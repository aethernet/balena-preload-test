import https from 'https';
import axios from 'axios';
// import fetch from 'fetch';
import dockerParseImage from 'docker-parse-image';
import { fs } from 'zx';
import { inspect } from 'util';
import * as stream from 'stream';
import { promisify } from 'util';

const finished = promisify(stream.finished);
import path from 'path';
// import jwkToPem from 'jwk-to-pem';
// import mod_jws from 'jws';
// import fetch from 'node-fetch';

/*
  This should authenticate to the registry api, get a token,
  Get the distribution manifest, the manifest from the registry and get the blobs.

  How to run:
  npm i
  node getManifest.mjs

  You can also replace scopeo with this.
*/


/* 
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
*/ 

function getRegistryUrl(image) {
  const parsedImage = dockerParseImage(image);
  if (parsedImage.registry) return `https://${parsedImage.registry}/v2/`;
  return 'https://registry2.balena-cloud.com/v2/';
}

function createManifestOptions(token) {
  return {
      "headers": {
          "Accept": "application/vnd.docker.distribution.manifest.v2+json",
          "Authorization": `Bearer ${token}`
      }}}


/* TODO: iterate through all blobs, compare sizes, and download the ones that are missing
** /v2/<name>/blobs/<digest>
** https://stackoverflow.com/questions/71534322/http-stream-using-axios-node-js
*/
async function getAllBlobs(image, token, manifest, baseInPath) {
  
  const options = {
    "method": "GET",
    "headers": {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.docker.image.rootfs.diff.tar.gzip",
      "Accept-Encoding": "gzip",
      "responseType": 'stream',
    },
  }
   const headCache = {};
   const host = 'https://registry2.77105551e3a8a66011f16b1fe82bc504.bob.local/v2/v2/53b00bed7a4c6897db23eb0e4cf620e3'
    const tgzLayersDigest = await Promise.all(manifest.layers.map(async (layer) => {

      console.log('\n\n==> getAllBlob response layer', inspect(await layer, true, 2, true))
      const writer = fs.createWriteStream(`${baseInPath}/${layer.digest.split(':')[1]}`);
      options.url = `${host}/blobs/${layer.digest}`;
      const { data, headers } = await axios(options)
      // if (!(data instanceof stream)) console.log('Not stream');
      console.log('\n\n==> getAllBlob response layer', inspect(await layer, true, 2, true))
      console.log('\n\n==> getAllBlob response headers', inspect(await headers, true, 2, true))
      // console.log('\n\n==> getAllBlob response data', inspect(await data, true, 10, true))
      if ((headers['content-length'] === layer.size) 
        && (headers['docker-content-digest'] === layer.digest)) {
          writer.write(data);
          writer.end();
        }

      // if (await headers.status === 404) {
      //   console.error('==> blob not found', layer.digest);
      //   headCache[layer.digest] = 'failed';
      //   return headCache
      // }
      headCache[layer.digest] = 'success';
      return headCache
    }))
}

// TODO Finish getBlobs
// GET /v2/<name>/blobs/<digest></digest>
// This should pull the blob from the registry after checking head.
async function getBlobs(image, token, configDigest, contentLength,baseInPath) {
  const options = {
    "method": "GET",
    "headers": {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.docker.image.rootfs.diff.tar.gzip",
      // "Content-Type": 'application/vnd.docker.image.rootfs.diff.tar.gzip',
      // "Accept-Encoding": "br;q=1.0, gzip;q=0.8, *;q=0.1",
      // "Accept-Encoding": "gzip, deflate, br",
      // "content-length": contentLength,
    },
  }
  console.log(image, '===> getBlob image');
  const host = 'https://registry2.77105551e3a8a66011f16b1fe82bc504.bob.local/v2/v2/53b00bed7a4c6897db23eb0e4cf620e3'
  const url = `${ host}/blobs/${configDigest}`;
  console.log(url, '===> getBlob url')
  try {
    const res = await axios.get(url, options);
    console.log('==> getBlob res.data', await res.data)
    fs.writeFileSync(`${baseInPath}/${configDigest}`, JSON.stringify(await res.data, null, 2));
    console.log('==> getBlob res.headers', await res.headers)

    
  } catch (error) {
    console.error('==> getBlob error', error)
    // throw new Error(`\n\n==> getBlob => ERROR: ${error}`);
  }
}

