#!/usr/bin/env bash
set -euo pipefail
# Scarica il runtime Node.js ufficiale per macOS Apple Silicon e lo
# prepara come "sidecar" Tauri, cioe' l'eseguibile che l'app nativa
# porta dentro di se' per far girare il server (src/) senza bisogno che
# sul Mac dell'utente sia installato nient'altro.
#
# La versione LTS viene risolta automaticamente da nodejs.org: non c'e'
# un numero di versione da tenere aggiornato a mano in questo script.
#
# Usato da .github/workflows/release.yml, sempre su runner macOS arm64
# (stessa architettura dei due Mac di destinazione).

TARGET_TRIPLE="aarch64-apple-darwin"
DEST="src-tauri/binaries/node-${TARGET_TRIPLE}"

NODE_VERSION=$(curl -sS https://nodejs.org/dist/index.json \
  | python3 -c "import json,sys; data=json.load(sys.stdin); print(next(d['version'] for d in data if d.get('lts')))")

echo "Node LTS risolta: ${NODE_VERSION}"

TMP_DIR=$(mktemp -d)
curl -sSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-arm64.tar.gz" \
  -o "${TMP_DIR}/node.tar.gz"
tar -xzf "${TMP_DIR}/node.tar.gz" -C "${TMP_DIR}"

mkdir -p src-tauri/binaries
cp "${TMP_DIR}"/node-*-darwin-arm64/bin/node "${DEST}"
chmod +x "${DEST}"
rm -rf "${TMP_DIR}"

echo "Sidecar pronto: ${DEST}"
