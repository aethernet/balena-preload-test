#!/usr/bin/env zx

/** 
 * This is an optional step, which loop thru all images folder from step 2 and compress them for tranport / strorage
 * 
 * Note : 
 * - We do simple tar + gz `.tgz` files
 * - We can do any packaging / compression we need, .tgz has been choose for demonstration purpose
 * 
*/

const tmpFolder = '/tmp/preloadTest'
const inFolder = path.join(tmpFolder, 'out')
const outFolder = path.join(tmpFolder, 'assets')

// clean up
await $`rm -rf ${outFolder}`
await $`mkdir -p ${outFolder}`

// list images

/** utils: return all subdirectory of arg (no files) */
const listDirs = async (directory) => {
    const elements = await fs.readdir(directory, { withFileTypes: true })
    return elements
      .filter(element => !element.isFile())
      .map(element => element.name)
}

const images = await listDirs(inFolder)

// compress
for (const image of images) {
  $`tar -zcvf ${path.join(outFolder, `${image}.tgz`)} ${path.join(inFolder, image)}`
}
