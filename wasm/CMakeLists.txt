cmake_minimum_required(VERSION 3.10)

# set the project name
project(PigmentPaintWasm)

set(CMAKE_MODULE_PATH cmakeModules
)

if (NOT DEFINED ENV{EMSCRIPTEN})
	if (DEFINED ENV{EMSDK})
		set(EMSCRIPTEN, $ENV{EMSDK})
	endif()
else()
set(EMSCRIPTEN $ENV{EMSCRIPTEN})
endif()

set(SOURCES main.cpp
	curve.cpp
)

set(INCLUDE main.h
	curve.h
)

#not working
if (${CMAKE_HOST_WIN32})
#	set(BUILD_SCRIPT build.bat)
	set(BUILD_SCRIPT sh build.sh)
else()
	set(BUILD_SCRIPT build.sh)
endif()

message(
	STATUS _SOURCES ${SOURCES}
)
add_custom_target(wasm 
    ALL ${BUILD_SCRIPT}
	DEPENDS ${SOURCES} ${INCLUDE}
	WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
	SOURCES ${SOURCES}
)
