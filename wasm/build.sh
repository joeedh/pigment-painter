#!/usr/bin/env bash

source env.sh

emsdk activate latest

em++ --std=c++20 -s "ALLOW_MEMORY_GROWTH=1" -s "INITIAL_MEMORY=183500800" -s "EXPORTED_FUNCTIONS=[_getImageId,_onStrokeStart,_getOrigPixel,_incStrokeId,_getStrokeId,_setStrokeId,_main,_execDraw,_setBrush,_execDot,_getImageData,_test]" main.cpp -o main.mjs -O1