function makeBlobUrl(image, digest) {
  // registry spec https://docs.docker.com/registry/spec/api/
  const parsedImage = dockerParseImage(image);
  const baseRegistry = getRegistryUrl(image);
  const {repository, namespace} = parsedImage;
  const url = `${baseRegistry}${repository}/blobs/${digest}`;
  return url;
}


/*
  GET /v2/<name>/blobs/<digest>
  WORKS
*/
async function getHeadBlob(image, token, manifest,configDigest,fsLayers) {
  const options = {
    "method": "HEAD",
    "headers": {
      "Accept": 'application/vnd.docker.distribution.manifest.v2+json',
      "Authorization": `Bearer ${token}`,
    },
  }
  console.log(image, '===> getHeadBlob image');
  const host = 'https://registry2.77105551e3a8a66011f16b1fe82bc504.bob.local/v2/v2/53b00bed7a4c6897db23eb0e4cf620e3'
  const url = `${ host}/blobs/${configDigest}`;
  console.log(url, '===> getHeadBlob url')
  try {
    const res = await axios.head(url, options);
    console.log('==> getHeadBlob res.data', await res.data)
    console.log('==> getHeadBlob res.headers', await res.headers)
    if (res.headers['content-length'] && res.headers['docker-content-digest'] === configDigest) {
      console.log('==> getHeadBlob res.headers["content-length"]', res.headers['content-length'])
      console.log('==> getHeadBlob res.headers["docker-content-digest"]', res.headers['docker-content-digest'])
      console.log('==> getHeadBlob configDigest', configDigest)
      return res.headers['content-length'];
    }
    return 0;
    // const headCache = {};
    // const tgzLayersDigest = await Promise.all(manifest.layers.map(async (layer) => {
    // // const tgzLayersDigest = await Promise.all(config.fsLayers.map(async (layer) => {
    //   // const blob = layer.blobSum.split(":")[1];
    //   // const blob = layer.digest.split(":")[1];
    //   const blob = layer.blobSum;
    //   const url = makeBlobUrl(image,  blob);
    //   const res = await axios.head(url, options);

    //   console.log('\n\n==> getHeadBlob res headers', inspect(await res.headers, true, 10, true))
    //   // console.log('=\n\n=> getHeadBlob res data', inspect(await res.data, true, 10, true))
    //   if (await res.status === 404) {
    //     console.error('==> blob not found', layerInfo.digest);
    //     headCache[layerInfo.digest] = 'failed';
    //     return
    //   }


    //   // Response Should get these from server after HEAD request
    //   // "content-length": 171,
    //   // "docker-content-digest": digest,
    //   if (layerInfo.digest === res.headers['docker-content-digest']) {
    //     headCache[layerInfo.digest] = 'success';
    //     return layerInfo;
    //   }
    //   headCache[layerInfo.digest] = 'fail';
    //   return layerInfo
    // }))

  } catch (error) {
    console.error('==> getHeadBlob error', error)
    // throw new Error(`\n\n==> getHeadBlob => ERROR: ${error}`);
  }
}

// WORKS
// passing in Tag (manifest.config.digest) will get the config.digest.
// https://{registry}/v2/{imageName}/manifests/{tag}
async function getConfig(image, token, manifest, baseInPath) {
  const options = createManifestOptions(token);
  options.headers.Accept = "application/vnd.docker.container.image.v2+json";
  const url = makeManifestUrl(image, manifest.config.digest);
  const configDigestName = manifest.config.digest.split(":")[1];
  try {
    const res = await axios.get(url, options);
    fs.writeFileSync(`${baseInPath}/${configDigestName}`, JSON.stringify(await res.data, null, 2));
    console.log(await res.headers, '==> getConfig res.headers' )
    console.log(await res.data, '==> getConfig res.data')
    console.log(await inspect(res.data.signatures[0].header), '==> getConfig res.data.signatures[0].header')
    // const verified = await _verifyJws(signatures[0].header.jws)
    // console.log(verified, '==> getConfig verified \n\n')
    return await res.data;
  } catch (error) {
    throw new Error(`\n\n==> getConfig => ERROR: ${error}`);
  }
}

/**
 * GET /v2/<name>/manifests/<reference>
 * Host: <registry host>
 * Authorization: <scheme> <token>
 */
function makeManifestUrl(image) {
  // registry spec https://docs.docker.com/registry/spec/api/
  const baseRegistry = getRegistryUrl(image);
  const parsedImage = dockerParseImage(image);
  const {repository, registry, tag, namespace} = parsedImage;
  const manifestUrl = `${baseRegistry}${namespace || ''}/${repository}/manifests/${tag || 'latest'}`;
  return manifestUrl;
}

