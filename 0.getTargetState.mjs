#!/usr/bin/env zx

/** Get target state of supervisor
 * Here we'd need to get the "target state" for the fleet.
 * 
 * Best : an api endpoint on the fleet to get a target state for preloading
 * Possible : create a device on the fleet, get the state, delete the device (current cli preloader implementation)
 * Worse (current) : hardcoded version copied from the dashboard
 * 
 * note: 
 * - i removed the `name` from the target, we'll see if it's necessary : "name": "morning-shape"
 * 
 * */

const tmpFolder = '/tmp/preloadTest'
const workFolder = path.join(tmpFolder, 'work')
const outFolder = path.join(tmpFolder, 'out')

/** Clean up */
await $`rm -rf ${tmpFolder}`
await $`mkdir -p ${workFolder}`
await $`mkdir -p ${outFolder}`

const targetState = {
  "pinDevice": false,
  "config": {
    "RESIN_SUPERVISOR_DELTA_VERSION": "3",
    "RESIN_SUPERVISOR_NATIVE_LOGGER": "true",
    "RESIN_HOST_CONFIG_avoid_warnings": "1",
    "RESIN_HOST_CONFIG_disable_splash": "1",
    "RESIN_HOST_CONFIG_dtoverlay": "\"vc4-kms-v3d\"",
    "RESIN_HOST_CONFIG_dtparam": "\"i2c_arm=on\",\"spi=on\",\"audio=on\"",
    "RESIN_HOST_CONFIG_gpu_mem": "16",
    "RESIN_HOST_FIREWALL_MODE": "",
    "RESIN_SUPERVISOR_DELTA": "1",
    "RESIN_SUPERVISOR_POLL_INTERVAL": "900000",
    "RESIN_SUPERVISOR_DELTA_REQUEST_TIMEOUT": "59000"
  },
  "apps": {
    "1933815": {
      "releaseId": 2168707,
      "commit": "2f24cd2be3006b029911a3d0da6837d5",
      "name": "preloading-test-pi4",
      "services": {
        "1575101": {
          "restart": "always",
          "volumes": [
            "files:/files"
          ],
          "ports": [
            "80"
          ],
          "environment": {
            "BROWSE_FOLDER": "/files"
          },
          "imageId": 4913976,
          "serviceName": "files",
          "image": "registry2.balena-cloud.com/v2/a42656089dcef7501aae9dae4687a2c5@sha256:0ae9a712a8c32ac04b91d659a9bc6d4bb2e76453aaf3cfaf036f279262f1f100",
          "running": true,
          "labels": {}
        },
        "1575102": {
          "restart": "always",
          "privileged": true,
          "volumes": [
            "files:/files"
          ],
          "imageId": 4913977,
          "serviceName": "sdcard",
          "image": "registry2.balena-cloud.com/v2/5eb45ce8b915cd87865cf954a5e53129@sha256:0406bfce1cb9ccac879bdeb720228f322eab8e269cc0d846ec1843e691d7b841",
          "running": true,
          "environment": {},
          "labels": {}
        }
      },
      "networks": {},
      "volumes": {
        "files": {}
      }
    }
  }
}

await $`echo ${JSON.stringify(targetState)} > ${path.join(workFolder, 'apps.json')}`
