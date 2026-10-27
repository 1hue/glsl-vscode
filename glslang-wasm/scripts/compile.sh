#!/bin/sh
# Builds dist/ (glslang.wasm, loader, licenses). Runs inside Emscripten container, see scripts/build.sh
set -eu
cd "$(dirname "$0")/.."

GLSLANG_TAG=16.6.0
GLSLANG_COMMIT=e1b562a8bed273a02f30b59b66a5d499793cede5

git clone --quiet --depth 1 --branch "$GLSLANG_TAG" https://github.com/KhronosGroup/glslang.git /tmp/glslang
test "$(git -C /tmp/glslang rev-parse HEAD)" = "$GLSLANG_COMMIT"

# Image cache is root-owned
export EM_CACHE=/tmp/emcache
cp -r "$EMSDK/upstream/emscripten/cache" "$EM_CACHE"

emcmake cmake -S /tmp/glslang -B /tmp/build \
	-DCMAKE_BUILD_TYPE=MinSizeRel \
	-DBUILD_EXTERNAL=OFF \
	-DENABLE_SPIRV=OFF \
	-DENABLE_HLSL=OFF \
	-DENABLE_OPT=OFF \
	-DENABLE_PCH=OFF \
	-DENABLE_GLSLANG_BINARIES=OFF \
	-DGLSLANG_TESTS=OFF \
	-DGLSLANG_ENABLE_INSTALL=OFF
cmake --build /tmp/build --parallel --target glslang glslang-default-resource-limits

rm -rf dist
mkdir dist
em++ -Oz -flto -fno-exceptions -fno-rtti \
	-I/tmp/glslang -I/tmp/build/include \
	src/check.cpp \
	$(find /tmp/build -name '*.a') \
	-sMODULARIZE \
	-sEXPORT_NAME=createModule \
	-sENVIRONMENT=node,web,worker \
	-sFILESYSTEM=0 \
	-sALLOW_MEMORY_GROWTH \
	-sSTACK_SIZE=8MB \
	-sEXPORTED_FUNCTIONS=_initialize,_finalize,_check,_free \
	-sEXPORTED_RUNTIME_METHODS=stringToNewUTF8,UTF8ToString \
	-o dist/glslang.js

cp src/index.js src/index.d.ts src/glslang.d.ts dist/
cp /tmp/glslang/LICENSE.txt dist/LICENSE.glslang.txt
cp "$EMSDK/upstream/emscripten/LICENSE" dist/LICENSE.emscripten.txt
cp "$EMSDK/upstream/emscripten/system/lib/libc/musl/COPYRIGHT" dist/LICENSE.musl.txt
