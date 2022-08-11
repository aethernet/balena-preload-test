import crypto from "crypto"
import gunzip from "gunzip-maybe"

import tar from "tar-stream"
import digestStream from "digest-stream"
import path from "path"
import { getAuthHeaders } from "./getAuth.mjs"
import { pullManifestsFromRegistry, getUrls, getBlob } from "./getManifest.mjs"
import { inspect } from "util"
// FIXME: Those import are uses for mocks, should eventually be removed
import fs from "fs-extra"
import { fileURLToPath } from "url"
import logger from "./logger.mjs"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const baseInPath = path.join(__dirname, "in")

// variables
const getEnvs = (user) => {
  const authHeaders = getAuthHeaders(user)
  const envs = {
    edwin2: {
      app_id: "ed91bdb088b54a3b999576679281520a", //ee6c3b3f75ae456d9760171a27a36568
      release_id: "302261f9d08a388e36deccedac6cb424", // "2f24cd2be3006b029911a3d0da6837d5" 
      balenaosRef: "expanded-aarch64",
      user: "edwin3",
      password: process.env.PASSWD,
    },
    bob: {
      app_id: "ee6c3b3f75ae456d9760171a27a36568",
      release_id: "63908fb619fceb7bc30de7d93c207af2",
      balenaosRef: "expanded-aarch64",
      user: "bob" || authHeaders.auth.username,
      password: process.env.PASSWD || authHeaders.auth.password,
    }
  }[user];
  logger.warn(inspect(envs),'==> envs');
  if (!envs.password) throw new error("Password is missing, launch this with `PASSWD=****** node streaming.mjs`")
  return envs;
}
const { app_id, release_id, balenaosRef, user, password } = getEnvs("bob")



/** 
 * Get repositories.json for a balenaos version
 * //TODO: this should be stored on S3 along the expanded version of os, in the meantime getting this from local fs
 * @param {string} balenaosRef - balenaos we want to get the repositories for
 * @return {json} repositories.json
 */
const getRepositoriesJsonFor = async (baleneosVersion) => {
  return fs.readJsonSync(path.join(__dirname, "in", `${baleneosVersion}.repositories.json`))
}

/**
 * Get Apps.json from api
 * //TODO: There's no endpoint yet so faking it using the fs
 * @param {string} app_id - app_id
 * @param {string} release_id - release_id
 * @returns {json} - apps.json object
 */
const getAppsJson = async ({ app_id, release_id }) => {
  return await fs.readJson(path.join(__dirname, "in", "apps.json"))
}

/**
 * extractImageIdsFromAppsJson
 * @param {json} appJson - appsJson
 * @param {string} app_id - app_id
 * @param {string} release_id - release_id
 * @returns {[]object} - list of {image_name, commit}
 */
const extractImageIdsFromAppsJson = ({ appsJson, app_id, release_id }) => {
  const appId = Object.keys(appsJson.apps) || app_id;
  logger.warn(`==> appId: ${appId}`)
  const releaseId = Object.keys(appsJson.apps?.[appId]?.releases) || release_id;
  logger.warn(`==> releaseId: ${releaseId}`)
  const imageKeys = Object.keys(appsJson.apps?.[appId]?.releases?.[releaseId]?.services)
  const imageNames = imageKeys.map((key) => appsJson.apps?.[appId]?.releases?.[releaseId]?.services[key].image)
  return imageNames.map((image) => {
    const [image_name, image_hash] = image.split("@")
    return { image_name, image_hash }
  })
}

/**
 * Download Distribution Manifest
 * //TODO: should be a call to the registry, until that code is ready, i'm faking it using fs
 * @param {[]string} images - array of images
 * @returns {[]json} - array of distribution manifests
 */
const getManifests = async (images, auth) => {
  const manifestsAll = [];
  logger.warn(`== Downloading Manifests @getManifests ==`)
  for (const key in images) {
    const { image_name, image_hash } = images[key]
    logger.verbose(`=> ${parseInt(key) + 1} / ${images.length} : ${image_name}`)
    const manifestInfo = await pullManifestsFromRegistry(image_name, auth, baseInPath)
    manifestsAll.push({
      ...manifestInfo,
      image_name,
      image_hash,
    })
  }
  return manifestsAll;
}


