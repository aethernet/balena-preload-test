#!/usr/bin/env zx

// const scanned = await $`sudo balena scan |grep address`;
// console.log('scanned', scanned);

// bob Nuc
const bobAddress = '192.168.4.185';
// const bobAddress = await $`(printf "results:\n$(sudo balena scan)" \
//     | yq e '.results[] \
//     | select(.osVariant=="development").address' - \
//     | head -n 1)`;
const uuid='7710555';
const balenaDeviceUuid='77105551e3a8a66011f16b1fe82bc504';
const tld='bob.local';

// test device (raspberry pi 4)
const deviceAddress = '192.168.4.82';
// const deviceAddress = await $`(printf "results:\n$(sudo balena scan)" \
//     | yq e '.results[] \
//     | select(.osVariant=="development").address' - \
//     | tail -n 1)`;
const versionAppJson = '4';

const inPath = path.join(__dirname, "in");
const outPath = path.join(__dirname, "out");

const configPath = `${inPath}/config${versionAppJson}.json`;
const appsPathVersioned = `${inPath}/apps${versionAppJson}.json`;
const appsPath = `${inPath}/apps.json`;

// clean in folder
await $`rm -rf ${inPath}/config* ${inPath}/apps*`;

const configJson = await $`scp -P 22222 root@${deviceAddress}:/mnt/boot/config.json ${configPath}`;

const config = await fs.readJson(configPath);

const deviceId = config.uuid;
// a6facb7b455dd99e9eb8ba3930c0b85b

const bobApiToken= await $`cat < ~/.balena/token`;
const appsJsonFull = await $`curl -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${bobApiToken}" \
    -X GET "https://api.${balenaDeviceUuid}.${tld}/device/v3/${deviceId}/state" > ${appsPathVersioned}`

// const appsJsonFull = await $`curl -H "Content-Type: application/json" \
// -H "Authorization: Bearer ${bobApiToken}" \
// -X GET "https://api.balena-cloud.com/device/v3/${deviceId}/state" > ${appsPathVersioned}`

const apps = await fs.readJson(appsPathVersioned);
const appsJson = await apps[deviceId];
await fs.writeFileSync(appsPath, JSON.stringify(appsJson));
console.log('appsJson', appsJson);
await $`ls ${inPath}/`;
await $`cat ${appsPath} | jq`;


// const curledUrl = await $`curl --upload-file ${appsPath} https://transfer.sh/apps.json`;
// console.log('curledUrl', curledUrl);
// ssh to the builder
// await $`balena ssh ${bobAddress} builder`;

// git clone https://github.com/zoobot/balena-preload-test.git

// copy in the apps.json to the builder 
// TODO copy it directly how to scp to service without balena scp?
// await $`curl ${curledUrl} -o balena-preload-test/in/apps.json`;