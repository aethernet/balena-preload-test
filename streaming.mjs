import crypto from "crypto"
import gunzip from "gunzip-maybe"
import tar from "tar-stream"
import digestStream from "digest-stream"
import path from "path"
import { getAuthHeaders } from "./getAuth.mjs"
import { pullManifestFromRegistry } from "./getManifest.mjs"

// FIXME: Those import are uses for mocks, should eventually be removed
import fs from "fs-extra"
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const baseInPath = path.join(__dirname, "in")

// variables
const app_id = "ee6c3b3f75ae456d9760171a27a36568" //"7ea7c15b12144d1089dd20645763f790" // "ed91bdb088b54a3b999576679281520a" ee6c3b3f75ae456d9760171a27a36568
const release_id = "7e27e701c0e15a34c85881f0e1e53896" //"302261f9d08a388e36deccedac6cb424" // "2f24cd2be3006b029911a3d0da6837d5" 
const balenaosRef = "expanded-aarch64.img.zip"

/** 
 * Get repositories.json for a balenaos version
 * //TODO: this should be stored on S3 along the expanded version of os, in the meantime getting this from local fs
 * @param {string} balenaosRef - balenaos we want to get the repositories for
 * @return {json} repositories.json
 */
const getRepositoriesJsonFor = async (baleneosVersion) => {
  return await fs.readJson(path.join(__dirname, "in", `baleneosVersion.repositories.json`))
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
  const imageKeys = Object.keys(appsJson.apps?.[app_id]?.releases?.[release_id]?.services)
  const imageNames = imageKeys.map((key) => appsJson.apps?.[app_id]?.releases?.[release_id]?.services[key].image)
  return imageNames.map((image) => {
    const [image_name, image_hash] = image.split("@")
    return { image_name, image_hash }
  })
}

/**
 * downloadFilesForFsToRead
 * @param {string} images - registry url with repository and namespace
 * @returns {{[]}object} - list of {manifest, configManifest, digests}
 */
const downloadFilesForFsToRead = async (images) => {
  await Promise.all(
    images.map(async (image) => (pullManifestFromRegistry(image)))
  )
}

/**
 * Download Distribution Manifest
 * //TODO: should be a call to the registry, until that code is ready, i'm faking it using fs
 * @param {[]string} images - array of images
 * @returns {[]json} - array of distribution manifests
 */
const getDistributionManifests = async (images) =>
  await Promise.all(
    images.map(async ({ image_name, image_hash }) => ({
      manifest: await fs.readJson(path.join(__dirname, "in", "images", image_name.split("/").reverse()[0], "manifest.json")),
      image_name,
      image_hash,
    }))
  )

/**
 * Download Image Manifest
 * //TODO: should be a call to the registry, until that code is ready, i'm faking it using fs
 * @param {[]string} distributionManifests - array of distribution manifests
 * @returns {[]json} - array of image manifests
 */
const getImageManifests = async (distributionManifests) =>
  await Promise.all(
    distributionManifests.map(async ({ manifest, image_name, image_hash }) => ({
      manifest: await fs.readJson(path.join(__dirname, "in", "images", image_name.split("/").reverse()[0], manifest.config.digest.split(":")[1])),
      image_id: manifest.config.digest.split(":")[1],
      image_name,
      image_hash,
    }))
  )

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
const layerStreamProcessing = (layerStream, pack, cache_id) =>
  new Promise((resolve, reject) => {
    const extract = tar.extract()

    // will hold diff_id value once the hash is done
    let diff_id = null
    let size = -1

    const digestedCb = (digest, length) => {
      diff_id = `sha256:${digest}`
      size = length
    }

    const digester = digestStream("sha256", "hex", digestedCb)

    layerStream
      .pipe(gunzip()) // uncompress if necessary, will pass thru if it's not gziped
      .pipe(digester) // compute hash and forward
      .pipe(extract) // extract from the tar

    // on extract, move to the right folder and pack into the output tarball
    extract.on("entry", function (header, stream, callback) {
      // moving to the right folder in tarball
      header.name = path.join("docker", "overlay2", cache_id, "diff", header.name)
      // write to the tar
      stream.pipe(pack.entry(header, callback))
    })

    extract.on("finish", function () {
      // WARNING: i'm worried we might have a race condition here, I don't have "proof" that the digester callback has been properly called before this resolve occurs
      resolve({ diff_id, size })
    })

    extract.on("error", function (error) {
      reject(error)
    })
  })

/**
 * Promise : packEntry
 * Promisify tar-stream.pack.entry ( https://www.npmjs.com/package/tar-stream )
 * @param {object} header - tar-stream.pack.entry header
 * @param {string} value - tar-stream.pack.entry value
 * @returns {Promise}
 * */
const packEntry = (header, value, callback) =>
  new Promise((resolve, reject) => {
    pack.entry(header, value, (error) => {
      if (error) reject(error)
      resolve(true)
    })
  })

// ##############
// Processing
// ##############
// 0. Get authHeaders
const authHeaders = getAuthHeaders()

// 1. get apps.json
const appsJson = await getAppsJson({ app_id, release_id })

// 2. extract image_ids from appsJson
const images = await extractImageIdsFromAppsJson({ appsJson, app_id, release_id })

// 2.2/4. download files for fs to read
const registryManifests = await downloadFilesForFsToRead(images, authHeaders, baseInPath);

// 3. get distribution manifests from registry
const distributionManifests = await getDistributionManifests(images)

// 4. get the image manifests from registry
const imageManifests = await getImageManifests(distributionManifests)

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

