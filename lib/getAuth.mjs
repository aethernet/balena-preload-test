import fs from 'fs-extra'
import os from 'os'

//TODO: remove deps to fs and os
export const getAuthHeaders = async ({user, password}) => {
  return {
    auth: {
      username: user ?? 'bob',
      password: password ?? await fs.readFileSync(`${os.homedir()}/.balena/token`, 'utf8')
    },
    "Docker-Distribution-API-Version": 'registry/2.0',
  }
}