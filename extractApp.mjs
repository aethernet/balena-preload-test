#!/usr/bin/env zx
import { makeDirectories, makeFiles } from './utilities.mjs'

const inPath = path.join(__dirname, 'in')
const outPath = path.join(__dirname, 'out')

// clean out folder
await $`rm -rf ${outPath}`
if (!argv.skipDownload) await $`rm -rf ${path.join(inPath, 'images')}`

// create work directories
const workDirectories = [
    {pathStr: inPath, mode: '0777'},
    {pathStr: outPath, mode: '0777'},
    {pathStr: `${inPath}/images`, mode: '0777'},
]
makeDirectories(workDirectories)

await $`touch ${path.join(outPath, ".gitkeep")}`

const apps = await fs.readJson(path.join(inPath, "apps.json"))

/** Extract images name/tag from apps.json */
const appId = Object.keys(apps.apps)[0]
const releaseId = Object.keys(apps.apps[appId].releases)[0]
const services = Object.keys(apps.apps[appId].releases[releaseId].services)
console.log('services =>', services)

// Map runs in parallel, do we need to change this too? I can't tell because I only have one service.
const images = services.map((key) => apps.apps[appId].releases[releaseId].services[key].image)
console.log('images =>', images)
/** Use scopio to pull images from the registry */
// We should process image in sequence instead of parallel to avoid clash with shared layers (or have a smarter optimization mechanism)
for (const image of images) {
  const imageUrl = image.split("@")[0]
  const commitHash = image.split("@")[1]
  await $`./static-v3.mjs --imageUrl ${imageUrl} --commitHash ${commitHash} ${argv.skipDownload ? '--skipDownload':''}`
}

// tarball everything for injection
if (!argv.skipTar) {
  await $`tar -cvf ${path.join(outPath, "out.tar")} -C ${inPath} apps.json`
  await $`tar -uvf ${path.join(outPath, "out.tar")} -C ${outPath} docker`
  await $`cd ${outPath} && tar -uvf ${path.join(outPath, "out.tar")} *.repositories.json`
}