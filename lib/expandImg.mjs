import fs from 'fs';
import { resolve } from 'path';
import { spawn, spawnSync } from 'child_process';
import {inspect} from 'util';
import gunzip from "gunzip-maybe"
import * as PartitionInfo from 'partitioninfo'
import * as FileDisk from 'file-disk'

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

const SPAWN_OPTS = { 
    cwd: '/',
    windowsHide: true,
    stdio: [
    /* Standard: stdin, stdout, stderr */
    'ignore',
    /* Custom: pipe:3, pipe:4, pipe:5 */
    'pipe', process.stderr
]}

/** 
 * createDDArgs
 * dd helper
 * @param {string} partitionTableDiskImage 
 * @param {string} nameImage 
 * @param {int} resizeMultiplier 
 * return {Array} argsList 
 */

function createDDArgs(ifImage, ofImage, partitionInfos, sizeExpansion) {
    const argsListMore = {}
    const { offset, size, type } = partitionInfos
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

export const expandImg = async (img, partitionInfo) => {
    if (!img) {
        throw new Error(`No img: "${img}"`);
    }
    const timeName = new Date().toISOString();
    const inImageName = `${IMAGES_BASE_UNZIPPED}/${img}`;
    const outImageName = `${IMAGES_EXPANDED}/${timeName}-${img}`;
    const argsList = await createDDArgs(inImageName, outImageName, partitionInfo, '5120M');
    await spawn('dd', argsList, SPAWN_OPTS);
    return outImageName;
};

const getPartitionsInfo = async (image, lastPartitionIndex) => {
    console.log(image, lastPartitionIndex)
    const partition = await PartitionInfo.get(image, lastPartitionIndex)
    return partition ;
}

const getPartitionsInfoAll = async (image) => {
    console.log('image', image)
    const partitionInfoObj = await PartitionInfo.getPartitions(image);
    // partitions = partitionInfoObj.partitions
    partitionInfoObj.partitions.unshift(null) // one-indexed

    const filehandle = await fs.promises.open(image, 'r+');
    // new FileDisk(fd, readOnly, recordWrites, recordReads, discardIsZero=true)
   const filedisk = new FileDisk.FileDisk(filehandle, false, true, true);
//    filedisk = new FileDisk.FileDisk(filehandle, false, true, true)

    console.log('partitionInfoObj', partitionInfoObj, 'filedisk', filedisk);
    const partitionsLength = partitionInfoObj.partitions.length
    return {...partitionInfoObj, lastPartitionIndex: partitionInfoObj.partitions[partitionsLength - 1].index};
}

const unzipImage = (image) => {
    if (!image.includes("zip"))  { 
        const images = {
            unzippedImg: image, 
            unzippedDirImg: `${IMAGES_BASE_UNZIPPED}/${image}` 
        }
        console.log('images', images)
        return images;
    };
    const unzippedImg = image.split('.').slice(0, -1).join('.');
    const unzipped = gunzip(`${IMAGES_BASE_ZIPPED}/${image}`, {dir: IMAGES_BASE_UNZIPPED});
    const unzippedDirImg = `${IMAGES_BASE_UNZIPPED}/${unzippedImg}`;
    return { unzippedImg, unzippedDirImg };
}

const prepareImage = async (image) => {
    const { unzippedImg, unzippedDirImg } = unzipImage(image);
    const { lastPartitionIndex } = await getPartitionsInfoAll(unzippedDirImg);
    const partition = await getPartitionsInfo(unzippedDirImg, lastPartitionIndex);
    return {partition, lastPartitionIndex, unzippedImg, unzippedDirImg};
}

const getImages = async (image) => {
    const { partition, lastPartitionIndex, unzippedImg, unzippedDirImg } = await prepareImage(image);
    const expandedImage = await expandImg(unzippedImg, partition);
    const expandedPartitionInfoArray = await getPartitionsInfoAll(unzippedDirImg, expandedImage);
    console.log('expandedPartitionInfoArray',inspect(expandedPartitionInfoArray, { depth: null }));
}

getImages(IMAGE_NAME)