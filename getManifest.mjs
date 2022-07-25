import https from 'https';
import axios from 'axios';
// import fetch from 'fetch';
import dockerParseImage from 'docker-parse-image';
import { fs } from 'zx';
import { inspect } from 'util';

/*
  This should authenticate to the registry api, get a token,
  Get the manifest from the registry and get the blobs.
 
  TODO: work on functions getHeadBlob then getBlob

  How to run:
  npm i
  node getManifest.mjs

  You can also replace scopeo with this but it's currently only getting the manifest, not the blobs.
*/


/* 
Pull manifests using the endpoint /v2/<name>/manifests/<reference>
Pull blobs using the endpoint /v2/<name>/blobs/<digest>

Proof of Concept
Used a reverse proxy to catch the HTTP requests made by the 
docker client when pulling a docker image from the registry, here is the output:

1. Get a valid token and make a HEAD request to verify that the manifest exists. Checking manifest
Notice how we get back the image Id on Docker-Content-Digest header, as specified in the standard.

2. After validating that the manifest exists just requests a token for each of the layers and it's data: First layer
*/

// https://docs.docker.com/registry/spec/api/
// https://github.com/dlgmltjr0925/docker-registry-web/blob/cbab3f214d3d47be3c93d1b5ab969f7b711663fc/utils/dockerRegistry.ts
// https://github.com/moby/moby/issues/9015
// https://github.com/containers/skopeo/blob/main/cmd/skopeo/copy.go
// https://github.com/mafintosh/docker-parse-image/blob/master/index.js
// https://gist.github.com/leodotcloud/9cd3dabdc73ccb498777073a0c8df64a
// https://github.com/moby/moby/blob/0910306bf970603ce787466a98e4294ba81af841/layer/layer_store.go#L102
// https://programmer.ink/think/container-principle-understand-layerid-diffid-chainid-cache-id.html
// https://github.com/productionwentdown/dri/blob/e7a85c5666f45b716be47d112be2578638143fbf/src/api.js
// https://github.com/viraja1/decentralized_docker_hub_registry/blob/782de6b84532c70c51049b3aec35a177998f089a/daemon/server.js
// https://github.com/bmonty/docker-manifest
// https://github.com/viraja1/decentralized_docker_hub_registry/blob/782de6b84532c70c51049b3aec35a177998f089a/hub/server.js
// https://github.com/plurid/hypod/blob/c69c53ef8c9aa41741144b416d2109c55a5eb7e1/packages/hypod-server/source/server/data/constants/docker/index.ts


const fetchFromRegistry = async (url, options, callerFunction) => {
  try {
    const response = await axios.get(url, options);
    return await response;
  } catch (error) {
    // console.error('===> fetchFromRegistry', error, callerFunction);
    // throw new Error('==> failed to fetch.');
  }
}

function getRegistryUrl(image) {
  const parsedImage = dockerParseImage(image);
  if (parsedImage.registry) return `https://${parsedImage.registry}/v2/`;
  return 'https://registry2.balena-cloud.com/v2/';
}



const createAuthTokenHeaderOptions = (token, options) => {
  return {
      "headers": {
          "Accept": "application/vnd.docker.distribution.manifest.v2+json",
          "Content-Type": "application/vnd.docker.distribution.manifest.v1+json",
          "Authorization": `Bearer ${token}`
      }}}

// TODO Finish getBlobs once getHeadBlobs is working
// GET /v2/<name>/blobs/<digest></digest>
// This should pull the blob from the registry after checking head.
const getBlobs = async (image, token, manifest, baseInPath) => {
  const options = {
    "method": "get",
    "headers": {
      "Authorization": `Bearer ${token}`,
      "Accept-Encoding": "gzip, deflate, br",
      "Accept": "application/vnd.docker.distribution.manifest.v2+json",
      // "Content-Type": "application/vnd.docker.distribution.manifest.v1+json",
      // "Accept": "application/vnd.docker.image.rootfs.diff.tar.gzip",
      // "Content-Type": 'application/vnd.docker.image.rootfs.diff.tar.gzip',
      // "Content-Type": 'application/vnd.docker.container.image.v1+json',
      // "Accept-Encoding": "br;q=1.0, gzip;q=0.8, *;q=0.1",

      // Should get these from server after HEAD request
      // "content-length": 171,
      // "docker-content-digest": digest,
    }
  }
  const imageHash = await manifest.config.digest.split(":")[1]
  const url = makeBlobUrl(image,  imageHash);
  const res = await axios.get(url, options);
  fs.writeFileSync(`${path.join(baseInPath)}/${imageHash}`, JSON.stringify(res.data, null, 2));

  // TODO iterate through all digests and get blobs
  
}

