#!/usr/bin/env zx

const inPath = path.join(__dirname, "in")
const outPath = path.join(__dirname, "out")
const apps = await fs.readJson(path.join(inPath, "apps.json"))

/** Extract images name/tag from apps.json */
const appId = Object.keys(apps.apps)[0]
const images = Object.keys(apps.apps[appId].services)
  .map(key => apps.apps[appId].services[key].image)

/** Get image id for image tag using `repositories.json` */
const repositories = await fs.readJson(path.join(inPath, 'var', 'lib', 'docker', 'image', 'overlay2', 'repositories.json'))

const imagesId = images
  .map(image => repositories.Repositories[image.split('@')[0].split(':')[0]][image].split(':')[1])

// clean out folder
await $`rm -rf ${outPath}`

/** Run extract for each image in the app */
for(let image of imagesId) {
  await $`./extract.mjs --image ${image}`
}
