#!/usr/bin/env node

import { pipeline } from "stream"
import tar from "tar-stream"
import tarfs from "tar-fs"
import { tmpdir } from "os"
import { resolve } from "path"
import * as osfs from "fs"
import EventEmitter from "events"
import * as ext2fs from "ext2fs"
import * as FileDisk from "file-disk"
import * as PartitionInfo from "partitioninfo"
import zlib from "zlib"
import { $ } from "zx"

// we don't know how many files there will be
EventEmitter.setMaxListeners(0)

const x = tar.extract()
const gunzip = zlib.createGunzip()

const usage = () => {
  console.error(
    `Usage:
inject.mjs extracts assets from a etcher archive and
injects the into a disk image

  inject.mjs /path/to/input /path/to/output

Preparing archive:
  archive should be created first with the disk image, then with
  directory of file to inject under the 'inject' directory,
  with the partition number as the subdirectory.
    > tar cvvf /path/to/input /path/to/disk/image /path/to/inject

Example:
  For this example, we assume the following file tree:
    .
    ├── image.img
    └── inject
        └── 5
            ├── testfile1.txt
            └── testfile2.txt -> ./testfile1.txt
  where we with to inject the file 'testfile1.txt' into the
  root directory of partition 5

  1. Prepare archive
    tar cvvf test.tar ./image.img inject
  2. Extract disk image while injecting files:
    inject.mjs ./image.img inject
`
  )
  process.exit(1)
}

const { argv } = process
// if (~argv.indexOf("-h")) {
//   usage()
// }

const input = argv[2] ?? "/Users/edwinjoassart/Desktop/e79f12853a5bd723094ac96138bb6e64-soundtest-raspberrypi3-64-2.94.4-v12.11.36.img.etch.tar"
const output = argv[3] ?? "/tmp/preloaded.img"
if (!(output && input)) {
  console.error(`input and output are required. Got ${input} and ${output}`)
  usage()
}

const cleanup = () => {
  if (imagePath) {
    try {
      for (const fs of Object.values(bifs)) {
        fs.umount()
      }
      osfs.statSync(imagePath)
      osfs.unlinkSync(imagePath)
    } catch (err) {}
  }
}
const cleanupErr = (err, cb) => {
  if (err) {
    console.error(err)
    cleanup()
    process.exit(1)
  }
  if (typeof cb === "function") cb()
}

process.on("uncaughtException", cleanupErr)

let imagePath
let partitions
let filehandle
let filedisk

const IMAGE_NAME = `etch-${Date.now()}-${(Math.random() * 1e10) | 0}.img`
const onImage = (_header, stream, next) => {
  console.log("on Image")

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
    cleanupErr(err)
    partitions = (await PartitionInfo.getPartitions(imagePath)).partitions
    partitions.unshift(null) // one-indexed
    filehandle = await osfs.promises.open(imagePath, "r+")
    // new FileDisk(fd, readOnly, recordWrites,
    //  recordReads, discardIsZero=true)
    filedisk = new FileDisk.FileDisk(filehandle, false, true, true)
    // x.on("entry", onMember)
    // x.end()
    unpack()
  })
}
const bifs = {}
const lazyFs = async (partitionNo) => {
  if (!bifs[partitionNo]) {
    try {
      const offset = partitions[partitionNo].offset
      bifs[partitionNo] = await ext2fs.mount(filedisk, offset)
    } catch (err) {
      cleanupErr(`Could not mount partition ${partitionNo}\n${err.message}. Is this an ext partition?`)
    }
  }
  return bifs[partitionNo].promises
}

const unpack = async () => {
  console.log("unpack", imagePath)

  const fs = await lazyFs(6)

  osfs.createReadStream(input).pipe(
    tarfs.extract("/", {
      ignore: function (name, header) {
        return header.type === "link" || name === "image.zip" || name === "manifest.json"
      },
      fs,
      readable: true,
      writable: true,
    })
  )
}
// const writeStreams = []
// const onMember = async (header, stream, next) => {
//   await write(header, stream)
//   next()
// }

// const write = (header, stream) =>
//   new Promise(async (resolve, reject) => {
//     // we should stop on write end not stream end
//     // stream.on("end", resolve(true))

//     let [directive, partitionNo, ...parts] = header.name.split("/")
//     if (!parts[0]) {
//       reject("no path")
//     }

//     partitionNo = Number(partitionNo)

//     if (isNaN(partitionNo)) cleanupErr(`inject subdirectory must be a partition number, got ${partitionNo}`)
//     if (!partitions[partitionNo]) cleanupErr(`partition ${partitionNo} not found.`)
//     if (directive !== "inject") cleanupErr(`Directory '${directive}' not recognized.`)

