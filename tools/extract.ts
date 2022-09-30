// Fork of https://github.com/mafintosh/tar-fs
// The MIT License (MIT)
// Copyright (c) 2014 Mathias Buus
// Fork by Edwin Joassart for Balena (2022)

import path from "path"
// import mkdirp from "./mkdirp.mjs"
import { chownSync, mkdirSync, PathLike } from "fs"
import chownr from "chownr"
import tar from "tar-stream"
import pump from "pump"
// import combinedStream from "combined-stream";
// import { noop } from "zx/build/util";

interface Header{
  name: string
  type?: "symlink" | "file" | "link" | "character-device" | "block-device" | "directory" | "fifo" | "contiguous-file" | "pax-header" | "pax-global-header" | "gnu-long-link-path" | "gnu-long-path" | null | undefined;
  mode?: number | undefined;
  uid: number;
  gid: number;
  size?: number | undefined;
  mtime?: Date | undefined;
  linkname?: string | null | PathLike | undefined;
}

export default function (cwd: string, opts: any = {}) {
  if (!cwd) cwd = "."
  if (!opts) opts = {}

  var xfs = opts.lzfs
  var ignore = opts.ignore
  var map = opts.map
  var mapStream = opts.mapStream
  var extract = tar.extract()
  var own = true
  var umask = typeof opts.umask === "number" ? ~opts.umask : ~processUmask()
  var dmode = typeof opts.dmode === "number" ? opts.dmode : 0
  var fmode = typeof opts.fmode === "number" ? opts.fmode : 0
  var strict = opts.strict !== false
  
  if (opts.readable) {
    dmode |= parseInt('555', 8)
    fmode |= parseInt('444', 8)
  }
  if (opts.writable) {
    dmode |= parseInt('333', 8)
    fmode |= parseInt('222', 8)
  }

  var chperm = function (name: string, header: Header, cb: any) {
    var link = header.type === "symlink"

    var chmod = xfs.chmod
    var chown = xfs.chown
    if (!chmod) return cb()
    const directoryMode = (header.type === "directory") ? dmode : fmode

    // TODO Do we really need bitwise or? Typescript complains about undefined
    // var mode = (header.mode | directoryMode) & umask //??
    var mode = (header.mode || directoryMode) & umask //??

    if (chown && own) chown.call(xfs, name, header.uid, header.gid, onchown)
    // else onchown(null)

    function onchown(err: Error | null): any {
      if (err) return cb(err)
      if (!chmod) return cb()
      chmod.call(xfs, name, mode, cb)
    }
  }

  extract.on("entry", (header: Header, stream: any, next) => {
    if (ignore(header)) {
      stream.resume()
      return next()
    }

    header = map(header) || header

    var name = path.join(cwd, path.join("/", header.name))

    const stat = (err: Error | null): void =>  {
      if (err) return next(err)
      chperm(name, header, next)
    }
    
    const headerLinkName: any = header.linkname;

    var onsymlink = function () {
      xfs.unlink(name, function () {
        const symlinked = xfs.symlinkSync(headerLinkName, name)
        chperm(name, header, next)
      })
    }

    var onlink = () => {
      xfs.unlink(name, () => {
        var srcpath = path.join(cwd, path.join("/", headerLinkName))

        xfs.link(srcpath, name, (err: any | null): any => {
          if (err && err.code === "EPERM" && opts.hardlinkAsFilesFallback) {
            stream = xfs.createReadStream(srcpath)
            return onfile()
          }

          return stat(err)
        })
      })
    }

    var onfile = () => {
      console.log("onfile")
      var ws = xfs.createWriteStream(name)
      var rs = mapStream(stream, header)

      ws.on("error", (err: Error) => {
        rs.destroy(err)
      })
    //   var combinedStream = CombinedStream.create();
    //   combinedStream.append(fs.createReadStream('file1.txt'));
    //   combinedStream.append(fs.createReadStream('file2.txt'));
    //   combinedStream([rs, ws]).on("error", next).on("finish", stat)
      pump(rs, ws, (err) => {
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

    validate(xfs, dir, path.join(cwd, "."), (err: Error | null, valid: any): void => {
      if (err) return next(err)
      if (!valid) return next(new Error(`${dir} is not a valid path`))

      console.log(`validate`, header.name)
      mkdirfix(
        dir,
        {
          fs: xfs,
          own: own,
          uid: header.uid,
          gid: header.gid,
        },
        (err: Error | null): any => {
          console.log("mkdirfix", err)
          if (err) return next(err)
          
          switch (header.type) {
            case "file": return onfile()
            case "link": return onlink()
            case "symlink": return onsymlink()
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

function validate(fs: any, name: any, root: any, cb: (err: Error | null, valid: any) => void) {
  console.log(name, root)
  if (name === root) return cb(null, true)
  fs.lstat(name, function (err: any, st: any) {
    console.log(err, st)
    if (err && err.code !== "ENOENT") return cb(err, null)
    if (err || st.isDirectory()) return validate(fs, path.join(name, ".."), root, cb)
    cb(null, false)
  })
}

async function mkdirfix(name: string, opts: any, cb: (err: Error | null) => void) {
  try {
    // const made = await mkdirp(name, { fs: opts.fs })
    const made = await mkdirSync(name, { recursive: true })
    console.log("made", made)
    // https://nodejs.org/api/fs.html#fsmkdirsyncpath-options
    if (made && opts.own) {
      //  chownr(made, opts.uid, opts.gid, cb)
      chownSync(made, opts.uid, opts.gid,);
    }
  } catch (err) {
    if (err instanceof Error) {
        // ✅ TypeScript knows err is Error
        console.error(err.message);
        cb(err)
    } else {
        console.error('Unexpected error', err);
    }
    
  }
}

var processUmask = function () {
  return process.umask ? process.umask() : 0
}
