import { fs } from 'zx';
import os from 'os';

export const getAuthHeaders = (options) => {
    return {
        auth: {
          username: options?.user || 'bob',
          password: options?.password || fs.readFileSync(`${os.homedir()}/.balena/token`, 'utf8')
          // password: options?.password || "$(cat < ~/.balena/token)"
        },
        "Docker-Distribution-API-Version": 'registry/2.0',
      }
    }

// export const getAuth = async (options) => {
//     const authHeaders = auth || getAuthHeaders(auth);

  
//     const authResponseForRealm = await getRealmResponse(registryUrl, authHeaders);
//     console.log('\n\n==> authResponseForRealm', authResponseForRealm);
  
//     const token = await getToken(parsedImage, authHeaders, authResponseForRealm);
//     console.log('\n\n==> token', token);
//     return {token}
// }
  // TODO - add cert support
  // # cert_manager=$(DOCKER_HOST=${uuid}.local docker ps \
  //   #   --filter "name=cert-manager" \
  //   #   --format "{{.ID}}")
  //   # echo $cert_manager
  
  //   # DOCKER_HOST=${uuid}.local docker cp ${cert_manager}:/certs/private/ca-bundle.${balena_device_uuid}.${tld}.pem balena/
  //   # echo $DOCKER_HOST
  
  //   export NODE_EXTRA_CA_CERTS="/Users/rose/Documents/balena-io/balena-cloud/balena/ca-bundle.${balena_device_uuid}.${tld}.pem"
  //   echo $NODE_EXTRA_CA_CERTS
  
  //   # * ⚠️ add CA root certificates and mark trusted (e.g. macOS):
  //   sudo security add-trusted-cert -d -r trustAsRoot -k /Library/Keychains/System.keychain ${NODE_EXTRA_CA_CERTS}
  