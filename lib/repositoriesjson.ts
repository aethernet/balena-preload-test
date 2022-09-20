/**
 * Deal with /var/lib/docker/image/overlay2/repositories.json
 * That file informs balena-engine of what images are availble in its local store
 * and maps images name(s) (including tag) to an image digest.
 *
 * Here we generate a complete repositories.json for all the preloaded images, including the supervisor.
 *
 * We will overwrite the orignal repositories.json which has been created at the balenaos build.
 *
 * One small difference between the original and the one we create is that we don't tag the supevisor with its hash.
 * Which shouldn't have any impact, but is worth noting "au cas où"
 */

import { ManifestInfosRepos, Repositories, ManifestInfosFromRegistry } from "./interface-manifest"

/**
 * Relative path of repositories.json as injected in the resin-data partition
 * On a running device it would be /var/lib/docker/image/overlay2/repositories.json
 */
const repositoriesJsonInjectionPath = "docker/image/overlay2/repositories.json"

// TODO repositories.json types
// interface Repositories {
//   [image_name: string]:
// }

/**
 * createAllRepositoriesFragments
 */


const createAllRepositoriesFragments = (manifests: ManifestInfosRepos[]) => {
  const repositories: Repositories = {}
  for (const { imageId, imageName, imageHash, isSupervisor, supervisorVersion } of manifests) {
    // prepare repositories
    repositories[imageName] = {
      [`${imageName}:latest`]: `sha256:${imageId}`,
    }
    if (imageHash !== "latest") repositories[imageName][`${imageName}:@${imageHash}`] = `sha256:${imageId}`

    if (isSupervisor)
      repositories["balena_supervisor"] = {
        [`balena_supervisor:${supervisorVersion}`]: imageId,
      }
  }
  console.log("==> @createAllRepositoriesFragments repositories")
  return repositories
}

/**
 * Return a repositories.json augmented by fragments for all images
 * @param {Array} manifests - images manifests
 * @param {JSON} repositoriesJson - origal repositories.json
 */
const buildRepositories = ( manifests: ManifestInfosRepos[]) => {
  console.log("== Build Repositories @buildRepositories ==")

  // generate repositories fragments for preloaded images
  const repositories = {
    Repositories: createAllRepositoriesFragments(manifests),
  }

  console.log("repositories.json", repositories)

  return repositories
}

export { buildRepositories, repositoriesJsonInjectionPath }
