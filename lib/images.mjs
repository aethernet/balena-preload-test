import path from "path"
/** Prepare injectable files for all images */
const getImagesConfigurationFiles = (manifests) => {
  const dockerImageOverlay2Imagedb = path.join("docker", "image", "overlay2", "imagedb")
  return manifests
    .map(({ configManifestV2, image_id }) => {
      const shortImage_id = image_id.split(":")[1]
      return [
        {
          header: { name: path.join(dockerImageOverlay2Imagedb, "content", "sha256", shortImage_id), mode: "0o644" },
          content: JSON.stringify(configManifestV2),
        },
        {
          header: { name: path.join(dockerImageOverlay2Imagedb, "metadata", "sha256", shortImage_id, "lastUpdated"), mode: "0o644" },
          content: new Date().toISOString(),
        },
      ]
    })
    .flat()
}

export { getImagesConfigurationFiles }
