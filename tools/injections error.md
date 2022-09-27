# injections error

## link

-> temporary fixed by skipping

(hard)links

## this one is a device file

-> temporary fixed by skipping

```
6:/docker/overlay2/a83f599d4cde8dbb85b355f43f16b0441f4fd4032c0985f62ae42857767409a6/diff/lib/apk/db/lock
header 600
ErrnoException: node_ext2fs_close UNKNOWN (2133571343) args: [5903656]
    at ccallThrowAsync (/Users/edwinjoassart/Balena/cloud/balena-cloud/balena-img/src/lib/balena-preload-test/node_modules/ext2fs/lib/util.js:22:9)
    at async close (/Users/edwinjoassart/Balena/cloud/balena-cloud/balena-img/src/lib/balena-preload-test/node_modules/ext2fs/lib/fs.js:296:3)
    at async WriteStream._close (/Users/edwinjoassart/Balena/cloud/balena-cloud/balena-img/src/lib/balena-preload-test/node_modules/ext2fs/lib/fs.js:882:9) {
  errno: 2133571343,
  syscall: 'node_ext2fs_close',
  code: 'UNKNOWN'
}
```

## this one i don't know (maybe the double underscore ?)

-> temporary fixed by skipping files containing `__`

```
6:/docker/overlay2/4c20f61b694c8ba9d243f07a2fa5b870aa6c72741390b54f7d6920632302531e/diff/usr/local/lib/node_modules/npm/node_modules/node-gyp/gyp/pylib/gyp/generator/__init__.py
header 644
ErrnoException: node_ext2fs_close UNKNOWN (2133571343) args: [5399688]
    at ccallThrowAsync (/Users/edwinjoassart/Balena/cloud/balena-cloud/balena-img/src/lib/balena-preload-test/node_modules/ext2fs/lib/util.js:22:9)
    at async close (/Users/edwinjoassart/Balena/cloud/balena-cloud/balena-img/src/lib/balena-preload-test/node_modules/ext2fs/lib/fs.js:296:3)
    at async WriteStream._close (/Users/edwinjoassart/Balena/cloud/balena-cloud/balena-img/src/lib/balena-preload-test/node_modules/ext2fs/lib/fs.js:882:9) {
  errno: 2133571343,
  syscall: 'node_ext2fs_close',
  code: 'UNKNOWN'
}
```

## another one with no idea what's the matter

```
6:/docker/overlay2/d98ad62a92b2f60ea56647436605ea47833646df2b68694492a87677980173ab/diff/var/lib/systemd/deb-systemd-helper-enabled/timers.target.wants/apt-daily-upgrade.timer
ErrnoException: node_ext2fs_close UNKNOWN (2133571343) args: [5399688]
    at ccallThrowAsync (/Users/edwinjoassart/Balena/cloud/balena-cloud/balena-img/src/lib/balena-preload-test/node_modules/ext2fs/lib/util.js:22:9)
    at async close (/Users/edwinjoassart/Balena/cloud/balena-cloud/balena-img/src/lib/balena-preload-test/node_modules/ext2fs/lib/fs.js:296:3)
    at async WriteStream._close (/Users/edwinjoassart/Balena/cloud/balena-cloud/balena-img/src/lib/balena-preload-test/node_modules/ext2fs/lib/fs.js:882:9) {
  errno: 2133571343,
  syscall: 'node_ext2fs_close',
  code: 'UNKNOWN'
}
```
