/**
 * `Apps.json` is the file that will inform the supervisor of what's has been preloaded, which services should be started and with which config.
 *
 * `Apps.json` content is a subset of the `target state` for a device in a fleet running a given release.
 * Once we have that target fleeet, we need to go down one level to `apps` and keep only that element.
 *
 * In Apps.json we have the list of all the images that makes up a release.
 */

// import logger from "../logger.mjs"
import { readJson } from "fs-extra"
import { PreloadIds, AppsJsonProp } from "./streamPreloadingAssets"

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
const getAppsJson = async ({ app_id, release_id }: PreloadIds) => {
  console.log(app_id)
  console.log(release_id)
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

  return await readJson("../in/apps.json")
}

/**
 * Takes a apps.json and returns the list of images for an app & release.
 * If apps_id and/or release_id is unkown it will return first.
 * // TODO: return all instead of first when no app or release is specified.
 */



interface Image {
  image_name: string
  image_hash: string
}

const getImageIds = ({ app_id, release_id, appsJson }: AppsJsonProp): Image[] => {
  const appId = app_id ?? Object.keys(appsJson.apps)[0]
  const releaseId = release_id ?? Object.keys(appsJson.apps?.[appId]?.releases)[0]
  console.log(`==> appId: ${appId} & releaseId: ${releaseId}`)
  const imageKeys = Object.keys(appsJson.apps?.[appId]?.releases?.[releaseId]?.services)
  const imageNames = imageKeys.map((key) => appsJson.apps?.[appId]?.releases?.[releaseId]?.services[key].image)
  return imageNames.map((image) => {
    const [image_name, image_hash] = image.split("@")
    return { image_name, image_hash }
  })
}

export { getAppsJson, getImageIds }
