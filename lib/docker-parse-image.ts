/**
 * Typescript version
 * https://github.com/mafintosh/docker-parse-image/blob/master/index.js
 */

 export interface DockerParsedImage {
  registry: string,
  namespace?: any,
  repository: string,
  tag?: any,
  name: string,
  fullname: string,
}

const dockerParseImage = (image:any) => {
    if (!image) return null
    const registryArray = image.split('/')

    let registry = registryArray[0];
    let namespace = registryArray[1];
    const repository = registryArray[2].split('@')[0];
    let tag = registryArray[2].split('@')[1];
  
    if (!namespace && registry && !registry.includes(':') && !registry.includes('.')) {
      namespace = registry
      registry = null
    }

    registry = registry ? `${registry}/` : ''
    namespace = namespace && namespace !== 'library' ? `${namespace}/` : ''
    tag = tag && tag !== 'latest' ? `:${tag}` : ''
  
    const name = `${registry}${namespace}${repository}${tag}`
    const fullname = `${registry}${(namespace || 'library/')}${repository}${(tag || ':latest')}`
  
    const result = {
      registry: registry || null,
      namespace: namespace || null,
      repository: repository || null,
      tag: tag || null,
      name,
      fullname,
    }

    return result
  }

export { dockerParseImage }