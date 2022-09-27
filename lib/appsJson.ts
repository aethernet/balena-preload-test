/**
 * `Apps.json` is the file that will inform the supervisor of what's has been preloaded, which services should be started and with which config.
 *
 * `Apps.json` content is a subset of the `target state` for a device in a fleet running a given release.
 * Once we have that target fleeet, we need to go down one level to `apps` and keep only that element.
 *
 * In Apps.json we have the list of all the images that makes up a release.
 */

// import logger from "../logger.mjs"

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
const getAppsJson = async ({ app_id, release_id }: any) => {
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

  return {
    apps: {
      ed91bdb088b54a3b999576679281520a: {
        id: 1933815,
        name: "preloading-test-pi4",
        is_host: false,
        class: "fleet",
        releases: {
          "2f24cd2be3006b029911a3d0da6837d5": {
            id: 2168707,
            services: {
              files: {
                id: 1575101,
                image_id: 4913976,
                image:
                  "registry2.balena-cloud.com/v2/a42656089dcef7501aae9dae4687a2c5@sha256:0ae9a712a8c32ac04b91d659a9bc6d4bb2e76453aaf3cfaf036f279262f1f100",
                environment: {
                  BROWSE_FOLDER: "/files",
                },
                labels: {},
                composition: {
                  restart: "always",
                  volumes: ["files:/files"],
                  ports: ["80"],
                  environment: {
                    BROWSE_FOLDER: "/files",
                  },
                },
              },
              sdcard: {
                id: 1575102,
                image_id: 4913977,
                image:
                  "registry2.balena-cloud.com/v2/5eb45ce8b915cd87865cf954a5e53129@sha256:0406bfce1cb9ccac879bdeb720228f322eab8e269cc0d846ec1843e691d7b841",
                environment: {},
                labels: {},
                composition: {
                  restart: "always",
                  privileged: true,
                  volumes: ["files:/files"],
                },
              },
            },
            volumes: {
              files: {},
            },
          },
        },
      },
    },
    config: {
      RESIN_SUPERVISOR_DELTA_VERSION: "3",
      RESIN_SUPERVISOR_NATIVE_LOGGER: "true",
      RESIN_HOST_FIREWALL_MODE: "",
      RESIN_SUPERVISOR_DELTA: "1",
      RESIN_SUPERVISOR_POLL_INTERVAL: "900000",
      RESIN_SUPERVISOR_DELTA_REQUEST_TIMEOUT: "59000",
    },
  }
}

/**
 * Takes a apps.json and returns the list of images for an app & release.
 * If apps_id and/or release_id is unkown it will return first.
 * // TODO: return all instead of first when no app or release is specified.
 */
interface ImageIdsInput {
  appsJson: any //TODO: get propertype for appsJson V3
  app_id: string
  release_id: string
}

interface Image {
  image_name: string
  image_hash: string
}

const getImageIds = ({ appsJson, app_id, release_id }: ImageIdsInput): Image[] => {
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
