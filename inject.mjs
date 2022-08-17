#!/usr/bin/env node

import { pipeline } from 'stream'
import tar from 'tar-stream'
import { tmpdir } from 'os'
import { resolve } from 'path'
import * as osfs from 'fs'
import EventEmitter from 'events'
import * as ext2fs from 'ext2fs'
import * as FileDisk from 'file-disk'
import * as PartitionInfo from 'partitioninfo'

// we don't know how many files there will be
EventEmitter.setMaxListeners(0)

const x = tar.extract()

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
if (~argv.indexOf('-h')) {
  usage()
}
const input = argv[3]
const output = argv[4]
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
    } catch(err) {}
  }
}
const cleanupErr = (err, cb) => {
  if (err) {
    console.error(err)
    cleanup()
    process.exit(1)
  }
  if (typeof cb === 'function') cb()
}

process.on('uncaughtException', cleanupErr)

let imagePath;
let partitions;
let filehandle;
let filedisk;

const IMAGE_NAME = `etch-${Date.now()}-${Math.random()*1e10|0}`
const onImage = (_header, stream, next) => {
  imagePath = resolve(tmpdir(), IMAGE_NAME)
  pipeline(
    stream,
    osfs.createWriteStream(imagePath),
    async err => {
      cleanupErr(err)
      partitions = (await PartitionInfo.getPartitions(imagePath)).partitions
      partitions.unshift(null) // one-indexed
      filehandle = await osfs.promises.open(imagePath, 'r+')
      // new FileDisk(fd, readOnly, recordWrites,
      //  recordReads, discardIsZero=true)
      filedisk = new FileDisk.FileDisk(filehandle, false, true, true)
      x.on('entry', onMember)
      next()
    }
  )
}
const bifs = {}
const lazyFs = async partitionNo => {
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
const writeStreams = []
const onMember = async (header, stream, next) => {
  writeStreams.push(EventEmitter.once(stream, 'end'))
  let [directive, partitionNo, ...parts] = header.name.split('/')
  if (!parts[0]) {
    return next()
  }
  partitionNo = Number(partitionNo)
  if (isNaN(partitionNo))
    cleanupErr(`inject subdirectory must be a partition number, got ${partitionNo}`)
  if (!partitions[partitionNo])
    cleanupErr(`partition ${partitionNo} not found.`)
  if (directive !== 'inject')
    cleanupErr(`Directory '${directive}' not recognized.`)

  const fs = await lazyFs(partitionNo)
  let dir = ''
  for (const part of parts.slice(0, parts.length - 1)) {
    dir += '/' + part
    try {
      const stat = await fs.stat(dir)
      if (!stat.isDirectory()) cleanupErr(`ENOTDIR: ${dir} is not a directory.`)
    } catch (err) {
      if (err.code === 'ENOENT') {
        await fs.mkdir(dir)
      }
    }
  }
  const p = `/${parts.join('/')}`
  console.error(`${partitionNo}:${p}`)
  if (header.type === 'directory') {
    try {
      const stat = await fs.stat(p)
      if (!stat.isDirectory()) cleanupErr(`EEXIST: ${p} exists and is not a directory.`)
    } catch (err) {
      if (err.code === 'ENOENT') await fs.mkdir(p)
      cleanupErr(err.message)
    }
    const fh = await fs.open(p, 'r+')
    await fh.chown(header.uid, header.gid)
    await fh.chmod(header.mode)
    next()
  } else if (header.type === 'symlink') {
    try {
      const stat = await fs.lstat(p)
      if (!stat.isSymbolicLink())
        cleanupErr(`EEXIST: ${p} exists and is not a symlink`)
      if (await fs.readlink(p) !== header.linkname)
        cleanupErr(`EEXIST: ${p} exists. If overwrite is desired, please file an issue.`)
      await fh.chown(header.uid, header.gid)
      await fh.chmod(header.mode)
    } catch (err) {
      if (err.code === 'ENOENT')
        await fs.symlink(header.linkname, p)
      else
        cleanupErr(err.message)
    }
    next()
  } else if (header.type === 'file') {
    try {
      await fs.stat(p)
      cleanupErr(`EEXIST: ${p} exists. Refusing to overwrite`)
    } catch(err) {
      if (err.code != 'ENOENT') throw err
    }
    pipeline(
      stream,
      fs.createWriteStream(p),
      async err => {
        const fh = await fs.open(p, 'r+')
        await fh.chown(header.uid, header.gid)
        await fh.chmod(header.mode)
        await fh.close()
        cleanupErr(err, next)
      }
    )
  } else {
    cleanupErr(`${header.type} unsupported. Please file an issue`)
  }
}
x.once('entry', onImage);

pipeline(
  osfs.createReadStream(input),
  x,
  async (err) => {
    cleanupErr(err)
    await osfs.promises.rename(imagePath, output)
    cleanup()
    await Promise.all(writeStreams)
    console.error(`Success!\nImage written to ${output}`);
  }
)
