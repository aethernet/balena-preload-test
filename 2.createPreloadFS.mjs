#!/usr/bin/env zx

const tmpFolder = '/tmp/preloadTest'
const inFolder = path.join(tmpFolder, 'work')
const outFolder = path.join(tmpFolder, 'out')

/** Clean up output dir */
await $`rm -rf ${outFolder}`
await $`mkdir ${outFolder}`

/** 
 * Generate a 16char alphanum key, 
 * create the link file in the layer folder 
 * and a symlink from the l/_key_ to _layer_/diff 
 * FIXME: PROTOTYPE : this method is not robust and needs to be replaced by a proper hash function, collision is a real threat here
 * */
const createLSymlink = async ({layerName, outFolder}) => {
  const linkShort = [...Array(16).keys()].map(() => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 34)]).join('')
  // add a `link` file in the layer folder with the ref of the link
  await $`echo ${linkShort} > ${path.join(outFolder, layerName, 'link')}`
  // add a symlink in the `l` folder pointing back to the layer diff folder
  // await $`ln -s ${path.join(outFolder, layerName, 'diff')} ${path.join(outFolder, 'l', linkShort)}`
}

/** Read manifest */
const manifest = await fs.readJSON(path.join(inFolder, 'manifest.json'))

const mainLayerSha256 = manifest.config.digest.replace('sha256:', '')

const layersSha256 = manifest.layers.map(layer => layer.digest?.replace('sha256:', ''))

/** Create folder structure and uncompress tgz to diff folders */

// Create the `l` directory
await $`mkdir -p ${path.join(outFolder, 'overlay2', 'l')}`

// main image layer has the image manifest and a few other references
await $`mkdir -p ${path.join(outFolder, 'overlay2', mainLayerSha256)}`
await $`touch ${path.join(outFolder, 'overlay2', mainLayerSha256, 'commited')}`
await $`mkdir ${path.join(outFolder, 'overlay2', mainLayerSha256, 'work')}`
await $`mkdir ${path.join(outFolder, 'overlay2', mainLayerSha256, 'diff')}`
await createLSymlink({layerName: mainLayerSha256, outFolder: path.join(outFolder, 'overlay2')})

for (let layer of layersSha256) {
  await $`mkdir -p ${path.join(outFolder, 'overlay2', layer, 'diff')}`
  await $`tar -zxvf ${path.join(inFolder, layer)} -C ${path.join(outFolder, 'overlay2', layer, 'diff')}`
  await createLSymlink({layerName: layer, outFolder: path.join(outFolder, 'overlay2')})
}

/** Produce portion of repositories.json which we'll merge on next stage 
 * FIXME: registry address needs to come from somewhere and will be the name of the image
 * It's probably important it stays consistent for updates to work
 * Same for the sha256 of the latest commit
 * 
 * Note that this hardcoded version comes from a cli preloaded image
*/
const repositories = {
  'Repositories': {
    'registry2.balena-cloud.com/v2/a42656089dcef7501aae9dae4687a2c5': {
      'registry2.balena-cloud.com/v2/a42656089dcef7501aae9dae4687a2c5:latest': `sha256:${mainLayerSha256}`,
      'registry2.balena-cloud.com/v2/a42656089dcef7501aae9dae4687a2c5@sha256:0ae9a712a8c32ac04b91d659a9bc6d4bb2e76453aaf3cfaf036f279262f1f100': `sha256:${mainLayerSha256}`
    },
  },
}

await $`mkdir -p ${path.join(outFolder, 'image', 'overlay2')}`
await $`echo ${JSON.stringify(repositories)} > ${path.join(outFolder, 'image', 'overlay2', 'repositories.json')}`

/** 
 * Produces apps.json (no merge necessary) 
 * This is the target state of the supervisor once our app runs
 * No need to deal with that now, first step is to see if the image is properly loaded and available if we want to run it :
 * */