import crypto from "crypto"
import tar from "tar-stream"
import gunzip from "gunzip-maybe"
import digestStream from "digest-stream"
import path from "path"
import { getUrls, getBlob } from "./registry.js"
import logger from "../logger.js"
import { inspect } from "util"

/**
 * Precompute _Layers_ array
 * A flat array of objects representing all layer from all images for all the apps/releases to preload
 *
 * Object contains :
 * - `token` used to auth to the registry
 * - `diff_id` from the image config manifest
 * - `chain_id` computed for the layer
 * - `isDuplicate` boolean, true if an indentical layer has been found
 * - `parent` chain id of the parent layer (if not first layer in the chain)
 * - `link` 13 char all caps random string, unless it's a duplicated layer, in that case use the same link as the first encounter
 * - `lower` chain of all links up to the topmost layer in the chain
 *
 * Note : here we precomputes almost all values we'll need later to create the files/folders for the layer.
 * `cache-id` is not precompute at this stage for performance reasons.
 *
 * `chache-id` will be randomly assigned to each layer when downloading.
 * While downlaoding we'll compute the `diff_id` (sha256 hash of gunziped data) of the layer we're downloading
 * and find the matching pre-computed meta-data in this `layers` array.
 *
 * @param {[Object]} manifests - array of image config manifests
 * */

