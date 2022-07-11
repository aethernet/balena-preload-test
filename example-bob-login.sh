#! /usr/bin/env sh

# -------------------------------------------------------
# login
# -------------------------------------------------------
# unset BALENARC_BALENA_URL
# unset DOCKER_HOST
# balena login
# balena_api_token="$(cat < ~/.balena/token)"
# echo $balena_api_token

# uuid=$(printf "results:\n$(sudo balena scan)" \
#   | yq e '.results[] | select(.osVariant=="development").host' - \
#   | awk -F'.' '{print $1}' | head -n 1); echo $uuid;

# username="zoobot"
# machine_name="nuc"
# balena_device_uuid="$(balena devices|grep ${username}|grep ${machine_name}|grep true|awk '{print $NF}'| awk -F'[[:space:]="/]+' '{print $(NF-1)}')"; echo $balena_device_uuid;
# -------------------------------------------------------
# SET Nuc ids
# -------------------------------------------------------

uuid='7710555'
balena_device_uuid='77105551e3a8a66011f16b1fe82bc504'
tld='bob.local'

echo $uuid
echo $balena_device_uuid
echo $tld

# ensure you can reach relevant mDNS (.local) hosts[fn4]:
ping -c 1 ${uuid}.local && ping -c 1 api.${balena_device_uuid}.${tld}

# -------------------------------------------------------
# -------------------------------------------------------
# cert_manager=$(DOCKER_HOST=${uuid}.local docker ps \
#   --filter "name=cert-manager" \
#   --format "{{.ID}}")
# echo $cert_manager

# DOCKER_HOST=${uuid}.local docker cp ${cert_manager}:/certs/private/ca-bundle.${balena_device_uuid}.${tld}.pem balena/
# echo $DOCKER_HOST

# export NODE_EXTRA_CA_CERTS="/Users/rose/Documents/balena-io/balena-cloud/balena/ca-bundle.${balena_device_uuid}.${tld}.pem"
# echo $NODE_EXTRA_CA_CERTS

# * ⚠️ add CA root certificates and mark trusted (e.g. macOS):
# sudo security add-trusted-cert -d -r trustAsRoot -k /Library/Keychains/System.keychain ${NODE_EXTRA_CA_CERTS}


# * test to confirm the OS is configured to trust your CA (⚠️ without specifying `-k|--insecure`):

# ```sh
# while ! CURL_CA_BUNDLE=${NODE_EXTRA_CA_CERTS} \
#   curl --fail -I https://api.${balena_device_uuid}.${tld}/ping; do sleep 5s; done;
# ```

# * ⚠️ enable [sideshow-bob](src/sideshow-bob) to create an admin user and import device
#   types (`qemux86-64` and `raspberry-pi2` are imported by default)[[fn6](#fn6)]:

# ```sh
# balena env add API_TOKEN "${balena_api_token}" \
#   --service sideshow-bob \
#   --device "${uuid}" \
#   --debug

# -------------------------------------------------------
# -------------------------------------------------------

# set this when you want to target your local instance
export BALENARC_BALENA_URL=${balena_device_uuid}.${tld}

admin_email=bob@balena.local
admin_password="${balena_device_uuid}"

balena login --credentials \
  --email "${admin_email}" \
  --password "${admin_password}"

bob_api_token="$(cat < ~/.balena/token)"

username="$(balena whoami | grep USERNAME | cut -c11-)"
api_key="$(balena api-key generate "${username}")"
api_key=$(echo ${api_key} | sed -n 's/^.*: \([^ ]*\).*$/\1/p')

dashboard_url="https://dashboard.${balena_device_uuid}.${tld}"
open $dashboard_url

# You're done! 🎉
