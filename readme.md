# Generate preloadable assets for a balena application

## Purpose

This PoC is part of a bigger `.etch` effort.

The puropose of these script is to produce the minimal files to inject in a clean balena os image to preload a complete application.
In other terms, we need to get the same files `balena-engine` would produce when pulling images for an app without using `balena-engine`, `docker` or any similar engine.

Those files are the ones that usualy lives in `/var/lib/docker/images/...` and `/var/lib/docker/overlay2/...`.

By design those script only works for an `overlay2` driver as it's the only one currently used by recent `balena-engine`.

This is processing the assets "on the wire". Meaning we're computing the assets as we're streaming them from the registry. There should be no hit on the filesystem.
As the processing is actually quite fast, this shouldn't have a minimal impact on speed.

## Warning

This is a PoC build for special narrow use case. It's not recommended to mess with the content of `/var/lib/docker`.
Play with it at your own risk and be sure to have backup of your important stuff.

## Alternatives

An earlier attempt at pre-loading was based on file extraction from the fs of a running `balena-engine`. While it was working (cf `extraction-deprecated` branch), this was impractial in the context of the balena infrastructure and has been abandoned in favor of this simpler static method.

## Process

1. Get an apps.json and place in `in` folder
2. Place a expanded `balenaos.img` in `in` folder
3. Extract `repositories.json`from `balenaos.img` and place it along in `in` folder
4. Configure for your needs (in `main.mjs`)
5. Run `main.mjs`
6. Mount the balenaos.img filesystem (ext4)
7. Run `inject.mjs`
8. Unmout the `balenaos.img`
9. Flash `balenaos.img` and run on your device

### Get `apps.json`

Note : This will soon be automated thanks to a new api endpoint to get the target state of a "future" device in a fleet.

We need a v3 of `apps.json` which will only work with `supervisor v13+` (fairly recent version of belena os at the time of writing).

To get this file you need a provisioned device on a fleet, note that the device online status doesn't matter.

Go to the dashboard, open your browser dev tools, go to the network panel, browse to the device -> diagnostic -> supervisor state. Search the `xhr` call for one that looks like
`https://api.balena-cloud.com/device/v2/_deviceid_/state` (note that device `id` is not equal to `uuid`).

Replace `v2` by `v3` and run it back. You can do that with a fetch in the dev tool console, or with curl

`curl -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" -X GET https://api.balena-cloud.com/device/v3/<DEVICE_ID>/state`

