#!/bin/bash

find $1 -name parent -exec grep -l $2 {} \;