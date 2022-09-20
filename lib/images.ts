/** Prepare injectable files for all images */
import { ManifestInfosFromRegistry } from "./interface-manifest"

const getImagesConfigurationFiles = (manifests: ManifestInfosFromRegistry[]) => {
  const dockerImageOverlay2Imagedb = "docker/image/overlay2/imagedb"
  return manifests
    .map(({ configManifestV2, imageId}) => {
      const shortImageId = imageId.split(":")[1]
      return [
        {
          header: { name: `${dockerImageOverlay2Imagedb}/content/sha256/${shortImageId}`, mode: 644 },
          content: JSON.stringify(configManifestV2),
        },
        {
          header: { name: `${dockerImageOverlay2Imagedb}/metadata/sha256/${shortImageId}/lastUpdated`, mode: 644 },
          content: new Date().toISOString(),
        },
      ]
    })
    .flat()
}

export { getImagesConfigurationFiles }
