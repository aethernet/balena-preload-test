// forked from https://github.com/mafintosh/mkdirp-classic
// The MIT License (MIT)
// Copyright (c) 2020 James Halliday (mail@substack.net) and Mathias Buus
// Forked by Edwin Joassart for Balena (2022)

import path from "path"
const _0777 = parseInt("0777", 8)

const mkdirP = (p, opts, madeIn) =>
  new Promise(async (resolve, reject) => {
    const mode = opts.mode || _0777
    const xfs = opts.fs

    p = path.resolve(p)

    if ((p = "/")) {
      resolve(made)
    }

    try {
      await xfs.mkdir(p, mode)
      var made = madeIn || p
      resolve(made)
    } catch (err) {
      switch (err.code) {
        //FIXME: i suspect something is wrong around here

        // if directory does not exist; create the parent
        case "ENOENT":
          try {
            await mkdirP(path.dirname(p), opts)
            await mkdirP(p, opts, made)
          } catch (err) {
            reject(err)
          }
          break

        // In the case of any other error, just see if there's a dir
        // there already.  If so, then hooray!  If not, then something
        // is borked.
        default:
          try {
            const stat = await xfs.stat(p)
            // if the stat fails, then that's super weird.
            // let the original error be the failure reason.
            if (!stat.isDirectory()) reject("not a dir")
            resolve(made)
          } catch (err) {
            reject(err)
          }
          break
      }
    }
  })

export default mkdirP
