/**
 * Get the base image we're going to preload assets in (balenaos.img)
 * // TODO: Manage image expansion
 * Get repositories.json out of the original image
 * */

import logger from "../logger.mjs"
import path from "path"
import fs from "fs-extra"
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Get the file size
 * @returns image size
 */
const getImageSize = ({ image }) => {
  const filePath = path.join(__dirname, "..", "in", `${image}.img`)
  const { size } = fs.statSync(filePath)
  return size
}

/**
 * // TODO:
 * This is a mock of the real function
 * It currently reads from the FS and stream the output
 * In production it should comes from S3
 */
const streamBaseImage = ({ image, pipeStreamTo }) =>
  new Promise((resolve, reject) => {
    logger.warn("== Start streaming base image (balenaOs) @streamBaseImage ==")

    const filePath = path.join(__dirname, "..", "in", `${image}.img`)

    const baseOsReadStream = fs.createReadStream(filePath)

    baseOsReadStream.on("open", function () {
      // stream the file to the tar stream
      baseOsReadStream.pipe(pipeStreamTo)
    })

    baseOsReadStream.on("end", function () {
      // we're good we can continue the process
      logger.warn("== End of base image streaming (balenaOs) @streamBaseImage ==")
      resolve(true)
    })
    baseOsReadStream.on("error", function (error) {
      // something went wrong
      reject(error)
    })
  })

export { getImageSize, streamBaseImage }
