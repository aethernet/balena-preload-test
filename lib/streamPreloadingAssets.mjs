import crypto from "crypto"
import gunzip from "gunzip-maybe"
import tar from "tar-stream"
import digestStream from "digest-stream"
import path from "path"
import { getAuthHeaders } from "./getAuth.mjs"
import { pullManifestsFromRegistry, getUrls, getBlob } from "./getManifest.mjs"

// FIXME: Those import are uses for mocks and debugging, should eventually be removed
import fs from "fs-extra"
import { inspect } from "util"
import logger  from "../logger.mjs"
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const baseInPath = path.join(__dirname, "in")

/** 
 * Get repositories.json for a balenaos version
 * //TODO: this should be stored on S3 along the expanded version of os, in the meantime getting this from local fs
 * @param {string} balenaosRef - balenaos we want to get the repositories for
 * @return {json} repositories.json
 */
const getRepositoriesJsonFor = async (baleneosVersion) => {
  return await fs.readJson(path.join(__dirname, "..", "in", `${baleneosVersion}.repositories.json`))
}

/**
 * Get Apps.json from api
 * //TODO: There's no endpoint yet so faking it using the fs
 * @param {string} app_id - app_id
 * @param {string} release_id - release_id
 * @returns {json} - apps.json object
 */
const getAppsJson = async ({ app_id, release_id }) => {
  return await fs.readJson(path.join(__dirname, ".." , "in", "apps.json"))
}

/**
 * extractImageIdsFromAppsJson
 * @param {json} appJson - appsJson
 * @param {string} app_id - app_id
 * @param {string} release_id - release_id
 * @returns {[]object} - list of {image_name, commit}
 */
const extractImageIdsFromAppsJson = ({ appsJson, app_id, release_id }) => {
  const appId = Object.keys(appsJson.apps)[0] || app_id;
  logger.warn(`==> appId: ${appId}`)
  const releaseId = Object.keys(appsJson.apps?.[appId]?.releases)[0] || release_id;
  logger.warn(`==> releaseId: ${releaseId} \n\n`)
  const imageKeys = Object.keys(appsJson.apps?.[appId]?.releases?.[releaseId]?.services)
  const imageNames = imageKeys.map((key) => appsJson.apps?.[appId]?.releases?.[releaseId]?.services[key].image)
  return imageNames.map((image) => {
    const [image_name, image_hash] = image.split("@")
    return { image_name, image_hash }
  })
}

/**
 * Download Distribution Manifest
 * @param {[]string} images - array of images
 * @returns {[]json} - array of distribution manifests
 */
