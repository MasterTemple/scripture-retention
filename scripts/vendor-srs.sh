#!/usr/bin/env bash
# Builds the Rust engine's WebAssembly package (with FSRS's optimizer) and copies it into
# vendor/scripture-srs, which the app depends on (it isn't published to npm). Run after changing
# rust/crates/scripture-srs or scripture-srs-ffi; needs Rust and the BoltFFI CLI (see rust/README.md).
set -euo pipefail
cd "$(dirname "$0")/.."
(cd rust/crates/scripture-srs-ffi && npm install --silent && ./scripts/pack-wasm.sh)
rm -rf vendor/scripture-srs
mkdir -p vendor/scripture-srs
cp rust/crates/scripture-srs-ffi/dist/wasm/pkg/* vendor/scripture-srs/
rm -f vendor/scripture-srs/*.map
echo "vendor/scripture-srs: $(du -sh vendor/scripture-srs | cut -f1)"
