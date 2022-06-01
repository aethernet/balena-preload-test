#!/usr/bin/env zx

/**
 * parameter : name of the image we're looking for with tag; can be provided using `--image` argument
 */
const imageId = argv.image

// constant
const inPath = path.join(__dirname, "in")
const basePath = path.join(inPath, "var", "lib", "docker")
const imagePath = path.join(basePath, "image", "overlay2")

const outPath = path.join(__dirname, "out")
const outBasePath = path.join(outPath, "docker")
const outImagePath = path.join(outBasePath, "image", "overlay2")

// inspect.json has to be copied from host, in a "real world" scenario, this would directly come from "docker inspect _image id or name_"
const inspectRaw = await fs.readJson(path.join(__dirname, "in", "inspect.json"))
const inspect = inspectRaw.find(image => image.Id === `sha256:${imageId}`)

if (`sha256:${imageId}` !== inspect.Id) throw new Error(`Image ids doesn't match ${imageId} ${inspect.Id}`)

// (split on @ in case it's tag by a commit, or : in case it's tag with a version (i.e. latest))
const imageNames = inspect.RepoTags.map((name) => name.split("@")[0].split(":")[0])

/**
 * get overlays2 folder list
 * */
const overlays2 = [
  inspect.GraphDriver.Data.UpperDir.split("/").reverse()[1],
  inspect.GraphDriver.Data.LowerDir.split(":").map((overlay) => overlay.split("/").reverse()[1]),
].flat()

/**
 * get `links` for each overlay2, those are symlinks (shorter names) from the `/var/lib/docker/overlay2/l` folder pointing back to a `overlay2/_sha256_/diff`
 * those links are stored as plain text in each `/var/lib/docker/overlay2/_sha256_/link` file
 */
const ls = []
for (const overlay of overlays2) {
  const l = await $`cat ${path.join(basePath, "overlay2", overlay, "link")}`
  ls.push(l.stdout)
}

/**
 * get layerdb first element (the one where diffId == pathId)
 *
 * Notes about how they're built :
 * Layers in the json are labbeled using diffId (sha256 based on the content of the uncompressed diff folder)
 * Layers in the folder are named using pathId which is a sha256 of a string composed of the diffId of the layer, a space, and the pathId of the parent layer
 * As the highest layer has no parent diffid == pathid. This is our entry point
 * Each layer on disk has a "parent" file which contains the pathId of the parent, that's how we navigate into this mess
 */
const layers = [inspect.RootFS.Layers[0].split(":")[1]]

for (let i = 0; i < inspect.RootFS.Layers.length - 1; i++) {
  // find which folder on disk has previous layerId as parent; because of zx limitation we offload the search to a bash script
  const newLayer = await $`./findLayerByParent.sh ${path.join(imagePath, "layerdb", "sha256")} ${layers[i]}`
  layers.push(newLayer.stdout.split("/").reverse()[1])
}

/** Double check that we have all layers using the `cache-id` file of the layer */
if (layers.length !== overlays2.length) throw new Error(`Overlay2 and Layerdb doens't contains the same number of folder : ${overlays2.length} vs ${layers.length}`)

for (let layer of layers) {
  const cacheId = await $`cat ${path.join(imagePath, "layerdb", "sha256", layer, "cache-id")}`
  if(!overlays2.map(id => `${id}`).includes(`${cacheId}`)) throw new Error(`Overlay2 doens't match cache id of layer ${cacheId}, ${overlays2.indexOf(cacheId)}`)
}

/**
 * extract snippet from /var/lib/docker/image/overlay2/repositories.json
 * this extract will have to be merged with the existing repositories.json when injecting
 */

const repositories = await fs.readJson(path.join(imagePath, "repositories.json"))

const repositoriesExtract = {}

for (let name of imageNames) {
  repositoriesExtract[name] = repositories.Repositories[name]
}

/** copy everything we identified to `out` folder */

// create folder structure
await $`mkdir -p ${path.join(outPath, "docker", "overlay2", "l")}`
await $`mkdir -p ${path.join(outPath, "docker", "image", "overlay2", "imagedb", "content", "sha256")}`
await $`mkdir -p ${path.join(outPath, "docker", "image", "overlay2", "imagedb", "metadata", "sha256")}`
await $`mkdir -p ${path.join(outPath, "docker", "image", "overlay2", "layerdb", "sha256")}`

// copy overlay2
for (let overlay of overlays2) {
  $`cp -Rf ${path.join(basePath, "overlay2", overlay)} ${path.join(outBasePath, "overlay2", overlay)}`
}

// copy layers in image/layerdb
for (let layer of layers) {
  $`cp -Rf ${path.join(imagePath, "layerdb", "sha256", layer)} ${path.join(outImagePath, "layerdb", "sha256", layer)}`
}

// copy links in overlay2/l
for (let link of ls) {
  $`cp -Rf ${path.join(basePath, "overlay2", "l", link)} ${path.join(outBasePath, "overlay2", "l", link)}`
}

// write repositories extract for merging
$`echo ${JSON.stringify(repositoriesExtract)} > ${path.join(outPath, `${imageId}.repositories.json`)}`

/** copy imagedb/content/_sha256_ json */
$`cp ${path.join(imagePath, "imagedb", "content", "sha256", imageId)} ${path.join(outImagePath, "imagedb", "content", "sha256", imageId)}`

/** copy imagedb/metadata/_sha256_ dir */
$`cp -Rf ${path.join(imagePath, "imagedb", "metadata", "sha256", imageId)} ${path.join(outImagePath, "imagedb", "metadata", "sha256")}`

/** copy apps.json */
$`cp ${path.join(inPath, "apps.json")} ${path.join(outPath, "apps.json")}`