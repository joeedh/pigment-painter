#!/usr/bin/env bash

git submodule init
git submodule foreach git submodule init

git submodule update --recursive
git pull && git submodule foreach --recursive git pull

