ARG NATIVE_IMAGE=liberty-playground:native
FROM ${NATIVE_IMAGE} AS compiler_c
COPY --from=liberty_source /src/ /opt/liberty/src/
COPY --from=liberty_source /sys/ /opt/liberty/sys/
WORKDIR /compiler-c
RUN /opt/liberty/target/bin/compile_to_c -boost -no_gc -split legacy -o compile_to_c compile_to_c

FROM emscripten/emsdk:7.0.0@sha256:3803e37bf748ddee14d31cf712fcab09ca367fca83bbefeb78ce4c1f284e6f3f AS wasm
COPY --from=compiler_c /compiler-c/ /compiler-c/
COPY --from=compiler_c /opt/liberty/src/lib/ /package/liberty/src/lib/
COPY --from=compiler_c /opt/liberty/sys/ /package/liberty/sys/
COPY --from=compiler_c /opt/liberty/resources/short/ /package/liberty/resources/short/
COPY build/liberty.se /package/liberty/liberty.se
COPY build/compiler.sh /experiment/build-compiler.sh
RUN bash /experiment/build-compiler.sh
COPY runtime/eiffel/translator.mjs /out/runtime/eiffel/
COPY tests/compiler/node-smoke.mjs /out/node-smoke.mjs
RUN node /out/node-smoke.mjs
ARG LIBERTY_REVISION=unknown
ARG SOURCE_DIFF_SHA256=unknown
ARG BOOTSTRAP_IMAGE_ID=unknown
ARG LIBERTY_REPOSITORY=unknown
ARG SOURCE_DIRTY=unknown
ARG SOURCE_MODE=unknown
ARG PLAYGROUND_REVISION=uncommitted
ARG PLAYGROUND_TREE_SHA256=unknown
RUN LIBERTY_REVISION="$LIBERTY_REVISION" SOURCE_DIFF_SHA256="$SOURCE_DIFF_SHA256" BOOTSTRAP_IMAGE_ID="$BOOTSTRAP_IMAGE_ID" \
    LIBERTY_REPOSITORY="$LIBERTY_REPOSITORY" SOURCE_DIRTY="$SOURCE_DIRTY" SOURCE_MODE="$SOURCE_MODE" \
    PLAYGROUND_REVISION="$PLAYGROUND_REVISION" PLAYGROUND_TREE_SHA256="$PLAYGROUND_TREE_SHA256" \
    node -e 'require("fs").writeFileSync("/out/runtime/eiffel/provenance.json", JSON.stringify({sourceRepository:process.env.LIBERTY_REPOSITORY,sourceRevision:process.env.LIBERTY_REVISION,sourceTreeSha256:process.env.SOURCE_DIFF_SHA256,sourceDirty:process.env.SOURCE_DIRTY==="true",sourceMode:process.env.SOURCE_MODE,playgroundRevision:process.env.PLAYGROUND_REVISION,playgroundTreeSha256:process.env.PLAYGROUND_TREE_SHA256,bootstrapImage:process.env.BOOTSTRAP_IMAGE_ID,flags:"Liberty -boost -no_gc -split legacy; emcc -O2; stack 16 MiB; initial 64 MiB; max 1 GiB"},null,2)+"\n")'
COPY --from=liberty_source /COPYING /out/licenses/Liberty-COPYING
COPY --from=liberty_source /AUTHORS /out/licenses/Liberty-AUTHORS
COPY runtime/eiffel/client.mjs runtime/eiffel/worker.mjs runtime/eiffel/input.mjs /out/runtime/eiffel/
COPY runtime/worker-request.mjs /out/runtime/

FROM scratch AS artifacts
COPY --from=wasm /out/ /
