// Fork of https://github.com/mafintosh/tar-fs
// The MIT License (MIT)
// Copyright (c) 2014 Mathias Buus
// Fork by Edwin Joassart for Balena (2022)

import path from "path"
import mkdirp from "./mkdirp.mjs"
// import chownr from "chownr"
import tar from "tar-stream"
// import pump from "pump"

export default function (cwd, opts) {
  if (!cwd) cwd = "."
  if (!opts) opts = {}

  var xfs = opts.fs
  var ignore = opts.ignore || noop
  var map = opts.map || noop
  var extract = tar.extract()
  // var own = true
  // var umask = typeof opts.umask === "number" ? ~opts.umask : ~processUmask()
  var dmode = typeof opts.dmode === "number" ? opts.dmode : 0
  var fmode = typeof opts.fmode === "number" ? opts.fmode : 0
  // var strict = opts.strict !== false

  if (opts.readable) {
    dmode |= parseInt(555, 8)
    fmode |= parseInt(444, 8)
  }
  if (opts.writable) {
    dmode |= parseInt(333, 8)
    fmode |= parseInt(222, 8)
  }

  const chperm = (name, header) => {
    const link = header.type === "symlink"

    /* eslint-disable node/no-deprecated-api */
    // var chmod = link ? xfs.lchmod : xfs.chmod
    // var chown = link ? xfs.lchown : xfs.chown
    /* eslint-enable node/no-deprecated-api */

    // if (!chmod) return cb()

    // var mode = (header.mode | (header.type === "directory" ? dmode : fmode)) & umask

    // if (chown && own) chown.call(xfs, name, header.uid, header.gid, onchown)
    // else onchown(null)

    // function onchown(err) {
    //   if (err) return cb(err)
    //   if (!chmod) return cb()
    //   chmod.call(xfs, name, mode).then(() => cb())
    // }
  }

  extract.on("entry", async function (header, stream, next) {
    if (ignore(header)) {
      stream.resume()
      return next()
    }

    header = map(header) || header

    const name = path.join(cwd, path.join("/", header.name))

    const stat = (err) => {
      if (err) return next(err)
      chperm(name, header)
      next()
    }

    const onsymlink = async () => {
      // console.log("unlinking")
      // await xfs.unlink(name)
      try {
        await xfs.symlink(header.linkname, name)
      } catch (error) {
        console.log("error on symlink", error)
      }
      stat()
    }

    const onlink = async () => {
      // console.log("unlinking")
      // await xfs.unlink(name)
      const srcpath = path.join(cwd, path.join("/", header.linkname))
      try {
        await xfs.link(srcpath, name)
      } catch (error) {
        console.log("error on link", error)
      }
      stat()
    }

    const onfile = async () => {
      try {
        console.log("onfile")

        const ws = await xfs.createWriteStream(name)
        const rs = stream

        // ws.on("error", function (err) {
        //   console.log("file writestream error", err)
        //   rs.destroy(err)
        //   reject(err)
        // })

        // rs.on("error", function (err) {
        //   console.log("file readstream error", err)
        //   reject(err)
        // })

        //   console.log("inject file")
        //   ws.on("close", resolve)
        //   rs.pipe(ws)
        // } catch (err) {
        //   console.log("error in file")
        //   reject("error here")
        // } finally {
        //   stat()
        next()
        // }
      } catch (error) {
        console.log(error)
      }

      try {
        const dir = path.dirname(name)
        await mkdirp(dir, xfs)
        switch (header.type) {
          // case "directory":
          //   return ondirectory()
          case "file":
            console.log("will do file")
            return await onfile()
          case "link":
            console.log("will do link")
            return await onlink()
          case "symlink":
            console.log("will do sym")
            return await onsymlink()
        }
      } catch (error) {
        console.log("error bim", error)
      } finally {
        stream.resume()
        next()
      }

      if (opts.finish) extract.on("finish", opts.finish)

      return extract
    }
  })

  // async function mkdirfix(name, opts, cb) {
  //   try {
  //     await mkdirp(name, opts.fs)
  //     if (made && opts.own) {
  //       chownr(made, opts.uid, opts.gid, cb)
  //     } else {
  //       cb()
  //     }
  //   } catch (err) {
  //     cb(err)
  //   }
  // }

  var processUmask = function () {
    return process.umask ? process.umask() : 0
  }
}
