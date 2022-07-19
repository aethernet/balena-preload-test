#!/usr/bin/env zx

import crypto from "crypto"
import path from "path"

const imageUrl = argv.imageUrl ?? "registry2.balena-cloud.com/v2/a42656089dcef7501aae9dae4687a2c5"
const commitHash = argv.commitHash ?? "sha256:0ae9a712a8c32ac04b91d659a9bc6d4bb2e76453aaf3cfaf036f279262f1f100"

const user = argv.user ?? "u_edwin3"
const token = argv.token ?? (await $`cat < ./api_key`)

// utilities
// FIXME: there's no mechanism to prevent collision
const generateLinkId = () => [...Array(26).keys()].map(() => "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 34)]).join("")
const generateCacheId = () => [...Array(64).keys()].map(() => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 34)]).join("")

const baseOutPath = path.join(__dirname, "out", "docker")
const baseInPath = path.join(__dirname, "in", "images", imageUrl.split("/").reverse()[0])

await $`mkdir ${baseInPath}`

// get the image using skopeo
if (!argv.skipDownload)
  await $`skopeo copy ${`docker://${imageUrl}`} dir:${path.join(baseInPath)} --override-os linux --override-arch amd64 --src-creds ${user}:${token}`

// get the image hash from manifest
const manifestJson = await fs.readJson(path.join(baseInPath, "manifest.json"))

const imageHash = manifestJson.config.digest.split(":")[1]

// get the image json
const imageJson = await fs.readJson(path.join(baseInPath, imageHash))

// list manifest digest from manifest layers
const tgzLayersDigest = manifestJson.layers.map((layer) => ({
  digest: layer.digest.split(":")[1],
  size: layer.size,
}))

// rename all files to have .tar.gz
// gunzip to get the tar
// sha256sum to get the digest
// then
// compute each layers chainid from the diffids
// formula is : sha256 of a string composed of the chainid of the parent layer, a space, and the diffid of the layer
// the topmost layer (the first one), has no parent so its chainid = its diffid
// also
// keeping the size of the layer handy for future use
// genereating a random 26 char for the linkid

