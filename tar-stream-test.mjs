#!/usr/bin/env zx

import * as tar from "tar-stream"

const pack = tar.pack() // pack is a streams2 stream
const path = "YourTarBall.tar"
const yourTarball = fs.createWriteStream(path)

// add a file called YourFile.txt with the content "Hello World!"
pack.entry({ name: "/hello/world/YourFile.txt" }, "Hello World!", function (err) {
  if (err) throw err
})
pack.entry({ name: "/hello/world/emptyFolder", type: "folder" }, "Hello World!", function (err) {
  if (err) throw err
})
pack.entry({ name: "/hello/link", linkname: "hello/world/", type: "symlink" }, function (err) {
  if (err) throw err
})

pack.finalize()

// pipe the pack stream to your file
pack.pipe(yourTarball)

yourTarball.on("close", function () {
  console.log(path + " has been written")
  fs.stat(path, function (err, stats) {
    if (err) throw err
    console.log(stats)
    console.log("Got file info successfully!")
  })
})
