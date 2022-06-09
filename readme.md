# Extract images from fs of a running balena-engine / docker and inject in a clean balenaos

## Prepare

1. Connect a device to a fleet or build some images
2. SSH to the host
3. Compress the whole `/var/lib/docker` (ie : `tar -zcvf /tmp/docker.tgz /var/lib/docker` )
4. Exfiltrate archived `var/lib/docker` (ie : `curl -T /tmp/docker.tgz https://transfer.sh/docker.tgz`)
5. Uncompress `var/lib/docker` in the `in` folder (from this repo) on your dev machine (i.e. `tar -zxvf /tmp/docker.tgz` )
6. Put a valid `apps.json` v3 for the fleet to preload in the `in` folder (cf `get apps.json` section below)

### Get `apps.json`

We need a v3 of `apps.json` which will only work with `supervisor v13+` (fairly recent version of belena os at the time of writing).

To get that for a fleet you need a provisioned device on the fleet (which should be the case if you followed the rest prepare instructions), note that the device online status doesn't matter.

Go to the dashboard, open your browser dev tools, go to the network panel, browse to the device -> diagnostic -> supervisor state. Search the `xhr` call for one that looks like 
`https://api.balena-cloud.com/device/v2/_deviceid_/state` (note that device `id` is not equal to `uuid`).

Replace `v2` by `v3` and run it back. You can do that with a fetch in the dev tool console, or with curl

`curl -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>"  -X GET https://api.balena-cloud.com/device/v3/<DEVICE_ID>/state`

Replace `<TOKEN>` with your balena token (you can find it in `~/.balena/token` if you're logged in from the cli) and `<DEVICE_ID>` with the device id.

You'll get a json, containing a `[_UUID_]: {apps: {name: '', ...}, config: {...}}`, which is not the same format as `apps.json`.

You need to remove the first `key` and get the contnet one level up so it looks like :
`{apps: {...}, config: {...}}` and remove the `apps.name`.

#### TODO: 
- automate this whole thing (from a device `uuid` which is easy to get from dashboard, or with a `fleet slug` as it's done in the `cli` (creating a fake device, getting the target state, deleting the device).

## Extract

1. run `extractApp.mjs`

- Images `name` will be taken from the `apps.json` and translation to image hash will be done using the `repositories.json` from the assets
- All `layers` and metadata for all images will be extracted to the `out` folder.
- A snippet of `repositories.json` will be copied for each images as `_imageHash_.repositories.json` in the out folder
- `apps.json` will be copied from `in` to `out`

## Inject to a balenaos `.img`

1. Mount the two partitions (`resin-data` and `resin-boot`) from balenaos inflated, expanded image (cf `resizeBalenaOsPartition.md` for details)
2. Run `inject.mjs` with parameters pointing to the mounted `resin-data` (i.e : `inject.mjs --resin-data /Volumes/resin-data --resin-boot /Volumes/resin-boot`). Note: `--resin-boot` is optional (cf `inject settings` section below)
3. Unmount all the partitions from the image
4. Burn the image to a sd card using etcher
5. Insert sd in device and boot up
6. Ssh to the device (i.e. if using the static ethernet ip `balena ssh 10.0.0.1`)
7. Test that everything is running as it should (`balena-engine ps` should returns all your containers running, `balena-engine images` should list all images (apps + supervisor))

### Inject Settings

You can add two optional settings file :
  - `config.json` (in the `in` folder)
  - `static_ip` (in the `root` folder of this project)

If `resin-boot` partition is mounted and provided and one of those optional files are availble, they will be injected in the boot partition (at root for `config.json` and in `system-connectons` for `static_ip`).

#### `config.json`
You can get `config.json` for your fleet from the balena cloud dashboard. Add a device to the fleet and download the `_appname_config.json` file instead of the os `.img.zip` (be sure to select `dev` and not `prod`), then rename the file and drop it in the `in` folder. This way you can reuse the same expanded os base image while testing different fleets.

#### `static_ip`
It's a simple ethernet static ip configuration file which will configure `ethernet` to a static 10.0.0.1/24 ip. The idea is that you can easily configure your laptop to `10.0.0.*/24` run an ethernet cable between the two and get access to the device without the device connected to the internet.

This is to prevent the device to register itself to the cloud and get a new target state. It means if the device has its services running you're sure it's because prelaoding worked.

## Troubleshooting

### check if images are there

- `balena-engine images` should list all images loaded on the system
- `journalctl -n 400 -u balena.service` -> look for informations about failed images import

### check why services doesn't starts

- `balena-engine logs balena_supervisor` -> look for informations about `apps.json` failing to load

## `apps.json`

The target state as shown on the dashboard gives too much informations.
The file needs to follow this format : https://github.com/balena-os/balena-supervisor/blob/master/src/types/state.ts#L352-L359

```
{
  config: {...},
	apps: {...},
  pinDevice: boolean
}
```

Most of those inforamtions are under the `local` field when copied from the dashboard.

# FS Structure and essential files

On a running engine, docker fs is located in `/var/lib/docker/`, if not specified all folders or files discussed below are relative to that directory.

To transplant an image we need to move :

- `overlay2/_overalyHashId_` (directories)
- `image/overlay2/imagedb/content/sha256/_imageId_` (single file)
- `image/overlay2/imagedb/metadata/sha256/_imageId_` (single directory)
- `image/overlay2/layerdb/_layerChainId_` (directories)

- `image/overlay2/repositories.json` (partial of a json, which will have to be merged with existing one when injecting)

## How to track those files

Manifest will list `diff-id` for each layers.
But on the file system, the folder will be named using `chainId`.

`chainId(n)` is `sha256(chainId(n-1) + ' ' + diffId(n))`
Except for highest layer as that one has no parent so for that one `chainId` = `diffId`.

Each of those layer has a `parent` file which contains the `chainId` of the parent, this can be used for extra check.

Each of those layers also contains a `cacheId` file containing the hash of the corresponding overlay, using that file we can find the corresponding `overlay2` folder.

In each `overlay2` folder we have a `link` file which contains the "short name" used in the `l` folder to create a `symlink` back the the `overlay2/_id_/diff` folder. Those symlinks are used to limit the size of the `mount` parameter used when mounting the overlays together.

## Apps.json

This file contains instruction about the target state of the device for the `balena-supervisor`.
There's no good way of getting it yet (cf previous notes).

It has to be copied at the root of the `resin-data` partition.

Note that starting with `v13` of `supervisor`, supervisor expects an `apps.json` `v3`, prior is `v2`.

## repositories.json

That file contains the relation between `image tags` (aka names) and `image id`.

As there's at least one image (`balena-supervisor`) installed on a blank balena-os, we need to merge the informations from our images inside that file.

## Notes about `overlay2` and `l` folders

Some `overlay2` might be shared across multiple images (if they are identical).
This is not a problem per se, but as they're full of symlinks it might become an issue when at injection stage.

I've solve that in this PoC by checking if the folder exist before writing it.
This solution works as I merge all `images` assets _before_ injection.
If we want to inject multiple images in etcher we need a mechanism to decide how to deal with this situation at the `.etch` level.
