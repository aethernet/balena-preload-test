#!/usr/bin/env zx

// parameters, mount point of resin-data partition in the host system. Can be set with an argument "--resin-data"
const mountPoint = argv["resin-data"] ?? path.join("/", "Volumes", "resin-data")
const mountBoot = argv["resin-boot"] ?? path.join("/", "Volumes", "resin-boot")

// constant
const basePath = path.join(__dirname, "out", "docker")
const imagePath = path.join(basePath, "image", "overlay2")

// copy all files to the docker folder unless `--skipLayers` (useful when you need to only update config or repos)
if (!argv.skipLayers) {
  await $`cp -Rf ${basePath}/* ${path.join(mountPoint, "docker")}`
}

// merge each _image_.reposotories.json with base repositories.json
const repositories = await fs.readJson(path.join(mountPoint, "docker", "image", "overlay2", "repositories.json"))
const potentialRepoSources = await fs.readdir(path.join(__dirname, "out"))
const repoSources = potentialRepoSources.filter((source) => source.split(".").reverse()[1] === "repositories")

for (const repo of repoSources) {
  const injectableRepositories = await fs.readJson(path.join(__dirname, "out", repo))
  for (const repository in injectableRepositories) {
    repositories.Repositories[repository] = injectableRepositories[repository]
  }
}

await $`echo ${JSON.stringify(repositories)} > ${path.join(mountPoint, "docker", "image", "overlay2", "repositories.json")}`

// copy apps.json
await $`cp -Rf ${__dirname}/out/apps.json ${path.join(mountPoint)}`

// copy static_network config
if (mountBoot) {
  const staticIpExist = fs.existsSync(path.join(__dirname, "static_ip"))
  const configExist = fs.existsSync(path.join(__dirname, "in", "config.json"))
  if(staticIpExist) await $`cp ${path.join(__dirname, "static_ip")} ${path.join(mountBoot, "system-connections", "static_ip")}`
  if(configExist) await $`cp ${path.join(__dirname, "in", "config.json")} ${path.join(mountBoot, "config.json")}`
}
