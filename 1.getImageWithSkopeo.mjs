#!/usr/bin/env zx

const registry = 'registry-proxy.balena-cloud.com'
const imageSlug = 'edwin3/files_aarch64'
const tmpFolder = '/tmp/preloadTest'

const workFolder = path.join(tmpFolder, 'work')
const outFolder = path.join(tmpFolder, 'out')

/** Clean up */
await $`rm -rf ${tmpFolder}`
await $`mkdir -p ${workFolder}`
await $`mkdir -p ${outFolder}`

/** Get image archives with Skopeo */

await $`skopeo copy docker://${registry}/${imageSlug} dir:${workFolder} --override-os linux --override-arch amd64`
