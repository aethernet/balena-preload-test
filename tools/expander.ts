import fs from 'fs';
import { resolve } from 'path';
import { spawn, spawnSync, SpawnOptions } from 'child_process';
import {inspect} from 'util';
import gunzip from "gunzip-maybe"
import * as PartitionInfo from 'partitioninfo'
import * as FileDisk from 'file-disk'
import { pipeline, PipelineSource } from "stream"
import tar from "tar-stream"
import tarfs from "tar-fs"
import { tmpdir } from "os"
import * as osfs from "fs"
import EventEmitter from "events"
import * as ext2fs from "ext2fs"
// import zlib from "zlib"
import { $ } from "zx"


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

/**
 * Partition expansion with js
 * 
 * Useful tools for disk manipulation
 * https://github.com/balena-io-modules/partitioninfo
 * https://github.com/jhermsmeier/node-gpt
 * https://github.com/jhermsmeier/node-mbr
 * https://github.com/balena-io-modules/balena-image-fs
 * https://github.com/balena-io-modules/node-ext2fs
 * https://github.com/balena-io-modules/balena-preload/blob/master/src/preload.py
 */

// const input = argv[2] ?? '/tmp/preloadTarball.tar';
const input = '/Users/rose/Documents/balena-io/preloadimg-test/edwin/balena-preload-test/in/e79f12853a5bd723094ac96138bb6e64-soundtest-raspberrypi3-64-2.94.4-v12.11.36.img.etch.tar';
const output = '/tmp/preloaded.img';
if (output && input) {
  console.info(`input: ${input}`)
  console.info(`output: ${output}`)
}
if (!(output && input)) {
  console.error(`input and output are required. Got ${input} and ${output}`)
  usage()
}

const IMAGES_BASE = resolve('images-base');
const IMAGES_BASE_ZIPPED = resolve(`${IMAGES_BASE}/zipped`);
const IMAGES_BASE_UNZIPPED = resolve(`${IMAGES_BASE}/unzipped`);
const IMAGES_EXPANDED = resolve('images-expanded');
const IMAGE_NAME = 'balena.img.zip';
const IMAGE_EXPANDED = 'balena-expanded.img'

console.log(`IMAGES_BASE: ${IMAGES_BASE}`);
console.log(`IMAGES_BASE: ${IMAGES_BASE_ZIPPED}`);
console.log(`IMAGES_BASE: ${IMAGES_BASE_UNZIPPED}`);
console.log(`IMAGES_EXPANDED: ${IMAGES_EXPANDED}`);

// In bytes:
const SECTOR_SIZE = 512
const MBR_SIZE = 512
const GPT_SIZE = SECTOR_SIZE * 34
const MBR_BOOTSTRAP_CODE_SIZE = 446

const SPAWN_OPTS: SpawnOptions = { 
    cwd: '/',
    windowsHide: true,
    stdio: [
    /* Standard: stdin, stdout, stderr */
    'ignore',
    /* Custom: pipe:3, pipe:4, pipe:5 */
    'pipe', process.stderr
]}

interface SpawnOpts {
    cwd: string;
    windowsHide: boolean;
    stdio: (string | (NodeJS.WriteStream & {
        fd: 2;
    }))[];
}

interface DDInfo {
    ifImage: string;
    ofImage: string;
    sizeExpansion: string;
}

// interface PartitionInfo {
//     offset: number;
//     size: number;
//     type: string;
// }

/** 
 * createDDArgs
 * dd helper
 * @param {string} partitionTableDiskImage 
 * @param {string} nameImage 
 * @param {int} resizeMultiplier 
 * return {Array} argsList 
 */
function createDDArgs({
    ifImage, 
    ofImage, 
    sizeExpansion}:DDInfo, 
    partitionInfos: PartitionInfo.MBRPartition | PartitionInfo.GPTPartition | null):Array<string> {
    const argsListMore = {}
    // const { offset, size, type } = partitionInfos
    const argsList = [ 
        `if=${ifImage}`, 
        `of=${ofImage}`,
        `bs=1`,
        `count=0`,
        `seek=${sizeExpansion}`,
        'status=progress',
    ];
    return argsList;
}