async function getManifest(image, token, authHeaders,baseInPath) {
  console.log(token, '==> getManifest token');
  const options = {
    "method": "GET",
    withCredentials: true,
    credentials: 'include',
    "headers": {
      "Accept": 'application/vnd.docker.distribution.manifest.v2+json',
      "Authorization": `Bearer ${token}`,
    },
  };
  console.log(options, '==> getManifest optionsManifest');
  // const url = makeManifestUrl(image);
  const host = 'https://registry2.77105551e3a8a66011f16b1fe82bc504.bob.local/v2/v2/53b00bed7a4c6897db23eb0e4cf620e3'
  const url = `${ host}/manifests/latest`;
  console.log(url, '==> getManifest url');
  try {
    const res = await axios.get(url, options);
    const data = await res.data;
    console.log(inspect(await data,true,10,true), '==> getManifest res');
    const digest = res.headers["docker-content-digest"];
    console.log(digest, '==> getManifest digest');
    console.log(inspect(baseInPath,true,10,true), '==> getManifest baseInPath');
    fs.writeFileSync(`${baseInPath}/manifest.json`, JSON.stringify(await data, null, 2));
    return { ...data, digest };
  } catch (error) {
    console.error(inspect(error,true,10,true), '==> getManifest error');
    // throw new Error(`==> NOPE did not get registry manifest data. ERROR: ${error}`);
  }
}

const  getToken = async (image, options, authResponse, tag) => {
  try {
    const parsedImage = dockerParseImage(image);
    const tokenOptions = {
      method: 'GET',
      params: {
        service: authResponse.service,
        scope: `repository:${parsedImage.namespace 
          ? `${parsedImage.namespace}/` 
          : 'library/'}${parsedImage.repository}:${tag || 'pull'}`,
      },
      ...options,
    };
    console.log('\n\n\n ==> getToken tokenOptions', inspect(tokenOptions, true, 10, true))
    const tokenResponse = await axios.get(authResponse.realm, tokenOptions);
    if (!tokenResponse.data.token) throw new Error("token registry fail.");
    console.log(typeof tokenResponse.data.token,'==> getToken tokenResponse.data.token');
    return await tokenResponse.data.token;
  } catch (error) {
    console.log(error);
    throw new Error('Failed to get authentication token from registry.');
  }
}

// async function blob(name, digest) {
// 	const { headers } = await request('HEAD', `/v2/${name}/blobs/${digest}`, `repository:${name}:pull`);
// 	return {
// 		dockerContentDigest: headers.get('Docker-Content-Digest'),
// 		contentLength: parseInt(headers.get('Content-Length'), 10),
// 	};
// }

// async function configBlob(name, digest) {
// 	return request('GET', `/v2/${name}/blobs/${digest}`, `repository:${name}:pull`);
// }