//     // lazyFS will get our partition and create the folder structure if required
//     const fs = await lazyFs(partitionNo)
//     let dir = ""
//     for (const part of parts.slice(0, parts.length - 1)) {
//       dir += "/" + part
//       try {
//         const stat = await fs.stat(dir)
//         if (!stat.isDirectory()) cleanupErr(`ENOTDIR: ${dir} is not a directory.`)
//       } catch (err) {
//         if (err.code === "ENOENT") {
//           await fs.mkdir(dir)
//         }
//       }
//     }

//     const p = `/${parts.join("/")}`
//     console.error(`${partitionNo}:${p}`)

//     if ((header.devMajor || header.devMinor) && (header.devMajor !== 0 || header.devMinor !== 0)) {
//       //TODO: add support for device file
//       console.log(`this is a device file ${header.devMajor}, ${header.devMinor}`)
//       resolve("skip device file")
//       return
//     }

//     switch (header.type) {
//       // should never happen for balena but might happen for other distro
//       case "directory":
//         try {
//           const stat = await fs.stat(p)
//           if (!stat.isDirectory()) cleanupErr(`EEXIST: ${p} exists and is not a directory.`)
//         } catch (err) {
//           if (err.code === "ENOENT") await fs.mkdir(p)
//           // cleanupErr(err.message)
//         }
//         const fh = await fs.open(p, "r+")
//         await fh.chown(header.uid, header.gid)
//         await fh.chmod(header.mode)
//         await fh.close()
//         resolve(true)
//         break
//       case "symlink":
//         try {
//           const stat = await fs.lstat(p)
//           if (!stat.isSymbolicLink()) cleanupErr(`EEXIST: ${p} exists and is not a symlink`)
//           if ((await fs.readlink(p)) !== header.linkname) cleanupErr(`EEXIST: ${p} exists. If overwrite is desired, please file an issue.`)
//           resolve(true)
//         } catch (err) {
//           if (err.code === "ENOENT") {
//             await fs.symlink(header.linkname, p)
//             // await fh.chown(header.uid, header.gid)
//             // await fh.chmod(header.mode)
//             // await fh.close()
//           } else cleanupErr(err.message)
//           resolve(true)
//         }
//         break

//       // most of the content should trigger this one
//       case "file":
//         try {
//           await fs.stat(p)
//           cleanupErr(`EEXIST: ${p} exists. Refusing to overwrite`)
//         } catch (err) {
//           if (err.code != "ENOENT") throw err
//         }
//         // skip problematic files
//         if (header.name.includes("__")) {
//           resolve("skipping file")
//           return
//         }
//         const writeStream = fs.createWriteStream(p)
//         stream.pipe(writeStream)
//         writeStream.on("finish", async () => {
//           writeStream.end()
//           const fh = await fs.open(p, "r+")
//           await fh.chown(header.uid, header.gid)
//           await fh.chmod(header.mode)
//           await fh.close()
//           resolve(true)
//         })
//         writeStream.on("error", (error) => {
//           cleanupErr(error)
//           reject(`file injection failed ${error.message}`)
//         })
//         break
//       case "link":
//         try {
//           const stat = await fs.lstat(p)
//           if (!stat.isLink()) cleanupErr(`EEXIST: ${p} exists and is not a symlink`)
//           if ((await fs.readlink(p)) !== header.linkname) cleanupErr(`EEXIST: ${p} exists. If overwrite is desired, please file an issue.`)
//           resolve(true)
//         } catch (err) {
//           if (err.code === "ENOENT") {
//             const linkname = header.linkname.includes("overlay2") ? header.linkname : `${p.split("/diff")[0]}/diff${header.linkname}`
//             //TODO: support link
//             // resolve("link not supported")
//             // shouldn't check existence
//             await fs.link(linkname, p)
//             // await fh.chown(header.uid, header.gid)
//             // await fh.chmod(header.mode)
//             // await fh.close()
//           } else cleanupErr(err.message)
//           resolve(true)
//         }
//         break
//       default:
//         cleanupErr(`${header.type} unsupported. Please file an issue`)
//         reject("unsuported file type")
//         break
//     }
//   })

// first file in the archive should be the manifest
const onManifest = async (_header, stream, next) => {
  if (_header.name === "manifest.json") {
    console.log("manifest", await extractManifestFromStream(stream))
  } else if (header.name.contains(".gz")) {
    onImage(_header, stream, next)
    return
  }

  // second file in the archive should be the image
  x.once("entry", onImage)

  next()
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
x.once("entry", onManifest)

pipeline(osfs.createReadStream(input), x, async (err) => {
  console.log("pipeline")
  cleanupErr(err)
  await osfs.promises.rename(imagePath, output)
  cleanup()
  await Promise.all(writeStreams)
  console.error(`Success!\nImage written to ${output}`)
})
