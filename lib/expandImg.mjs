import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
// import pLimit from 'p-limit';
// import gunzip from "extract-zip";
import gunzip from "gunzip-maybe"
import { promisify } from "util";
// import $ from "zx";

// var path = require("path");
const IMAGES_BASE = path.resolve('images-base');
const IMAGES_EXPANDED = path.resolve('images-expanded');
console.log(`IMAGES_BASE: ${IMAGES_BASE}`);
console.log(`IMAGES_EXPANDED: ${IMAGES_EXPANDED}`);


// # In bytes:
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
 *  // obs is the output block size and ibs is the input block size. If you specify bs without ibs or obs this is used for both.
    // Seek will just "inflate" the output file. 
    // Seek=7 means that at the beginning of the output file, 
    // 7 "empty" blocks with output block size=obs=4096bytes will be inserted.
    // This is a way to create very big files quickly.
    // Or to skip over data at the start which you do not want to alter. 
    // Empty blocks only result if the output file initially did not have that much data.
 */
function createDDArgs(inImageName, outImageName, resizeMultiplier) {
    const partitionTableLabel = 'GPT' || 'DOS';
    const argsListMore = {}
    argsListMore.sizing = `count=${MBR_BOOTSTRAP_CODE_SIZE}`;
    if (partitionTableLabel === 'DOS') {
      argsListMore.sizing =  [ `skip=${MBR_SIZE}`, `seek=${MBR_SIZE}`, `count=${MBR_BOOTSTRAP_CODE_SIZE - MBR_SIZE}`];
    }
    if (partitionTableLabel === 'GPT') {
        argsListMore.sizing = [ `skip=${GPT_SIZE}`, `seek=${GPT_SIZE}`, `count=${MBR_BOOTSTRAP_CODE_SIZE - GPT_SIZE}`];
    }
    
    const argsList = [ 
        `if=${inImageName}`, 
        `of=${outImageName}`,
        
        `ibs=${1024 * resizeMultiplier}`,
        `seek=5`,
        // `bs=${resizeMultiplier}M`, // one MiB * resizeMultiplier
        `obs=10G`,
        'conv=notrunc',
        'status=progress',
        // `iflag=count_bytes, skip_bytes`, // count and skip in bytes
        // `oflag=seek_bytes`// seek in bytes
        ...argsListMore.sizing
    ];
    return argsList;
}

export const expandImg = async (img) => {
    if (!img) {
        throw new Error(`No img: "${img}"`);
    }
    const unzippedPath = `${IMAGES_BASE}/unzipped/`
    if (img.includes("zip")) {
        // await gunzip(img, {dir: `${IMAGES_BASE}/unzipped/`});
        await gunzip(`${IMAGES_BASE}/zipped/${img}`, {dir: unzippedPath});
    }
    // else {
    // const diskutilResults = await spawn('diskutil', ['list']);
    // console.log('diskutil', await diskutilResults);
    const generateRandom = Math.random().toString(36).substring(2, 15);
    console.log('generateRandom', generateRandom);
    const inImageName = `${unzippedPath}${img.split('.').slice(0, -1).join('.')}`;
    const outImageName = `${IMAGES_EXPANDED}/${generateRandom}.img`;
    const argsList = await createDDArgs(inImageName, outImageName, 7)
    await spawn('dd', argsList, { 
        cwd: '/',
        windowsHide: true,
        stdio: [
        /* Standard: stdin, stdout, stderr */
        'ignore',
        /* Custom: pipe:3, pipe:4, pipe:5 */
        'pipe', process.stderr
    ]});
};

// strace dd if=/dev/disk5 of=./images-expanded/tuckers.img bs=4M conv=notrunc
// dd if=/dev/disk5 of=./images-expanded/tuckers.img bs=4M conv="notrunc"
// bs=4M
expandImg('balena-cloud-preloaded-raspberrypi4-64-2022.1.1-v12.11.0.img.zip')