# Extract images from fs of a running balena-engine / docker and inject in a clean balenaos

## Prepare

1. Connect a device to a fleet or build some images
2. SSH to the host
3. Compress the whole `/var/lib/docker` (ie : `tar -zcvf /tmp/docker.tgz /var/lib/docker` )
4. Exfiltrate archived `var/lib/docker` and inspect.json (ie : `curl -T /tmp/docker.tgz https://transfer.sh/docker.tgz`)
5. Uncompress `var/lib/docker` in the `in` folder on your dev machine (i.e. `tar -zxvf /tmp/docker.tgz` )
6. Copy a valid `apps.json` for the fleet to preload in the `in` folder (you can get one from the device dashboard -> diagnostic -> supervisor state), clean it up to keep only the images you're going to inject and only keep the content of `local` (cf section below with details)

## Run

1. run `extractApp.mjs`

- Images `name` will ba taken from the `apps.json`
- All `layers` and metadata for all images will be extracted to the `out` folder.
- A snippet of `repositories.json` will be copied for each images as `_imageHash_.repositories.json`

## Inject
### by copying on sd

1. Burn a balena os image with free space to a sd card using etcher (cf specific readme)
3. Mount the sd card (/!\ ext4 partitions, you'll need extra drivers for mac or windows) (i.e. `Paragon ExtFS for mac` (test licence works fine for 10 days))
4. Run `inject.mjs` with parameters pointing to the mounted `resin-data` drive. (i.e : `inject.mjs --resin-data /Volumes/resin-data --resin-boot /Volumes/resin-boot`). Note: `--resin-boot` is optional, and if set will copy `static_ip` file to configure ethernet static ip address.
5. Unmount sd card
6. Insert sd in device and boot up
7. Ssh to the device (i.e. if using the static ethernet ip `balena ssh 10.0.0.1`)
7. Test that everything is running as it should (`balena-engine ps` should returns all your containers)

### by copying to img
1. Mount the two partitions (`resin-data` and `resin-boot`) from balenaos inflated, expanded image to the host
2. Run `inject.mjs` with parameters pointing to the mounted `resin-data` (i.e : `inject.mjs --resin-data /Volumes/resin-data --resin-boot /Volumes/resin-boot`). Note: `--resin-boot` is optional, and if set will copy `static_ip` file to configure ethernet static ip address.
3. Unmount all the partitions from the image
4. Burn the image to a sd card using etcher
5. Insert sd in device and boot up
6. Ssh to the device (i.e. if using the static ethernet ip `balena ssh 10.0.0.1`)
7. Test that everything is running as it should (`balena-engine ps` should returns all your containers)

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
