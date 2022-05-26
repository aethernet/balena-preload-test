#!/usr/bin/env zx

/** 
 * 
 * Injecting all images in the sd card
 * Merging all repositories.json into one (one per images and one from the os)
 * Injecting apps.json
 * 
 * Notes :
 * Before launching this script : 
 * I flashed a stock balenaos.img to sd card (pi 4 / 64bits)
 * I pushed it into an (offline) pi and boot it up so the data partition is extended to it's full size
 * I removed it from the pi and put it back into my laptop sdcard reader
 * I mounted the card on my laptop (macbook m1) using `extFS for mac` (paid soft from paragon, should also work with fuse and extfuse, hopefully the 10 days demo of extFS for mac will be enough to finish this feature :D)
 * 
 * Then I laucnh this script
 * 
 * This process should be replaced by :
 * - using a pre-expanded balenaos.img (an image with a few gig of free space at the end of the partition 5)
 * - using `balana-image-fs` to copy files into the image without having to mount it
 * 
 * In the next series of test, this should be applied on the image using balena-image-fs pre-flash
 * 
 * More notes : 
 * - the merging function could be part of the .etch manifest.json files
 * - the list of images should come fom the .etch manifest.json files
 */

const resinDataDockerPath = '/Volumes/resin-data/docker'
const inFolder = '/tmp/preloadTest/out'

/** 
 * Merge Repositories.json together 
 * This function could be part of the .etch file
 * Then it's applied using a reducer on top of the files coming from all layers
 * If we need to merge other files, we can pass another merge function to the reducer
 * */
const mergeRepositories = (original, injection) => ({
  ...original,
  Repositories: {
    ...original.Repositories,
    ...injection.Repositories
  }
})

// list images -> in a .etch files, this list would come from `manifest.json`
/** utils: return all subdirectory of arg (no files) */
const listDirs = async (directory) => {
    const elements = await fs.readdir(directory, { withFileTypes: true })
    return elements
      .filter(element => !element.isFile())
      .map(element => element.name)
}

const images = await listDirs(inFolder)

// Future array of all repositories.json that should be merged
const osRepositories = await fs.readJSON(path.join(resinDataDockerPath, 'image', 'overlay2', 'repositories.json'))
const repositories = [osRepositories]

for (const image of images) {
  const imgPath = path.join(inFolder, image)
  
  // copy layers on SD
  await $`cp -Rf ${path.join(imgPath, 'overlay2')}/ ${path.join(resinDataDockerPath, 'overlay2')}`
  
  // add repositories to the list of repositories to be merged
  repositories.push(await fs.readJSON(path.join(imgPath, 'image', 'overlay2', 'repositories.json')))
}

// merge repositories.json
const mergedRepositories = repositories.reduce((acc, repository) => mergeRepositories(acc, repository))

// inject repositories.json
await $`echo ${JSON.stringify(mergedRepositories)} > ${path.join(resinDataDockerPath, 'image', 'overlay2', 'repositories.json')}`

// inject apps.json
await $`cp ${path.join(inFolder, 'apps.json')} ${path.join(resinDataDockerPath, 'apps.json')}`