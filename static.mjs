#!/usr/bin/env zx
// #! /usr/bin/env node

import crypto from 'crypto'
import path from 'path'
import {inspect} from 'util'
import { makeDirectories, makeFiles } from './utilities.mjs'
import { pullManifestFromRegistry } from './getManifest.mjs'

$.verbose = false

const imageUrl = argv.imageUrl ?? "registry2.balena-cloud.com/v2/a42656089dcef7501aae9dae4687a2c5"
const commitHash = argv.commitHash ?? "sha256:0ae9a712a8c32ac04b91d659a9bc6d4bb2e76453aaf3cfaf036f279262f1f100"

const user = argv.user ?? "bob"
const token = argv.token ?? (await $`cat < ~/.balena/token`)
// const user = argv.user ?? "u_edwin3"
// const token = argv.token ?? (await $`cat < ./api_key`)

// utilities
const generateLinkId = () => crypto.randomBytes(13).toString('hex').toUpperCase()
const generateCacheId = () => crypto.randomBytes(32).toString('hex')

const baseInPath = path.join(__dirname, 'in', 'images', imageUrl.split("/").reverse()[0])
const baseOutPath = path.join(__dirname, 'out', 'docker')

const baseDirectories = [
    {pathStr: baseInPath, mode: '0777'},
    {pathStr: baseOutPath, mode: '0777'},
]
makeDirectories(baseDirectories)

// get the image using skopeo
if (!argv.skipDownload)
  console.log(`=====> getting ${imageUrl}`)
  // await $`skopeo inspect ${`docker://${imageUrl}`} --override-os linux --override-arch amd64 --src-creds ${user}:${token}`
  await $`skopeo copy ${`docker://${imageUrl}`} dir:${path.join(baseInPath)} --override-os linux --override-arch amd64 --src-creds ${user}:${token}`
console.log(`=> got ${imageUrl} archive; processing`)
  
// TODO comment this in if you want to replace scopeo copy to get the registry manifest
// const manifest = await pullManifestFromRegistry(imageUrl, {user, token})
// await fs.writeFileSync(`${path.join(baseInPath)}/manifest.json`, JSON.stringify(manifest, null, 2));

const manifestJson = await fs.readJson(path.join(baseInPath, "manifest.json"))

// get the image hash from manifest
// https://docs.docker.com/engine/reference/commandline/manifest/
// The manifest.json file describes the location of a list of image layers and config file. 
// It can then be used in the same way as an image name in docker pull and docker run commands.

console.log(`==> got ${inspect(manifestJson, true,10,true)} manifest json`)
const imageHash = await manifestJson.config.digest.split(":")[1]
console.log(`==>  ${imageHash} <-imageHash baseInPath`,baseInPath)
// const layerUrl = `${imageUrl}/${imageHash}`
// const imageHashManifest = await pullManifestFromRegistry(layerUrl, {user, token})
// await fs.writeFileSync(`${path.join(baseInPath)}/imageHash`, JSON.stringify(imageHashManifest, null, 2));
// await $`mkdir -p ${path.join(baseInPath, imageHash)}`
// await $`chmod -R 777 ${baseInPath}\${imageHash}`
// get the image json
// Each layer is comprised of a json file (which looks like the config file), 
// a VERSION file with the string 1.0 , and a layer.tar file containing the images files.
// https://blog.knoldus.com/docker-manifest-a-peek-into-images-manifest-json-files/

// list manifest digest from manifest layers
const tgzLayersDigest = await Promise.all(manifestJson.layers.map(async (layer) => {
  const layerInfo = {
    digest: layer.digest.split(":")[1],
    size: layer.size,
  }
  // TODO Get blobs - this has moved to the getManifest.mjs file
  // GET /v2/<name>/blobs/<digest></digest>
  // const layerUrl = `${imageUrl}/blobs/${layerInfo.digest}`
  // const manifest = await pullManifestFromRegistry(layerUrl, {user, token})
  // await fs.writeFileSync(`${path.join(baseInPath)}/layerInfo.digest`, JSON.stringify(manifest, null, 2));

  return layerInfo
}))

console.log(`==>  ${inspect(tgzLayersDigest, true,10,true)}<-tgzLayersDigest`)

console.log(`==>  ${path.join(baseInPath)} path.join(baseInPath)`)
const imageJson = await fs.readJson(path.join(baseInPath, imageHash))
console.log(`==>  ${imageJson} imageJson`)


