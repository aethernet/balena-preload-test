import { fs } from 'zx';
import os from 'os';

export const getAuthHeaders = async (options) => {
    return {
        auth: {
          username: options?.user || 'bob',
          password: options?.password || await fs.readFileSync(`${os.homedir()}/.balena/token`, 'utf8')
        },
      }
    }

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
  