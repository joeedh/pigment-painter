#!/usr/bin/env bash

alias python3=python.exe
export PATH="/c/Python38:`cygpath $WASM_EMSDK`:$PATH"

source $WASM_EMSDK/emsdk_env.sh
