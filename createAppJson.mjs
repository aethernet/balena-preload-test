#!/usr/bin/env zx

// const scanned = await $`sudo balena scan`;
// console.log('scanned.stdout', scanned.stdout);
// const addresses = await $`(printf "results:\n$(sudo balena scan)" \
//     | yq e '.results[] \
//     | select(.osVariant=="development").address')`;

// test device (raspberry pi 4)
// const deviceAddress = addresses.stdout.split("\n")[1] ?? '192.168.4.222';
const deviceAddress = '192.168.4.222';
console.log('device Address', deviceAddress);

// bob device
// const bobAddress = addresses.stdout.split("\n")[0] ?? '192.168.4.185';
const bobAddress = '192.168.4.185';
console.log(' bobAddress',  bobAddress);

// const uuid = await $`(printf "results:\n$(sudo balena scan)" \
//   | yq e '.results[] | select(.osVariant=="development").host' - \
//   | awk -F'.' '{print $1}' | tail -n 1)` ?? '7710555';
const uuid = '7710555';
console.log('uuid', uuid);


const username = await $`(balena whoami | grep USERNAME | cut -c11-)` ?? bob;
let api_key = await $`(cat < ~/.balena/token)`;

//https://dashboard.77105551e3a8a66011f16b1fe82bc504.bob.local/devices/a6facb7b455dd99e9eb8ba3930c0b85b/summar
// You are getting this: 77105551e3a8a66011f16b1fe82bc504
// const balenaDeviceUuid = await $`(balena devices|grep bob|grep 7710555|grep true|awk '{print $NF}'| awk -F'/' '{print $3}'|awk -F'.' '{print $2}')` ?? '77105551e3a8a66011f16b1fe82bc504';
const balenaDeviceUuid = '77105551e3a8a66011f16b1fe82bc504'
console.log('balenaDeviceUuid', balenaDeviceUuid);
const tld = 'bob.local';


const versionAppJson = '4';

// create folders tree
const makeDirectory = ((directory) => {
  if (!fs.existsSync(directory)){
    fs.mkdirSync(directory.pathStr, 
      { recursive: true, mode: directory.mode }
    );
  }
});
const makeDirectories = (paths) => paths.forEach(makeDirectory);
const inPath = '/tmp/in'
const outPath = '/tmp/out';
const workDirectories = [
    {pathStr: inPath, mode: 766},
    {pathStr: outPath, mode: 766},
]
makeDirectories(workDirectories);

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
// console.log('appsJson', appsJson);
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