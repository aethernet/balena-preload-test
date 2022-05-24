#!/usr/bin/env zx

/** 
 * Notes :
 * I've flashed a stock balenaos.img to sd card (pi 4 / 64bits)
 * I mounted the card on my laptop (macbook m1) using `extFS for mac` (paid)
 * So I'll be able to copy files to the sd card as it
 * 
 * In the next series of test, this should be applied on the image using balena-image-fs pre-flash
 */

const resinDataDockerPath = '/Volumes/resin-data/docker'
const inFolder = '/tmp/preloadTest/out'

const originRepositoriesJson = await fs.readJSON(path.join(resinDataDockerPath, 'image', 'overlay2', 'repositories.json'))
const injectRepositoriesJson = await fs.readJSON(path.join(inFolder, 'image', 'overlay2', 'repositories.json'))

const mergeRepositories = {
  ...originRepositoriesJson,
  Repositories: {
    ...originRepositoriesJson.Repositories,
    ...injectRepositoriesJson.Repositories
  }
}

await $`cp -Rf ${path.join(inFolder, 'overlay2')}/ ${path.join(resinDataDockerPath, 'overlay2')}`
await $`echo ${JSON.stringify(mergeRepositories)} > ${path.join(resinDataDockerPath, 'image', 'overlay2', 'repositories.json')}`