/** Compute Chain Id
 *
 * formula is : sha256 of a string composed of the chainid of the parent layer, a space, and the diffid of the layer
 * i.e. sha256("sha256:e265835b28ac16782ef429b44427c7a72cdefc642794515d78a390a72a2eab42 sha256:573a4eb582cc8a741363bc2f323baf020649960822435922c50d956e1b22a787")
 *
 * @param {string} previousChainId - chain_id of n-1
 * @param {string} diff_id - diff_id of n
 * @returns {string} - chain_id for n
 */
const computeChainId = ({ previousChainId, diff_id }) => crypto.createHash("sha256").update(`sha256:${previousChainId} ${diff_id}`).digest("hex")

/**
 * Promise : Layer Stream Processing
 * @param {readableStream} layerStream - byte stream of the layer archive (tar+gz)
 * @param {tar.pack} pack - tar pack
 * @param {string} cache_id - generated cache_id
 * @return {object} {diff_id, size} - hash digest of the tar archive (unzipped) and size in byte
 */
async function layerStreamProcessing(layerStream, pack, cache_id, compressedSize, layer, ) {
  const extract = tar.extract();
  return new Promise((resolve) => {
    let diff_id = null
    let size = -1
    const listenerFn = (resultDigest, length) => {
      diff_id = `sha256:${resultDigest}`
      size = length
    }
    const digester = digestStream("sha256", "hex", listenerFn)

    extract.on('entry', (header, stream, cb) => {
      header.name = path.join("docker", "overlay2", cache_id, "diff", header.name)
      const headerPipe = pack.entry(header, cb)
      stream.pipe(headerPipe)
    });
    extract.on('finish', () => {
      const diffed = { diff_id, size }
      resolve(diffed);
    });
    layerStream.pipe(gunzip()) // uncompress if necessary, will pass thru if it's not gziped
        .pipe(digester) // compute hash and forward
        .pipe(extract) // extract from the tar
  });
}

/**
 * PromisePacker
 * Promisify tar-stream.pack.entry ( https://www.npmjs.com/package/tar-stream )
 * @param {object} header - tar-stream.pack.entry header
 * @param {string} value - tar-stream.pack.entry value
 * @returns {Promise}
 * */
const promisePacker = (pack) => (header, value, cb) =>
  new Promise((resolve, reject) => {
    logger.debug(`=> pack header.name: ${header.name}`)
    // logger.debug(`=> pack value: ${inspect(value, true, 5, true)}`)
    pack.entry(header, value, (error) => {
      if (error) reject(error)
      if(cb) cb()
      resolve(true)
    })
  })

// 5. create a `layers` array of object to keep track of what we're doing
// format is
// {
// 	"image_name": image_name
//  "image_id": image_id
// 	"gzip_id": layerDownloadId,
// 	"cache_id": random(32),
//  "parent_diff_id": diff_id(n-1)
// 	"diff_id": diff_id,
// 	"chain_id": sha256(chain_id(n-1) + ' ' + diff_id(n))
// 	"lower": undefined,
// 	"size": undefined,
// 	"link": generateLinkId(),
// 	"isDuplicate": false
//  "lower": lower link chain
// }
async function getLayers(manifests) {
  logger.warn(`== getting Layers @getLayers ==`)
  return manifests
    .map(({manifest, image_name, image_id, diff_ids, token }) => {
      // compute and generate values for all the layers from all images, while deduplicating cache and link
      const computedLayers = []
      for (const key in diff_ids) {
        const diff_id = diff_ids[parseInt(key)]
        const chain_id = parseInt(key) == 0 ? diff_id : computeChainId({ previousChainId: computedLayers[parseInt(key) - 1].chain_id, diff_id })
        const duplicateOf = computedLayers.find((layer) => layer.chain_id === chain_id)
        const isDuplicate = Boolean(duplicateOf)
        computedLayers.push({
          token,
          diff_id,
          chain_id,
          parent: parseInt(key) > 0 ? computedLayers[parseInt(key) - 1].chain_id : null,
          isDuplicate,
          link: isDuplicate ? duplicateOf[0].link : crypto.randomBytes(13).toString("hex").toUpperCase(),
          cache_id: null, // we'll generate it later and populate back
        })
      }
      return computedLayers
    })
    .map((layers) => {
      // 7. compute the lower link chain
      const chain = layers.map((layer) => `l/${layer.link}`)
      return layers.map((layer, key) => ({
        ...layer,
        lower: key > 0 ? chain.slice(0, key).join(":") : null,
      }))
    })
    .flat();
}

