import axios from 'axios';
import dockerParseImage from 'docker-parse-image';
import { fs } from 'zx';
import { inspect } from 'util';
import { getAuthHeaders } from './getAuth.mjs';
const featureFlags = {
  justDownload: false,
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

function getRegistryUrl({ registry, namespace }) {
  if (!registry) return `https://registry2.balena-cloud.com/${namespace}/`;
  return `https://${registry}/${namespace}/`;
}

// NOTE the double namespace here, the 1st v2 is for docker Version2, the second is for image release Version2
// Not sure how to get the image rel
function getImageUrl({ registry, namespace, repository }) {
  return `https://${registry}/${namespace}/${namespace}/${repository}`; 
}

/** getAllBlobs
  /v2/<name>/blobs/<digest>
*/
export const getBlob = async (imageUrl, token, layer, baseInPathSub) => {
  const options = {
    "method": "GET",
    "headers": {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.docker.image.rootfs.diff.tar.gzip",
      "Accept-Encoding": "gzip",
      "responseType": 'stream',
      "Docker-Distribution-API-Version": 'registry/2.0',
    },
  }
  try {
    // const writer = fs.createWriteStream(`${baseInPath}/${layer.digest.split(':')[1]}`);
    options.url = `${imageUrl}/blobs/${layer.digest}`;
    const { data, headers } = await axios(options)
    if ((parseInt(headers['content-length']) === layer.size) 
      && (headers['docker-content-digest'] === layer.digest)) {
        console.log(`\n\n==> getting Blob: ${layer.digest} size: ${layer.size}`)
        const headerSize = headers['content-length'];
        const layerSize = layer.size;
        const headerDigest = headers['docker-content-digest'];
        const layerDigest = layer.digest;
        console.log(`\n\n==> getBlob: size: ${layer.size} ${headers['content-length']} `);
        console.log(`\n\n==> getBlob: size: ${layer.digest} \n${headers['docker-content-digest']} `);
        return await data;
    } else {
      console.error('\n\n==> getAllBlob layer failed:', inspect(await layer, true, 2, true))
      console.error('==> getAllBlob layer failed response headers', inspect(headers, true, 2, true))
      return { ...layer, error: 'failed'};
    }
  } catch(error) {
    console.error('\n\n==> getAllBlob error:', inspect(error, true, 2, true))
  }
}

/** getAllBlobs
  Iterate through the layers and get the blobs.
  This is getting moved over the the mainland. Should it tho?

*/
async function getAllBlobs(imageUrl, token, manifest, baseInPath) {
  try {
    const tgzLayersDigest = await Promise.all(manifest.layers.map(async (layer) => {
      const layerStream = fs.createWriteStream(`${baseInPathSub}${layer}`);
      const dataBlob = await getBlob(imageUrl, token, layer, baseInPath)
      layerStream.write(await dataBlob);
      layerStream.end();
      return await dataBlob
    }))
    return tgzLayersDigest;
  } catch(error) {
    console.error('\n\n==> getAllBlob error:', inspect(error, true, 2, true))
  }
}

/**
  This should pull the blob from the registry after checking head.
  GET /v2/<name>/blobs/<digest>
  GET example /v2/53b00bed7a4c6897db23eb0e4cf620e3/blobs/sha256:1aa86408ad62437344cee93c2be884ad802fc63e05795876acec6de0bb21f3cc
*/
async function getConfigManifest(imageUrl, token, digest, baseInPath) {
  const options = {
    "method": "GET",
    url: `${imageUrl}/blobs/${digest}`,
    "headers": {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.docker.image.rootfs.diff.tar.gzip",
      "Docker-Distribution-API-Version": 'registry/2.0',
    },
  }
  try {
    const { data } = await axios(options);
    fs.writeFileSync(`${baseInPath}/${digest.split(':')[1]}`, JSON.stringify(await data, null, 2));
    return await data;
  } catch (error) {
    console.error('==> getBlob error', error)
    // throw new Error(`\n\n==> getBlob => ERROR: ${error}`);
  }
}

/**
  GET /v2/<name>/blobs/<digest>
*/
async function getHeadBlob(imageUrl, token, digest) {
  const options = {
    "method": "HEAD",
    "url": `${imageUrl}/blobs/${digest}`,
    "headers": {
      "Accept": 'application/vnd.docker.distribution.manifest.v2+json',
      "Authorization": `Bearer ${token}`,

      "Docker-Distribution-API-Version": 'registry/2.0',
    },
  }
  try {
    const { data, headers } = await axios(options);
    if (headers['content-length'] && headers['docker-content-digest'] === digest) {
      console.log(headers['content-length'], '==> getHeadBlob headers["content-length"]')
      console.log(headers['docker-content-digest'], '==> getHeadBlob headers["docker-content-digest"]\n\n')
      return headers['content-length'];
    }
    console.error(digest, '==> getHeadBlob failed to get configDigest\n\n')
    return 0;
  } catch (error) {
    throw new Error('==> getHeadBlob CATCH:', error);
  }
}

async function getManifest(imageUrl, token, authHeaders,baseInPath) {
  const options = {
    "method": "GET",
    url: `${imageUrl}/manifests/latest`,
    withCredentials: true,
    credentials: 'include',
    "headers": {
      "Accept": 'application/vnd.docker.distribution.manifest.v2+json',
      "Authorization": `Bearer ${token}`,

      "Docker-Distribution-API-Version": 'registry/2.0',
    },
  };
  try {
    const { data, headers } = await axios(options);
    const digest = headers["docker-content-digest"];
    fs.writeFileSync(`${baseInPath}/manifest.json`, JSON.stringify(await data, null, 2));
    return { ...data, digest };
  } catch (error) {
    throw new Error('==> NOPE did not get registry manifest. CATCH:', error);
  }
}

async function getToken(parsedImage, authHeaders, authResponse, tag) {
  try {
    const { repository, namespace } = parsedImage;
    const options = {
      method: 'GET',
      url: authResponse.realm,
      params: {
        service: authResponse.service,
        scope: `repository:${namespace 
          ? `${namespace}/` 
          : 'library/'}${repository}:${tag || 'pull'}`,
      },
      ...authHeaders,
    };
    console.log(inspect(options, true, 2, true), '==> getToken options:')
    const { data } = await axios(options);
    if (!data.token) throw new Error("token registry fail.");
    return await data.token;
  } catch (error) {
    throw new Error('Failed to get authentication token from registry.', error);
  }
}

async function getRealmResponse(url, authHeaders) {
  // parse auth response for the realm and service params provided by registry
  let options = { 
    method: 'GET',
    url,
    validateStatus: status => status === 401,
    ...authHeaders, 

  };
  try {
    const { headers } = await axios(options);
    if (headers['www-authenticate'] === undefined) {
      throw new Error('unsupported scheme');
    }
    // Looking for this
    // `Bearer realm="https://api.balena-cloud.com/auth/v1/token"
    // ,service="registry2.balena-cloud.com.bob.local"`
    const authHeader = headers['www-authenticate'].split(' ')[1].split(',');
    const authResponse =  { 
      realm: authHeader[0].split('=')[1].replace(/\"/g, ''),
      service: authHeader[1].split('=')[1].replace(/\"/g, '')
    };
    return authResponse;
  } catch (error) {
    throw new Error(`www-authenticate Bearer realm/service missing. ERROR: ${error}`);
  }
}

export const getUrls = async (image, layer) => {
  const parsedImage = dockerParseImage(image);
  console.log('\n\n==> parsedImage', parsedImage);
  const registryUrl = getRegistryUrl(parsedImage, layer);
  console.log('\n\n==> registryUrl', registryUrl);
  const imageUrl = getImageUrl(parsedImage);
  console.log('\n\n==> imageUrl', imageUrl);
  return { registryUrl, imageUrl, parsedImage };
}

const makeDirectory = async (directory) => {
  if (!fs.existsSync(directory)){
    fs.mkdirSync(directory, 
      { recursive: true, mode: '0777' }
    );
  }
};

export const pullManifestsFromRegistry = async (image, auth, baseInPath) => {
  const authHeaders = auth || await getAuthHeaders(auth);
  const { registryUrl, imageUrl, parsedImage } = await getUrls(image);


  const baseInPathSub = `${baseInPath}/images/${parsedImage.repository}`;
  console.log(baseInPathSub, '\n\n==> baseInPathSub');
  await makeDirectory(baseInPathSub);

  const authResponseForRealm = await getRealmResponse(registryUrl, authHeaders);
  console.log('\n\n==> authResponseForRealm', authResponseForRealm);

  const token = await getToken(parsedImage, authHeaders, authResponseForRealm);
  console.log('\n\n==> token', token);

  const manifest = await getManifest(imageUrl, await token, authHeaders, baseInPathSub);
  console.log('\n\n==> manifest', manifest);
  const configDigest = manifest.config.digest;
  console.log(manifest.config,'==> HERE  manifest manifest.config \n\n', ); 
  const digests = manifest.layers.map(layer => ({digest: layer.digest, size: layer.size}));

  const contentLength = await getHeadBlob(imageUrl, await token, configDigest);
  // console.log(contentLength,'=====> contentLength')

    // We are using this manifest as its V2
  const configManifestV2 = await getConfigManifest(imageUrl, await token, configDigest, baseInPathSub);
  console.log(await configManifestV2.rootfs,'=====> configManifestV2.rootfs')
  const diff_ids = await configManifestV2.rootfs.diff_ids;

  if (featureFlags.justDownload) {
    const allBlobAlltheTime = await getAllBlobs(imageUrl, await token, manifest, baseInPathSub);
    console.log(await allBlobAlltheTime,'=====> allBlobAlltheTime');
  }

  // console.log( image,'image HERE ==> \n\n');
  return { manifest, digests, configDigest, configManifestV2, diff_ids, imageUrl, token };
}



// const image = 'registry2.77105551e3a8a66011f16b1fe82bc504.bob.local/v2/53b00bed7a4c6897db23eb0e4cf620e3'
// const baseInPath = `in/images/${image.split("/").reverse()[0]}`
// const userInfo = null;

// pullManifestFromRegistry(image, userInfo, baseInPath)

