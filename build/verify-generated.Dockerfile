ARG NATIVE_IMAGE=liberty-playground:native
FROM ${NATIVE_IMAGE} AS fixture_c
COPY --from=liberty_source /src/ /opt/liberty/src/
COPY --from=liberty_source /sys/ /opt/liberty/sys/
COPY examples/ /examples/
COPY build/generate-fixtures.sh /experiment/build/generate-fixtures.sh
RUN bash /experiment/build/generate-fixtures.sh

FROM emscripten/emsdk:7.0.0@sha256:3803e37bf748ddee14d31cf712fcab09ca367fca83bbefeb78ce4c1f284e6f3f AS verify
COPY --from=fixture_c /generated/ /generated/
COPY --from=fixture_c /opt/liberty/sys/ /opt/liberty/sys/
COPY build/compile-fixtures.sh /experiment/build/compile-fixtures.sh
RUN bash /experiment/build/compile-fixtures.sh
COPY tests/compiler/aot.html /out/index.html
COPY --from=browser_output /validation/ /validation/
COPY build/verify-generated.sh /experiment/build-validation.sh
RUN bash /experiment/build-validation.sh
COPY tests/compiler/execution.html /out/validation/index.html

FROM scratch AS artifacts
COPY --from=verify /out/ /
