import fs, { truncate } from 'fs';
import { resolve } from 'path';
import { spawn, spawnSync, execFilesync } from 'child_process';
import {inspect} from 'util';
import gunzip from "gunzip-maybe"
import * as PartitionInfo from 'partitioninfo'
import * as FileDisk from 'file-disk'
import logger from "../logger.mjs"
import os from 'os';
import zlib from 'zlib';

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
const IMAGE_NAME = 'balena.img'
const IMAGE_EXPANDED = 'balena-expanded.img'

// Change these to suite your needs
const ORIGINAL_IMG="77105551.img" // original image to be resized
const EXPANDED_IMG="balenaos.img" // resized image name

const LOOP_DEV="/dev/loop10" // loop device name
const ALLOCATOR="fallocate" // Preallocate space to a file.
const FILESYSTEM="ext2" // ext2/ext3/ext4 file system resizer resize (default)

// Make sure SIZE_FILE_ALLOCATION is big enough for the partitions you want to resize
const SIZE_FILE_ALLOCATION='5120M' // How much to allocate to the image file for expansion
const SIZE_PARTITION=5369 // 5GB How much to expand the partition by
const PARTITION_NUMBER=6 // partition number to resize

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

// -------------------------------------------------------
// START
// -------------------------------------------------------

/**
 * sizeOfOriginalImage
 * Check size of original image
 * @param {String} image 
 * @returns {int} size
 */ 
async function sizeOfOriginalImage(image) {
   const size = (await fs.promises.stat(image)).size
   loggers.info('sizeOfOriginalImage size:', size);
   return size;
}

const resizeFileSystem = async () => {
    const FILESYSTEM = os.platform();
    if (['aix', 'darwin', 'freebsd','linux', 'openbsd', 'sunos'].includes(FILESYSTEM)) {
        resize2fs([`${LOOP_DEV}p${PARTITION_NUMBER}`])
    }
    if (['win32'].includes(FILESYSTEM)) {
        btrfs('filesystem','resize','max',`${LOOP_DEV}p${PARTITION_NUMBER}`)
    }
}

/**
 * partprobe spawn version
 * @param {Array} ARGS 
 * @returns 
 */
 const partprobe = (ARGS) => {
    const argsList = []
    try {
        const { stdout, stderr } = await spawnSync('partprobe', argsList, SPAWN_OPTS);
        return { stdout, stderr };
    } catch(error) {
        loggers.error(`partprobe CATCH ${error}`);
    }
}

/**
 * parted spawn version
 * @param {Array} ARGS 
 * @returns 
 */
const parted = (ARGS) => {
    const argsList = [
        '-s',
        ' -a',
        'opt',
        `"${LOOP_DEV}"`,
        ...ARGS
    ]
    try {
        const { stdout, stderr } = await spawnSync('parted', argsList, SPAWN_OPTS);
        return { stdout, stderr };
    } catch(error) {
        loggers.error(`parted CATCH ${error}`);
    }
}

/**
 * dd spawn version
 * @param {String} inImageName 
 * @param {String} outImageName 
 * @param {Array} ARGS 
 * @returns 
 */
const dd = async (ARGS) => spawnSync('dd', ARGS, SPAWN_OPTS);


/**
 * TODO - rewrite this in ts?: // https://github.com/abresas/losetup-js
 * @param {String} LOOP_DEV 
 * @param {String} EXPANDED_IMG 
 * @param {Array} ARGS
 * @returns 
 */
const losetup = async (LOOP_DEV, EXPANDED_IMG, ARGS) => {
    try {
        const { stdout, stderr } = await spawnSync('losetup', [ ...ARGS ], SPAWN_OPTS);
        return { stdout, stderr };
    } catch(error) {
        loggers.error(`losetup CATCH ${error}`);
    }
};

const getImages = async (image, sizeExpansion = SIZE_FILE_ALLOCATION) => {
    // 0. Check size of original image
    const sizeIn = await sizeOfOriginalImage(image);
    logger.info(`sizeIn ${sizeIn}`);

    // 1. copy the image to a new name so you retain the original in case you need redo
    fs.copyFileSync(image, EXPANDED_IMG, 755);

    // 2. set up and control loop devices - create temporary loop devices for the partitions in the img
    await losetup(LOOP_DEV, EXPANDED_IMG)

    // 3. Allocator
    await dd([`if=${LOOP_DEV}`, `of=${EXPANDED_IMG}`, `bs=1`, `count=0`, `seek=${SIZE_FILE_ALLOCATION}`, 'status=progress'] );

    // # 5. use parted to print free partitions table in scripted mode,  -s --script never prompts for user intervention
    await parted(['-s', '-a', 'opt', `${LOOP_DEV}`, 'print free'])
    
    // # 6. manipulate disk partitions to resize partitions to 5GB - 
    // # Partition 4 is the umbrella partition that holds 5 and 6. 
    // # If we don't resize 4, partition 6 will not have enough room either.
    await parted(['-s', '-a', 'opt', `${LOOP_DEV}`, `resizepart 4 ${SIZE_PARTITION}`])
    await parted(['-s', '-a', 'opt', `${LOOP_DEV}`, `resizepart ${PARTITION_NUMBER} ${SIZE_PARTITION}`])
    
    // # 7. use parted to print free partitions table to see if resize worked
    // parted -s -a opt "${LOOP_DEV}" "print free"
    await parted(['-s', '-a', 'opt', `${LOOP_DEV}`, 'print free'])
    
    // # 8. partprobe - inform the OS of partition table changes, -s, --summary Show a summary of devices and their partitions.
    await partprobe(['-s', `${LOOP_DEV}`]);

    // 9. file system resizer - preload.py uses fsck to get the filesystem
    await resizeFilesystem()

    // 10. delete the loop device
    await losetup(['-d', LOOP_DEV])

    // 11. zip the file back up
    fs.createReadStream(EXPANDED_IMG).pipe(gzip).pipe(`${EXPANDED_IMG}.gzip`)

    // 12. check the image
    const sizeOut = await sizeOfOriginalImage(EXPANDED_IMG);
    logger.info(`sizeOut ${sizeOut}`);

    // -------------------------------------------------------
    // ENDZONE
    // You're expanded! 🎉
    // -------------------------------------------------------
}

getImages(IMAGE_NAME)