/**
 * `Apps.json` is the file that will inform the supervisor of what's has been preloaded, which services should be started and with which config.
 *
 * `Apps.json` content is a subset of the `target state` for a device in a fleet running a given release.
 * Once we have that target fleeet, we need to go down one level to `apps` and keep only that element.
 *
 * In Apps.json we have the list of all the images that makes up a release.
 */

// import logger from "../logger.mjs"
import { readJson } from 'fs-extra';
import { PreloadIds, AppsJsonProp } from './streamPreloadingAssets';
import { inspect } from 'util';

/**
 * Derives Apps.json from target state obtained from the api
 *
 * TODO: There's no endpoint yet so faking it using the fs
 * Will be replaced by the api call when this PR https://github.com/balena-io/open-balena-api/pull/1081 is merged
 *
 * @param {string} appId - appId
 * @param {string} releaseId - releaseId
 * @returns {json} - apps.json object
 */
const getAppsJson = async ({ appId, releaseId }: PreloadIds) => {
	console.log('getAppsJson appId', appId);
	console.log('getAppsJson releaseId', releaseId);
	//   // FIXME: is fleetUUID equal to appId ? If not it will be required
	//   // In production those informations should already be available in image-maker
	//   const options = {
	//     method: "GET",
	//     url: `https://api.${process.env.BALENAENV}/device/v3/fleet-state/${fleetUuid}/release/${releaseId}`,
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

	return await readJson('in/apps.json');
};

/**
 * Takes a apps.json and returns the list of images for an app & release.
 * If appsId and/or releaseId is unkown it will return first.
 * // TODO: return all instead of first when no app or release is specified.
 */
const getImageIds = ({ appId, releaseId, appsJson }: AppsJsonProp) => {
	const appIdImage = appId ?? Object.keys(appsJson.apps)[0];
	console.log(`@getImageIds ==> appIdImage: ${appIdImage}`);

	const releaseIdImage =
		releaseId ?? Object.keys(appsJson.apps?.[appIdImage]?.releases)[0];
	console.log(`@getImageIds ==> releaseIdImage: ${releaseIdImage}`);

	const imageKeys = Object.keys(
		appsJson.apps?.[appIdImage]?.releases?.[releaseIdImage]?.services,
	);
	// console.log(`@getImageIds ==> imageKeys ${imageKeys}`)

	const imageNames = imageKeys.map(
		(key) =>
			appsJson.apps?.[appIdImage]?.releases?.[releaseIdImage]?.services[key]
				.image,
	);
	return imageNames.map((image) => {
		const [imageName, imageHash] = image.split('@');
		return { imageName, imageHash };
	});
};

export { getAppsJson, getImageIds };