Replace `<TOKEN>` with your balena token (you can find it in `~/.balena/token` if you're logged in from the cli) and `<DEVICE_ID>` with the device id.

You'll get a json, containing a `[_UUID_]: {apps: {name: '', ...}, config: {...}}`, which is not the same format as `apps.json`.

You need to remove the first `key` and get the content one level up so it looks like :
`{apps: {...}, config: {...}}` and remove `apps.name`.

Save that file as `apps.json` in the repo `in` folder.

## Generate assets

- copy `.env.dist` to `.env`
- add an expanded `balenaos.img` in the `in` folder
- add a `apps.json` file in the `in` folder
- add a `VERSION` file in the `in` folder with the version of `balena_supervisor` which is inside balenaos image (comes from S3)
- add a `device_type.json` file `in` folder (comes from the S3)
- edit `.env` for your config
- run `node main.mjs`

Note that both VERSION and device_type.json will be provided by `balena-img` (which fech them from S3 along os image)

### inject.mjs

inject.mjs extracts assets from a etcher archive while injecting the assets into the disk image

```
./inject.mjs /path/to/input /path/to/output
```

Preparing archive:
archive should be created first with the disk image, then with
directory of file to inject under the 'inject' directory,
with the partition number as the subdirectory. > tar cvvf /path/to/input /path/to/disk/image /path/to/inject

Example:
For this example, we assume the following file tree:

```
.
├── image.img
└── inject
    └── 6
        ├── testfile1.txt
        └── testfile2.txt -> ./testfile1.txt
```

where we with to inject the file 'testfile1.txt' into the
root directory of partition 5

```
1.  a. Manually prepare archive
      tar cvvf test.tar ./image.img inject
    b. Automagically prepare the archive
      Use main.mjs to generate the archive
2.  Extract disk image while injecting files:
    ./inject.mjs ./image.img inject
```

#### `config.json`

You can get `config.json` for your fleet from the balena cloud dashboard. Add a device to the fleet and download the `_appname_config.json` file instead of the os `.img.zip` (be sure to select `dev` and not `prod`). You'll need to inject that file manually in the `boot` partition of the image. This way you can reuse the same expanded os base image while testing different fleets.

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

To transplant/unpack an image we need :

One per layer (cf next section for id generation):

- `image/overlay2/layerdb/sha256/_chain-id_/cache-id` (utf-8 text file - content is a random 48 lowercap alphanum string, also used as the name the corresponding `overlay2` folder below)
- `image/overlay2/layerdb/sha256/_chain-id_/diff` (utf-8 text file - content is the diff-id)
- `image/overlay2/layerdb/sha256/_chain-id_/parent` (utf-8 text file - content is the chain-id of the parent layer)
- `image/overlay2/layerdb/sha256/_chain-id_/size` (utf-8 text file)
- `overlay2/_cache-id_/lower` (utf-8 text file; content : cf lower section below)
- `overlay2/_cache-id_/diff` (directory - content is gunziped / untar of the layer archive)
- `overlay2/_cache-id_/work` (empty directory)
- `overlay2/_cache-id_/commited` (empty file)
- `overlay2/_cache-id_/link` (utf-8 text file - content is a random 24 all caps alphanum string (same as the symlink in the `l` folder below))
- `overlay2/l/_link_` (symlink to the corresponding `overlay2/_cache_id_/diff` folder and named from the content of the `link` file)

One per image :

- `image/overlay2/imagedb/content/sha256/_image-id_` (json file)
- `image/overlay2/imagedb/metadata/sha256/_image-id_/lastUpdate` (uft-8 text file with an UTC ISO date)
- `/_image_id_.repositories.json` (json partial to be merged with balena-os repositories.json before injection)

## Ids

### image-id

SHA256 Hash of the image json main file.

### diff-id

SHA256 Hash of the tar archive of the layer (the actual content of the layer) as stored on the registry.

This is listed in the image main json as a list of ordered `diff-id`.

Note that the tar.gzip files you'll probaly pull from the registry are named with another sha256 hash run on the compressed archive.
You need to gunzip the archive and compute the hash to get the `diff-id`.

### chain-id

`chainId(n)` is `sha256(chainId(n-1) + ' ' + diffId(n))` (sha256 hash on this exact string)

Except for highest layer as that one has no parent so for that one `chainId` = `diffId`.

### cache-id

This one is a random string of 32 lower caps alpha numeric characters.
It's the name of the `overlay2` folder which will contain the uncompressed, unarchived content of the layer and is referenced in the layer `cache-id` file.

## link

To overcome filesystem limitation, all `diff` folder have a shorter name `alias` known as the `link`. The `link` is a random `13` all caps alpha numeric string. It's the name of a `symlink` pointing from `overlay2/l/_link_` to a `overlay2/_cache-id/diff` folder, the link is also stored as a string in the `overlay2/_cache_id/link` file.

### lower

Lower is a pre-computed list of all the links to the layers down the current one in the chain, separeted by `:`.

It looks like this : `l/_linkForNextLayer_:l/_linkForSecondNextLayer_:...:l/_linkForLastLayer`.

## A note about deduplication

The docker / moby / balena-engine filesystem is quite efficient when it comes to duplicated layers from different images.
As the layers are named from a sha256 hash of their content, to layer with same content should have the same name.
Combined with the chain-id computation, we can ensure that we not only have the same layers, but the same _layer chain_ to the bottom of the image and only store those files once.

This means when generarting the assets for an image we need to check if the same layers (same `chain-id`) already exist and if so reuse them instead of creating a copy.

This has some impact into the way we generate the `lower` chain for the layers that goes on top of the duplicated chain and complexify parallel image processing.

## Apps.json

This file contains instruction about the target state of the device for the `balena-supervisor`.
There's no good way of getting it yet (cf previous notes).

It has to be copied at the root of the `resin-data` partition (`inject.mjs` takes care of that).

Note that starting with `v13` of `supervisor`, supervisor expects an `apps.json` `v3`, prior is `v2`.

For the preloading effort we assume `apps.json v3`.

## repositories.json

That file contains the relation between `image tags` (aka names; note the plural an image can have multiple tags) and `image-id`.

As there's at least one image (`balena-supervisor`) installed on a blank balena-os, we need to merge the informations from our images inside the existing file.

## Useful Documentation and Links

[https://programmer.ink/think/container-principle-understand-layerid-diffid-chainid-cache-id.html](https://programmer.ink/think/container-principle-understand-layerid-diffid-chainid-cache-id.html)

## TODO:

- automate the retrieval of `apps.json` from the new fleet target state endpoint (when it's merged)
- handle resin-data partition expension (wip)
- find a good enough method to determine the size of the soon to be preloaded assets
- refactor in typescript
- automate tests

## Known limitations and (maybe) important difference between extracted and generated method

- in layerdb we skiped the creation `split-tar.json.gz` as it's related to distribution. It's used to ensure we can recreate the exact same tarball for a layer from the `diff` folder content and therefore upload back to a registry the same layer (with the same hash -> same name). Uploading an image to a registry from a preloaded app is not in the scope of those script, so we're not generating this file.
- `lastUpdate` date is generated with less precision than the original ones (3 digit ms instead of ... 7 or 8) this has no impact whatsoever
- we only created the required files to run the image, more metadata exist when pulling an image from the registry from the engine

### pre-preloading (SV)

As of now, all the balenaos base images [contains a `Supervisor` service preloaded at os build time](https://github.com/balena-os/meta-balena/blob/61b53fbb8b667de54707cc6aa94fd79674958856/meta-balena-common/recipes-containers/docker-disk/files/entry.sh#L63). Historically "balena-health-check" was also preloaded at that moment, but it's [been removed very recently](https://github.com/balena-os/meta-balena/pull/2734).

Problem with those pre-preloaded images is that it's hard to know what they are without extracting files from the balenaos image itself. Best source so far is `repositories.json`, but it doesn't gives us infos about how the layers have been created (remember there's some _randomly named folders_ in some key places).

So we have ~~two~~ three choices :

- A. we get deeper into the os, and map all those folders to reuse them
- B. we preload the supevisor again, which means we stream those layers twice and we let the engine clean up orphan on first boot
- C. we use an empty balenaos (no supervisor) and preload it on the fly

C would probably be the best - given we can fix some loose ends like what happen when you don't want an `.etch` file.

B is what we're going with for the PoC as it's easy and predictable even if wasteful. It means always streaming the full Supervisor (alpine + node 12 + SV) twice. A solution would be to only do the overlapping layers but it might be early-optimisation as maybe (A) can be a solution.

A would be great if we can read files in data partition without too much trouble. If it's too much, we still can create some sort of a `preloading` manifest at os build stage and keep it somewhere.
