# Resizing resin-data partition
## Requirement
- a balenaos*.img file or .img.zip
- a linux host (works on balenaos)
- a priviledged container (if doing this in a docker)
* `zip`, `unzip`, `parted` installed
* 
## Process
This will make a 5Gb image 
(size is set at step 2) 
(change value of 7 and 9 if you changed the size at 2):
0. `# unzip balenaos*.zip && mv balena*.img balenaos.img
1. `# losetup /dev/loop10 balenaos.img`
2. `# fallocate -l 5120M balenaos.img` 
3. `# losetup -c /dev/loop10`
4. `# parted /dev/loop10`
5. `(parted shell)# print free`
Should return a list of the partitions with plenty of free space after partition 6.
6. `(parted shell) resizepart 4`
7. `(parted shell : END ?) 5369`
8. `(parted shell) resizepart 6`
9. `(parted shell : END ?) 5369`
10. `(parted shell) print free
Should return the same table as before, but with a expanded partition 6 (yay!)
11. `(parted shell) [ctrl+c]`
12. `# partprobe -s /dev/loop10`
13. `# resize2fs /dev/loop10p6`
14. `# losetup -d /dev/loop10`
15. `# zip balenaos.img.zip balenaos.img`

Resized image can now be transfered out and flashed to sd card (or injected with files using balena-image-fs).

NB: 
- Partition table might be slightly different depending on the device type (i.e. generic aarch64 has only 5 partitions (no extended MBR), so no need to resize part 4 and resin-data is part 5)

