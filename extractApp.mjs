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
await $`rm -rf ${path.join(inPath, 'images')}`
await $`mkdir ${outPath}`
await $`mkdir -p ${path.join(inPath, 'images')}`
await $`touch ${path.join(outPath, ".gitkeep")}`

/** Use scopio to pull images from the registry */
await Promise.all(
  images.map(async image => {
    const imageUrl = image.split("@")[0]
    const commitHash = image.split("@")[1]
    await $`./static.mjs --imageUrl ${imageUrl} --commitHash ${commitHash}`
  })
)

// tarball everything for injection
await $`tar -cvf ${path.join(outPath, "out.tar")} -C ${inPath} apps.json`
await $`tar -uvf ${path.join(outPath, "out.tar")} -C ${outPath} docker`
await $`cd ${outPath} && tar -uvf ${path.join(outPath, "out.tar")} *.repositories.json`