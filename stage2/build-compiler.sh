#!/usr/bin/env bash
set -euo pipefail
mkdir -p /out /objects /package/liberty/bin
cd /compiler-c
# Bound parallel compilation memory use on Docker Desktop.
printf '%s\0' compile_to_c[0-9]*.c | xargs -0 -P 4 -I '{}' bash -c \
    'emcc -O2 -c "$1" -o "/objects/${1%.c}.o"' _ '{}'
emcc /objects/*.o -O2 -lm \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
    -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 -sALLOW_MEMORY_GROWTH=1 \
    -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=1073741824 -sSTACK_SIZE=16777216 \
    '-sEXPORTED_RUNTIME_METHODS=["callMain","FS","ENV","HEAPU8"]' \
    --preload-file /package/liberty@/liberty -o /out/compiler.mjs
emcc --version > /out/emscripten-version.txt