export const expandImg = async (img: string, partitionInfo: PartitionInfo.MBRPartition | PartitionInfo.GPTPartition): Promise<string> => {
    if (!img) {
        throw new Error(`No img: "${img}"`);
    }
    const timeName = new Date().toISOString();
    const ifImage = `${IMAGES_BASE_UNZIPPED}/${img}`;
    const ofImage = `${IMAGES_EXPANDED}/${timeName}-${img}`;
    const sizeExpansion = '5120M';
    const argsList = await createDDArgs({ifImage, ofImage, sizeExpansion}, partitionInfo);
    await spawn('dd', argsList, SPAWN_OPTS);
    return ofImage;
};

const getPartitionsInfo = async (image: string, lastPartitionIndex: number) => {
    console.log(image, lastPartitionIndex)
    const partition = await PartitionInfo.get(image, lastPartitionIndex)
    return partition ;
}

const getPartitionsInfoAll = async (image: string) => {
    console.log('image', image)
    const partitionInfoObj = await PartitionInfo.getPartitions(image);
    // partitions = partitionInfoObj.partitions
    // partitionInfoObj.partitions.unshift(null) // one-indexed

    const filehandle = await fs.promises.open(image, 'r+');
    // new FileDisk(fd, readOnly, recordWrites, recordReads, discardIsZero=true)
   const filedisk = new FileDisk.FileDisk(filehandle, false, true, true);
//    filedisk = new FileDisk.FileDisk(filehandle, false, true, true)

    console.log('partitionInfoObj', partitionInfoObj, 'filedisk', filedisk);
    const partitionsLength = partitionInfoObj.partitions.length
    return {...partitionInfoObj, lastPartitionIndex: partitionInfoObj.partitions[partitionsLength - 1].index};
}

const prepareImage = async (image: string) => {
    const { lastPartitionIndex } = await getPartitionsInfoAll(image);
    const partitionInfo: PartitionInfo.MBRPartition | PartitionInfo.GPTPartition = await getPartitionsInfo(image, lastPartitionIndex);
    return {partitionInfo, lastPartitionIndex};
}

const getImages = async (image: string) => {
    const { partitionInfo, lastPartitionIndex } = await prepareImage(image);
    const expandedImage = await expandImg(image, partitionInfo);
    const expandedPartitionInfoArray = await getPartitionsInfoAll(expandedImage);
    console.log('expandedPartitionInfoArray',inspect(expandedPartitionInfoArray, { depth: null }));
}


let imagePath: string
let partitions: PartitionInfo.MBRPartition[] | PartitionInfo.GPTPartition[]
let filehandle: fs.promises.FileHandle
let filedisk: FileDisk.FileDisk

interface OnImage {
    _header: {key: string, value: string}[];
    stream: FileDisk.DiskStream;
    next: () => Promise<OnImage>;
}

function inject(){
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
        // imagePath="/var/folders/12/152flv_j1754jg5gmwl2v10r0000gn/T/etch-1664350552293-1401670079.img"
        await $`hdiutil resize -size 5g ${imagePath}`
        await $`ls -lth ${imagePath}`
        // await $`dd if=${imagePath} of=${imagePath} bs=1 count=0 seek='5120M' status=progress`
        // await $`qemu-img resize -f raw ${imagePath} ${size}`
        await $`node ./parted/parted.js --script ${imagePath} resizepart 4 ${size} resizepart 6 ${size}`
        await $`ls -lth ${imagePath}`
        const di = await $`hdiutil attach ${imagePath}`
        await $`ls -lth /Volumes/`
        const diskImage = di.stdout.split(" ")[0]
        // await $`umount ${diskImage}s6`
        await $`node ./resize2fs/resize2fs.js -f ${diskImage}s6`
        await $`hdiutil detach ${diskImage}`

        // prepare the image for loading
        cleanupErr(err, undefined)
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
 
}

