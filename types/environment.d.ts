declare global {
    namespace NodeJS {
      interface ProcessEnv {
        GITHUB_AUTH_TOKEN: string;
        NODE_ENV: 'development' | 'production';
        PORT?: string;
        APPID: string
        RELEASEID: string
        BALENAOS: string
        USER: string
        PASSWORD?: any
        TARBALL: string
        BALENAENV: string
        DEVICEADDRESS: string
        CONSOLELEVEL: string
        DATA_PARTITION: string
        API: string
        API_TOKEN?: string
        SV_VERSION: string
        ARCH: string
        BASEIMAGE: string
      }
    }
  }
  
// Module example
//   declare module "digest-stream" {
//     export default function digestStream(algorithm: string, inputEncoding: string, digestEncoding?: any, options?: any, listenerFn?: any): any
//   }

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}