const getManifests = async (images, auth) => {
  const manifestsAll = [];
  logger.warn(`== Downloading Manifests @getManifests ==`)
  for (const key in images) {
    const { image_name, image_hash } = images[key]
    logger.info(`=> ${parseInt(key) + 1} / ${images.length} : ${image_name}`)
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
async function layerStreamProcessing(layerStream, packStream, cache_id, compressedSize, layer) {
  const extract = tar.extract()
  
  // Promisify the event based control flow
  return new Promise((resolve) => {
    // 0. Setup the digester
    let diff_id = null
    let size = -1
    const digesterCb = (resultDigest, length) => {
      // logger.log(`=> digesterCb resultDigest: ${resultDigest}, ${length}`, packStream, cache_id)
      diff_id = `sha256:${resultDigest}`
      size = length
    }
    const digester = digestStream("sha256", "hex", digesterCb)

    // 4. tar extracted happens here
    extract.on('entry', (header, stream, callback) => {
      const hasHeaderPax = header.pax
      if (hasHeaderPax){
        /**
         * DELETE header.pax here, if it exists, as it is causing problems with the symlink handling.
         * header.pax overrides over the from/to name path for the symlinks so ends up at root level
         * 
         * deleting mostly .npm caches and the Főtanúsítvány cert symlink pax entry
         * root/.npm/_cacache/
         * 
         * pax: {
         *  linkpath: '/usr/share/ca-certificates/mozilla/NetLock_Arany_=Class_Gold=_Főtanúsítvány.crt',
         *  path: 'etc/ssl/certs/ca-cert-NetLock_Arany_=Class_Gold=_Főtanúsítvány.pem'
         * }
         * 
         * QUESTIONMARK ABOUT THIS ONE
         * It does exist in the layer as gstreamer, so I think its fixed
         * name: 'usr/libexec/gstreamer-1.0/gst-ptp-helper',
         * pax: {
         *    'SCHILY.xattr.security.capability': '\x01\x00\x00\x02\x00\x14\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
         *  }
        */
        logger.debug(`=> @layerStreamProcessing header ${inspect(header, true, 2, true)}`)
        delete header.pax
      }
      const headerNewName = { ...header, name: path.join("docker", "overlay2", cache_id, "diff", header.name) }
      if (hasHeaderPax) {
        logger.debug(`=> @layerStreamProcessing headerNewName ${inspect(headerNewName, true, 2, true)}`)
      }
      
      // 5. change header name to give file its destination folder in the output tarball
      stream.pipe(packStream.entry(headerNewName, callback))
    });

    // 7. when this layer finished extraction, we get the digest (diff_id) and size from the digester
    // then resolve the promise to allow moving on to the next layer
    extract.on('finish', () => {
      const diffed = { diff_id, size }
      resolve(diffed);
    });

    layerStream.pipe(gunzip()) // 1. uncompress if necessary, will pass thru if it's not gziped
        .pipe(digester) // 2. compute hash and forward (this is a continuous process we'll get the result at the end)
        .pipe(extract) // 3. extract from the layer tar archive (generate `entry` events cf 4.)
  });
}

/**
 * PromisePacker
 * Promisify tar-stream.pack.entry ( https://www.npmjs.com/package/tar-stream )
 * 
 * @param {tar-stream.pack} pack - tar-stream.pack.entry
 * @returns {Function} packer - function to return the promisified packer
 * 
 * @param {object} header - tar-stream.pack.entry header
 * @param {string} value - tar-stream.pack.entry value
 * @param {function} cb - optional callback to call after packing the entry
 * @returns {Promise}
 * */
const promisePacker = (pack) => (header, value, cb) =>
  new Promise((resolve, reject) => {
    if ( header.name.includes("sha256/sha256:") ) {
      logger.verbose(`=> FIXME!! pack header.name: ${header.name}`)
      // logger.verbose(`=> pack value: ${value}`)
      // logger.debug(`=> pack cb: ${cb}`)
    }
    pack.entry(header, value, (error) => {
      if (error) reject(error)
      if(cb) cb()
      resolve(true)
    })
  })

// 5. create a `layers` array of object to keep track of what we're doing
// format is
// {
//  "token": registryAuthToken,
// 	"image_name": image_name
//  "image_id": image_id
// 	"gzip_id": layerDownloadId,
//  "parent_diff_id": diff_id(n-1)
// 	"diff_id": diff_id,
// 	"chain_id": sha256(chain_id(n-1) + ' ' + diff_id(n))
// 	"size": undefined,
// 	"link": generateLinkId(),
// 	"isDuplicate": false
//  "lower": lower link chain
// }
async function getLayers(manifests) {
  logger.warn(`== getting Layers @getLayers ==`)
  // logger.debug(`=> manifests: ${inspect(manifests, true, 10, true)}`)
  return manifests
    .map(({ diff_ids, token }) => {
      // loops on images and compute / generate values all layers
      // use same `cache` and `link` in case of duplicated layers (layers with same chain_id in two images)
      // note : we'll generate `cache_id` later when processing the layer and link back then
      const computedLayers = []
      for (const key in diff_ids) {
        const diff_id = diff_ids[parseInt(key)]
        const chain_id = parseInt(key) == 0 ? diff_id.split(':')[1] : computeChainId({ previousChainId: computedLayers[parseInt(key) - 1].chain_id, diff_id })
        const duplicateOf = computedLayers.find((layer) => layer.chain_id === chain_id)
        const isDuplicate = Boolean(duplicateOf)
        computedLayers.push({
          token,
          diff_id,
          chain_id,
          parent: parseInt(key) > 0 ? computedLayers[parseInt(key) - 1].chain_id : null,
          isDuplicate,
          link: isDuplicate ? duplicateOf[0].link : crypto.randomBytes(13).toString("hex").toUpperCase()
        })
      }
      return computedLayers
    })
    .map((imageLayers) => {
      // 7. compute the lower link chain
      // `lower` chain is a string composed of the path to the `link` of all lower layers in the chain
      // i.e. : `l/*sublayer1link*:l/*sublayer2link:l/*sublayer3link`
      // lowest layer doesn't have any (empty lower)
      const chain = imageLayers.map((layer) => `l/${layer.link}`)
      return imageLayers.map((layer, key) => ({
        ...layer,
        lower: key > 0 ? chain.slice(0, key).join(":") : null,
      }))
    })
    .flat();
}

// setup tar-stream
const prepareTarball = (outputStream) => {
  // logger.log(`=> prepareTarball outputStream: ${inspect(outputStream,true,5,true)}`)
  const pack = tar.pack()
  pack.pipe(outputStream)
  return pack
}

/** DownloadProcessLayers 
 * // 8. download and process layers
 * 
 * This is the meaty part of the process. 
 * For each layer it will (on stream) : 
 *  - stream from registry
 *  - gunzip
 *  - digest (on the fly)
 *  - untar
 *  - rename files to match the destination directory
 *  - tar (`pack`)
 *  - stream to output
 * 
 * Then create all metadata files, `tar` and stream them to output using `packFile`
*/
const downloadProcessLayers = async (manifests, layers, packStream, packFile) => {

  // getting the compressed layers id from the distribution manifest
  // note this is not the same ids as the diff_id (yet) as these are digest of the *compressed* layer (.tar.gz) while diff_id are uncompressed (.tar)
  const processingLayers = manifests
    .map(
      ({ manifest, image_name, token }) => manifest.layers.map((layer) => ({ image_name, token, compressedSize: layer.size, layer: layer.digest.split(":")[1] })))
    .flat()
    .filter((layer, index, layers) => layers.indexOf(layer) === index) // dedupe to prevent downloading twice layers shared across images
  
  logger.warn(`== Processing Layers @downloadProcessLayers ==`)
  for (const key in processingLayers) {
    const { layer, image_name, compressedSize, token } = processingLayers[key]
    console.log(`=> ${parseInt(key) + 1} / ${processingLayers.length} : ${layer}`)
    
    // we generate the random chain_id for the layer here (instead of doig so when pre-computing layer infos)
    // like this we can stream the layer diff folder prior to knowing it's diff_id
    // to get the diff_id we need to hash (sha256) the layer `tarball`, which we cannot do before gettin the whole layer
    // we'll stream while computing the `sha256` at the same time, once the whole layer has been processed we'll
    // attach the cache_id with all layers with matching `diff_id` (might be multiples as we might have duplicates)
    const cache_id = crypto.randomBytes(32).toString("hex")
    
    try {
      // get the url
      const {imageUrl} = getUrls(image_name)
      
      // get the stream
      const layerStream = await getBlob(imageUrl, token, { digest: `sha256:${layer}`, size: compressedSize});
      
      // process the stream and get back `size` (uncompressed) and `diff_id` (digest)
      const {size, diff_id} = await layerStreamProcessing(layerStream, packStream, cache_id, compressedSize, layer)

      // find all layers related to this archive
      const relatedLayers = layers.filter((layer) => layer.diff_id === diff_id);

      // create the metadata and link files for all related layers
      for (const { chain_id, diff_id, parent, lower, link } of relatedLayers) {
        // compute useful paths
        const dockerOverlay2CacheId = path.join("docker", "overlay2", cache_id)
        const dockerOverlay2l = path.join("docker", "overlay2", "l")
        // FIXME this chain_id still has sha256 in the name
        const dockerImageOverlay2LayerdbSha256ChainId = path.join("docker", "image", "overlay2", "layerdb", "sha256", chain_id)
        const dockerImageOverlay2LayerdbSha256 = path.join("docker", "image", "overlay2", "layerdb", "sha256")
        // create symlink from `l/_link_` to `../_cache_id_/diff`
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

/**
 * Generate and add the "images" related metadata
 * // 9. Add the `images` related files
 * @param {object} manifests - images manifests
 * @param {Promise} packFile - tar output file packer as promise
 */
const packImageFiles = async (manifests, packFile) => {
  const dockerImageOverlay2Imagedb = path.join("docker", "image", "overlay2", "imagedb")

  logger.warn("== Add Images Files @packImageFiles ==")
  for (const key in manifests) {
    const { configManifestV2, image_id} = manifests[key]
    const shortImage_id = image_id.split(':')[1]
    
    console.log(`=> ${parseInt(key) + 1} / ${manifests.length} : ${shortImage_id}`)


    await packFile({ name: path.join(dockerImageOverlay2Imagedb, "content", "sha256", shortImage_id), mode: "0o644" }, JSON.stringify(configManifestV2))
    await packFile(
      { name: path.join(dockerImageOverlay2Imagedb, "metadata", "sha256", shortImage_id, "lastUpdated"), mode: "0o644" },
      new Date().toISOString()
    )
  }
}

/**
 * Prepare repositories object for each images, merge with the existing one (from the os image) and write to the output tar stream
 * TODO : this should be splitted into pure functions
 * // 10. merge repositories.json
 * @param {object} manifests - images manifests
 * @param {Promise} packFile - tar output file packer as promise
 */
const mergeRepositories = async (manifests, packFile, balenaosRef) => {
  logger.warn("== Merge Repositories @mergeRepositories ==")
  const repositories = []

  // create all repositories fragments
  for (const { image_id, image_name, image_hash } of manifests) {
    // prepare repositories
    repositories[image_name] = {
      [`${image_name}:latest`]: `sha256:${image_id}`,
      [`${image_name}:@${image_hash}`]: `sha256:${image_id}`,
    }
  }
  
  logger.info('==> @mergeRepositories manifests', inspect(manifests))
  logger.info('==> @mergeRepositories repositories',  repositories)
  // get the balenaos original repositories.json
  const repositoriesJson = getRepositoriesJsonFor(balenaosRef)

  // merge
  for (const repository of repositories) {
    repositoriesJson[repository] = {...repository}
  }

  // output
  const repoPackFileName = path.join("docker", "image", "overlay2")
  logger.info(`==> @mergeRepositories repoPackFileName ${repoPackFileName}`)
  await packFile({name: repoPackFileName, mode: "0o644" }, JSON.stringify(repositoriesJson))
}

/**
 * Main Processing function
 * 
 * Timing is important.
 * As we're outputing to a tar stream
 * We need to kind of be synchronous (one file out at any given time)
 */
const streamPreloadingAssets = async ({outputStream, user, password, app_id, release_id, balenaosRef}) => {
  // ##############
  // Processing
  // ##############
  logger.warn('==> STARTING @streamPreloadingAssets');
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
  const packStream = prepareTarball(outputStream) // this one is streamable
  const packFile = promisePacker(packStream) // this one is a promise

  // // 8. download and process layers
  await downloadProcessLayers(manifests, layers, packStream, packFile)

  await packImageFiles(manifests, packFile)

  await mergeRepositories(manifests, packFile, balenaosRef)

  // close tarball
  packStream.finalize()
  logger.warn('==> FINISHED @streamPreloadingAssets');
  logger.verbose('==> change consoleLevel log levels in logger.mjs for less verbose logging');
}

export default streamPreloadingAssets