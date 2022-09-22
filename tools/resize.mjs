#!/usr/bin/env zx

const image = "/Users/edwinjoassart/Desktop/image.img"

// will only work with qemu-img installed on device
// this is made for mac
// don't know yet of a better way of resizing the image prior to expansion

const size = "5G"

await $`qemu-img resize -f raw ~/Desktop/image.img ${size}`
await $`node ./parted/parted.js --script ${image} resizepart 4 ${size} resizepart 6 ${size}`
await $`open ${image}`
const di = await $`diskutil list`.pipe($`grep "disk image"`)
const diskImage = di.stdout.split(" ")[0]
await $`node ./resize2fs/resize2fs.js ${diskImage}s6`
await $`diskutil eject ${diskImage}`
