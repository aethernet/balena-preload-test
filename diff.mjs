#!/usr/bin/env zx

const getDirectories = async source =>
  (await fs.readdir(source, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

// list all layers in `docker/image/overlay2/layerdb/sha256`

const layerPath = path.join(__dirname, 'out', 'docker', 'image', 'overlay2', 'layerdb', 'sha256')
const overlay2Path = path.join(__dirname, 'out', 'docker', 'overlay2')

// const checksLayers = await getDirectories(layerPath)
//   .then(layers => 
//     layers
//       .map(layer => ({
//         layer, 
//         cacheId: fs.readFileSync(path.join(layerPath, layer, 'cache-id'), {encoding: 'utf8'})
//       }))
//       .map(({layer, cacheId}) => ({
//         layer,
//         cacheId,
//         hasOverlay2: fs.existsSync(path.join(overlay2Path, cacheId)),
//         link: fs.readFileSync(path.join(overlay2Path, cacheId, 'link'), {encoding: 'utf8'}),
//       }))
//       .filter(({hasOverlay2}) => !hasOverlay2)
//   ).then(checks => console.log(`> ${checks.length} layers without matching overlay2`))

const checksOverlay2s = await getDirectories(overlay2Path)
  .then(async overlays => {
    const mapped = overlays
    .filter(overlay => overlay !== "l")
    .map(async (overlay, index) => {
      try {
        console.log('\n\nSTART ====>', index)
        const grep = await $`grep ${overlay} ${layerPath}/*/cache-id`
        console.log('grep', grep)
        const cacheId = grep.stdout
        console.log('cacheId', cacheId)
        console.log('overlay', overlay)
        console.log('END ====> \n\n')
        return {
          overlay,
          cacheId
        }
      } catch (err) {
        console.error('ERROR =>', overlay)
        return {overlay}
      }
    })
    
    const mapfin = await Promise.all(mapped)
    console.log(' \n\nmapfin', mapfin)
    const filtered = mapfin.filter(({cacheId},index) => {
      console.log('\n\nSTART filter ====>', index)
      console.log('cacheId', cacheId, !cacheId)
      console.log('END filter====> \n\n')
      return !cacheId
    })
    console.log('filtered', filtered)
    return filtered;
  }).then(checks => 
    console.log(`> ${checks.length} overlay2 without matching layer`)
  )
  