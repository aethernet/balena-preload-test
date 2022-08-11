import streamPreloadingAssets from "./streaming.mjs";
import path from "path"
import fs from "fs-extra"
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// variables
const app_id = "7ea7c15b12144d1089dd20645763f790" // "ed91bdb088b54a3b999576679281520a" ee6c3b3f75ae456d9760171a27a36568
const release_id = "302261f9d08a388e36deccedac6cb424" // "2f24cd2be3006b029911a3d0da6837d5" 
const balenaosRef = "expanded-aarch64"
const user = "edwin3"
const password = process.env.PASSWD

if (!password) throw new error("Password is missing, launch this with `PASSWD=****** node streaming.mjs`")

// TODO: output is currently a file, it should become the response of a http request
const outputStream = fs.createWriteStream(path.join(__dirname, "out", "tarball.tar"))

await streamPreloadingAssets({outputStream, user, password, app_id, release_id, balenaosRef})

console.log(`=== Your tarball is ready in the out folder === `)