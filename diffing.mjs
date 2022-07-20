#!/usr/bin/env zx

/** 
 * 
 * This script purpose is to spot all the differences between two different dockers filesystem
 * With a focus on those folders (given the root follows `/var/lib/docker` folder structure)
 * ./image/** 
 * ./overlay2/**
 * 
 * `images` shoulds be quite straigtforward to compare given the images stored are the same (deterministic)
 * `overlay2` is different, all folders are randomly named, but the content is predictable and linked to a layer in `image`
 * 
 * */

