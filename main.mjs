import streamPreloadingAssets from "./lib/streamPreloadingAssets.mjs";
import path from "path"
import fs from "fs-extra"
import { getEnvs } from "./lib/getAuth.mjs";
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
  
const { app_id, release_id, balenaosRef, user, password } = getEnvs()

// TODO: output is currently a file, it should become the response of a http request
const outputStream = fs.createWriteStream(path.join(__dirname, "out", "tarball.tar"))

await streamPreloadingAssets({outputStream, user, password, app_id, release_id, balenaosRef})

console.log(`=== Your tarball is ready in the out folder === `)