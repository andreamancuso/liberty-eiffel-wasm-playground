FROM debian:bookworm-slim@sha256:c67e92c8099ba22853ab4cfda7cfb494d253d6012ca82dee98ba8976772af018
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential autoconf automake ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/liberty
COPY --from=liberty_source /install.sh ./
COPY --from=liberty_source /work/tools.sh /work/se_make.sh work/
COPY --from=liberty_source /src/ src/
COPY --from=liberty_source /sys/ sys/
COPY --from=liberty_source /resources/ resources/
COPY --from=liberty_source /tutorial/ tutorial/
RUN find . -type f \( -name '*.sh' -o -name '*.run' \) \
    -exec sed -i 's/\r$//' {} +
RUN bash ./install.sh -plain -bootstrap > /tmp/bootstrap.log 2>&1 \
    || { tail -100 /tmp/bootstrap.log; exit 1; }
