#!/usr/bin/env zx

// parameters, mount point of resin-data partition in the host system. Can be set with an argument "--resin-data"
const mountPoint = argv["resin-data"] ?? path.join("/", "Volumes", "resin-data")

// constant
const basePath = path.join(__dirname, "out", "docker")
const imagePath = path.join(basePath, "image", "overlay2")

// extract `*.repositories.json` from `out.tar`
// TODO : this is done on a mac (bsdtar), on linux it would probably be `--wildcards` instead of `--include`
await $`cd out && tar -xvf out.tar --include='*.repositories.json'`

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

// inject the new repositories.json inside `out.tar`
await $`mkdir -p ${imagePath}`
await $`echo ${JSON.stringify(repositories)} > ${path.join(imagePath, "repositories.json")}`
await $`tar -uf ${path.join("out", "out.tar")} -C ${path.join(basePath, "..")} ${path.join("docker", "image", "overlay2", "repositories.json")}`

// delete extracted repositories.json
for (const repo of repoSources) {
  await $`rm ${path.join(__dirname, "out", repo)}`
}
await $`rm -rf ${basePath}`
