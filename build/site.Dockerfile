ARG TOOLCHAIN_IMAGE=liberty-playground:toolchain
FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS frontend
WORKDIR /ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ui/ ./
RUN npm test && npm run build

FROM ${TOOLCHAIN_IMAGE} AS site
COPY --from=compiler_output /runtime/eiffel/ /out/runtime/eiffel/
COPY --from=compiler_output /licenses/ /out/licenses/liberty/
COPY runtime/ /out/runtime/
COPY --from=frontend /ui/dist/ /out/
FROM scratch AS artifacts
COPY --from=site /out/ /
