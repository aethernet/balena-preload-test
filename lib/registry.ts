import axios, { AxiosRequestConfig, AxiosBasicCredentials } from "axios";
import "dotenv/config"
import { env } from "process"
// https://stackoverflow.com/questions/41292559/could-not-find-a-declaration-file-for-module-module-name-path-to-module-nam
import { dockerParseImage, DockerParsedImage } from "./docker-parse-image";
import { Manifest, ManifestsAll, ManifestInfosFromRegistry, ConfigManifestV2 } from "./interface-manifest"
import { inspect } from "util"

const featureFlags = {
  testRegistry: true,
}

/**
  This should authenticate to the registry api, get a token,
  Get the distribution manifest, the manifest from the registry and get the blobs.

  How to run:
  npm i
  node getManifest.mjs

  You can also replace scopeo with this.
*/

/**
** /v2/<name>/manifests/<reference>
** /v2/<name>/blobs/<digest>

Proof of Concept
Used a reverse proxy to catch the HTTP requests made by the 
docker client when pulling a docker image from the registry, here is the output:

1. Get a valid token and make a HEAD request to verify that the manifest exists. Checking manifest
Notice how we get back the image Id on Docker-Content-Digest header, as specified in the standard.

2. After validating that the manifest exists just requests a token for each of the layers and it's data: First layer
*/

/* 
Helpful links to understand the registry and other versions of registry code:
https://docs.docker.com/registry/spec/api/
https://github.com/dlgmltjr0925/docker-registry-web/blob/cbab3f214d3d47be3c93d1b5ab969f7b711663fc/utils/dockerRegistry.ts
https://github.com/TritonDataCenter/node-docker-registry-client/blob/master/lib/registry-client-v2.js
https://github.com/moby/moby/issues/9015
https://github.com/containers/skopeo/blob/main/cmd/skopeo/copy.go
https://github.com/mafintosh/docker-parse-image/blob/master/index.js
https://gist.github.com/leodotcloud/9cd3dabdc73ccb498777073a0c8df64a
https://github.com/moby/moby/blob/0910306bf970603ce787466a98e4294ba81af841/layer/layer_store.go#L102
https://programmer.ink/think/container-principle-understand-layerid-diffid-chainid-cache-id.html
https://github.com/productionwentdown/dri/blob/e7a85c5666f45b716be47d112be2578638143fbf/src/api.js
https://github.com/viraja1/decentralized_docker_hub_registry/blob/782de6b84532c70c51049b3aec35a177998f089a/daemon/server.js
https://github.com/bmonty/docker-manifest
https://github.com/viraja1/decentralized_docker_hub_registry/blob/782de6b84532c70c51049b3aec35a177998f089a/hub/server.js
https://github.com/plurid/hypod/blob/c69c53ef8c9aa41741144b416d2109c55a5eb7e1/packages/hypod-server/source/server/data/constants/docker/index.ts
https://stackoverflow.com/questions/71534322/http-stream-using-axios-node-js
*/


/**
 * 
 * @param {string} registry
 * @param {string} namespace
 * @returns 
 */
function getRegistryUrl({ registry, namespace }: DockerParsedImage | any = null): string {
  if (!registry) return `https://registry2.balena-cloud.com/${namespace}/`
  return `https://${registry}/${namespace}/`
}

/**
 * getImageUrl
 * @param {string} registry
 * @param {string} namespace
 * @param {string} repository
 * @returns {string} imageUrl
 */
// NOTE the double namespace here, the 1st v2 is for docker Version2, the second is for image release Version2
// Not sure how to get the image rel
function getImageUrl({ registry, namespace, repository }: DockerParsedImage | any = null): string {
  // we're only supporting docker api v2 for now
  return `https://${registry}/v2/${namespace}/${repository}`
}

/** getAllBlobs
  /v2/<name>/blobs/<digest>
*/

/**
 * getBlob
 * @param imageUrl
 * @param token
 * @param layer
 * @returns
 */
export async function getBlob(imageUrl: string, token: string, layer: { [key: string]: number | string }): Promise<Object> {
  const options: AxiosRequestConfig = {
    method: "GET",
    responseType: "stream",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.docker.image.rootfs.diff.tar.gzip",
      "Accept-Encoding": "gzip",
      "Docker-Distribution-API-Version": "registry/2.0",
    },
    url: `${imageUrl}/blobs/${layer.digest}`,
  }
  try {
    const { data, headers } = await axios(options)
    if (parseInt(headers["content-length"], 10) === layer.size && headers["docker-content-digest"] === layer.digest) {
      console.log("==> getBlob stream header/layer sizes match", parseInt(headers["content-length"]), layer.size)
      console.log("==> getBlob stream header/layer digests match", headers["docker-content-digest"], layer.digest)
    }
    return data
  } catch (error) {
    console.error("\n\n==> getBlob error:", inspect(error, true, 2, true))
    throw error
  }
}

