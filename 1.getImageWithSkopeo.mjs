#!/usr/bin/env zx

/**
 * Notes : 
 * - Skopeo has been installed on my system (macos) using brew before running this script
 * - you also need to change the user to match your balena cloud user (mind the `u_`)
 * - create an api key in the dashboard and copy it into an `api_key` file beside this script
 */

const user = 'u_edwin3'
const token = await $`cat < ./api_key`

const tmpFolder = '/tmp/preloadTest'
const workFolder = path.join(tmpFolder, 'work')
const outFolder = path.join(tmpFolder, 'out')

/** Get target state */
const targetState = await fs.readJSON(path.join(workFolder, 'apps.json'))

// extract image name (which are the registry url as well)
const appId = Object.keys(targetState.apps)[0]
const images = Object.keys(targetState.apps[appId].services).map(key => targetState.apps[appId].services[key].image)

/** Get image archives with Skopeo and store them in seperate folders */

for(const image of images) {
  const imageDir = path.join(workFolder, image.split('/').reverse()[0])
  await $`mkdir -p ${imageDir}`

  await $`skopeo copy docker://${image} dir:${imageDir} --src-creds ${user}:${token} --override-os linux --override-arch amd64` //FIXME: overrides os and arch are not necessary
}