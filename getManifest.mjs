import axios from 'axios';
import dockerParseImage from 'docker-parse-image';
import os from 'os';
import { fs } from 'zx';
import { inspect } from 'util';

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

// NOTE the double namespace here, why oh why must it be?
function getRegistryUrlWithRepository({ registry, namespace, repository }) {
  return `https://${registry}/${namespace}/${namespace}/${repository}`; 
}


/** getAllBlobs
  /v2/<name>/blobs/<digest>
*/
async function getAllBlobs(registryUrlWithRepository, token, manifest, baseInPath) {
  const options = {
    "method": "GET",
    "headers": {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.docker.image.rootfs.diff.tar.gzip",
      "Accept-Encoding": "gzip",
      "responseType": 'stream',
    },
  }
  try {
    const tgzLayersDigest = await Promise.all(manifest.layers.map(async (layer) => {
      const writer = fs.createWriteStream(`${baseInPath}/${layer.digest.split(':')[1]}`);
      options.url = `${registryUrlWithRepository}/blobs/${layer.digest}`;
      const { data, headers } = await axios(options)
      if ((parseInt(headers['content-length']) === layer.size) 
        && (headers['docker-content-digest'] === layer.digest)) {
          writer.write(data);
          writer.end();
          console.log('\n\n==> getAllBlob layer done writing:', inspect(await layer, true, 2, true))
          return layer;
      } else {
        console.error('\n\n==> getAllBlob layer failed:', inspect(await layer, true, 2, true))
        console.error('==> getAllBlob layer failed response headers', inspect(await headers, true, 2, true))
      }
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
async function getConfigManifest(registryUrlWithRepository, token, digest, baseInPath) {
  const options = {
    "method": "GET",
    url: `${registryUrlWithRepository}/blobs/${digest}`,
    "headers": {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.docker.image.rootfs.diff.tar.gzip",
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
async function getHeadBlob(registryUrlWithRepository, token, digest) {
  const options = {
    "method": "HEAD",
    "url": `${registryUrlWithRepository}/blobs/${digest}`,
    "headers": {
      "Accept": 'application/vnd.docker.distribution.manifest.v2+json',
      "Authorization": `Bearer ${token}`,
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

async function getManifest(registryUrlWithRepository, token, authHeaders,baseInPath) {
  const options = {
    "method": "GET",
    url: `${registryUrlWithRepository}/manifests/latest`,
    withCredentials: true,
    credentials: 'include',
    "headers": {
      "Accept": 'application/vnd.docker.distribution.manifest.v2+json',
      "Authorization": `Bearer ${token}`,
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


async function getAuthHeaders(options) {
  return {
    auth: {
      username: options?.user || 'bob',
      password: options?.password || await fs.readFileSync(`${os.homedir()}/.balena/token`, 'utf8')
    },
  }
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




export const pullManifestFromRegistry = async (image, userInfo, baseInPath) => {
  const authHeaders = getAuthHeaders(userInfo);
  console.log('\n\n==> authHeaders', authHeaders);

  const parsedImage = dockerParseImage(image);
  console.log('\n\n==> parsedImage', parsedImage);
  const registryUrl = getRegistryUrl(parsedImage);
  console.log('\n\n==> registryUrl', registryUrl);
  const registryUrlWithRepository = getRegistryUrlWithRepository(parsedImage);
  console.log('\n\n==> registryUrlWithRepository', registryUrlWithRepository);

  const authResponseForRealm = await getRealmResponse(registryUrl, authHeaders);
  console.log('\n\n==> authResponseForRealm', authResponseForRealm);

  const token = await getToken(parsedImage, authHeaders, authResponseForRealm);
  console.log('\n\n==> token', token);

  const manifest = await getManifest(registryUrlWithRepository, await token, authHeaders, baseInPath);
  console.log('\n\n==> manifest', manifest);
  const configDigest = manifest.config.digest;
  console.log(manifest.config,'==> HERE  manifest manifest.config \n\n', ); 
  const digests = manifest.layers.map(layer => ({digest: layer.digest, digest: layer.size}));

  const contentLength = await getHeadBlob(registryUrlWithRepository, await token, configDigest);
  // console.log(contentLength,'=====> contentLength')

    // We are using this manifest as its V2
  const configManifestV2 = await getConfigManifest(registryUrlWithRepository, await token, configDigest, baseInPath);
  console.log(await configManifestV2.rootfs,'=====> configManifestV2.rootfs')

  const allBlobAlltheTime = await getAllBlobs(registryUrlWithRepository, await token, manifest, baseInPath);
  console.log(await allBlobAlltheTime,'=====> allBlobAlltheTime');

  // console.log( image,'image HERE ==> \n\n');
  return { manifest, digests, configManifestV2 };
}


const image = 'registry2.77105551e3a8a66011f16b1fe82bc504.bob.local/v2/53b00bed7a4c6897db23eb0e4cf620e3'
const baseInPath = `in/images/${image.split("/").reverse()[0]}`
const userInfo = null;

pullManifestFromRegistry(image, userInfo, baseInPath)