// rename all files to have .tar.gz
// gunzip to get the tar
// sha256sum to get the digest -> this will gets us the diffId for that layer, here we should check that it match imageJson's diff_ids (and that we have all of them)
// then
// compute each layers chainid from the diffids
// formula is : sha256 of a string composed of the chainid of the parent layer, a space, and the diffid of the layer
// the topmost layer (the first one), has no parent so its chainid = diffid
// also
// keeping the size of the layer handy for future use (not that useful, the actual size of the layer is different)
// genereating a random 26 char for the linkid

const osType = await $`uname -a`
const isLinux = osType.stdout.includes('Linux')

const digests = await Promise.all(
  tgzLayersDigest.map(async ({ digest, size }) => {
    if (!argv.skipDownload) {
      await $`mv ${path.join(baseInPath, digest)} ${path.join(baseInPath, `${digest}.tar.gz`)}`
      await $`gunzip ${path.join(baseInPath, `${digest}.tar.gz`)}`
    }
    const layerDigestRes = isLinux
      ? await $`sha256sum ${path.join(baseInPath, `${digest}.tar`)}`
      : await $`openssl sha256 ${path.join(baseInPath, `${digest}.tar`)}`
    return {
      gzipid: digest,
      cacheid: generateCacheId(),
      // layerid; uese openSSL if on macos (!isLinux) as it's shiped by default
      layerid: isLinux ? layerDigestRes.stdout.split(" ")[0] : layerDigestRes.stdout.split(" ")[1].split("\n")[0],
      size,
      linkid: generateLinkId(),
    }
  })
).then((digests) => {
  const newDigests = []
  for (const key in digests) {
    newDigests.push({
      ...digests[key],
      chainid: key == 0 
        ? digests[key].layerid
        : crypto
          .createHash("sha256")
          .update(`sha256:${newDigests[key - 1].chainid} sha256:${digests[key].layerid}`)
          .digest("hex"),
    })
  }
  return newDigests
})

// prebuild a chain of linkid path to use in overlays2's `lower` files
// Note about shared layers across images :
// If some group of layers are shared across different images, their chainid would be identical
// Therefore we won't duplicate them on disk and reuse the one already there
// It means we also need to use the existing `link` and build `lower` accordingly for all upper layers
// Solution is to : 
// 1. Check for chainid already on disk
// 2. If found get `link` for the corresponding cache (overlay2) and place it in the link chain
// 3. If not found use the generated one (link will be created later using that name)
const linkIdFullChain = digests.map((digest) => {
  if (fs.existsSync(`${baseOutPath}/image/overlay2/layerdb/sha256/${digest.chainid}`)) {
    const cacheid = fs.readFileSync(`${baseOutPath}/image/overlay2/layerdb/sha256/${digest.chainid}/cache-id`, {encoding: 'utf8'})
    const link = fs.readFileSync(`${baseOutPath}/overlay2/${cacheid}/link`, {encoding: 'utf8'})
    console.log(`--------------> found existing link : ${link} for layer ${digest.chainid} with cache ${cacheid}`)
    return `l/${link}`
  }
  return `l/${digest.linkid}`
})

const imageDirectories = [
    {pathStr: `${baseOutPath}/image/overlay2/imagedb/content/sha256`, mode: '0777'},
    {pathStr: `${baseOutPath}/image/overlay2/imagedb/metadata/sha256`, mode: '0777'},
    {pathStr: `${baseOutPath}/overlay2/l`, mode: '0777'},
    {pathStr: `${baseOutPath}/image/overlay2/imagedb/metadata/sha256/${imageHash}`, mode: '0777'},
]
makeDirectories(imageDirectories)
const imageFiles = [
  {
    name: `${baseOutPath}/image/overlay2/imagedb/metadata/sha256/${imageHash}/lastUpdated`, 
    val: new Date().toISOString(), 
    mode: '0644'
  }
]
makeFiles(imageFiles)

// images/overlay2/imagedb
// ./content/sha256 => images json
// ./metadata/sha256/*imageId*/lastUpdated => isoString date
await $`cp ${path.join(baseInPath, imageHash)} ${path.join(baseOutPath, "image", "overlay2", "imagedb", "content", "sha256", imageHash)}`
// await $`mkdir -p ${path.join(baseOutPath, "image", "overlay2", "imagedb", "metadata", "sha256", imageHash)}`
// await $`echo ${new Date().toISOString()} > ${path.join(baseOutPath, "image", "overlay2", "imagedb", "metadata", "sha256", imageHash, "lastUpdated")}`
// 33

// images/overlay2/layerdb/sha256/*chainId*
// ./cache-id => id of corresponding overlay2 -> 32 random alphanum char
// ./diff => layerId
// ./parent => parent chainId
// ./size => size of layer in byte
// ./tar-split.json.gz => we skip this one as it works without. AFAIK It's should only be useful for `pushing` back the image to a registry, which we shouldn't do from a balena preloaded device.

