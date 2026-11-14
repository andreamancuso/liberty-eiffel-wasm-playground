ARG NATIVE_IMAGE=liberty-emscripten:stage1-native
FROM ${NATIVE_IMAGE} AS generated
COPY --from=liberty_source /src/ /opt/liberty/src/
COPY --from=liberty_source /sys/ /opt/liberty/sys/
COPY examples/ /examples/
COPY generate.sh /experiment/generate.sh
RUN bash /experiment/generate.sh
ARG LIBERTY_REVISION=unknown
RUN printf '%s\n' "$LIBERTY_REVISION" > /generated/source-revision.txt

# Current SDK release, pinned to its linux/amd64 manifest.
FROM emscripten/emsdk:7.0.0@sha256:3803e37bf748ddee14d31cf712fcab09ca367fca83bbefeb78ce4c1f284e6f3f AS wasm
COPY --from=generated /generated/ /generated/
COPY --from=generated /opt/liberty/sys/ /opt/liberty/sys/
COPY build-wasm.sh /experiment/build-wasm.sh
RUN bash /experiment/build-wasm.sh
COPY web/ /out/

FROM scratch AS artifacts
COPY --from=wasm /out/ /
