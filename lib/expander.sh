#! /usr/bin/env sh



# -------------------------------------------------------
# Expand balenaos - Scripted resize of partitions
# -------------------------------------------------------

# https://www.gnu.org/software/parted/
# https://askubuntu.com/questions/798853/dd-different-unit-for-bs-skip-and-count
# http://www.infotinks.com/dd-fallocate-truncate-making-big-files-quick/
# https://github.com/openzfs/zfs/issues/326
# https://antipaucity.com/2017/08/31/fallocate-vs-dd-for-swap-file-creation/
# https://en.wikipedia.org/wiki/Partition_type
# https://www.qnx.com/developers/docs/7.0.0/index.html#com.qnx.doc.neutrino.sys_arch/topic/fsys_Partitions.html

# -------------------------------------------------------
# SET VARS
# -------------------------------------------------------


# Change these to suite your needs
ORIGINAL_IMG="77105551.img" # original image to be resized
EXPANDED_IMG="balenaos.img" # resized image name

LOOP_DEV="/dev/loop10" # loop device name
ALLOCATOR="fallocate" # Preallocate space to a file.
FILESYSTEM="ext2" # ext2/ext3/ext4 file system resizer resize (default)

# Make sure SIZE_FILE_ALLOCATION is big enough for the partitions you want to resize
SIZE_FILE_ALLOCATION='5120M' # How much to allocate to the image file for expansion
SIZE_PARTITION=5369 #5GB How much to expand the partition by
PARTITION_NUMBER=6 # partition number to resize


# -------------------------------------------------------
# START
# -------------------------------------------------------


# 0. Check size of original image
ls -lh "${ORIGINAL_IMG}"

# 1. copy the image so you retain the original in case you need redo
cp "${ORIGINAL_IMG}" "${EXPANDED_IMG}"

# 2. set up and control loop devices - create temporary loop devices for the partitions in the img
losetup "${LOOP_DEV}" "${EXPANDED_IMG}"

# 3. preallocate or deallocate space to a file
case $ALLOCATOR in
        "fallocate")
                fallocate -l "$SIZE_FILE_ALLOCATION" "${EXPANDED_IMG}" # fallocate -l - Specifies the length of the range -
                ;;
        "dd")
                dd if="${LOOP_DEV}" of="${EXPANDED_IMG}" bs=1 count=0 seek="${SIZE_FILE_ALLOCATION}" status=progress
                ;;
        "truncate")
                truncate -s "$SIZE_FILE_ALLOCATION" "${EXPANDED_IMG}"
                ;;
esac

# 4. Force the loop driver to reread the size of the file associated with the specified loop device. --c, --set-capacity loopdev - 
losetup -c "${LOOP_DEV}" 

# 5. use parted to print free partitions table in scripted mode,  -s --script never prompts for user intervention
parted -s -a opt "${LOOP_DEV}" "print free"

# 6. manipulate disk partitions to resize partitions to 5GB - Do we need to do partition 4 or just the last partition?
# parted -s -a opt "${LOOP_DEV}"  "resizepart 4 ${SIZE_PARTITION}"
parted -s -a opt "${LOOP_DEV}"  "resizepart ${PARTITION_NUMBER} ${SIZE_PARTITION}"

# 7. use parted to print free partitions table to see if resize worked
parted -s -a opt "${LOOP_DEV}" "print free"

# 8. partprobe - inform the OS of partition table changes, -s, --summary Show a summary of devices and their partitions.
partprobe -s "${LOOP_DEV}"

# 9. file system resizer - preload.py uses fsck to get the filesystem
FILESYSTEM=`fsck -N ${LOOP_DEV} |grep ${LOOP_DEV} | cut -d ']' -f 2 | cut -d ' ' -f 2 | cut -d '.' -f 2`
echo "${FILESYSTEM}"
case $FILESYSTEM in
        "ext2")
                resize2fs "${LOOP_DEV}p${PARTITION_NUMBER}" # fs.startswith("ext")
                ;;
        "ext3")
                resize2fs "${LOOP_DEV}p${PARTITION_NUMBER}" # fs.startswith("ext")
                ;;
        "ext4")
                resize2fs "${LOOP_DEV}p${PARTITION_NUMBER}" # fs.startswith("ext")
                ;;
        "btrfs")
                btrfs filesystem resize max "${LOOP_DEV}p${PARTITION_NUMBER}"
                ;;
esac


# 10. delete the loop device
losetup -d "${LOOP_DEV}"

# 11. zip the file back up
zip "${EXPANDED_IMG}".zip "${EXPANDED_IMG}"

# 12. check the image
ls -lh "${EXPANDED_IMG}"

# -------------------------------------------------------
# ENDZONE
# You're expanded! 🎉
# -------------------------------------------------------