const layers = imageManifests
  .map(({ manifest, image_name, image_id }) => {
    // compute and generate values for all the layers from all images, while deduplicating cache and link
    const computedLayers = []
    for (const key in manifest.rootfs.diff_ids) {
      const diff_id = manifest.rootfs.diff_ids[parseInt(key)]
      const chain_id = parseInt(key) == 0 ? diff_id : computeChainId({ previousChainId: computedLayers[parseInt(key) - 1].chain_id, diff_id })
      const duplicateOf = computedLayers.find((layer) => layer.chain_id === chain_id)
      const isDuplicate = Boolean(duplicateOf)
      computedLayers.push({
        image_name,
        image_id,
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
  .flat()

// 8. download and process layers

// setup tar-stream
const pack = tar.pack()
const tarball = fs.createWriteStream(path.join(__dirname, "out", "tarball.tar"))
pack.pipe(tarball) //TODO: output to a file, should eventually be a http response

const processingLayers = distributionManifests
  .map(({ manifest, image_name }) => manifest.layers.map((layer) => ({ image_name, layer: layer.digest.split(":")[1] })))
  .flat()
  .filter((layer, index, layers) => layers.indexOf(layer) === index) // dedupe to prevent downloading twice layers shared across images

for (const { layer, image_name } of processingLayers) {
  // we generate random chain_id for the layer here (instead of when pre-computing layer infos)
  // like this we can stream the layer diff folder prior to knowing it's diff_id
  // to get the diff_id we need to hash (sha256) the layer `tarball`, which we cannot do before gettin the whole layer
  // so we'll start streaming, and compute the `sha256` at the same time, once the whole layer is downloaded we'll
  // attach the cache_id with all (in case of duplicates) diff_id
  const cache_id = crypto.randomBytes(32).toString("hex")

  console.log("add layer =>", layer, image_name)

  // processing the stream
  try {
    // start streaming the file //TODO: this is a mock, it should come from a fetch to the registry
    const layerStream = fs.createReadStream(path.join(__dirname, "in", "images", image_name.split("/").reverse()[0], layer))

    const { diff_id, size } = await layerStreamProcessing(layerStream, pack, cache_id)

    // find all layers related to this archive
    const relatedLayers = layers.filter((layer) => layer.diff_id === diff_id)
    for (const { chain_id, diff_id, parent, lower, link } of relatedLayers) {
      // create all other files and folders required for this layer
      const dockerOverlay2CacheId = path.join("docker", "overlay2", cache_id)
      const dockerOverlay2l = path.join("docker", "overlay2", "l")
      const dockerImageOverlay2LayerdbSha256ChainId = path.join("docker", "image", "overlay2", "layerdb", "sha256", chain_id)

      // symlink from `l/_link_` to `../_cache_id_/diff`
      await packEntry({
        name: path.join(dockerOverlay2l, link),
        type: "symlink",
        linkname: path.join("..", cache_id, "diff"),
      })

      await packEntry({ name: path.join(dockerOverlay2CacheId, "commited"), mode: "0o600" }, "") // empty file
      await packEntry({ name: path.join(dockerOverlay2CacheId, "work"), mode: "0o777", type: "directory" }) // empty directory
      await packEntry({ name: path.join(dockerOverlay2CacheId, "link"), mode: "0o644" }, link)
      await packEntry({ name: path.join(dockerImageOverlay2LayerdbSha256ChainId, "diff"), mode: "0o755" }, diff_id)
      await packEntry({ name: path.join(dockerImageOverlay2LayerdbSha256ChainId, "cache-id"), mode: "0o755" }, cache_id)
      await packEntry({ name: path.join(dockerImageOverlay2LayerdbSha256ChainId, "size"), mode: "0o755" }, String(size))
      if (parent) await packEntry({ name: path.join(dockerImageOverlay2LayerdbSha256ChainId, "parent"), mode: "0o755" }, parent) // first layer doens't have any parent
      if (lower) await packEntry({ name: path.join(dockerOverlay2CacheId, "lower"), mode: "0o644" }, lower) // lowest layer has no lower
    }
  } catch (error) {
    console.error(error)
  }
}

// 9. Add the `images` related files
const dockerImageOverlay2Imagedb = path.join("docker", "image", "overlay2", "imagedb")
const repositories = []
for (const { manifest, image_id, image_name, image_hash } of imageManifests) {
  console.log("add image =>", image_id, image_name)

  await packEntry({ name: path.join(dockerImageOverlay2Imagedb, "content", "sha256", image_id), mode: "0o644" }, JSON.stringify(manifest))
  await packEntry(
    { name: path.join(dockerImageOverlay2Imagedb, "metadata", "sha256", image_id, "lastUpdated"), mode: "0o644" },
    new Date().toISOString()
  )

  // prepare repositories
  repositories[image_name] = {
    [`${image_name}:latest`]: `sha256:${image_id}`,
    [`${image_name}:@${image_hash}`]: `sha256:${image_id}`,
  }
}

// 10. merge repositories.json
// TODO: this should be done by downloading the `repositories.json` linked to the balenaos image we're going to stream
// Those files shouls be placed in s3 along the expanded .img so we don't need to extract it each time we serve an image
// In the meantime I'll take one from the `in` folder
const repositoriesJson = getRepositoriesJsonFor(balenaosRef)
for (const repository of repositories) {
  repositoriesJson[repository] = {...repository}
}

await packEntry({name: path.join("docker", "image", "overlay2"), mode: "0o644" }, JSON.stringify(repositoriesJson))

// 11. Close the tarball
pack.finalize()
