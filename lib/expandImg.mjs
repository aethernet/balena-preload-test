import fs from 'fs';
import { resolve } from 'path';
import { spawn, spawnSync } from 'child_process';
import {inspect} from 'util';
// import pLimit from 'p-limit';
// import gunzip from "extract-zip";
import gunzip from "gunzip-maybe"
import { promisify } from "util";
import * as osfs from 'fs'
import EventEmitter from 'events'
// import * as ext2fs from 'ext2fs'
// import * as FileDisk from 'file-disk'
import * as PartitionInfo from 'partitioninfo'


/** 
 * parted:
 * parted is a disk partitioning and partition resizing program. 
 * It allows you to create, destroy, resize, move and copy ext2, linux-swap, FAT, FAT32, and reiserfs partitions. 
 * It can create, resize, and move Macintosh HFS partitions, as well as detect jfs, ntfs, ufs, and xfs partitions. 
 * It is useful for creating space for new operating systems, reorganising disk usage, and copying data to new hard disks.
 * 
 * parted resizepart
 * resizepart does not care about the filesystem at all. 
 * It just changes the partition table to specify a new location where the partition now ends.
 * For the filesystem driver, the end of the partition will be a hard wall.But for the filesystem driver, 
 * the end of the partition will be a hard wall. 
 * this is good for expanding but be careful when shrinking.
 * 
 * use gparted (or similar) to resize / move partitions - 
 * dd will simply recreate the old partition scheme, as it is a bitwise copy & applies no 'intelligence' to the operation.
 * So created my partitions in parted sdb1=33G sdb2=33G and sdb3=33G
Sdb4/5 the rest.
 * gparted is just a graphical frontend for parted.
*/ 

/**
 * resize2fs
 */

// /var/lib/docker/image/overlay2/repositories.json
// /image/overlay2/repositories.json
// balena-img-fs to get repositories.json
// partx

const IMAGES_BASE = resolve('images-base');
const IMAGES_BASE_ZIPPED = resolve(`${IMAGES_BASE}/zipped`);
const IMAGES_BASE_UNZIPPED = resolve(`${IMAGES_BASE}/unzipped`);
const IMAGES_EXPANDED = resolve('images-expanded');
console.log(`IMAGES_BASE: ${IMAGES_BASE}`);
console.log(`IMAGES_BASE: ${IMAGES_BASE_ZIPPED}`);
console.log(`IMAGES_BASE: ${IMAGES_BASE_UNZIPPED}`);
console.log(`IMAGES_EXPANDED: ${IMAGES_EXPANDED}`);

// In bytes:
const SECTOR_SIZE = 512
const MBR_SIZE = 512
const GPT_SIZE = SECTOR_SIZE * 34
const MBR_BOOTSTRAP_CODE_SIZE = 446

/** 
 * createDDArgs
 * dd helper
 * @param {string} partitionTableDiskImage 
 * @param {string} nameImage 
 * @param {int} resizeMultiplier 
 * return {Array} argsList 
 * https://askubuntu.com/questions/798853/dd-different-unit-for-bs-skip-and-count
 *  // obs is the output block size and ibs is the input block size. If you specify bs without ibs or obs this is used for both.
    // Seek will just "inflate" the output file. 
    // Seek=7 means that at the beginning of the output file, 
    // 7 "empty" blocks with output block size=obs=4096bytes will be inserted.
    // This is a way to create very big files quickly.
    // Or to skip over data at the start which you do not want to alter. 
    // Empty blocks only result if the output file initially did not have that much data.

    
    https://en.wikipedia.org/wiki/Partition_type

    Filesystem
    https://www.qnx.com/developers/docs/7.0.0/index.html#com.qnx.doc.neutrino.sys_arch/topic/fsys_Partitions.html
    type 131 is unix ext2
 */

function createDDArgs(ifImage, ofImage, partitionInfos) {
    // const partitionTableLabel = 'GPT' || 'DOS';
    const argsListMore = {}
    const {offset, size, type} = partitionInfos
    argsListMore.sizing = [`count=${MBR_SIZE}`, 'seek=5'];
    // if (partitionTableLabel === 'DOS') {
    //   argsListMore.sizing =  [ `skip=${MBR_SIZE}`, `seek=${MBR_SIZE}`, `count=${offset - MBR_SIZE}`];
    // }
    // if (partitionTableLabel === 'GPT') {
    //     argsListMore.sizing = [ `skip=${GPT_SIZE}`, `seek=${GPT_SIZE}`, `count=${offset - GPT_SIZE}`];
    // }
    // console.log(partitionTableLabel,'partitionTableLabel', argsListMore.sizing, 'offset', offset);
    
    const argsList = [ 
        `if=${ifImage}`, 
        `of=${ofImage}`,
        
        `ibs=${size}`,
        // `bs=${resizeMultiplier}M`, // one MiB * resizeMultiplier
        `obs=${size}`,
        'conv=notrunc',
        'status=progress',
        // `iflag=count_bytes, skip_bytes`, // count and skip in bytes
        // `oflag=seek_bytes`// seek in bytes
        ...argsListMore.sizing
    ];
    return argsList;
}


