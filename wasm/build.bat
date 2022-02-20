%call %EMSCRIPTEN%/emsdk_env.bat

%EMSCRIPTEN%\emsdk.bat activate latest

em++ --std=c++20 -s "ALLOW_MEMORY_GROWTH=1" -s "INITIAL_MEMORY=183500800" -s "EXPORTED_FUNCTIONS=[_upscaleImage,_sampleLUTLinear,_makeMipMaps,_getImageId,_onStrokeStart,_incStrokeId,_getStrokeId,_setStrokeId,_main,_setBrush,_execDot,_getImageData,_test]" main.cpp curve.cpp -o main.mjs -O1