/** getAllBlobs
  Iterate through the layers and get the blobs.
  This is getting moved over the the mainland. Should it tho?
*/
/**
 * getAllBlobs
 * Iterate through the layers and get the blobs.
 * This is getting moved over the the mainland. Should it tho?
 * @param {object} imageUrl - imageUrl per image
 * @param {string} token - token per image
 * @param {string} manifest - manifest per image
 * @returns {Promise}
 * */
// async function getAllBlobs(imageUrl: string, token: string, manifest: { [key: string]: any }): Promise<Object> {
//   try {
//     const tgzLayersDigest = await Promise.all(
//       manifest.layers.map(async (layer: { [key: string]: any }) => {
//         const dataBlob = await getBlob(imageUrl, token, layer)
//         return await dataBlob
//       })
//     )
//     return tgzLayersDigest
//   } catch (error) {
//     console.error("\n\n==> getAllBlob error:", inspect(error, true, 2, true))
//     throw error
//   }
// }



/**
 * getConfigManifest
 * This should pull the blob from the registry after checking head.
 * GET /v2/<name>/blobs/<digest>
 * GET example /v2/53b00bed7a4c6897db23eb0e4cf620e3/blobs/sha256:1aa86408ad62437344cee93c2be884ad802fc63e05795876acec6de0bb21f3cc
 * @param imageUrl
 * @param token
 * @param digest
 * @returns
 */
async function getConfigManifest(
  imageUrl: string, 
  token: string, 
  digest: string): Promise<ConfigManifestV2> {
  const options = {
    method: "GET",
    url: `${imageUrl}/blobs/${digest}`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.docker.image.rootfs.diff.tar.gzip",
      "Docker-Distribution-API-Version": "registry/2.0",
    },
  }
  try {
    const { data } = await axios(options)
    return await data
  } catch (error) {
    console.error("==> getBlob error", error)
    throw error
  }
}

// /**
//  * GET /v2/<name>/blobs/<digest>
//  * @param imageUrl
//  * @param token
//  * @param digest
//  * @returns
//  */
// async function getHeadBlob(imageUrl: string, token: string, digest: string): Promise<Object> {
//   const options = {
//     method: "HEAD",
//     url: `${imageUrl}/blobs/${digest}`,
//     headers: {
//       Accept: "application/vnd.docker.distribution.manifest.v2+json",
//       Authorization: `Bearer ${token}`,
//       "Docker-Distribution-API-Version": "registry/2.0",
//     },
//   }
//   try {
//     const { data, headers } = await axios(options)
//     // Not possible to check `headers['docker-content-digest'] === digest`
//     // since cloudfront frontend doesn't forward dockers headers
//     return headers["content-length"] ?? 0
//   } catch (error) {
//     throw new Error(`==> getHeadBlob CATCH: ${error}`)
//   }
// }

/**
 *
 * @param imageUrl
 * @param token
 * @returns
 */
async function getManifest(imageUrl: string, token: string): Promise<Manifest> {
  const options = {
    method: "GET",
    url: `${imageUrl}/manifests/latest`,
    withCredentials: true,
    credentials: "include",
    headers: {
      Accept: "application/vnd.docker.distribution.manifest.v2+json",
      Authorization: `Bearer ${token}`,
      "Docker-Distribution-API-Version": "registry/2.0",
    },
  }
  try {
    const { data } = await axios(options)
    return data;
  } catch (error) {
    console.error("==> getManifest error", error)
    throw new Error(`==> NOPE did not get registry manifest. CATCH: ${error}`)
  }
}

/**
 *
 * @param parsedImage
 * @param authHeaders
 * @param authResponse
 * @param tag
 * @returns
 */