async function getLayers(manifests) {
  logger.warn(`== getting Layers @getLayers ==`)
  return manifests
    .map(({ diff_ids, token }) => {
      // loops on images and compute / generate values all layers
      // use same `cache` and `link` in case of duplicated layers (layers with same chain_id in two images)
      // note : we'll generate `cache_id` later when processing the layer and link back then
      const computedLayers = []
      for (const key in diff_ids) {
        const diff_id = diff_ids[parseInt(key)]
        const chain_id =
          parseInt(key) == 0 ? diff_id.split(":")[1] : computeChainId({ previousChainId: computedLayers[parseInt(key) - 1].chain_id, diff_id })
        const duplicateOf = computedLayers.find((layer) => layer.chain_id === chain_id)
        const isDuplicate = Boolean(duplicateOf)
        computedLayers.push({
          token,
          diff_id,
          chain_id,
          parent: parseInt(key) > 0 ? computedLayers[parseInt(key) - 1].chain_id : null,
          isDuplicate,
          link: isDuplicate ? duplicateOf[0].link : crypto.randomBytes(13).toString("hex").toUpperCase(),
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
    .flat()
}

/**
 * Given a list of distribution manifests, return a flatten list of deduped layer blob digests ready to be downloaded
 * Note: these digests are not `diff_id` as these are from *compressed* layers (tar.gz) while diff_id are from *uncompressed* (tar)
 * @param {[Object]} manifests - array of distribution manifests with auth
 * @return {[Object]} layerUrls - array of layers blob digests with athentication token
 */
const getLayerDistributionDigests = (manifests) => {
  return manifests
    .map(({ manifest, image_name, token }) =>
      manifest.layers.map((layer) => ({ image_name, token, compressedSize: layer.size, layer: layer.digest.split(":")[1] }))
    )
    .flat()
    .filter((layer, index, layers) => layers.indexOf(layer) === index) // dedupe to prevent downloading twice layers shared across images
}

/**
 * Generate random 32 char lowercase `chain_id`
 *
 * we generate the random chain_id for the layer here (instead of doig so when pre-computing layer infos)
 * like this we can stream the layer prior to knowing it's `diff_id`
 * getting the diff_id require to hash (sha256) layer's `tarball`, which means we need to get the whole layer first
 *
 * As we don't want to keep the whole layer in memory, we'll hash while streaming (on the wire)
 * and link the `cache` with all layers having matching `diff_id` (there might be duplicate layers with same `diff_id` but different `chain_id`)
 */
const getRandomDiffId = () => crypto.randomBytes(32).toString("hex")

/**
 * Prepare files from layer metadata
 * @param {Object} - layer
 * */
const generateFilesForLayer = ({ chain_id, diff_id, parent, lower, link, size, cache_id }) => {
  // compute useful paths
  const dockerOverlay2CacheId = `docker/overlay2/${cache_id}`
  const dockerOverlay2l = "docker/overlay2/l"
  // FIXME this chain_id still has sha256 in the name
  const dockerImageOverlay2LayerdbSha256 = path.join("docker/image/overlay2/layerdb/sha256")
  const dockerImageOverlay2LayerdbSha256ChainId = `${dockerImageOverlay2LayerdbSha256}/${chain_id}`

  const files = [
    // `link` symlink from `l/_link_` to `../_cache_id_/diff`
    {
      header: {
        name: `dockerOverlay2l/${link}`,
        type: "symlink",
        linkname: `../${cache_id}/diff`,
      },
    },
    // emtpy `commited` file
    {
      header: { name: `${dockerOverlay2CacheId}/commited`, mode: "0o600" },
      content: "",
    },
    // emtpy `work` directory
    {
      header: { name: `${dockerOverlay2CacheId}/work`, mode: "0o777", type: "directory" },
    },
    // `link` file
    {
      header: { name: `${dockerOverlay2CacheId}/link`, mode: "0o644" },
      content: link,
    },
    // `diff` file
    {
      header: { name: `${dockerImageOverlay2LayerdbSha256ChainId}/diff`, mode: "0o755" },
      content: diff_id,
    },
    // `cache_id` file
    {
      header: { name: `${dockerImageOverlay2LayerdbSha256ChainId}/cache-id`, mode: "0o755" },
      content: cache_id,
    },
    // `size` file
    {
      header: { name: `${dockerImageOverlay2LayerdbSha256ChainId}/size`, mode: "0o755" },
      content: String(size),
    },
  ]

  // `parent` file; first layer doens't have any parent
  if (parent)
    files.push({
      header: { name: `${dockerImageOverlay2LayerdbSha256ChainId}/parent`, mode: "0o755" },
      content: parent,
    })

  // `lower` chain; last layer doesn't have any lower
  if (lower)
    files.push({
      header: { name: `${dockerOverlay2CacheId}/lower`, mode: "0o644" },
      content: lower,
    })

  return files
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
const downloadProcessLayers = async ({ manifests, layers, packStream, injectPath }) => {
  logger.warn(`== Processing Layers @downloadProcessLayers ==`)

  const processingLayers = getLayerDistributionDigests(manifests)
  const injectableFiles = []

  for (const key in processingLayers) {
    const { layer, image_name, compressedSize, token } = processingLayers[key]
    console.log(`=> ${parseInt(key) + 1} / ${processingLayers.length} : ${layer}`)

    try {
      const cache_id = getRandomDiffId()

      // get the url
      const { imageUrl } = getUrls(image_name)

      // get the stream
      const layerStream = await getBlob(imageUrl, token, { digest: `sha256:${layer}`, size: compressedSize })

      // process the stream and get back `size` (uncompressed) and `diff_id` (digest)
      const { size, diff_id } = await layerStreamProcessing({ layerStream, packStream, cache_id, injectPath })

      // find all layers related to this archive
      const relatedLayers = layers.filter((layer) => layer.diff_id === diff_id)

      // create the metadata and link files for all related layers
      for (const layer of relatedLayers) {
        injectableFiles.push(generateFilesForLayer({ ...layer, size, cache_id }))
      }
    } catch (error) {
      logger.error("downloadProcessLayers CATCH", error)
    }
  }
  return injectableFiles.flat()
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
async function layerStreamProcessing({ layerStream, packStream, cache_id, injectPath }) {
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
    extract.on("entry", (header, stream, callback) => {
      if (header.pax) {
        /**
         * DELETE header.pax here, if it exists, as it is causing problems with the symlink handling.
         * header.pax overrides over the from/to name path for the symlinks so ends up at root level
         */
        logger.debug(`=> @layerStreamProcessing header ${inspect(header, true, 2, true)}`)
        delete header.pax
      }

      // change the name of the file to place it at the right position in tar archive folder tree
      const headerNewName = { ...header, name: `${injectPath}/docker/overlay2/${cache_id}/diff/${header.name}` }

      // 5. change header name to give file its destination folder in the output tarball
      stream.pipe(packStream.entry(headerNewName, callback))
    })

    // 7. when this layer finished extraction, we get the digest (diff_id) and size from the digester
    // then resolve the promise to allow moving on to the next layer
    extract.on("finish", () => {
      const diffed = { diff_id, size }
      resolve(diffed)
    })

    layerStream
      .pipe(gunzip()) // 1. uncompress if necessary, will pass thru if it's not gziped
      .pipe(digester) // 2. compute hash and forward (this is a continuous process we'll get the result at the end)
      .pipe(extract) // 3. extract from the layer tar archive (generate `entry` events cf 4.)
  })
}

export { getLayers, downloadProcessLayers }
