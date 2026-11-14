FROM emscripten/emsdk:7.0.0@sha256:3803e37bf748ddee14d31cf712fcab09ca367fca83bbefeb78ce4c1f284e6f3f AS toolchain
COPY build/toolchain.lock.json build/prepare-toolchain.py /experiment/
RUN python3 /experiment/prepare-toolchain.py
WORKDIR /runtime/src/memfs
RUN /sdk/bin/clang --target=wasm32-wasip1 -O2 -c memfs.c -o /tmp/memfs.o \
    && /sdk/bin/clang --target=wasm32-wasip1 -DSTB_SPRINTF_IMPLEMENTATION -x c -O2 -c stb_sprintf.h -o /tmp/sprintf.o \
    && mkdir -p /out/runtime/wasi/toolchain /out/licenses \
    && /sdk/bin/wasm-ld -L/sdk/share/wasi-sysroot/lib/wasm32-wasip1 --no-entry --export-dynamic --allow-undefined \
       --initial-memory=4194304 -o /out/runtime/wasi/toolchain/memfs.wasm /tmp/memfs.o /tmp/sprintf.o -lc
RUN cp /downloads/clang.wasm /downloads/lld.wasm /downloads/sysroot.tar /out/runtime/wasi/toolchain/ \
    && cp /runtime/LICENSE /runtime/LICENSE.llvm /runtime/NOTICE /out/licenses/ \
    && cp /experiment/toolchain.lock.json /out/runtime/wasi/toolchain/
COPY build/patch-runtime.py /experiment/
RUN python3 /experiment/patch-runtime.py
COPY build/pack-sysroot.py /experiment/
RUN python3 /experiment/pack-sysroot.py
FROM toolchain AS probe
COPY --from=compiler_output /validation/hello/ /probe/
RUN /sdk/bin/clang /probe/hello.c -O0 -D_WASI_EMULATED_SIGNAL -lwasi-emulated-signal -o /probe/hello.wasm
COPY runtime/wasi/program.mjs /out/runtime/wasi/
COPY runtime/download.mjs /out/runtime/
COPY tests/compiler/backend-probe.mjs /experiment/
RUN node /experiment/backend-probe.mjs
FROM scratch AS artifacts
COPY --from=toolchain /out/ /
