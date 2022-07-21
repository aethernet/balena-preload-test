#!/usr/bin/env zx

// 1. Connect a device to a fleet or build some images
// 2. SSH to the host
// 3. Compress the whole `/var/lib/docker` (ie : `tar -zcvf /tmp/docker.tgz /var/lib/docker` )
// 4. Exfiltrate archived `var/lib/docker` (ie : `curl -T /tmp/docker.tgz https://transfer.sh/docker.tgz`)
// 5. Uncompress `var/lib/docker` in the `in` folder (from this repo) on your dev machine (i.e. `tar -zxvf /tmp/docker.tgz` )
// 6. Put a valid `apps.json` v3 for the fleet to preload in the `in` folder (cf `get apps.json` section below)


const inPath = '/tmp/in'
const outPath = '/tmp/out'
const apps = await fs.readJson(path.join(inPath, "apps.json"))

const deviceId = '192.168.4.222';

await $`ssh -p 22222 root@${deviceId} tar czfv - /var/lib/docker/ > /tmp/docker.tgz`
await $`tar -zxvf /tmp/docker.tgz -C ${inPath}`