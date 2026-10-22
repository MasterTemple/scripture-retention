#!/usr/bin/env bash
# Builds the npm package (scripture-srs) into dist/wasm/pkg, with its README and license.
set -euo pipefail
cd "$(dirname "$0")/.."
boltffi pack wasm --release
cp README.md dist/wasm/pkg/README.md
cp ../../../LICENSE dist/wasm/pkg/LICENSE
# BoltFFI's exception passes its class name to Error, so `err.message` would be "SrsError":
# give it the error's own message instead, in every generated file that defines the class
patched=0
for file in dist/wasm/pkg/*.js dist/wasm/pkg/*.ts; do
  case "$file" in *.d.ts) continue ;; esac
  grep -q 'class SrsErrorException extends Error' "$file" || continue
  patched=$((patched + 1))
  grep -q 'super(value.message);' "$file" && continue
  if ! grep -q 'super("SrsError");' "$file"; then
    echo "pack-wasm.sh: SrsErrorException in $file no longer calls super(\"SrsError\"); update the patch" >&2
    exit 1
  fi
  perl -pi -e 's/super\("SrsError"\);/super(value.message);/' "$file"
done
if [ "$patched" -eq 0 ]; then
  echo "pack-wasm.sh: no generated file defines SrsErrorException; update the patch" >&2
  exit 1
fi
# web.js, bundler.js, and node.js export `initialized`, which BoltFFI's types leave out
types=dist/wasm/pkg/scripture_srs.d.ts
if ! grep -q 'export declare const initialized' "$types"; then
  printf '%s\n' '' \
    '/** Resolves once the WebAssembly module is loaded: await it before the first call in a browser (in Node and Bun it already has) */' \
    'export declare const initialized: Promise<void>;' >> "$types"
fi