// overlay2/*cacheid* 
// <- FIXME: overlay2 folders should be named with something more appropriate, but I cannot find informations about how they're named
// <- my best guess is a digest of the `diff` folder but i don't know how.
// ./committed => empty file, not sure what its role is
// ./link => linkid (random 24 caps alphanum char) / related to the l symlinks
// ./diff/* => actual content of the layer (gunzip + untar of the layer archive)
// ./work => empty folder

// ./lower => chain of lower layers links path such as : `l/*LOWER1LINK*:l/*LOWER2LINK*:l/...`, if it's the first in the chain it has all lowers, if it's last it has no lower file

// A note on deduplication
// As some layers might be shared across multiple images, their chainid up to a point might be the same.
// In that case we shouldn't duplicate the `cache` folder (overlay2) and shouldn't override the `cache-id` of the layer
// But this poses the problem of the `lower` directory for layers which _exists_ before the duplicated one
// The lower chain shouldn't point to "random" links but to the shared ones
// FIXME: the lower chain is broken atm

// overlay2/l/*linkid* -> symlink pointing to related overlay diff folder linkid has to be the same as content of link file
const writeToFile = (filePath, content, mode) => fs.writeFileSync(filePath, content, { mode })
//44

// https://github.com/moby/moby/blob/master/vendor/github.com/containerd/containerd/rootfs/diff.go
// https://github.com/containerd/containerd/blob/main/diff/diff.go

for (const key in digests) {
  const { layerid, chainid, gzipid, cacheid, size, linkid } = digests[key]
  
  // ============================================================
  //chainId
  const baseOutPathChainId = `${baseOutPath}/image/overlay2/layerdb/sha256/${chainid}`
  
  // if the layer has already been made for another image, just skip it (it will be shared)
  if (fs.existsSync(baseOutPathChainId)) continue

  const digestChainIdDirectories = [
    {pathStr: baseOutPathChainId, mode: '0777'},
  ]
  makeDirectories(digestChainIdDirectories)
  const digestChainIdFiles = [
    {name: `${baseOutPathChainId}/diff`, val: `sha256:${layerid}`, mode: '0755'},
    {name: `${baseOutPathChainId}/cache-id`, val: cacheid, mode: '0755'},
    {name: `${baseOutPathChainId}/size`, val: `${size}`, mode: '0755'}, //size needs to be converted to string
  ]
  if (key > 0) digestChainIdFiles.push(
    {name: `${baseOutPathChainId}/parent`, val: `sha256:${digests[key - 1].chainid}`, mode: '0644'}
  )
  makeFiles(digestChainIdFiles)
  
  // ============================================================
  //cacheId
  const baseOutPathCacheId = `${baseOutPath}/overlay2/${cacheid}`
  const digestCacheIdDirectories = [
    {pathStr: baseOutPathCacheId, mode: '0777'},
    {pathStr: `${baseOutPathCacheId}/work`, mode: '0777'},
    {pathStr: `${baseOutPathCacheId}/diff`, mode: '0777'},
  ]
  makeDirectories(digestCacheIdDirectories)
  const digestCacheIdFiles = [
    {name: `${baseOutPathCacheId}/link`, val: linkid, mode: '0644'},
    {name: `${baseOutPathCacheId}/committed`, val: '', mode: '0600'},
  ]
  if(key > 0) digestCacheIdFiles.push(
    { name: `${baseOutPathCacheId}/lower`, val: linkIdFullChain.slice(0, key).join(":"), mode: '0644' }
  )
  makeFiles(digestCacheIdFiles)

  await $`tar -zxf ${path.join(baseInPath, `${gzipid}.tar`)} -C ${path.join(baseOutPath, "overlay2", cacheid, "diff")}`
  await $`ln -s ${path.join('..', cacheid, "diff")} ${path.join(baseOutPath, "overlay2", "l", linkid)}`
}

// ============================================================
// create the repositories.json snippet for the image
const repositories = {
  [imageUrl]: {
    [`${imageUrl}:latest`]: `sha256:${imageHash}`,
    [`${imageUrl}@${commitHash}`]: `sha256:${imageHash}`, // the commit hash is an information we can grab from apps.json
  },
}

// ============================================================
// $`echo ${JSON.stringify(repositories)} > ${path.join(baseOutPath, '..', `${imageHash}.repositories.json`)}`
makeFiles([{
  name: path.join(baseOutPath, '..', `${imageHash}.repositories.json`),
  val: JSON.stringify(repositories),
  mode: '0644'
}])
