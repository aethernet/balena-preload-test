import fs from 'fs-extra'
import os from 'os'

//TODO: remove deps to fs and os
export const getAuthHeaders = (options) => {
    return {
        auth: {
          username: options?.user || 'bob',
          password: options?.password || fs.readFileSync(`${os.homedir()}/.balena/token`, 'utf8')
        },
        "Docker-Distribution-API-Version": 'registry/2.0',
      }
    }

/**
 * getEnvs
 * @param {String} user 
 * @returns {Object} envs
 */
 export const getEnvs = () => {
  const user = process.env.PASSWD ? "edwin3" : "bob"
  const authHeaders = getAuthHeaders(user)
  const envs = {
    edwin2: {
      app_id: "7ea7c15b12144d1089dd20645763f790", // "ed91bdb088b54a3b999576679281520a" ee6c3b3f75ae456d9760171a27a36568
      release_id:  "302261f9d08a388e36deccedac6cb424", // "2f24cd2be3006b029911a3d0da6837d5"
      balenaosRef: "expanded-aarch64",
      user: "edwin3",
      password: process.env.PASSWD,
    },
    bob: {
      app_id: "ee6c3b3f75ae456d9760171a27a36568",
      release_id: "63908fb619fceb7bc30de7d93c207af2",
      balenaosRef: "expanded-aarch64",
      user: "bob" || authHeaders.auth.username,
      password: process.env.PASSWD || authHeaders.auth.password,
    }
  }[user];
  if (!envs.password) throw new error("Password is missing, launch this with `PASSWD=****** node streaming.mjs`")
  return envs;
}