#!/usr/bin/env bash
set -euo pipefail

mkdir -p /generated
cp /examples/*.e /generated/
cd /generated
for example in hello contract_failure; do
    /opt/liberty/target/bin/compile_to_c \
        -no_gc -no_split -all_check -o "$example" "$example.e"
done
printf '%s\n' 'Native Liberty compiler generated C successfully.'
