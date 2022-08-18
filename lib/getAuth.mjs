export const getAuthHeaders = (options) => {
  return {
    auth: {
      username: options?.user,
      password: options?.password
    },
    "Docker-Distribution-API-Version": 'registry/2.0',
  }
}
