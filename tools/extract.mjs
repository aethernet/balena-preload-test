// Fork of https://github.com/mafintosh/tar-fs
// The MIT License (MIT)
// Copyright (c) 2014 Mathias Buus
// Fork by Edwin Joassart for Balena (2022)

import path from "path"
import mkdirp from "./mkdirp.mjs"
import chownr from "chownr"
import tar from "tar-stream"
import pump from "pump"

export default function (cwd, opts) {
  if (!cwd) cwd = "."
  if (!opts) opts = {}

  var xfs = opts.fs
  var ignore = opts.ignore || noop
  var map = opts.map || noop
  var extract = tar.extract()
  var own = true
  var umask = typeof opts.umask === "number" ? ~opts.umask : ~processUmask()
  var dmode = typeof opts.dmode === "number" ? opts.dmode : 0
  var fmode = typeof opts.fmode === "number" ? opts.fmode : 0
  var strict = opts.strict !== false

  if (opts.readable) {
    dmode |= parseInt(555, 8)
    fmode |= parseInt(444, 8)
  }
  if (opts.writable) {
    dmode |= parseInt(333, 8)
    fmode |= parseInt(222, 8)
  }

  var chperm = function (name, header, cb) {
    var link = header.type === "symlink"

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
    cb()
  }

  extract.on("entry", function (header, stream, next) {
    if (ignore(header)) {
      stream.resume()
      return next()
    }

    header = map(header) || header

    var name = path.join(cwd, path.join("/", header.name))

    var stat = function (err) {
      if (err) return next(err)
      chperm(name, header, next)
    }

    var onsymlink = function () {
      xfs.unlink(name, function () {
        xfs.symlink(header.linkname, name, stat)
      })
    }

    var onlink = function () {
      xfs.unlink(name, function () {
        var srcpath = path.join(cwd, path.join("/", header.linkname))

        xfs.link(srcpath, name, function (err) {
          if (err && err.code === "EPERM" && opts.hardlinkAsFilesFallback) {
            stream = xfs.createReadStream(srcpath)
            return onfile()
          }

          stat(err)
        })
      })
    }

    var onfile = function () {
      console.log("onfile")
      var ws = xfs.createWriteStream(name)
      var rs = mapStream(stream, header)

      ws.on("error", function (err) {
        rs.destroy(err)
      })

      pump(rs, ws, function (err) {
        if (err) return next(err)
        ws.on("close", stat)
      })
    }

    if (header.type === "directory") {
      console.log(`mkdir`, header.name)
      return mkdirfix(
        name,
        {
          fs: xfs,
          own: own,
          uid: header.uid,
          gid: header.gid,
        },
        stat
      )
    }

    var dir = path.dirname(name)

    validate(xfs, dir, path.join(cwd, "."), function (err, valid) {
      if (err) return next(err)
      if (!valid) return next(new Error(dir + " is not a valid path"))

      console.log(`validate`, header.name)
      mkdirfix(
        dir,
        {
          fs: xfs,
          own: own,
          uid: header.uid,
          gid: header.gid,
        },
        function (err) {
          console.log("mkdirfix", err)
          if (err) return next(err)
          switch (header.type) {
            case "file":
              return onfile()
            case "link":
              return onlink()
            case "symlink":
              return onsymlink()
          }

          if (strict) return next(new Error("unsupported type for " + name + " (" + header.type + ")"))

          stream.resume()
          next()
        }
      )
    })
  })

  if (opts.finish) extract.on("finish", opts.finish)

  return extract
}

function validate(fs, name, root, cb) {
  console.log(name, root)
  if (name === root) return cb(null, true)
  fs.lstat(name, function (err, st) {
    console.log(err, st)
    if (err && err.code !== "ENOENT") return cb(err)
    if (err || st.isDirectory()) return validate(fs, path.join(name, ".."), root, cb)
    cb(null, false)
  })
}

async function mkdirfix(name, opts, cb) {
  try {
    const made = await mkdirp(name, { fs: opts.fs })
    if (made && opts.own) {
      chownr(made, opts.uid, opts.gid, cb)
    }
  } catch (err) {
    cb(err)
  }
}

var processUmask = function () {
  return process.umask ? process.umask() : 0
}
