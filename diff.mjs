#!/usr/bin/env zx

const getDirectories = async source =>
  (await fs.readdir(source, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

// list all layers in `docker/image/overlay2/layerdb/sha256`

const layerPath = path.join(__dirname, 'out', 'docker', 'image', 'overlay2', 'layerdb', 'sha256')
const overlay2Path = path.join(__dirname, 'out', 'docker', 'overlay2')

const checksLayers = await getDirectories(layerPath)
  .then(layers => 
    layers
      .map(layer => ({
        layer, 
        cacheId: fs.readFileSync(path.join(layerPath, layer, 'cache-id'), {encoding: 'utf8'})
      }))
      .map(({layer, cacheId}) => ({
        layer,
        cacheId,
        hasOverlay2: fs.existsSync(path.join(overlay2Path, cacheId)),
        link: fs.readFileSync(path.join(overlay2Path, cacheId, 'link'), {encoding: 'utf8'}),
      }))
      .filter(({hasOverlay2}) => !hasOverlay2)
  ).then(checks => console.log(`> ${checks.length} layers without matching overlay2`))

const checksOverlay2s = await getDirectories(overlay2Path)
  .then(overlays => 
    overlays
    .filter(overlay => overlay !== "l")
    .map(async overlay => {
      try {
        const grep = await $`grep ${overlay} ${layerPath}/*/cache-id`
        const cacheId = grep.stdout
        return {
          overlay,
          cacheId
        }
      } catch (err) {
        console.error('ERROR =>', overlay)
        return {overlay}
      }
    })
    .filter(({cacheId}) => !cacheId)
  ).then(checks => 
    console.log(`> ${checks.length} overlay2 without matching layer`)
  )
  