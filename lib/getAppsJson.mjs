/**
 * `Apps.json` is the file that will inform the supervisor of what's has been preloaded, which services should be started and with which config.
 *
 * `Apps.json` content is a subset of the `target state` for a device in a fleet running a given release.
 * Once we have that target fleeet, we need to go down one level to `apps` and keep only that element.
 */

// import logger from "../logger.mjs"
import path from "path"
import fs from "fs-extra"
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Derives Apps.json from target state obtained from the api
 *
 * TODO: There's no endpoint yet so faking it using the fs
 * Will be replaced by the api call when this PR https://github.com/balena-io/open-balena-api/pull/1081 is merged
 *
 * @param {string} app_id - app_id
 * @param {string} release_id - release_id
 * @returns {json} - apps.json object
 */
const getAppsJson = async ({ app_id, release_id, fleetUUID }, auth) => {
  //   // FIXME: is fleetUUID equal to app_id ? If not it will be required
  //   // In production those informations should already be available in image-maker
  //   const options = {
  //     method: "GET",
  //     url: `https://api.${process.env.BALENAENV}/device/v3/fleet-state/${fleetUuid}/release/${release_id}`,
  //     headers: {
  //       "Content-Type": "application/json",
  //       Authorization: `Bearer ${bobApiToken}`,
  //     }
  //   }

  //   try {
  //     const { data, headers } = await axios(options)
  //     return await data
  //   } catch (error) {
  //     console.error("\n\n==> getBlob error:", inspect(error, true, 2, true))
  //   }
  // }

  return await fs.readJson(path.join(__dirname, "..", "in", "apps.json"))
}

export { getAppsJson }
