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

export function dockerParseImage(image:any){
    var match = image.match(/^(?:([^\/]+)\/)?(?:([^\/]+)\/)?([^@:\/]+)(?:[@:](.+))?$/);
    if (!match) return null;
  
    var registry = match[1];
    var namespace = match[2];
    var repository = match[3];
    var tag = match[4];
  
    if (!namespace && registry && !/[:.]/.test(registry)) {
      namespace = registry;
      registry = null;
    }
  
    registry = registry ? registry+'/' : '';
    namespace = namespace && namespace !== 'library' ? namespace+'/' : '';
    tag = tag && tag !== 'latest' ? ':'+tag : '';
  
    const name = `${registry}${namespace}${repository}${tag}`;
    const fullname = `${registry}${namespace || 'library/'}${repository}${tag || ':latest'}`;
  
    return {
        registry,
        namespace: namespace || null,
        repository,
        tag: tag || null,
        name,
        fullname,
    };
}