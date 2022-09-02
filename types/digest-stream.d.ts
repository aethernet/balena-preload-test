/**
 * This type defition is a minimal place holder to make things work
 * A better solution would be to fork digest-stream and rewrite it as typescript
 *
 * The api is weird with the dynamic signture
 */
declare module "digest-stream" {
  export default function digestStream(algorithm: string, inputEncoding: string, digestEncoding?: any, options?: any, listenerFn?: any): any
}

// https://stackoverflow.com/questions/41292559/could-not-find-a-declaration-file-for-module-module-name-path-to-module-nam
