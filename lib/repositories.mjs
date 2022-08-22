import { FileDisk, withOpenFile } from 'file-disk';
import { resolve } from 'path';


/**
 * Extract repositories from a disk image.
 * /var/lib/docker/image/overlay2/repositories.json
 * /image/overlay2/repositories.json
 * balena-img-fs to get repositories.json??
 * https://github.com/balena-io-modules/balena-image-fs/blob/master/lib/index.ts
 */

const IMAGES_BASE_UNZIPPED = resolve('images-base/unzipped');
const IMAGE_NAME = '77105551.img';


/**
 * This does get the size of the image..
 */
async function experimentWithFileDisk() {
  const diskImage = `${IMAGES_BASE_UNZIPPED}/${IMAGE_NAME}`;
  const offset = 272629760;  // offset of the ext partition you want to mount in that disk image
  try {
    await withOpenFile(diskImage, 'r', async (handle) => {
      const disk = new FileDisk(handle);
      console.log("disk, disk.headers:", disk);
      // get file size
      const size = await disk.getCapacity();
      console.log("size:", size);
      const buf = Buffer.alloc(1024);

      const { bytesRead, buffer } = await disk.read(buf, 0, buf.length, 0);
      // write `buffer` into file starting at `buffer.length` (in the file)
      await disk.write(buf, 0, buf.length, buf.length);
      // flush
      await disk.flush();

      // await withMountedDisk(disk, offset, async ({promises:fs}) => {
      //   // List files
      //   console.log('readdir', await fs.readdir('/'));
      //   await fs.trim();
      //   // Show discarded regions
      //   console.log('discarded', disk.getDiscardedChunks());
      //   // Show ranges of useful data aligned to 1MiB
      //   console.log('ranges', await disk.getRanges(1024 ** 2));
      // });
    });
  } catch (error) {
    console.error(error);
  }
}



experimentWithFileDisk();