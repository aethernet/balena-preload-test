#!/usr/bin/env zx

const inPath = path.join(__dirname, "in")
const outPath = path.join(__dirname, "out")
const apps = await fs.readJson(path.join(inPath, "apps.json"))

/** Extract images name/tag from apps.json */
const appId = Object.keys(apps.apps)[0]
const releaseId = Object.keys(apps.apps[appId].releases)[0]
const images = Object.keys(apps.apps[appId].releases[releaseId].services).map((key) => apps.apps[appId].releases[releaseId].services[key].image)

/** Get image id for image tag using `repositories.json` */
const repositories = await fs.readJson(path.join(inPath, "var", "lib", "docker", "image", "overlay2", "repositories.json"))

const imagesId = images.map((image) => repositories.Repositories[image.split("@")[0].split(":")[0]][image].split(":")[1])

// clean out folder
await $`rm -rf ${outPath}`
await $`mkdir -p ${outPath}`
await $`touch ${path.join(outPath, ".gitkeep")}`

await $`tar -cvf ${path.join(outPath, "out.tar")} -C ${inPath} apps.json`

/** Run extract for each image in the app */
for (let image of imagesId) {
  await $`./extract.mjs --image ${image}`
}
