#!/usr/bin/env bash

git pull
git submodule init
git submodule foreach git submodule init

git submodule update --recursive
git submodule foreach --recursive git checkout master
git submodule foreach --recursive git pull

