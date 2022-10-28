// Edwin Joassart for Balena (2022)

import path from "path"

const mkdirP = (p, fs) =>
  new Promise(async (resolve, reject) => {
    p = path.resolve(p)

    // resolve if we're on root to avoid some specific error due to the device nature of /
    if (p === "/") {
      resolve()
      return
    }

    try {
      const stat = await fs.stat(p)
      // we got a directory, that's fine, we're good, let's get out of here
      // maybe we need a special test here for `root`

      resolve()
      return
    } catch (err) {
      // console.log("ENOENT")
      // we don't have a directory, let's check the parents recursiverly until we get one
      // if(err === "ENOENT") // we should check the error here, just in case
      await mkdirP(path.dirname(p), fs)
    }

    // we won't continue until we either gets a directory or reach root, so we now that path.dirname(p) exists
    // and we can create the current directory p

    // creating folder
    try {
      // console.log("creating folder", p)
      await fs.mkdir(p, parseInt("0777", 8))
    } catch (err) {
      reject()
    }

    resolve()
  })

export default mkdirP
