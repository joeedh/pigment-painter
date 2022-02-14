#!/usr/bin/env bash

git pull && git submodule foreach --recursive git pull

