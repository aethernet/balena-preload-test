import streamPreloadingAssets from "./lib/streamPreloadingAssets.js"
import "dotenv/config"
import fs from "fs-extra"

const app_id = process.env.APPID
const release_id = process.env.RELEASEID
const balenaosRef = process.env.BALENAOS
const user = process.env.USER
const password = process.env.PASSWORD
const tarball = process.env.TARBALL
const dataPartition = parseInt(process.env.DATA_PARTITION, 10)
const supervisorVersion = process.env.SV_VERSION
const arch = process.env.ARCH
const baseImage = process.env.BASEIMAGE

/**
 * Get balenaos size
 * @returns image size
 */
const getImageSize = (filePath) => {
  const { size } = fs.statSync(filePath)
  return size
}

const outputStream = fs.createWriteStream(tarball)

const balenaosStream = fs.createReadStream(baseImage)
const balenaosSize = getImageSize(baseImage)

balenaosStream.on("open", async () => {
  await streamPreloadingAssets({
    outputStream,
    balenaosStream,
    balenaosSize,
    user,
    supervisorVersion,
    arch,
    password,
    app_id,
    release_id,
    balenaosRef,
    dataPartition,
  })
})

console.log(`=== Your tarball is ready : ${tarball} ===`)