// fork() exec() spawn() spawnSync()
//https://github.com/adriano-di-giovanni/node-df/blob/master/lib/index.js
const getPartitions = async (image) => {
    // const diskutilResults = await spawn('diskutil', ['list']);
    // console.log('diskutil', await diskutilResults);
    const partitions = spawn('df', ['-hkP'], { 
        // cwd: '/',
        // windowsHide: true,
        stdio: [
        /* Standard: stdin, stdout, stderr */
        // 'inherit',
        'ignore',
        /* Custom: pipe:3, pipe:4, pipe:5 */
        'pipe', process.stderr
    ]});
    const partitionsResults = {partitions: [], partitionsLength: 0};

    partitions.stdout.on('data', data => {
        const parsedDf = parseDf(data);
        // const strData = splitDf(data);
        // partitionsResults.partitionArrayLength = strData.length;
        // // console.log('strData.length', strData.length);
        // const columnHeaders = strData.shift();
        // console.log('columnHeaders', columnHeaders);
        // const formatted = formatDf(strData, columnHeaders);
        partitionsResults.partitions = parsedDf.partitions;
        partitionsResults.partitionsLength = parsedDf.partitionsLength;
        return partitionsResults;
    });

    // partitions.stderr.on('data', data => {
    //     assert(false, 'NOPE stderr');
    // });

    partitions.on('close', code => {
        console.log('Child exited with', code, 'and stdout has been saved');
        console.log('partitionsResults', partitionsResults);
        return partitionsResults;
    });
    return partitionsResults;
}

const parseDf = (data) => {
   const strData = splitDf(data);
   const columnHeaders = strData.shift();
   const formatted = formatDf(strData, columnHeaders);
   return {partitions: formatted, partitionsLength: formatted.length};
}

const splitDf = (data) => {
    return data.toString()
        .replace(/ +(?= )/g,'') //replace multiple spaces between device parameters with one space
        .split('\n') //split by newline
        .map((line) => line.split(' ')); //split each device by one space
}

const formatDf = (strData, columnHeaders) => {
    return strData.map((devDisk) => {
        const partitionObj = {};
        for ( const [index,value] of devDisk.entries()) {
            partitionObj[columnHeaders[index]] = value
        }
        return partitionObj;
    });
}

export const expandImg = async (img, partitionInfo) => {
    if (!img) {
        throw new Error(`No img: "${img}"`);
    }
    const timeName = new Date().toISOString().split('.').join('').replaceAll(':', '');
    const inImageName = `${IMAGES_BASE_UNZIPPED}/${img}`;
    const outImageName = `${IMAGES_EXPANDED}/${timeName}-${img}`;

    const argsList = await createDDArgs(inImageName, outImageName, partitionInfo);
    await spawn('dd', argsList, { 
        cwd: '/',
        windowsHide: true,
        stdio: [
        /* Standard: stdin, stdout, stderr */
        'ignore',
        /* Custom: pipe:3, pipe:4, pipe:5 */
        'pipe', process.stderr
    ]});
    return outImageName;
};

// strace dd if=/dev/disk5 of=./images-expanded/tuckers.img bs=4M conv=notrunc
// dd if=/dev/disk5 of=./images-expanded/tuckers.img bs=4M conv="notrunc"
// bs=4M

const getPartitionsInfo = async (image, lastPartitionIndex) => {
    console.log(image, lastPartitionIndex)
    const partition = await PartitionInfo.get(image, lastPartitionIndex)
    console.log(partition.offset)
    console.log(partition.size)
    console.log(partition.type)
    console.log(partition.index)
    return partition ;
}

const getPartitionsInfoAll = async (image) => {
    const partitionInfoObj = await PartitionInfo.getPartitions(image);
    console.log('partitionInfoObj', partitionInfoObj);
    const partitionsLength = partitionInfoObj.partitions.length
    return {...partitionInfoObj, lastPartitionIndex: partitionInfoObj.partitions[partitionsLength - 1].index};
}

const unzipImage = (img) => {
    if (!img.includes("zip")) return img;
    const unzippedImg = img.split('.').slice(0, -1).join('.');
    //TODO do I need to drain after gunzip?
    const unzipped = gunzip(`${IMAGES_BASE_ZIPPED}/${img}`, {dir: IMAGES_BASE_UNZIPPED});
    console.log('unzipped', unzipped);
    const unzippedDirImg = `${IMAGES_BASE_UNZIPPED}/${unzippedImg}`;
    return { unzippedImg, unzippedDirImg };
}

const getImages = async (image) => {

    const { unzippedImg, unzippedDirImg } = unzipImage(image)

    const {partitions,  lastPartitionIndex} = await getPartitionsInfoAll(unzippedDirImg);
    console.log('lastPartitionIndex',lastPartitionIndex);

    const partitionInfo = await getPartitionsInfo(unzippedDirImg, lastPartitionIndex);
    console.log('partitionInfo',inspect(partitionInfo, { depth: null }));
    
    const expandedImage = await expandImg(unzippedImg, partitionInfo);
    console.log('expandedImage', await expandedImage);
    // const expandedPartitionInfoArray = await getPartitionsInfoAll(expandedImage);
    // console.log('expandedPartitionInfoArray',inspect(expandedPartitionInfoArray, { depth: null }));
    
    // TODO: expanded image is not working or corrupting the partition table 
    // maybe because offsets are not correct?
    // TODO: get partition info for expanded image
    const expandedPartitionInfo = await getPartitionsInfo(expandedImage);
    console.log('expandedPartitionInfo',inspect(expandedPartitionInfo, { depth: null }));
}
const image = 'balena-cloud-preloaded-raspberrypi4-64-2022.1.1-v12.11.0.img.zip'
getImages(image)