const cleanup = () => {
    if (imagePath) {
      try {
        for (const fs: unknown of Object.values(bifs)) {
          fs.umount()
        }
        osfs.statSync(imagePath)
        osfs.unlinkSync(imagePath)
      } catch (error) {
        if (error instanceof Error) {
          // ✅ TypeScript knows err is Error
          console.error(error.message);
        } else {
          console.error('Unexpected error', error);
        }
      }
    }
}

  
const cleanupErr = (err: Error | unknown, cb?: () => void) => {
    if (err) {
        console.error('cleanupErr', err)
        cleanup()
        process.exit(1)
    }
    if (typeof cb === "function") cb()
}

interface Bifs{
    [key: string]: FileDisk.FileDisk | number
}
const bifs: Bifs = {};
async function lazyFs(partitionNo: number) {
    if (!bifs[partitionNo]) {
        try {
        const offset = partitions[partitionNo].offset
        bifs[partitionNo] = await ext2fs.mount(filedisk, offset)
        } catch (error) {
            const err = error as Error
            err.message = `Could not mount partition ${partitionNo}\n${err.message}. Is this an ext partition?`;
            cleanupErr(err)
        }
    }
    return bifs[partitionNo].promises
}

function unpack() {
    console.log("unpack", imagePath)

    const fs = await lazyFs(6)

    osfs.createReadStream(input).pipe(
        // tarfs.extract("/", {
        tarfs.extract("/", {
        ignore: function (name: string, header: Header) {
            return header.type === "link" || name === "image.zip" || name === "manifest.json"
        },
        fs,
        readable: true,
        writable: true,
        })
    )
}


const onImage = (_header: Header, stream: PipelineSource, next: Function) => {
  console.log("on Image _header", _header)

  // make a tmp path to store the image
  imagePath = resolve(tmpdir(), IMAGE_NAME)
  console.log("on Image imagePath", imagePath)
  pipeline(stream, gunzip, osfs.createWriteStream(imagePath), async (error) => {
    // expand image and partition to 5gb
    // TODO: use node modules version instead of calling the cli
    console.log("expanding image GETS HERE", imagePath, error)
    const size = "5G"
    // imagePath="/var/folders/12/152flv_j1754jg5gmwl2v10r0000gn/T/etch-1664350552293-1401670079.img"
    await $`hdiutil resize -size 5g ${imagePath}`
    await $`ls -lth ${imagePath}`
    // await $`dd if=${imagePath} of=${imagePath} bs=1 count=0 seek='5120M' status=progress`
    // await $`qemu-img resize -f raw ${imagePath} ${size}`
    await $`node ./parted/parted.js --script ${imagePath} resizepart 4 ${size} resizepart 6 ${size}`
    await $`ls -lth ${imagePath}`
    const di = await $`hdiutil attach ${imagePath}`
    await $`ls -lth /Volumes/`
    const diskImage = di.stdout.split(" ")[0]
    // await $`umount ${diskImage}s6`
    await $`node ./resize2fs/resize2fs.js -f ${diskImage}s6`
    await $`hdiutil detach ${diskImage}`

    // prepare the image for loading
    cleanupErr(error)
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

interface Header {
    name: string;
    size: number;
    type: string;
}


// first file in the archive should be the manifest
const onManifest = async (header: Header, stream: ReadableStream, next: ) => {
  if (header.name === "manifest.json") {
    console.log("manifest", await extractManifestFromStream(stream))
  } else if (header.name.includes(".gz")) {
    console.log("onManifest has gz so goes to onImage", header.name, header.size)
    onImage(header, stream, next)
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
    stream.on("error", (error: Error) => reject(error))
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    console.log("extractManifestFromStream chunks", chunks)
  })

// first thing, trigger onImage on first element we got out of archive
x.once("entry", onManifest)

pipeline(osfs.createReadStream(input), x, async (error: Error | unknown) => {
  console.log("pipeline1")
  cleanupErr(error)
  console.log("pipeline2", error)
  await osfs.promises.rename(imagePath, output)
  console.log("pipeline3", output)
  cleanup()
  await Promise.all(writeStreams)
  console.error(`Success!\nImage written to ${output}`)
})
}


getImages(input)