const digests = await Promise.all(
  tgzLayersDigest.map(async ({ digest, size }) => {
    if (!argv.skipDownload) {
      await $`mv ${path.join(baseInPath, digest)} ${path.join(baseInPath, `${digest}.tar.gz`)}`
      await $`gunzip ${path.join(baseInPath, `${digest}.tar.gz`)}`
    }
    const layerDigestRes = await $`sha256sum ${path.join(baseInPath, `${digest}.tar`)}`
    return {
      gzipid: digest,
      cacheid: generateCacheId(),
      layerid: layerDigestRes.stdout.split(" ")[0],
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
const linkIdFullChain = digests.map((digest) => `l/${digest.linkid}`)

// create folders tree
await $`mkdir -p ${path.join(baseOutPath, "image", "overlay2", "imagedb", "content", "sha256")}`
await $`mkdir -p ${path.join(baseOutPath, "image", "overlay2", "imagedb", "metadata", "sha256")}`
await $`mkdir -p ${path.join(baseOutPath, "image", "overlay2", "layerdb", "sha256")}`
await $`mkdir -p ${path.join(baseOutPath, "overlay2", "l")}`

await $`chmod 700 ${path.join(baseOutPath, "image", "overlay2", "imagedb", "content", "sha256")}`
await $`chmod 700 ${path.join(baseOutPath, "image", "overlay2", "imagedb", "metadata", "sha256")}`
await $`chmod 700 ${path.join(baseOutPath, "image", "overlay2", "layerdb", "sha256")}`
await $`chmod 700 ${path.join(baseOutPath, "overlay2", "l")}`

// images/overlay2/imagedb
// ./content/sha256 => images json
// ./metadata/sha256/*imageId*/lastUpdated => isoString date
await $`cp ${path.join(baseInPath, imageHash)} ${path.join(baseOutPath, "image", "overlay2", "imagedb", "content", "sha256", imageHash)}`
await $`mkdir -p ${path.join(baseOutPath, "image", "overlay2", "imagedb", "metadata", "sha256", imageHash)}`
await $`echo ${new Date().toISOString()} > ${path.join(baseOutPath, "image", "overlay2", "imagedb", "metadata", "sha256", imageHash, "lastUpdated")}`

// images/overlay2/layerdb/sha256/*chainId*
// ./cache-id => id of corresponding overlay2 -> 32 random alphanum char
// ./diff => layerId
// ./parent => parent chainId
// ./size => size of layer in byte
// ./tar-split.json.gz => ? not sure this one is mandatory; as it's purpose seems related to push/pull functionalities let's try without

// overlay2/*cacheid* 
// <- FIXME: overlay2 folders should be named with something more appropriate, but I cannot find informations about how they're named
// <- my best guess is a digest of the `diff` folder but i don't know how.
// ./commited => empty file, not sure what its role is
// ./link => linkid (random 24 caps alphanum char) / related to the l symlinks
// ./diff/* => actual content of the layer (gunzip + untar of the layer archive)
// ./work => empty folder

// ./lower => chain of lower layers links path such as : `l/*LOWER1LINK*:l/*LOWER2LINK*:l/...`, if it's the first in the chain it has all lowers, if it's last it has no lower file

// overlay2/l/*linkid* -> symlink pointing to related overlay diff folder; linkid has to be the same as content of link file

for (const key in digests) {
  const { layerid, chainid, gzipid, cacheid, size, linkid } = digests[key]
  await $`mkdir -p ${path.join(baseOutPath, "image", "overlay2", "layerdb", "sha256", chainid)}`
  await $`echo ${cacheid} > ${path.join(baseOutPath, "image", "overlay2", "layerdb", "sha256", chainid, "cache-id")}`
  await $`echo ${`sha256:${layerid}`} > ${path.join(baseOutPath, "image", "overlay2", "layerdb", "sha256", chainid, "diff")}`
  await $`echo ${size} > ${path.join(baseOutPath, "image", "overlay2", "layerdb", "sha256", chainid, "size")}`
  if (key > 0) {
    await $`echo ${`sha256:${digests[key - 1].chainid}`} > ${path.join(baseOutPath, "image", "overlay2", "layerdb", "sha256", chainid, "parent")}`
  }
  
  await $`chmod -R 744 ${path.join(baseOutPath, "image", "overlay2", "layerdb", "sha256", chainid)}`
  await $`chmod 700 ${path.join(baseOutPath, "image", "overlay2", "layerdb", "sha256", chainid)}`

  await $`mkdir -p ${path.join(baseOutPath, "overlay2", cacheid, "work")}`
  await $`chmod 700 ${path.join(baseOutPath, "overlay2", cacheid)}`
  await $`touch ${path.join(baseOutPath, "overlay2", cacheid, "commited")}`
  await $`chmod 600 ${path.join(baseOutPath, "overlay2", cacheid, "commited")}`
  await $`echo ${linkid} > ${path.join(baseOutPath, "overlay2", cacheid, "link")}`
  await $`chmod 644 ${path.join(baseOutPath, "overlay2", cacheid, "link")}`
  await $`mkdir -p ${path.join(baseOutPath, "overlay2", cacheid, "diff")}`
  await $`tar -xf ${path.join(baseInPath, `${gzipid}.tar`)} -C ${path.join(baseOutPath, "overlay2", cacheid, "diff")}`
  await $`chmod 755 ${path.join(baseOutPath, "overlay2", cacheid, "diff")}`
  if(key > 0) {
    await $`echo ${linkIdFullChain.slice(0, key).join(":")} > ${path.join(baseOutPath, "overlay2", cacheid, "lower")}`
    await $`chmod 644 ${path.join(baseOutPath, "overlay2", cacheid, "lower")}`
  }
  
  await $`ln -s ${path.join('..', cacheid, "diff")} ${path.join(baseOutPath, "overlay2", "l", linkid)}`
}

// create the repositories.json snippet for the image
const repositories = {
  [imageUrl]: {
    [`${imageUrl}:latest`]: `sha256:${imageHash}`,
    [`${imageUrl}@${commitHash}`]: `sha256:${imageHash}`, // the commit hash is an information we can grab from apps.json
  },
}

$`echo ${JSON.stringify(repositories)} > ${path.join(baseOutPath, '..', `${imageHash}.repositories.json`)}`