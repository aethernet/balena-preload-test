import archiver from 'archiver';
import {
	promises as fs,
	constants,
	createReadStream,
	createWriteStream,
} from 'fs';

const folder = 'compressed';
const destination = 'destination.zip';
async  function zipFolder(folder, destination) {
    const name = 'Zipping back files into Edison zip archive';
    let position = 0;
    const archive = await archiver('zip', { zlib: { level: 9 } });

    archive.directory(folder, false);
    archive.finalize();
    const output = createWriteStream(destination);
    output.on('error', reject);
    output.on('close', () => {
        console.log('done')
    });
    archive.pipe(output);
    
}