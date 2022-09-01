interface AuthOptions {
  user?: string
  password?: string
}

export interface Auth {
  auth: {
    username?: string
    password?: string
  }
  "Docker-Distribution-API-Version": string
}

export const getAuthHeaders = (options: AuthOptions): Auth => {
  return {
    auth: {
      username: options?.user,
      password: options?.password,
    },
    "Docker-Distribution-API-Version": "registry/2.0",
  }
}
