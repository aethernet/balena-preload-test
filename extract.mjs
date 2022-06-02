#!/usr/bin/env zx

import crypto from "crypto"

/**
 * parameter : name of the image we're looking for with tag; provided using `--image` argument
 */
const imageId = argv.image

if (!imageId) {
  throw new Error("No Image Id provided; please use `--image` to pass the id of the image you want to extract")
}

// constant
const inPath = path.join(__dirname, "in")
const basePath = path.join(inPath, "var", "lib", "docker")
const imagePath = path.join(basePath, "image", "overlay2")

const outPath = path.join(__dirname, "out")
const outBasePath = path.join(outPath, "docker")
const outImagePath = path.join(outBasePath, "image", "overlay2")

// // inspect.json has to be copied from host, in a "real world" scenario, this would directly come from "docker inspect _image id or name_"
// const inspectRaw = await fs.readJson(path.join(__dirname, "in", "inspect.json"))
// const inspect = inspectRaw.find(image => image.Id === `sha256:${imageId}`)

// get the manifest for the image
const inspect = await fs.readJson(path.join(imagePath, "imagedb", "content", "sha256", imageId))

/**
 * get layerdb first element (the one where diffId == pathId)
 *
 * Notes about how they're built :
 * Layers in the json are labbeled using diffId (sha256 based on the content of the uncompressed diff folder)
 * Layers in the folder are named using pathId which is a sha256 of a string composed of the diffId of the layer, a space, and the pathId of the parent layer
 * As the highest layer has no parent diffid == pathid.
 *
 * We'll compute each chainId and double check using the `parent` file contained into the folder (it should contains the `chainId` of the parent layer)
 *
 */
const layers = []

for (let key = 0; key < inspect.rootfs.diff_ids.length; key++) {
  const diffId = inspect.rootfs.diff_ids[key]

  // first layer has no parent so chainId = diffId
  if (key === 0) {
    layers.push(diffId.split(":")[1])
    continue
  }

  // all other layers chainId is a sha256 hash of `chainId(n-1) diffId(n)`
  layers.push(
    crypto
      .createHash("sha256")
      .update(`sha256:${layers[key - 1]} ${diffId}`)
      .digest("hex")
  )
}

/**
 * get overlays2 folder ids from layers `cache-id` file
 * get `links` for each overlay2, those are symlinks (shorter names) from the `/var/lib/docker/overlay2/l` folder pointing back to a `overlay2/_sha256_/diff`
 *
 * those links are stored as plain text in each `/var/lib/docker/overlay2/_sha256_/link` file
 * */
const overlays2 = []
const ls = []
for (let layer of layers) {
  const overlay = await $`cat ${path.join(imagePath, "layerdb", "sha256", layer, "cache-id")}`
  overlays2.push(overlay.stdout)
  const l = await $`cat ${path.join(basePath, "overlay2", overlay.stdout, "link")}`
  ls.push(l.stdout)
}

/**
 * extract snippet from /var/lib/docker/image/overlay2/repositories.json
 * this extract will have to be merged with the existing repositories.json when injecting
 *
 * we might have more than one tag for each image id
 */

const repositories = await fs.readJson(path.join(imagePath, "repositories.json"))

const repositoriesExtract = {}

for (const repo in repositories.Repositories) {
  for (const tag in repositories.Repositories[repo]) {
    if (repositories.Repositories[repo][tag] === `sha256:${imageId}`) repositoriesExtract[repo] = repositories.Repositories[repo]
  }
}

/** copy everything we identified to `out` folder */

// create folder structure
await $`mkdir -p ${path.join(outPath, "docker", "overlay2", "l")}`
await $`mkdir -p ${path.join(outPath, "docker", "image", "overlay2", "imagedb", "content", "sha256")}`
await $`mkdir -p ${path.join(outPath, "docker", "image", "overlay2", "imagedb", "metadata", "sha256")}`
await $`mkdir -p ${path.join(outPath, "docker", "image", "overlay2", "layerdb", "sha256")}`

// copy overlay2
for (let overlay of overlays2) {
  // some layers my be shared across images which cause copy issue
  const exist = fs.existsSync(path.join(outBasePath, "overlay2", overlay))
  if (!exist) await $`cp -Rf ${path.join(basePath, "overlay2", overlay)} ${path.join(outBasePath, "overlay2", overlay)}`
}

// copy layers in image/layerdb
for (let layer of layers) {
  // shouldn't be as much a problem as for overlay, but for good measure
  const exist = fs.existsSync(path.join(outImagePath, "layerdb", "sha256", layer))
  if (!exist) await $`cp -Rf ${path.join(imagePath, "layerdb", "sha256", layer)} ${path.join(outImagePath, "layerdb", "sha256", layer)}`
}

// copy links in overlay2/l
for (let link of ls) {
  // same as overlay
  const exist = fs.existsSync(path.join(outBasePath, "overlay2", "l", link))
  if (!exist) await $`cp -Rfn ${path.join(basePath, "overlay2", "l", link)} ${path.join(outBasePath, "overlay2", "l", link)}`
}

// write repositories extract for merging
$`echo ${JSON.stringify(repositoriesExtract)} > ${path.join(outPath, `${imageId}.repositories.json`)}`

/** copy imagedb/content/_sha256_ json */
await $`cp ${path.join(imagePath, "imagedb", "content", "sha256", imageId)} ${path.join(outImagePath, "imagedb", "content", "sha256", imageId)}`

/** copy imagedb/metadata/_sha256_ dir */
await $`cp -Rf ${path.join(imagePath, "imagedb", "metadata", "sha256", imageId)} ${path.join(outImagePath, "imagedb", "metadata", "sha256")}`

/** copy apps.json */
await $`cp ${path.join(inPath, "apps.json")} ${path.join(outPath, "apps.json")}`
