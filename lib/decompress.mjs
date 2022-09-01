// import archiver from 'archiver';

// async  function zipFolder(folder, destination) {
//     const name = 'Zipping back files into Edison zip archive';
//     let position = 0;
    
//     const archive = await archiver('zip', { zlib: { level: 9 } });

//     archive.directory(folder, false);
//     archive.finalize();
//     const output = createWriteStream(destination);
//     output.on('error', reject);
//     output.on('close', () => {
//         console.log('done')
//     });
//     archive.pipe(output);
    
// }

// async function unzipFiles(archive, folder) {
//     // archive is the path to a zip file
//     const name = 'Unzipping Edison zip archive';
//     const stat = await fs.stat(archive);
//     return createReadStream(archive)
//         .on('data', (buf) => {
//             position += buf.length;
//             this._progress(name, (position / stat.size) * 100);
//         })
//         .pipe(unzipper.Extract({ path: folder }))
//         .promise();
// }




// async function extractDeflateToDisk(filename) {
//     combined.append(stream);
//     combined.append(DEFLATE_END);
//     const inflate = createInflateRaw();
//     combined.pipe(inflate);
//     return new BufferDisk(await streamToBuffer(inflate));
// }

// private async getPartStream(
//     filename: string,
// ): Promise<NodeJS.ReadableStream> {
//     const response = await this.download(`compressed${this.imageSuffix}/${filename}`, 'stream');
//     return response.data;
// }

// var input = new Buffer('lorem ipsum dolor sit amet');
// var compressed = zlib.deflate(input);
// var output = zlib.inflate(compressed);
// Note that node-zlib is only intended for small (< 128 KB) data that you already have buffered. It is not meant for input/output streams.

// import  MultiStream from 'multistream'

// var streams = [
//   fs.createReadStream(__dirname + '/numbers/1.txt'),
//   fs.createReadStream(__dirname + '/numbers/2.txt'),
//   fs.createReadStream(__dirname + '/numbers/3.txt')
// ]

// new MultiStream(streams).pipe(process.stdout) // => 123


import fs from 'fs';
// import gzipStream from 'gzip-stream';
// const { createDeflatePart, DeflatePartStreamMetadata } = gzipStream;
import { createDeflatePart, DeflatePartStreamMetadata } from 'gzip-stream';
import zlib from 'zlib';
// import { createGzipFromParts } from 'gzip-stream';
import CombinedStream from 'combined-stream';
// import * as unzipper from 'unzipper';


const folder = 'bobtest/rpi/compressed';
const destination = 'destination';

// Return a promise that the data will be written to path compressed with "deflate".
export async function compressToFile( stream, path )  {
	// return await Promise.allSettled((resolve, reject) => {
		const deflateStream = await createDeflatePart();
		const out = await createWriteStream(path);
		// stream.on('error', reject);
		// deflateStream.on('error', reject);
		// out.on('error', reject);
		out.on('close', () => deflateStream.metadata());
		const piped = await stream.pipe(deflateStream).pipe(out);
        return await piped;
	// });
}

async function combo() {
    const combined = CombinedStream.create();
   
    // combinedStream.append(fs.createReadStream('file1.txt'));
    // combinedStream.append(fs.createReadStream('file2.txt'));
    // combinedStream.pipe(fs.createWriteStream('combined.txt'));
    const fileObjs = fs.readdirSync(folder, { withFileTypes: true });
    console.log("\nCurrent directory files:");
    const streamers = await Promise.allSettled(fileObjs.map(file => {
        console.log(file);
        const inflate = zlib.createInflateRaw([file])
        return fs.createReadStream(`${folder}/${file.name}`)
        combined.append(inflate);
    }));
    // const newFile = `${destination}/combinedStreamRaw.gzip`;
    // combined.pipe(createWriteStream(newFile))
    // const metadata = await compressToFile(createReadStream(newFile), destination);

    const out = fs.createWriteStream(`${destination}/input.gz`);
    // const deflated = await compressToFile(combined, destination);
    // // Creating readable Stream
    // const inp = fs.createReadStream(`${destination}/input`);
  
    // // Creating writable stream
    
    // Calling createGzip method
    // const deflated = zlib.deflate(combined, (err, buffer) => console.log(err, 'err', buffer, 'buffer'));
    // zlib.deflateRaw(buf, callback)
    const gzip = zlib.createGzip();
    
    // // Piping
    // new MultiStream(await streamers).pipe(gzip).pipe(out);

    // new MultiStream(await streamers).pipe(process.stdout)
    console.log("Gzip created!");
}

combo();
// /var/lib/docker/volumes/1_s3-data/_data/balena-images/images/raspberrypi4-64/2.98.33/compressed
// /var/lib/docker/volumes/1_s3-data/_data/balena-images/images/raspberrypi4-64/2.98.33
//     # mkdir /mnt/external

//     Mount your external drive:
//     Raw

//     # mount /dev/sdb1 /mnt/external

//     Create the compressed disk image:
//     Raw

//     # dd if=/dev/sda | gzip -9 > /mnt/external/filename.img.gz

// To recover this in future, run the following command :
// Raw

// # zcat /mnt/external/filename.img.gz | dd of=/dev/sda