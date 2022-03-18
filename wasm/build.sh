#!/usr/bin/env bash

source ./env.sh

emsdk activate latest

em++ --std=c++20 -s "ALLOW_MEMORY_GROWTH=1" -s "INITIAL_MEMORY=183500800" -s "EXPORTED_FUNCTIONS=[_updatePigment,_toRGBInternSRGB,_toRGBInternLinear,_setK1K2,_setColorScale,_getPigmentS,_getPigmentK,_makePigmentData,_freePigmentData,_upscaleImage,_sampleLUTLinear,_makeMipMaps,_getImageId,_onStrokeStart,_incStrokeId,_getStrokeId,_setStrokeId,_main,_setBrush,_execDot,_getImageData,_test]" main.cpp pigment.cpp curve.cpp -o main.mjs -O1


