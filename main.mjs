import streamPreloadingAssets from "./lib/streamPreloadingAssets.mjs"
import fs from "fs-extra"
import "dotenv/config"

const app_id = process.env.APPID
const release_id = process.env.RELEASEID
const balenaosRef = process.env.BALENAOS
const user = process.env.USER
const password = process.env.PASSWORD
const tarball = process.env.TARBALL
const dataPartition = process.env.DATA_PARTITION

// TODO: output is currently a file, it should become the response of a http request
const outputStream = fs.createWriteStream(tarball)

await streamPreloadingAssets({ outputStream, user, password, app_id, release_id, balenaosRef, dataPartition })

console.log(`=== Your tarball is ready : ${tarball} ===`)