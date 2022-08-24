import tar from "tar-stream"
import path from "path"
import logger from "../logger.mjs"

/**
 * PromisePacker
 * Promisify tar-stream.pack.entry ( https://www.npmjs.com/package/tar-stream )
 *
 * @param {tar-stream.pack} pack - tar-stream.pack.entry
 * @returns {Function} packer - function to return the promisified packer
 *
 * @param {object} header - tar-stream.pack.entry header
 * @param {string} value - tar-stream.pack.entry value
 * @param {function} cb - optional callback to call after packing the entry
 * @returns {Promise}
 * */
const promisePacker = (pack, injectFolder) => (header, value, cb) =>
  new Promise((resolve, reject) => {
    if (header.name.includes("sha256:")) {
      logger.error(`=> FIXME!! pack header.name: ${header.name}`)
    }
    // add the root injectable folder in front of the name when injecting files
    if (injectFolder) header.name = `${injectFolder}/${header.name}`
    pack.entry(header, value, (error) => {
      if (error) reject(error)
      if (cb) cb()
      resolve(true)
    })
  })

/**
 * Streamable tar packer
 * // TODO : add compression to the stream
 * @param {Stream} outputStream
 * @returns Streamable tar packer
 */
const getTarballStream = (outputStream) => {
  // logger.log(`=> prepareTarball outputStream: ${inspect(outputStream,true,5,true)}`)
  const pack = tar.pack()
  pack.pipe(outputStream)
  return pack
}

export { promisePacker, getTarballStream }
