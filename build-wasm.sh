#!/usr/bin/env bash
set -euo pipefail

mkdir -p /out/generated
cp /generated/* /out/generated/
emcc --version > /out/emscripten-version.txt
cd /generated
for example in hello contract_failure; do
    emcc "$example.c" -O0 -lm \
        -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node \
        -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 -sALLOW_MEMORY_GROWTH=1 \
        '-sEXPORTED_RUNTIME_METHODS=["callMain"]' \
        -o "/out/$example.mjs"
done
