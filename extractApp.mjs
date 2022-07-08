#!/usr/bin/env zx

const inPath = path.join(__dirname, "in")
const outPath = path.join(__dirname, "out")
const apps = await fs.readJson(path.join(inPath, "apps.json"))

/** Extract images name/tag from apps.json */
const appId = Object.keys(apps.apps)[0]
const releaseId = Object.keys(apps.apps[appId].releases)[0]
const images = Object.keys(apps.apps[appId].releases[releaseId].services).map((key) => apps.apps[appId].releases[releaseId].services[key].image)

// clean out folder
await $`rm -rf ${outPath}`
await $`mkdir ${outPath}`
await $`touch ${path.join(outPath, ".gitkeep")}`

/** Use scopio to pull images from the registry */
for (const image of images) {
  const imageUrl = image.split("@")[0]
  const commitHash = image.split("@")[1]
  $`./static.mjs --imageUrl ${imageUrl} --commitHash ${commitHash}`
}

/** copy apps.json */
$`cp ${path.join(inPath, "apps.json")} ${path.join(outPath, "apps.json")}`
