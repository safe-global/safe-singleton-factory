#!/bin/bash

# depending on the os/platform - download eth-rpc and revive-dev-node into .bin folder

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m | tr '[:upper:]' '[:lower:]')

REVIVE_NODE=revive-dev-node-${OS}-${ARCH}
ETH_RPC=eth-rpc-${OS}-${ARCH}
RESOLC_BIN=""
BIN_DIR=bin

# NODES_VERSION=17037231207
NODES_VERSION=${NODES_VERSION:-'latest'}
RESOLC_VERSION=${RESOLC_VERSION:-'v0.3.0'}

echo "downloading nodes version: $NODES_VERSION"
echo "resolc version: $RESOLC_VERSION"

checksums_url="https://github.com/paritytech/hardhat-polkadot/releases/download/nodes-${NODES_VERSION}/checksums.txt"
resolc_checksums_url="https://github.com/paritytech/revive/releases/download/${RESOLC_VERSION}/checksums.txt"
echo "checksums_url: $checksums_url"
echo "resolc_checksums_url: $resolc_checksums_url"
curl -sL ${checksums_url} -o /tmp/node-${NODES_VERSION}-checksums.txt
curl -sL ${resolc_checksums_url} -o /tmp/resolc-${RESOLC_VERSION}-checksums.txt
CURRENT_NODES_CHECKSUM=$(cat ${BIN_DIR}/checksums.txt 2>/dev/null | tr -s ' ' ) || echo ""
NEW_NODES_CHECKSUM=$(cat /tmp/node-${NODES_VERSION}-checksums.txt | tr -s ' ')
CURRENT_RESOLC_CHECKSUM=$(cat ${BIN_DIR}/resolc-checksums.txt 2>/dev/null | tr -s ' ' ) || echo ""
NEW_RESOLC_CHECKSUM=$(cat /tmp/resolc-${RESOLC_VERSION}-checksums.txt | tr -s ' ')

mkdir -p ${BIN_DIR}

if [ "$CURRENT_NODES_CHECKSUM" != "$NEW_NODES_CHECKSUM" ]; then
  dev_node_url="https://github.com/paritytech/hardhat-polkadot/releases/download/nodes-${NODES_VERSION}/${REVIVE_NODE}"
  eth_rpc_url="https://github.com/paritytech/hardhat-polkadot/releases/download/nodes-${NODES_VERSION}/${ETH_RPC}"
  echo "dev_node_url: $dev_node_url"
  echo "eth_rpc_url: $eth_rpc_url"
  curl -L ${dev_node_url} -o ${BIN_DIR}/revive-dev-node
  curl -L ${eth_rpc_url} -o ${BIN_DIR}/eth-rpc
  cp /tmp/node-${NODES_VERSION}-checksums.txt ${BIN_DIR}/checksums.txt
else
  echo "Checksums match, skipping download"
fi

if [ "$CURRENT_RESOLC_CHECKSUM" != "$NEW_RESOLC_CHECKSUM" ]; then
if [ "$OS" == "darwin" ]; then
    RESOLC_BIN="universal-apple-darwin"
  elif [ "$OS" == "linux" ]; then
    RESOLC_BIN="x86_64-unknown-linux-musl"
  else
    echo "Unsupported OS: $OS"
    exit 1
  fi

  if [[ "$OS" == "linux" && "$ARCH" != "x86_64" ]]; then
    echo "Unsupported architecture: $ARCH for linux"
    exit 1
  fi

  curl -L https://github.com/paritytech/revive/releases/download/${RESOLC_VERSION}/resolc-${RESOLC_BIN} -o ${BIN_DIR}/resolc
  cp /tmp/resolc-${RESOLC_VERSION}-checksums.txt ${BIN_DIR}/resolc-checksums.txt
else
  echo "Resolc checksums match, skipping download"
fi

rm /tmp/node-${NODES_VERSION}-checksums.txt
rm /tmp/resolc-${RESOLC_VERSION}-checksums.txt

chmod -R 755 ${BIN_DIR}