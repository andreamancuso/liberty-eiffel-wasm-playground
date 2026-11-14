#!/usr/bin/env bash
set -euo pipefail
mkdir -p /out/validation
for example in hello multi; do
    cd "/validation/$example"
    emcc hello.c -O0 -lm \
        -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web \
        -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 -sALLOW_MEMORY_GROWTH=1 \
        '-sEXPORTED_RUNTIME_METHODS=["callMain"]' \
        -o "/out/validation/$example.mjs"
    cp expected.json "/out/validation/$example.expected.json"
done
