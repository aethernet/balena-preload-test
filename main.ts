import { streamPreloadingAssets } from "./lib/streamPreloadingAssets"
import "dotenv/config"
import fsx from "fs-extra"

const appId = process.env.APPID
const releaseId = process.env.RELEASEID
const balenaosRef = process.env.BALENAOS
const tarball = process.env.TARBALL!;
const dataPartition = parseInt(process.env.DATA_PARTITION!, 10);
const supervisorVersion = process.env.SV_VERSION
const arch = process.env.ARCH
const baseImage = process.env.BASEIMAGE!;
const api = process.env.API
const token = process.env.API_TOKEN
const user = process.env.USER
const password = process.env.PASSWORD

/**
 * Get balenaos size
 * @returns image size
 */
const getImageSize = (filePath: string) => {
  const { size } = fsx.statSync(filePath)
  return size
}

const outputStream = fsx.createWriteStream(tarball)

const balenaosStream = fsx.createReadStream(baseImage)
const balenaosSize = getImageSize(baseImage)

//TODO what is callback doing?
balenaosStream.on("open", async () => {
  await streamPreloadingAssets({
    outputStream,
    balenaosStream,
    balenaosSize,
    supervisorVersion,
    arch,
    appId,
    releaseId,
    balenaosRef,
    dataPartition,
    api,
    token,
    user,
    password,
    callback: () => {},
  })
})

console.log(`=== Your tarball is ready : ${tarball} ===`)
