#!/usr/bin/env node

import { pipeline } from "stream"
import tar from "tar-stream"
import extract from "./extract.mjs"
import { tmpdir } from "os"
import { resolve } from "path"
import * as osfs from "fs"
import EventEmitter from "events"
import * as ext2fs from "ext2fs"
import * as FileDisk from "file-disk"
import * as PartitionInfo from "partitioninfo"
import zlib from "zlib"
import { $ } from "zx"

const x = tar.extract()
const gunzip = zlib.createGunzip()

const { argv } = process
const input = argv[2] ?? "/Users/edwinjoassart/Desktop/e79f12853a5bd723094ac96138bb6e64-soundtest-raspberrypi3-64-2.94.4-v12.11.36.img.etch.tar"
const output = argv[3] ?? "/tmp/preloaded.img"

if (!(output && input)) {
  console.error(`input and output are required. Got ${input} and ${output}`)
}

let imagePath
let partitions
let filehandle
let filedisk

const IMAGE_NAME = `etch-${Date.now()}-${(Math.random() * 1e10) | 0}.img`
const onImage = (_header, stream, next) => {
  // make a tmp path to store the image
  imagePath = resolve(tmpdir(), IMAGE_NAME)

  pipeline(stream, gunzip, osfs.createWriteStream(imagePath), async (err) => {
    // expand image and partition to 5gb
    // TODO: use node modules version instead of calling the cli

    const size = "5G"
    await $`qemu-img resize -f raw ${imagePath} ${size}`
    await $`node ./parted/parted.js --script ${imagePath} resizepart 4 ${size} resizepart 6 ${size}`
    const di = await $`hdiutil attach ${imagePath}`
    const diskImage = di.stdout.split(" ")[0]
    await $`umount ${diskImage}s6`
    await $`node ./resize2fs/resize2fs.js -f ${diskImage}s6`
    await $`hdiutil detach ${diskImage}`

    // prepare the image for loading
    partitions = (await PartitionInfo.getPartitions(imagePath)).partitions
    partitions.unshift(null) // one-indexed
    filehandle = await osfs.promises.open(imagePath, "r+")
    // new FileDisk(fd, readOnly, recordWrites,
    //  recordReads, discardIsZero=true)
    filedisk = new FileDisk.FileDisk(filehandle, false, true, true)

    next()
  })
}
const bifs = {}
const lazyFs = async (partitionNo) => {
  if (!bifs[partitionNo]) {
    const offset = partitions[partitionNo].offset
    bifs[partitionNo] = await ext2fs.mount(filedisk, offset)
  }
  return bifs[partitionNo].promises
}

const unpack = async () =>
  new Promise(async (resolve, reject) => {
    console.log("unpack")
    const fs = await lazyFs(6)

    const extraction = extract("/", {
      ignore: function (header) {
        return !header.name.includes("inject")
      },
      map: function (header) {
        preloadedFiles++
        printProgress(parseInt((preloadedFiles / filesToPreload) * 100))
        // remove 2 first folder (`/inject/6`)
        header.name = `/${header.name.split("/").slice(2).join("/")}`
        return header
      },
      fs,
      readable: true,
      writable: true,
    })

    osfs.createReadStream(input).pipe(extraction)

    extraction.on("finish", () => {
      resolve()
    })
  })

let filesToPreload = 0
let preloadedFiles = 0

// first file in the archive should be the manifest
const onEntry = async (_header, stream, next) => {
  // console.log("entry", _header.name)
  if (_header.name === "manifest.json") {
    console.log("manifest", await extractManifestFromStream(stream))
    stream.resume()
    next()
  } else if (_header.name === "image.zip") {
    onImage(_header, stream, next)
  } else {
    // skip
    stream.resume()
    filesToPreload++
    next()
  }
}

function printProgress(progress) {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(progress + "%")
}

// extract manifest from a stream
const extractManifestFromStream = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = []
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on("error", (err) => reject(err))
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
  })

// first thing, trigger onImage on first element we got out of archive
x.on("entry", onEntry)

x.on("finish", () => {
  console.log("finish")
})

pipeline(osfs.createReadStream(input), x, async (err) => {
  console.log("pipeline")
  await unpack()
  await osfs.promises.rename(imagePath, output)
  console.error(`Success!\nImage written to ${output}`)
})
