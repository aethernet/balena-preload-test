/**
 * Deal with /var/lib/docker/image/overlay2/repositories.json
 * That file informs balena-engine of what images are availble in its local strore
 * and maps images name(s) (including tag) to an image digest.
 *
 * This file provides method to generate fragments of repositories.json for preloading images
 * and merging functionalities to inject those fragments inside a pre-existing repositories.json.
 *
 * Merging is necessary as we inject images inside a balenaos.img which already have some images (i.e. supervisor).
 */

import logger from "../logger.mjs"
import path from "path"
import fs from "fs-extra"

// TODO: this is only for the mock, remove it when we have fixed that part
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Relative path of repositories.json as injected in the resin-data partition
 * On a running device it would be /var/lib/docker/image/overlay2/repositories.json
 */
const repositoriesJsonInjectionPath = path.join("docker", "image", "overlay2", "repositories.json")

/**
 * createAllRepositoriesFragments
 */
const createAllRepositoriesFragments = (manifests) => {
  const repositories = []
  for (const { image_id, image_name, image_hash } of manifests) {
    // prepare repositories
    repositories[image_name] = {
      [`${image_name}:latest`]: `sha256:${image_id}`,
      [`${image_name}:@${image_hash}`]: `sha256:${image_id}`,
    }
  }
  logger.info("==> @createAllRepositoriesFragments repositories")
  logger.debug("==> @createAllRepositoriesFragments repositories", repositories)
  return repositories
}

/**
 * combineRepositories
 * @param {json} repositoriesJson - balenaos repositories.json
 * @param {json} repositories new json with all repositories
 * @return {json} repositories.json
 */
const combineRepositories = (repositoriesJson, repositories) => {
  for (const repository in repositories) {
    repositoriesJson.Repositories[repository] = { ...repositories[repository] }
  }
  return repositoriesJson
}

/**
 * Return a repositories.json augmented by fragments for all images
 * @param {Array} manifests - images manifests
 * @param {JSON} repositoriesJson - origal repositories.json
 */
const mergeRepositories = ({ originalRepositories, manifests }) => {
  logger.warn("== Merge Repositories @mergeRepositories ==")

  // generate repositories fragments for preloaded images
  const repositoriesFragments = createAllRepositoriesFragments(manifests)

  // combine balenaos original repositories.json with the generated repositories fragments
  const repositories = combineRepositories(originalRepositories, repositoriesFragments)

  console.log(repositories)

  return repositories
}

/**
 * Get repositories.json for a balenaos version
 * //TODO: this should be stored on S3 along the expanded version of os, in the meantime getting this from local fs
 * @param {string} balenaosRef - balenaos we want to get the repositories for
 * @return {json} repositories.json
 */
const getRepositoriesJsonForBaseImage = async (baleneosVersion) => {
  return await fs.readJson(path.join(__dirname, "..", "in", `${baleneosVersion}.repositories.json`))
}

export { mergeRepositories, repositoriesJsonInjectionPath, getRepositoriesJsonForBaseImage }
