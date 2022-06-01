#!/usr/bin/env zx

const inPath = path.join(__dirname, "in")
const outPath = path.join(__dirname, "out")
const apps = await fs.readJson(path.join(__dirname, "in", "apps.json"))

console.log(apps)

const appId = Object.keys(apps.apps)[0]
const images = Object.keys(apps.apps[appId].services)
  .map(key => apps.apps[appId].services[key].image)

/** 
 * FIXME : Here 
 * Here we would loop over `images` and do `docker inspect _iamge_`  for each of those, 
 * as we don't have access to the engine in this env; we'll just simulate that manually
 * 
*/

// clean out folder
await $`rm -rf ${outPath}`

/** Run extract for each image in the app */
const imagesId = [
  'eade27e71cefb1067d7fd15d5d754ab9fb31471e9478068cff97b8e530efdd35',
  'bfe7e8cf4d58cb61701dd110ee0560f3b64bbc5c09043c8529c8841a19533363'
]

for(let image of imagesId) {
  await $`./extract.mjs --image ${image}`
}