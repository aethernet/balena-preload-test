import * as tar from "tar-stream"

// ============================================================
// UTILITIES

// create folders tree
const makeDirectory = ({ directory, pack }) => pack.entry({ name: directory.name, mode: directory.mode, type: "folder" })
const makeFile = ({ file, pack }) => pack.entry({ name: file.name, mode: file.mode }, file.val)

// Symlinks are not that easy, the right linkname is not yet known
const makeSymlink = ({ link, pack }) => pack.entry({ name: link.name, mode: link.mode, type: "symlink", linkname: link.target })

export const makeDirectories = ({ paths, pack }) => paths.forEach((directory) => makeDirectory({ directory, pack }))
export const makeFiles = ({ files, pack }) => files.forEach((file) => makeFile({ file, pack }))
export const makeSymlinks = ({ links, pack }) => links.forEach((link) => makeSymlink({ link, pack }))

// UTILITIES
// ============================================================
