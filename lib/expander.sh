#! /usr/bin/env sh

# https://www.gnu.org/software/parted/

# -------------------------------------------------------
# Expand balenaos - Scripted resize of partitions
# -------------------------------------------------------

# Change these to suite your needs
ORIGINAL_IMG="77105551.img" # original image to be resized
EXPANDED_IMG="balenaos.img" # resized image name

# Make sure SIZE_FILE_ALLOCATION is big enough for the partitions you want to resize
SIZE_FILE_ALLOCATION='5120M' # How much to allocate to the image file for expansion
SIZE_PARTITION=5369 #5GB How much to expand the partition by

# 0. Check size of original image
ls -lh "$ORIGINAL_IMG"

# 1. copy the image so you retain the original in case you need redo
cp "$ORIGINAL_IMG" "$EXPANDED_IMG"

# 2. set up and control loop devices - create temporary loop devices for the partitions in the img
losetup /dev/loop10 balenaos.img

# 3. fallocate - preallocate or deallocate space to a file, -l length - Specifies the length of the range - 
fallocate -l "$SIZE_FILE_ALLOCATION" balenaos.img 

# 4. Force the loop driver to reread the size of the file associated with the specified loop device. --c, --set-capacity loopdev - 
losetup -c /dev/loop10 

# 5. use parted to print free partitions table in scripted mode,  -s --script never prompts for user intervention
parted -s -a opt /dev/loop10 "print free"

# 6. manipulate disk partitions to resize partitions to 5GB - Do we need to do partition 4 or just the last partition?
parted -s -a opt /dev/loop10  "resizepart 4 $SIZE_PARTITION"
parted -s -a opt /dev/loop10  "resizepart 6 $SIZE_PARTITION"

# 7. use parted to print free partitions table to see if resize worked
parted -s -a opt /dev/loop10 "print free"

# 8. partprobe - inform the OS of partition table changes, -s, --summary Show a summary of devices and their partitions.
partprobe -s /dev/loop10

# 9. resize2fs - ext2/ext3/ext4 file system resizer resize partition 6 
# resize2fs /dev/loop10p4
# resize2fs: Attempt to read block from filesystem resulted in short read while trying to open /dev/loop10p4
# Couldn't find valid filesystem superblock. - what about p4????
resize2fs /dev/loop10p6

# 10. delete the loop device
losetup -d /dev/loop10

# 11. zip the file back up
zip balenaos.img.zip balenaos.img

# 12. check the image
ls -lh "$EXPANDED_IMG"

# -------------------------------------------------------
# ENDZONE
# You're expanded! 🎉
# -------------------------------------------------------