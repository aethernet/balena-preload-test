#!/usr/bin/env zx

await $`./0.getTargetState.mjs`
await $`./1.getImageWithSkopeo.mjs`
await $`./2.createPreloadFS.mjs`
      $`./2.1.compressArtifact.mjs`
await $`./3.inject.mjs`

console.log('--------------------------------')
console.log('----------- INJECTED -----------')
console.log('--------------------------------')
console.log('wait for the script to end for all the assets to be compressed')
