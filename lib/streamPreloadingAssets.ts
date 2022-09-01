import path from "path"
import { env } from 'process';
import { getManifests } from "./registry"
import { buildRepositories, repositoriesJsonInjectionPath } from "./repositoriesjson"
import { streamBaseImage } from "./baseImage"
import { getAppsJson, getImageIds } from "./appsJson"
import { getLayers, downloadProcessLayers } from "./layers"
import { promisePacker, getTarballStream } from "./packer"
import { getImagesConfigurationFiles } from "./images"
import { getSupervisorImageNameFor } from "./supervisor"
import logger from "../logger"

interface PreloadOptions {
  outputStream: NodeJS.WritableStream
  balenaosStream: NodeJS.ReadableStream
  balenaosSize: number
  balenaos: string
  app_id: string
  release_id: string
  api: string
  token: string
  arch: string
  output: string
  balenaosRef: string
  dataPartition: number
  supervisorVersion: string
}

/**
 * Main Processing function
 *
 * Timing is important.
 * As we're outputing to a tar stream
 * We need to act synchronously as we stream files one at a time in the output pipe
 */
const streamPreloadingAssets = async ({
  outputStream,
  balenaosStream,
  balenaosSize,
  supervisorVersion,
  arch,
  app_id,
  release_id,
  balenaosRef,
  dataPartition = 6,
}: PreloadOptions): Promise<void> => {
  // ##############
  // Processing
  // ##############
  logger.warn("==> STARTING @streamPreloadingAssets")

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

  await packManifest({ name: "manifest.json", mode: 644 }, JSON.stringify(manifest))

  // Beware that knowing the file size in advance is mandatory
  const baseImageStreamEntry = packStream.entry({
    // TOOD: name: `${balenaosRef}.img`, // switch when inject.mjs select baseimage from manifest (currently hardcoded)
    name: "image.img",
    mode: 644,
    size: balenaosSize,
  })

  await streamBaseImage({ pipeStreamFrom: balenaosStream, pipeStreamTo: baseImageStreamEntry })

  // get apps.json
  const appsJson = await getAppsJson({ app_id, release_id })

  // extract image_ids from appsJson
  const images = getImageIds({ appsJson, app_id, release_id })

  // get the supervisor image
  const baseImages = [
    {
      image_name: await getSupervisorImageNameFor({
        version: supervisorVersion,
        arch,
        api: env.API,
        token: env.API_TOKEN,
      }),
      image_hash: "latest",
      isSupervisor: true,
      supervisorVersion,
    },
  ]

  // get manifests from registry for all images including pre-pre-loaded images (the ones inside the base image)
  const imagesbaseAndPreload = [...baseImages, ...images]
  const manifests = await getManifests(imagesbaseAndPreload)

  // precompute layers metadata for all layers
  const layers = await getLayers(manifests)

  // download and process layers, this is where most of the work is happening
  const layersInjectableFiles = await downloadProcessLayers({ manifests, layers, packStream, injectPath })

  // prepare images files
  const imagesInjectableFiles = getImagesConfigurationFiles(manifests)

  // generate repositories.json snipets for each images, merge everything and inject result
  const newRepositoriesJson = buildRepositories({ manifests })

  // prepare global metadata files
  const globalInjectable = [
    {
      header: { name: repositoriesJsonInjectionPath, mode: 644 },
      content: JSON.stringify(newRepositoriesJson),
    },
    {
      header: { name: "apps.json", mode: 644 },
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