// setup tar-stream
const prepareTarball = () => {
  const pack = tar.pack()
  const tarball = fs.createWriteStream(path.join(__dirname, "out", "tarball.tar"))
  pack.pipe(tarball) //TODO: output to a file, should eventually be a http response
  return pack
}

// 8. download and process layers
const downloadProcessLayers = async (manifests, layers, pack, packFile) => {

  // TODO, this is problematic, its not deduping layers which comes from the SV (host apps)
  const processingLayers = manifests
    .map(({ manifest, image_name, token }) => manifest.layers.map((layer) => ({ image_name, token, compressedSize: layer.size, layer: layer.digest.split(":")[1] })))
    .flat()
    .filter((layer, index, layers) => layers.indexOf(layer) === index) // dedupe to prevent downloading twice layers shared across images
  
  logger.warn(`== Processing Layers @downloadProcessLayers ==`)
  for (const key in processingLayers) {
    const { layer, image_name, compressedSize, token } = processingLayers[key]
    logger.verbose(`=> ${parseInt(key) + 1} / ${processingLayers.length} : sha256:${layer}`)
    // we generate random chain_id for the layer here (instead of doig so when pre-computing layer infos)
    // like this we can stream the layer diff folder prior to knowing it's diff_id
    // to get the diff_id we need to hash (sha256) the layer `tarball`, which we cannot do before gettin the whole layer
    // so we'll start streaming, and compute the `sha256` at the same time, once the whole layer is downloaded we'll
    // attach the cache_id with all (in case of duplicates) diff_id
    const cache_id = crypto.randomBytes(32).toString("hex")
    // processing the stream
    try {
      const { registryUrl, imageUrl, parsedImage } = await getUrls(image_name);
      const baseInPathSub = `${baseInPath}/images/${parsedImage.repository}`;
      const layerStream = await getBlob(imageUrl, token, { digest: `sha256:${layer}`, size: compressedSize}, baseInPathSub);

      const {size, diff_id} = await layerStreamProcessing(await layerStream, pack, cache_id, compressedSize, layer)

      // // find all layers related to this archive
      const relatedLayers = layers.filter((layer) => layer.diff_id === diff_id);

      for (const { chain_id, diff_id, parent, lower, link } of relatedLayers) {
        // create all other files and folders required for this layer
        const dockerOverlay2CacheId = path.join("docker", "overlay2", cache_id)
        const dockerOverlay2l = path.join("docker", "overlay2", "l")
        const dockerImageOverlay2LayerdbSha256ChainId = path.join("docker", "image", "overlay2", "layerdb", "sha256", chain_id)

        // symlink from `l/_link_` to `../_cache_id_/diff`
        await packFile({
          name: path.join(dockerOverlay2l, link),
          type: "symlink",
          linkname: path.join("..", cache_id, "diff"),
        })

        await packFile({ name: path.join(dockerOverlay2CacheId, "commited"), mode: "0o600" }, "") // empty file
        await packFile({ name: path.join(dockerOverlay2CacheId, "work"), mode: "0o777", type: "directory" }) // empty directory
        await packFile({ name: path.join(dockerOverlay2CacheId, "link"), mode: "0o644" }, link)
        await packFile({ name: path.join(dockerImageOverlay2LayerdbSha256ChainId, "diff"), mode: "0o755" }, diff_id)
        await packFile({ name: path.join(dockerImageOverlay2LayerdbSha256ChainId, "cache-id"), mode: "0o755" }, cache_id)
        await packFile({ name: path.join(dockerImageOverlay2LayerdbSha256ChainId, "size"), mode: "0o755" }, String(size))
        if (parent) await packFile({ name: path.join(dockerImageOverlay2LayerdbSha256ChainId, "parent"), mode: "0o755" }, parent) // first layer doens't have any parent
        if (lower) await packFile({ name: path.join(dockerOverlay2CacheId, "lower"), mode: "0o644" }, lower) // lowest layer has no lower
      }
    } catch (error) {
      logger.error('downloadProcessLayers CATCH', error);
    }
  }
}

