/**
 * Get the base image we're going to preload assets in (balenaos.img)
 * */

import logger from "../logger.js"

/**
 * Awaitable pipe stream from input to output
 */
const streamBaseImage = ({ pipeStreamFrom, pipeStreamTo }) =>
  new Promise((resolve, reject) => {
    logger.warn("== Start streaming base image (balenaOs) @streamBaseImage ==")

    pipeStreamFrom.pipe(pipeStreamTo)

    pipeStreamFrom.on("end", function () {
      // we're good we can continue the process
      logger.warn("== End of base image streaming (balenaOs) @streamBaseImage ==")
      resolve(true)
    })

    pipeStreamFrom.on("error", function (error) {
      // something went wrong
      reject(error)
    })
  })

export { streamBaseImage }