async function getRealmResponse(image, options) {
  // parse auth response for the realm and service params provided by registry
  let realmOptions = { 
    method: 'GET',
    validateStatus: status => status === 401,
    ...options, 
  };
  const url = getRegistryUrl(image)
  console.log(url, '==> getRealmUrl url\n\n\n ')
  try {
    const res = await axios.head(url, realmOptions);
    if (res.headers['www-authenticate'] === undefined) {
      throw new Error('unsupported scheme');
    }
    // Looking for this
    // `Bearer realm="https://api.balena-cloud.com/auth/v1/token"
    // ,service="registry2.balena-cloud.com.bob.local"`
    const authHeader = res.headers['www-authenticate'].split(' ')[1].split(',');
    const authResponse =  { 
      realm: authHeader[0].split('=')[1].replace(/\"/g, ''),
      service: authHeader[1].split('=')[1].replace(/\"/g, '')
    };
    console.log('\n\n==> authResponse', authResponse);
    return authResponse;
  } catch (error) {
    throw new Error(`www-authenticate Bearer realm/service missing. ERROR: ${error}`);
  }
}

function getAuthHeaders(options) {
  return {
    auth: {
        username: options?.user,
        password: options?.password
    },
  }

  // TODO - add cert support
  // # cert_manager=$(DOCKER_HOST=${uuid}.local docker ps \
  //   #   --filter "name=cert-manager" \
  //   #   --format "{{.ID}}")
  //   # echo $cert_manager
    
  //   # DOCKER_HOST=${uuid}.local docker cp ${cert_manager}:/certs/private/ca-bundle.${balena_device_uuid}.${tld}.pem balena/
  //   # echo $DOCKER_HOST
    
  //   export NODE_EXTRA_CA_CERTS="/Users/rose/Documents/balena-io/balena-cloud/balena/ca-bundle.${balena_device_uuid}.${tld}.pem"
  //   echo $NODE_EXTRA_CA_CERTS
    
  //   # * ⚠️ add CA root certificates and mark trusted (e.g. macOS):
  //   sudo security add-trusted-cert -d -r trustAsRoot -k /Library/Keychains/System.keychain ${NODE_EXTRA_CA_CERTS}
    
}


export const pullManifestFromRegistry = async (image, userInfo, baseInPath) => {

  
  const authHeaders = getAuthHeaders(userInfo);
  console.log('\n\n==> authHeaders', authHeaders);
  const authResponseForRealm = await getRealmResponse(image, authHeaders);
  console.log('\n\n==> authResponseForRealm', authResponseForRealm);
  const token = await getToken(image, authHeaders, authResponseForRealm);
  console.log('\n\n==> token', token);
  console.log('\n\n==> HERE  manifest' ); 
  const manifest = await getManifest(image, await token, authHeaders, baseInPath);
  
  console.log(manifest,'==> HERE  manifest manifest \n\n', ); 
  const configDigest = manifest.config.digest;
  console.log(manifest.config,'==> HERE  manifest manifest.config \n\n', ); 
  const digests = manifest.layers.map(layer => layer.digest);
  // console.log(digests, '==> HERE  manifest digests\n\n'); 

  const config = await getConfig(image, await token, manifest, baseInPath);
  const fsLayers = config.fsLayers.map(fslayer => fslayer.blobSum);
  // console.log(inspect(fsLayers,true,10,true), '==> config fsLayers \n\n'); 
  const contentLength = await getHeadBlob(image, await token, manifest, configDigest, fsLayers);
  console.log(contentLength,'=====> contentLength')
  const layers = await getBlobs(image, await token, configDigest, contentLength, baseInPath);
  console.log(layers,'=====> layers')
  const allBlobAlltheTime = await getAllBlobs(image, await token, manifest, baseInPath);
  console.log(allBlobAlltheTime,'=====> allBlobAlltheTime');
  console.log( image,'image HERE ==> \n\n');
  return manifest;
}

const image = 'registry2.77105551e3a8a66011f16b1fe82bc504.bob.local/v2/53b00bed7a4c6897db23eb0e4cf620e3'
// const baseInPath = './test'
const baseInPath = `in/images/${image.split("/").reverse()[0]}`
// const baseOutPath = path.join(__dirname, 'out', 'docker')
// commitHash = sha256:ab662eecdb30b71c7658e8c7d40eca4ae4bcde9eac117ed0022fc522da23a86e
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJib2IiLCJlbWFpbCI6ImJvYkBiYWxlbmEubG9jYWwiLCJjcmVhdGVkX2F0IjoiMjAyMi0wNi0wMlQyMjozMTo0MC41ODFaIiwiand0X3NlY3JldCI6IkVRWDdOS1FZT1BHRFRNUFRDUjc3RUxOSU9XQVpUWVVNIiwiaGFzX2Rpc2FibGVkX25ld3NsZXR0ZXIiOnRydWUsImZpcnN0X25hbWUiOiIiLCJsYXN0X25hbWUiOiIiLCJhY2NvdW50X3R5cGUiOiIiLCJzb2NpYWxfc2VydmljZV9hY2NvdW50IjpbXSwiY29tcGFueSI6IiIsImhhc1Bhc3N3b3JkU2V0Ijp0cnVlLCJwdWJsaWNfa2V5Ijp0cnVlLCJmZWF0dXJlcyI6WyJub3RpZmljYXRpb25zIl0sImludGVyY29tVXNlck5hbWUiOiJbNzcxMDU1NTFFM0E4QTY2MDExRjE2QjFGRTgyQkM1MDRdIGJvYiIsInBlcm1pc3Npb25zIjpbImFkbWluLmhvbWUiLCJhZG1pbi5sb2dpbl9hc191c2VyIl0sImF1dGhUaW1lIjoxNjU4NjY4MjkxMjUxLCJpYXQiOjE2NTg2NjgyOTEsImV4cCI6MTY1OTI3MzA5MX0.2DIcV_c5dBMYVaxrRGSiflGrVfh6F3x1R56kMOZ19Xw'
const userInfo = {
  user: "bob",
  token,
  // await fs.readFileSync('~/.balena/token', 'utf8')
}

pullManifestFromRegistry(image, userInfo, baseInPath)