// 9. Add the `images` related files
const packImageFiles = async (manifests, packFile) => {
  const dockerImageOverlay2Imagedb = path.join("docker", "image", "overlay2", "imagedb")

  logger.verbose("== Add Images Files @packImageFiles ==")
  for (const key in manifests) {
    const { configManifestV2, image_id, image_name } = manifests[key]

    await packFile({ name: path.join(dockerImageOverlay2Imagedb, "content", "sha256", image_id), 
      mode: "0o644" }, JSON.stringify(configManifestV2))

    await packFile({ name: path.join(dockerImageOverlay2Imagedb, "content", "sha256", image_id),
      mode: "0o644" }, new Date().toISOString())
  }
}

// 10. merge repositories.json
// TODO: this should be done by downloading the `repositories.json` linked to the balenaos image we're going to stream
// Those files shouls be placed in s3 along the expanded .img so we don't need to extract it each time we serve an image
// In the meantime I'll take one from the `in` folder
const mergeRepositories = async (manifests, packFile) => {
  logger.warn("== Merge Repositories @mergeRepositories ==")
  const repositories = []
  for (const { image_id, image_name, image_hash } of manifests) {
    // prepare repositories
    repositories[image_name] = {
      [`${image_name}:latest`]: `sha256:${image_id}`,
      [`${image_name}:@${image_hash}`]: `sha256:${image_id}`,
    }
  }

  logger.debug('==> @mergeRepositories manifests', inspect(manifests))
  logger.debug('==> @mergeRepositories repositories',  repositories)
  
  
  // TODO need repositoriesJson
  const repositoriesJson = await getRepositoriesJsonFor(balenaosRef)
  // const repositoriesJson = {}
  for (const repository of repositories) {
    repositoriesJson[repository] = {...repository}
  }
  logger.debug(`==> @mergeRepositories repositoriesJson ${inspect(repositoriesJson, true,3,true)}`)
  const repoPackFileName = path.join("docker", "image", "overlay2")
  logger.debug(`==> @mergeRepositories repoPackFileName ${repoPackFileName}`)
  await packFile({name: repoPackFileName, mode: "0o644" }, JSON.stringify(repositoriesJson))
}

const processPreloading = async () => {
  // ##############
  // Processing
  // ##############

  // 0. Get authHeaders
  const authHeaders = await getAuthHeaders({
    user,
    password
  })

  // 1. get apps.json
  const appsJson = await getAppsJson({ app_id, release_id })

  // 2. extract image_ids from appsJson
  const images = await extractImageIdsFromAppsJson({ appsJson, app_id, release_id })

  // 3. get manifests from registry
  const manifests = await getManifests(images, authHeaders)

  // 5. create a `layers` array of object to keep track of what we're doing
  const layers = await getLayers(manifests)

  // prepare tarball packer
  const pack = prepareTarball() // this one is streamable
  const packFile = promisePacker(pack) // this one is a promise

  // 8. download and process layers
  await downloadProcessLayers(manifests, layers, pack, packFile)

  // 9. Add the `images` related files
  await packImageFiles(manifests, packFile)

  // 10. merge repositories.json
  await mergeRepositories(manifests, packFile)

  // close tarball
  pack.finalize()
}
const preloaded = await processPreloading()
logger.warn(`=== Your tarball is ready in the out folder === `)

logger.warn(`=== in files are in verbose logs in the logs folder === `)
logger.warn(`=== packed files are in debug logs in the logs folder === `)

logger.warn(`=== to turn down the logs, edit line 4 consoleLevel in logger.mjs === `)