function makeBlobUrl(image, digest) {
  // registry spec https://docs.docker.com/registry/spec/api/
  const parsedImage = dockerParseImage(image);
  const baseRegistry = getRegistryUrl(image);
  const {repository, namespace} = parsedImage;
  const url = `${baseRegistry}${repository}/blobs/${digest}`;
  return url;
}

// TODO getHeadBlob
// This should do HEAD check to make sure blob/layer exists
const getHeadBlob = async (image, token, manifest, baseInPath) => {
  const options = {
    "method": "HEAD",
    "headers": {
      "Accept": "application/vnd.docker.distribution.manifest.v2+json",
      "Authorization": `Bearer ${token}`,
    }
  }
  
  // let digest = '94274425ee063cf3c983f54c16d65411506f1602fb30c7911965225a463a2376'
  // digest = 'bce5c272ff6548145aa920ec50b4e7715c05730731e0ac9d07847050ec584f39'
  try {
    const headCache = {};
    const tgzLayersDigest = await Promise.all(manifest.layers.map(async (layer) => {
      const layerInfo = {
        digest: layer.digest.split(":")[1],
        size: layer.size,
      }
      const url = makeBlobUrl(image,  layer.digest);
      const res = await axios.head(url, options);
      console.log('==> res.headers', await res.headers)
      if (await res.status === 404) {
        console.error('==> blob not found', layerInfo.digest);
        headCache[layerInfo.digest] = 'failed';
        return
      }


      // Response Should get these from server after HEAD request
      // "content-length": 171,
      // "docker-content-digest": digest,
      if (layerInfo.digest === res.headers['docker-content-digest']) {
        headCache[layerInfo.digest] = 'success';
        return layerInfo;
      }
      headCache[layerInfo.digest] = 'fail';
      return layerInfo
    }))

  } catch (error) {
    // console.error(error,'=====> getHeadBlob error')
    return error;
  }
}

const makeManifestUrl = (image) => {
  // registry spec https://docs.docker.com/registry/spec/api/
  const baseRegistry = getRegistryUrl(image);
  const parsedImage = dockerParseImage(image);
  console.log('==> parsedImage', parsedImage);
  const {repository, registry, tag, namespace} = parsedImage;
  const manifestUrl = `${baseRegistry}/${namespace || ''}/${repository}/manifests/${tag || 'latest'}`;
  console.log('==> manifestUrl', manifestUrl);
  return manifestUrl;
}


const getManifest = async (image, token, options = {}) => {
  const manifestOptions = createAuthTokenHeaderOptions(token, options);
  const manifestUrl = makeManifestUrl(image);
  try {
    const manifest = await fetchFromRegistry(manifestUrl, manifestOptions, 'getManifest');
    console.log('==> manifest.data', manifest.data);
    return manifest.data;
  } catch (error) {
    console.error('===> getManifest', error);
    throw new Error('==> Nope did not get registry manifest data.');
  }
}

const  getToken = async (image, options, authResponse) => {
  try {
    const parsedImage = dockerParseImage(image);
    const tokenOptions = {
      params: {
        service: authResponse.service,
        scope: `repository:${parsedImage.namespace ? `${parsedImage.namespace}/` : 'library/'}${parsedImage.repository}:pull`,
      },
      ...options,
    };
    const tokenResponse = await fetchFromRegistry(authResponse.realm, tokenOptions, 'getToken');
    if (!tokenResponse.data.token) throw new Error("token registry fail.");
    return await tokenResponse.data.token;
  } catch (error) {
    console.log(error);
    throw new Error('Failed to get authentication token from registry.');
  }
}

async function blob(name, digest) {
	const { headers } = await request('HEAD', `/v2/${name}/blobs/${digest}`, `repository:${name}:pull`);
	return {
		dockerContentDigest: headers.get('Docker-Content-Digest'),
		contentLength: parseInt(headers.get('Content-Length'), 10),
	};
}

