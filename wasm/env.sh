#!/usr/bin/env bash

alias python3=$PYTHON3
export PATH="/c/Python38:`cygpath $EMSCRIPTEN`:$PATH"

source $EMSCRIPTEN/emsdk_env.sh
