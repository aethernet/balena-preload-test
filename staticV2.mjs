#!/usr/bin/env zx

import crypto from "crypto"
import path from "path"

const imageUrl = argv.imageUrl ?? "registry2.balena-cloud.com/v2/a42656089dcef7501aae9dae4687a2c5"
const commitHash = argv.commitHash ?? "sha256:0ae9a712a8c32ac04b91d659a9bc6d4bb2e76453aaf3cfaf036f279262f1f100"

// const user = argv.user ?? "u_edwin3"
// const token = argv.token ?? (await $`cat < ./api_key`)
const user = await $`(balena whoami | grep USERNAME | cut -c11-)` ?? "u_zoobot"
const apiKey = await $`(balena api-key generate "${user}")`
const token = await apiKey.stdout.split("\n\n")[1];

// utilities
// FIXME: there's no mechanism to prevent collision
// const generateLinkId = () => [...Array(26).keys()].map(() => "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 34)]).join("")
// const generateCacheId = () => [...Array(64).keys()].map(() => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 34)]).join("")

// CON: uses extra library, doesn't really need to be cryptographically secure 
// PRO: works, more random/likely less collisions
// Questions: Not sure if this is slower
const generateLinkId = () => crypto.randomBytes(13).toString('hex').toUpperCase();
const generateCacheId = () => crypto.randomBytes(32).toString('hex');

// const baseOutPath = path.join(__dirname, "out", "docker")

const baseOutPath = '/tmp/out/docker';
await $`mkdir -p ${baseOutPath}`
const baseInPath = path.join(__dirname, "in", "images", imageUrl.split("/").reverse()[0])
await $`mkdir ${baseInPath}`

// get the image using skopeo
if (!argv.skipDownload)
  // await $`skopeo inspect ${`docker://${imageUrl}`} --override-os linux --override-arch amd64 --src-creds ${user}:${token}`
  await $`skopeo copy ${`docker://${imageUrl}`} dir:${path.join(baseInPath)} --override-os linux --override-arch amd64 --src-creds ${user}:${token}`

// get the image hash from manifest
// https://docs.docker.com/engine/reference/commandline/manifest/
// The manifest.json file describes the location of a list of image layers and config file. 
// It can then be used in the same way as an image name in docker pull and docker run commands.
const manifestJson = await fs.readJson(path.join(baseInPath, "manifest.json"))
const imageHash = manifestJson.config.digest.split(":")[1]

// get the image json
// Each layer is comprised of a json file (which looks like the config file), 
// a VERSION file with the string 1.0 , and a layer.tar file containing the images files.
// https://blog.knoldus.com/docker-manifest-a-peek-into-images-manifest-json-files/
const imageJson = await fs.readJson(path.join(baseInPath, imageHash))

// list manifest digest from manifest layers
const tgzLayersDigest = manifestJson.layers.map((layer) => ({
  digest: layer.digest.split(":")[1],
  size: layer.size,
}))
// TO HERE
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

// NEXT
const osType = await $`uname -a`;
const isLinux = osType.stdout.includes('Linux');
console.log('\n\n\nosType.stdout:\n\n\n', osType.stdout)

const digests = await Promise.all(
  tgzLayersDigest.map(async ({ digest, size }) => {
    if (!argv.skipDownload) {
      await $`mv ${path.join(baseInPath, digest)} ${path.join(baseInPath, `${digest}.tar.gz`)}`
      await $`gunzip ${path.join(baseInPath, `${digest}.tar.gz`)}`
    }
    const layerDigestRes = isLinux
      ? await $`sha256sum ${path.join(baseInPath, `${digest}.tar`)}`
      : await $`openssl sha256 ${path.join(baseInPath, `${digest}.tar`)}`
    console.log(layerDigestRes, '\n\n\nlayerDigestRes\n\n\n');
    const digests = {
      gzipid: digest,
      cacheid: generateCacheId(),
      layerid: layerDigestRes.stdout.split(" ")[0],
      size,
      linkid: generateLinkId(),
    }
    console.log(digests, '\n\n\ndigests\n\n\n');
    return digests;
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

console.log('\n\n\ndigests:\n\n\n', digests)
// NEXT

// 33
// prebuild a chain of linkid path to use in overlays2's `lower` files
const linkIdFullChain = digests.map((digest) => `l/${digest.linkid}`)
console.log('\n\n\nlinkIdFullChain:\n\n\n', linkIdFullChain)
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
// 33

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

//44
for (const key in digests) {
  const { layerid, chainid, gzipid, cacheid, size, linkid } = digests[key]
  console.log('\n\n\nkey:\n\n\n', key)
  console.log('\n\n\nlayerid, chainid, gzipid, cacheid, size, linkid:\n\n\n', layerid, chainid, gzipid, cacheid, size, linkid,'\n\n\n')
  // SHA256(/Users/rose/Documents/balena-io/preloadimg-test/edwin/balena-preload-test/in/images/7fbc6597d8fbf40ea7e1fbce32e7c51c/c1bd162799dc9188f2cdcaa59a3cb581e21509360f4c9d3e4f6bf34e61d755c2.tar)= 




  // const layerIDNoPath = layerid.split(".")[0].split("/").pop()
  // console.log('\n\n\nlayerIDNoPath:\n\n\n', layerIDNoPath,'\n\n\n')
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
  await $`tar -zxf ${path.join(baseInPath, `${gzipid}.tar`)} -C ${path.join(baseOutPath, "overlay2", cacheid, "diff")}`
  await $`chmod 755 ${path.join(baseOutPath, "overlay2", cacheid, "diff")}`
  if(key > 0) {
    await $`echo ${linkIdFullChain.slice(0, key).join(":")} > ${path.join(baseOutPath, "overlay2", cacheid, "lower")}`
    await $`chmod 644 ${path.join(baseOutPath, "overlay2", cacheid, "lower")}`
  }
  
  await $`ln -s ${path.join('..', cacheid, "diff")} ${path.join(baseOutPath, "overlay2", "l", linkid)}`
}
//44

// //55
// // create the repositories.json snippet for the image
const repositories = {
  [imageUrl]: {
    [`${imageUrl}:latest`]: `sha256:${imageHash}`,
    [`${imageUrl}@${commitHash}`]: `sha256:${imageHash}`, // the commit hash is an information we can grab from apps.json
  },
}

$`echo ${JSON.stringify(repositories)} > ${path.join(baseOutPath, '..', `${imageHash}.repositories.json`)}`
// //55