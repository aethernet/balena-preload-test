import path from "path"
import { getAuthHeaders } from "./getAuth.mjs"
import { getManifests } from "./registry.mjs"
import { 
  mergeRepositories, 
  repositoriesJsonInjectionPath, 
  getRepositoriesJsonForBaseImage, 
  getImagesFromRepositoriesJson 
} from "./repositoriesJson.mjs"
import { streamBaseImage, getImageSize } from "./baseImage.mjs"
import { getAppsJson, getImageIds } from "./appsJson.mjs"
import { getLayers, downloadProcessLayers } from "./layers.mjs"
import { promisePacker, getTarballStream } from "./packer.mjs"
import { getImagesConfigurationFiles } from "./images.mjs"
import logger from "../logger.mjs"

/**
 * Main Processing function
 *
 * Timing is important.
 * As we're outputing to a tar stream
 * We need to act synchronously as we stream files one at a time in the output pipe
 */
const streamPreloadingAssets = async ({ outputStream, user, password, app_id, release_id, balenaosRef, dataPartition = 6 }) => {
  // ##############
  // Processing
  // ##############
  logger.warn("==> STARTING @streamPreloadingAssets")
  // 0. Get authHeaders
  const authHeaders = await getAuthHeaders({
    user,
    password,
  })

  // prepare tarball packer
  const injectPath = path.join("inject", `${dataPartition}`)
  const packStream = getTarballStream(outputStream) // streamable
  const packFile = promisePacker(packStream, injectPath) // promise
  const packManifest = promisePacker(packStream) // promise

  // 0. create and stream a manifest
  const manifest = {
    image: balenaosRef,
    inject: [
      {
        partition: dataPartition,
        partitionName: "resin-data",
        inject: dataPartition,
      },
    ],
  }

  await packManifest({ name: "manifest.json", mode: "0o644" }, JSON.stringify(manifest))

  // start streaming the base image
  const baseImageSize = getImageSize({ image: balenaosRef })

  // Beware that knowing the file size in advance is mandatory
  const baseImageStreamEntry = packStream.entry({
    // TOOD: name: `${balenaosRef}.img`, // switch when inject.mjs select baseimage from manifest (currently hardcoded)
    name: "image.img",
    mode: "0o644",
    size: baseImageSize,
  })

  await streamBaseImage({ image: balenaosRef, pipeStreamTo: baseImageStreamEntry })

  // get apps.json
  const appsJson = await getAppsJson({ app_id, release_id }, authHeaders)

  // get the balenaos original repositories.json
  const balenaOsRepositoriesJson = await getRepositoriesJsonForBaseImage(balenaosRef)

  // extract image_ids from appsJson
  const images = getImageIds({ appsJson, app_id, release_id })

  // extract image_ids from repositories.json
  const baseImages = getImagesFromRepositoriesJson(balenaOsRepositoriesJson)

  // get manifests from registry for all images including pre-pre-loaded images (the ones inside the base image)
  const manifests = await getManifests([...baseImages, ...images], authHeaders)

  // precompute layers metadata for all layers
  const layers = await getLayers(manifests)

  // download and process layers, this is where most of the work is happening
  const layersInjectableFiles = await downloadProcessLayers({ manifests, layers, packStream, injectPath })

  // prepare images files
  const imagesInjectableFiles = getImagesConfigurationFiles(manifests)

  // generate repositories.json snipets for each images, merge everything and inject result
  const newRepositoriesJson = mergeRepositories({ manifests, originalRepositories: balenaOsRepositoriesJson })

  // prepare global metadata files
  const globalInjectable = [
    {
      header: { name: repositoriesJsonInjectionPath, mode: "0o644" },
      content: JSON.stringify(newRepositoriesJson),
    },
    {
      header: { name: "apps.json", mode: "0o644" },
      content: JSON.stringify(appsJson),
    },
  ]

  // inject all metadata files and folders
  for (const { header, content } of [...layersInjectableFiles, ...imagesInjectableFiles, ...globalInjectable]) {
    await packFile(header, content)
  }

  // close tarball
  packStream.finalize()
  logger.warn("==> FINISHED @streamPreloadingAssets")
  logger.verbose("==> change consoleLevel log levels in logger.mjs for less verbose logging")
}

export default streamPreloadingAssets
