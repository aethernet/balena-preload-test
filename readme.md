# Extract images from fs of a running balena-engine / docker and inject in a clean balenaos

## Prepare

1. Connect a device to a fleet or build some images
2. SSH to the host
3. Compress the whole `/var/lib/docker` (ie : `tar -zcvf /tmp/docker.tgz /var/lib/docker` )
4. List images available on the device (ie: `balena-engine images`)
5. Inspect image of interest (ie : `balena-engine inspect *imageIdOrName1* *imageIdOrName2* *imageIdOrNameN* > /tmp/inspect.json`) if you want to export/inject a whole app, you need to specify all images related to that app, beware to exlude the supervisor related one)
6. Exfiltrate archived `var/lib/docker` and inspect.json (ie : `curl -T /tmp/docker.tgz https://transfer.sh/docker.tgz`)
7. Uncompress `var/lib/docker` in the `in` folder on your dev machine (i.e. `tar -zxvf /tmp/docker.tgz` )
8. Copy `inspect.json` in the `in` folder on your dev machine
9. Copy a valid `apps.json` for the fleet to preload in the `in` folder (you can get one from the device dashboard -> diagnostic -> supervisor state), clean it up to keep only the images you're going to inject and only keep the content of `local` (cf section below with details)

## Run

1. edit `extractApp.mjs` to include the `full id` of each images you want to extract / inject.
2. run `extractApp.mjs`

- All `layers` and metadata for all images will be extracted to the `out` folder.
- A snippet of `repositories.json` will be copied for each images as `_imageHash_.repositories.json`

## Inject

1. Burn a balena os image with free space to a sd card using etcher (cf specific readme)
3. Mount the sd card (/!\ ext4 partitions, you'll need extra drivers for mac or windows) (i.e. `Paragon ExtFS for mac` (test licence works fine for 10 days))
4. Run `inject.mjs` with parameters pointing to the mounted `resin-data` drive. (i.e : `inject.mjs --resin-data /Volumes/resin-data --resin-boot /Volumes/resin-boot`). Note: `--resin-boot` is optional, and if set will copy `static_ip` file to configure ethernet static ip address.
5. Unmount sd card
6. Insert in device and boot up
7. Connect to ssh (i.e. if using the static ethernet ip `balena ssh 10.0.0.1`)
7. Test that everything is running as it should (`balena-engine ps` should returns running app containers)

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
Doing a `docker inspect _image Name Or Id_` will output a json with informations about the layers (`RootFs`) and overlays (`GraphDrivers`).

Overlays are quite easy to track as `GraphDriver.Data.LowerDir` is a string listing `diff` folders of all the `overlays` separated by a `:`. It's just a matter of splitting and cleaning the string.

Diff Layers on the other hands are more complex to track as they're listed as `diffId` while they're stored on disk in `image/overlay2/layerdb/` using `chainId`.

For the highest layer (first in the list) chainId = diffId, so that one is easy to locate.

For all other layers : `chainId(n)` is `sha256(diffId(n) + ' ' + chainId(n-1))`. 
Hopefully each of those layers (directory) contains a `parent` file which contains the chainId of the layer above them.

So starting with the highest layer (no parent), we can scan the layers to find the one who have it as a `parent`, repeat with layer2, ... until we have them all (we know the quantity in advance).

Each of those layers also contains a `cacheId` file containing the hash of the corresponding overlay. This can be used as a security to ensure we have all the right layers and corresponding overlays.

### Better solution to find the layers :
TODO: As we have the list of diffId and the algorithm to hash their chainId, we should simply compute it instead of searching for which one have the right parent.

## Apps.json
This file contains instruction about the target state of the device for the `balena-supervisor`.
There's no good way of getting it yet (cf previous notes).

It has to be copied at the root of the `resin-data` partition.

## repositories.json
That file contains the relation between `image tags` (aka names) and `image id`.

As there's at least one image (`balena-supervisor`) installed on a blank balena-os, we need to merge the informations from our images inside that file.