async function getToken(parsedImage: DockerParsedImage | any = null, authHeaders: AxiosBasicCredentials, authResponse: { [key: string]: any }, tag?: string) {
  try {
    const { repository, namespace } = parsedImage
    const options = {
      method: "GET",
      url: authResponse.realm,
      params: {
        service: authResponse.service,
        scope: `repository:${namespace ? `${namespace}/` : "library/"}${repository}:${tag || "pull"}`,
      },
      auth: authHeaders,
    }
    const { data } = await axios(options)
    if (!data.token) throw new Error("token registry fail.")
    return await data.token
  } catch (error) {
    throw new Error(`Failed to get authentication token from registry : ${error}`)
  }
}

interface AuthRealmServiceResponseType {
  realm: string;
  service: string;
}

/**
 *
 * @param url
 * @param authHeaders
 * @returns
 */
async function getRealmResponse(url: string, authHeaders: AxiosBasicCredentials): Promise<AuthRealmServiceResponseType> {
  // parse auth response for the realm and service params provided by registry
  let options = {
    method: "GET",
    url,
    validateStatus: (status: number) => status === 401,
    auth: authHeaders,
  }
  try {
    const { headers } = await axios(options)
    if (headers["www-authenticate"] === undefined) {
      throw new Error("unsupported scheme")
    }
    // Looking for this
    // `Bearer realm="https://api.balena-cloud.com/auth/v1/token"
    // ,service="registry2.balena-cloud.com.bob.local"`
    const authHeader = headers["www-authenticate"].split(" ")[1].split(",")
    const authRealmServiceResponse = {
      realm: authHeader[0].split("=")[1].replace(/\"/g, ""),
      service: authHeader[1].split("=")[1].replace(/\"/g, ""),
    }
    return authRealmServiceResponse
  } catch (error) {
    console.error("==> getRealmResponse error", error);
    throw new Error(`www-authenticate Bearer realm/service missing. ERROR: ${error}`)
  }
}

/**
 *
 * @param image
 * @param layer
 * @returns
 */
export function getUrls(image: string) {
  const parsedImage = dockerParseImage(image)
  const registryUrl = getRegistryUrl(parsedImage)
  const imageUrl = getImageUrl(parsedImage)
  return { registryUrl, imageUrl, parsedImage }
}

/**
 *
 * @param image
 * @param auth
 * @returns
 */
export async function pullManifestsFromRegistry(image: string, authHeaders: AxiosBasicCredentials): Promise<ManifestInfosFromRegistry> {
  const { registryUrl, imageUrl, parsedImage } = getUrls(image)

  const authRealmServiceResponse = await getRealmResponse(registryUrl, authHeaders)

  const token = await getToken(parsedImage, authHeaders, authRealmServiceResponse)

  const manifest = await getManifest(imageUrl, await token)
  console.log("==> manifest", inspect(manifest, true,10,true))
  const configDigest = manifest?.config?.digest
  const digests = manifest?.layers;

  // We are using this manifest as its V2
  const configManifestV2 = await getConfigManifest(imageUrl, await token, configDigest)
  const diffIds = await configManifestV2.rootfs.diff_ids

  // if (featureFlags.justDownload) {
  //   const allBlobAlltheTime = await getAllBlobs(imageUrl, await token, manifest)
  // }

  const imageId = configDigest
  const imageName = image

  return { manifest, digests, configDigest, configManifestV2, imageId, imageName, diffIds, imageUrl, token }
}

/**
 * Download Distribution Manifest
 * @param images - array of images
 * @returns - array of distribution manifests
 */
export const getManifests = async (images: Array<{ [key: string]: any }>, authHeaders: AxiosBasicCredentials): Promise<ManifestInfosFromRegistry[]> => {
  const manifests: ManifestInfosFromRegistry[] = []
  console.log(`== Downloading Manifests @getManifests ==`)
  for (const image in images) {
    const imageName = images[image].image_name
    console.log(`=> ${parseInt(image) + 1} / ${images.length} : ${imageName}`)
    const manifestInfo = await pullManifestsFromRegistry(imageName, authHeaders)
    manifests.push({
      ...manifestInfo,
      ...images[image],
    })
  }
  console.log(`== Downloading Manifests @getManifests DONE ==`)
  return manifests
}

if (featureFlags.testRegistry) {
  const imageName = 'registry2.77105551e3a8a66011f16b1fe82bc504.bob.local/v2/53b00bed7a4c6897db23eb0e4cf620e3' as  string;
  const authHeaders = {
    username: 'bob',
    password: 'MckyVT59iyr9qcOkP6jVZybxPG9HPypL',
  } as AxiosBasicCredentials;
  const manifestInfo = pullManifestsFromRegistry(imageName, authHeaders)
}