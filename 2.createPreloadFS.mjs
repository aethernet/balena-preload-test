#!/usr/bin/env zx

/** 
 * Here we create all the assets so they can be copied into the balaneos image 
 * Each images is it's own folder
 * Apps.json is forwarded as it
 * 
 * FIXME :
 * - We need to generate "short name" for the layers and link them up to the actual layer. This mechanism is to prevent `mount` to fail due to too long parameters.
 * Those `short names` are generated in a rather crude way, which is not robust against collision. A better solution should be found.
 * 
*/

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
  const linkShort = [...Array(26).keys()].map(() => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 34)]).join('')
  // add a `link` file in the layer folder with the ref of the link
  await $`echo ${linkShort} > ${path.join(outFolder, layerName, 'link')}`
  // add a symlink in the `l` folder pointing back to the layer diff folder
  await $`ln -s ${path.join(outFolder, layerName, 'diff')} ${path.join(outFolder, 'l', linkShort)}`

  return linkShort
}

const prepareImage = async ({imageFolder, imageName, imageTag, outFolder}) => {
  /** Read manifest */
  const manifest = await fs.readJSON(path.join(imageFolder, 'manifest.json'))

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
  await $`mkdir -p ${path.join(outFolder, 'image', 'overlay2', 'imagedb', 'content', 'sha256')}`
  await $`cp ${path.join(imageFolder, mainLayerSha256)} ${path.join(outFolder, 'image', 'overlay2', 'imagedb', 'content', 'sha256', mainLayerSha256)}`
  await createLSymlink({layerName: mainLayerSha256, outFolder: path.join(outFolder, 'overlay2')})

  // prepare the lower file that will be populate with layers links
  const lower = []

  // all other layers
  for (const layer of layersSha256) {
    await $`mkdir -p ${path.join(outFolder, 'overlay2', layer, 'diff')}`
    await $`tar -zxvf ${path.join(imageFolder, layer)} -C ${path.join(outFolder, 'overlay2', layer, 'diff')}`
    const link = await createLSymlink({layerName: layer, outFolder: path.join(outFolder, 'overlay2')})
    lower.push(`l/${link}`)
  }
  
  // add the `lower` file containing the full chain of lower overlays for the main folder
  await $`echo ${lower.join(':')} > ${path.join(outFolder, 'overlay2', mainLayerSha256, 'lower')}`

  // same of subsequent folders
  for (const layer of layersSha256) {
    lower.shift()
    await $`echo ${lower.join(':')} > ${path.join(outFolder, 'overlay2', layer, 'lower')}`
  }
  
  /** Prepare repositories.json which we be merged with the existing repositories */
  const repositories = {
    Repositories: {
      [imageName]: {
        [`${imageName}:latest`]: `sha256:${mainLayerSha256}`,
        [`${imageName}@${imageTag}`]: `sha256:${mainLayerSha256}`
      }
    }
  }
  
  await $`mkdir -p ${path.join(outFolder, 'image', 'overlay2')}`
  await $`echo ${JSON.stringify(repositories)} > ${path.join(outFolder, 'image', 'overlay2', 'repositories.json')}`
}

// prepare all images we need to import

/** utils: return all subdirectory of arg (no files) */
const listDirs = async (directory) => {
    const elements = await fs.readdir(directory, { withFileTypes: true })
    return elements
      .filter(element => !element.isFile())
      .map(element => element.name)
}

const images = await listDirs(inFolder)

for (const image of images) {
  const imageName = `registry2.balena-cloud.com/v2/${image.split('@')[0]}`
  await prepareImage({
    imageName,
    imageTag: image.split('@').reverse()[0],
    imageFolder: path.join(inFolder, image),
    outFolder: path.join(outFolder, image)
  })
}

// copy apps.json
await $`cp ${path.join(inFolder, 'apps.json')} ${path.join(outFolder, 'apps.json')}`