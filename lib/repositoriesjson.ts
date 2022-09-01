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

import logger from "../logger"

/**
 * Relative path of repositories.json as injected in the resin-data partition
 * On a running device it would be /var/lib/docker/image/overlay2/repositories.json
 */
const repositoriesJsonInjectionPath = "docker/image/overlay2/repositories.json"

/**
 * createAllRepositoriesFragments
 */
const createAllRepositoriesFragments = (manifests) => {
  const repositories = {}
  for (const { image_id, image_name, image_hash, isSupervisor, supervisorVersion } of manifests) {
    // prepare repositories
    repositories[image_name] = {
      [`${image_name}:latest`]: `sha256:${image_id}`,
    }
    if (image_hash !== "latest") repositories[image_name][`${image_name}:@${image_hash}`] = `sha256:${image_id}`

    if (isSupervisor)
      repositories["balena_supervisor"] = {
        [`balena_supervisor:${supervisorVersion}`]: image_id,
      }
  }
  logger.info("==> @createAllRepositoriesFragments repositories")
  return repositories
}

/**
 * Return a repositories.json augmented by fragments for all images
 * @param {Array} manifests - images manifests
 * @param {JSON} repositoriesJson - origal repositories.json
 */
const buildRepositories = ({ manifests }) => {
  logger.warn("== Build Repositories @buildRepositories ==")

  // generate repositories fragments for preloaded images
  const repositories = {
    Repositories: createAllRepositoriesFragments(manifests),
  }

  logger.debug("repositories.json", repositories)

  return repositories
}

export { buildRepositories, repositoriesJsonInjectionPath }
