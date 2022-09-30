import { pipeline } from "stream"
import tar from "tar-stream"
import { tmpdir } from "os"
import { resolve } from 'path';
import * as osfs from "fs"
// import * as ext2fs from "ext2fs"
// import { ext2fs } from 'ext2fs';
import * as FileDisk from 'file-disk'
import * as PartitionInfo from 'partitioninfo'
// import osfs from "fs"
import ext2fs from "ext2fs"
// import FileDisk from 'file-disk'
// import PartitionInfo from 'partitioninfo'
import zlib from "zlib"
import {exec} from 'child_process';
import {inspect} from 'util';
import EventEmitter from "events"
import extract from "./extract"

const x = tar.extract()
const gunzip = zlib.createGunzip()

// const { argv } = process
// const input = argv[2] ?? "/Users/edwinjoassart/Desktop/e79f12853a5bd723094ac96138bb6e64-soundtest-raspberrypi3-64-2.94.4-v12.11.36.img.etch.tar"
// const output = argv[3] ?? "/tmp/preloaded.img"

const input = '/Users/rose/Documents/balena-io/preloadimg-test/edwin/balena-preload-test/in/e79f12853a5bd723094ac96138bb6e64-soundtest-raspberrypi3-64-2.94.4-v12.11.36.img.etch.tar';
const output = '/tmp/preloaded.img';
if (output && input) {
  console.error(`input ${input}`)
  console.error(`output ${output}`)
}

if (!(output && input)) {
  console.error(`input and output are required. Got ${input} and ${output}`)
}

let imagePath: string
let partitions: PartitionInfo.MBRPartition[] | PartitionInfo.GPTPartition[]
let filehandle: osfs.promises.FileHandle
let filedisk: FileDisk.FileDisk

interface OnImage {
  _header: Header;
  stream: FileDisk.DiskStream;
  next: () => Promise<OnImage>;
}

interface Header{
  name: string
  type?: "symlink" | "file" | "link" | "character-device" | "block-device" | "directory" | "fifo" | "contiguous-file" | "pax-header" | "pax-global-header" | "gnu-long-link-path" | "gnu-long-path" | null | undefined;
  mode?: number
  uid?: number
  gid?: number
  size?: number
  mtime?: Date
  linkname?: string | null
}

const IMAGE_NAME = `etch-${Date.now()}-${(Math.random() * 1e10) | 0}.img`
const onImage = ({_header, stream, next}: OnImage) => {
  console.log("on Image _header", _header)

  // make a tmp path to store the image
  imagePath = resolve(tmpdir(), IMAGE_NAME)
  console.log("on Image imagePath", imagePath)
  pipeline(stream, gunzip, osfs.createWriteStream(imagePath), async (err) => {
      // expand image and partition to 5gb
      // TODO: use node modules version instead of calling the cli
      console.log("expanding image GETS HERE", imagePath, err)
      const size = "5G"
      exec(`hdiutil resize -size 5g ${imagePath}`)
      exec(`ls -lth ${imagePath}`)
      // exec(`dd if=${imagePath} of=${imagePath} bs=1 count=0 seek='5120M' status=progress`
      // exec(`qemu-img resize -f raw ${imagePath} ${size}`
      exec(`node ./parted/parted.js --script ${imagePath} resizepart 4 ${size} resizepart 6 ${size}`)
      exec(`ls -lth ${imagePath}`)
      const di: any = exec(`hdiutil attach ${imagePath}`)
      exec(`ls -lth /Volumes/`)
      const diskImage = di.stdout.split(" ")[0]
      // exec(`umount ${diskImage}s6`
      exec(`node ./resize2fs/resize2fs.js -f ${diskImage}s6`)
      exec(`hdiutil detach ${diskImage}`)

          // prepare the image for loading
      partitions = (await PartitionInfo.getPartitions(imagePath)).partitions
      // partitions.unshift(null) // one-indexed
      partitions.unshift() // one-indexed does it really need null to be null?
      filehandle = await osfs.promises.open(imagePath, "r+")
      // new FileDisk(fd, readOnly, recordWrites,
      //  recordReads, discardIsZero=true)
      filedisk = new FileDisk.FileDisk(filehandle, false, true, true)
      next()
  })
}

interface Bifs{
  [key: string]: FileDisk.FileDisk | number | any
}
const bifs: Bifs = {};

const lazyFs = async (partitionNo: number) => {
  if (!bifs[partitionNo]) {
    const offset = partitions[partitionNo].offset
    bifs[partitionNo] = await ext2fs.mount(filedisk, offset)
  }
  // TODO figure out promises type instead of any
  return bifs[partitionNo].promises
}

const unpack = async () =>
  new Promise(async (resolve, reject) => {
    console.log("unpack")
    const lzfs = await lazyFs(6)

    const extraction = extract("/hello", {
      ignore: function (header: Header) {
        return !header.name.includes("inject")
      },
      map: function (header: Header) {
        preloadedFiles =+ 1
        const progress = (preloadedFiles / filesToPreload) * 100;
        console.log('progress', progress)
        // remove 2 first folder (`/inject/6`)
        header.name = `/${header.name.split("/").slice(2).join("/")}`
        return header
      },
      lzfs,
      readable: true,
      writable: true,
    })

    osfs.createReadStream(input).pipe(extraction)

    extraction.on("finish", () => {
      resolve('done')
    })
  })

let filesToPreload = 0
let preloadedFiles = 0

// first file in the archive should be the manifest
const onEntry = async ({_header, stream, next}: OnImage) => {
  console.log("entry", inspect(_header));
  if (_header?.name === "manifest.json") {
    console.log("manifest", await extractManifestFromStream(stream))
    stream.resume()
    next()
  } else if (_header?.name === "image.zip") {
    onImage({_header, stream, next})
  } else {
    // skip
    stream.resume()
    filesToPreload =+ 1;
    next()
  }
}

// function printProgress(progress) {
//   process.stdout.clearLine()
//   process.stdout.cursorTo(0)
//   process.stdout.write(progress + "%")
// }

// extract manifest from a stream
const extractManifestFromStream = (stream: any) =>
  new Promise((resolve, reject) => {
    const chunks: any = []
    stream.on("data", (chunk: any) => chunks.push(Buffer.from(chunk)))
    stream.on("error", (err: Error) => reject(err))
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
  })

// first thing, trigger onImage on first element we got out of archive
x.on("entry", onEntry)

x.on("finish", () => {
  console.log("finish")
})

pipeline(osfs.createReadStream(input), x, async (err) => {
  console.log("pipeline")
  await unpack();
  const cpToOutput = await osfs.promises.rename(imagePath, output)
  console.error(`Success!\nImage written to ${output} ${cpToOutput}`)
})