async function configBlob(name, digest) {
	return request('GET', `/v2/${name}/blobs/${digest}`, `repository:${name}:pull`);
}

const getRealmResponse = async (image, options) => {
  // parse auth response for the realm and service params provided by registry
  let realmOptions = { 
    method: 'GET',
    validateStatus: status => status === 401,
    ...options, 
  };
  const url = getRegistryUrl(image)
  try {
    const realmResponse = await fetchFromRegistry(url, realmOptions);
    console.log('==> realmResponse', realmResponse.scheme);
    if (realmResponse.headers['www-authenticate'] === undefined) {
      throw new Error('unsupported scheme');
    }
    // if (realmResponse.headers['www-authenticate']) {
        console.log('==> has correct auth realmResponse.headers', realmResponse.headers);
      // Looking for this
      // `Bearer realm="https://api.balena-cloud.com/auth/v1/token"
      // ,service="registry2.balena-cloud.com.bob.local"`
      const authHeader = realmResponse.headers['www-authenticate'].split(' ')[1].split(',');
      const authResponse =  { 
        realm: authHeader[0].split('=')[1].replace(/\"/g, ''),
        service: authHeader[1].split('=')[1].replace(/\"/g, '')
      };
      console.log('==> authResponse', authResponse);
      return authResponse;
    // } else {
    //   console.error('===> Realm response wrong or missing');
    //   return;
    // }
  } catch (error) {
    console.error('===> getRealmResponse', error);
    throw new Error('Realm/service info from registry error catchment system.');
  }
}

const getAuthHeaders = async (options) => {
  return {
    auth: {
        username: options?.user,
        password: options?.password
    },
  }
}

export const pullManifestFromRegistry = async (image, userInfo, baseInPath) => {
  const authHeaders = getAuthHeaders(userInfo);
  const authResponseForRealm = await getRealmResponse(image, authHeaders);
  const token = await getToken(image, authHeaders, authResponseForRealm);
  const manifest = await getManifest(image, await token, authHeaders, baseInPath);
  const blob = await getHeadBlob(image, await token, manifest, baseInPath);
  // const layers = await getBlobs(image, await token, manifest, baseInPath);
  // console.log(layers,'=====> layers')
  return manifest;
}


const image = 'registry2.77105551e3a8a66011f16b1fe82bc504.bob.local/v2/53b00bed7a4c6897db23eb0e4cf620e3'
const baseInPath = './test'
// commitHash = sha256:ab662eecdb30b71c7658e8c7d40eca4ae4bcde9eac117ed0022fc522da23a86e
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJib2IiLCJlbWFpbCI6ImJvYkBiYWxlbmEubG9jYWwiLCJjcmVhdGVkX2F0IjoiMjAyMi0wNi0wMlQyMjozMTo0MC41ODFaIiwiand0X3NlY3JldCI6IkVRWDdOS1FZT1BHRFRNUFRDUjc3RUxOSU9XQVpUWVVNIiwiaGFzX2Rpc2FibGVkX25ld3NsZXR0ZXIiOnRydWUsImZpcnN0X25hbWUiOiIiLCJsYXN0X25hbWUiOiIiLCJhY2NvdW50X3R5cGUiOiIiLCJzb2NpYWxfc2VydmljZV9hY2NvdW50IjpbXSwiY29tcGFueSI6IiIsImhhc1Bhc3N3b3JkU2V0Ijp0cnVlLCJwdWJsaWNfa2V5Ijp0cnVlLCJmZWF0dXJlcyI6WyJub3RpZmljYXRpb25zIl0sImludGVyY29tVXNlck5hbWUiOiJbNzcxMDU1NTFFM0E4QTY2MDExRjE2QjFGRTgyQkM1MDRdIGJvYiIsInBlcm1pc3Npb25zIjpbImFkbWluLmhvbWUiLCJhZG1pbi5sb2dpbl9hc191c2VyIl0sImF1dGhUaW1lIjoxNjU4NjY4MjkxMjUxLCJpYXQiOjE2NTg2NjgyOTEsImV4cCI6MTY1OTI3MzA5MX0.2DIcV_c5dBMYVaxrRGSiflGrVfh6F3x1R56kMOZ19Xw'
const userInfo = {
  user: "bob",
  token,
  // await fs.readFileSync('~/.balena/token', 'utf8')
}
pullManifestFromRegistry(image, userInfo, baseInPath)