#!/usr/bin/env bash

trim() {
    # 3.5.3 Shell Parameter Expansion at https://www.gnu.org/software/bash/manual/bash.html
    local var="$*"
    # remove leading whitespace characters
    var="${var#"${var%%[![:space:]]*}"}"
    # remove trailing whitespace characters
    var="${var%"${var##*[![:space:]]}"}"
    echo "$var"
}

rpc_url=$(echo $ISSUE_BODY | egrep -o 'https?://[^ ]+' -m 1 | head -1)

if [ -z "$rpc_url" ]; then
    echo "COMMENT_OUTPUT=\"$ERROR_MSG_RPC_FAILURE\"" >> $GITHUB_ENV
    exit 1
fi

rpc_url="$(trim $rpc_url)"
echo "Extracted RPC url: $rpc_url. Trying to get the chain id..."
response=$(curl $rpc_url --location --header \
    'Content-Type: application/json' --data '{
                          "jsonrpc": "2.0",
                          "method": "eth_chainId",
                          "params": [],
                          "id": 5413
}')

if jq -e . >/dev/null 2>&1 <<< "$response"; then
    chain_id=$(echo "$response" | jq -r '.result')
    chain_id=${chain_id#0x}
    chain_id=$((16#$chain_id))
    echo "chain_id=$chain_id" >> $GITHUB_OUTPUT
    echo "rpc_url=$rpc_url" >> $GITHUB_OUTPUT
else
    echo "Failed to parse JSON, or got false/null"
    echo "COMMENT_OUTPUT=\"$ERROR_MSG_RPC_FAILURE\"" >> $GITHUB_ENV
    exit 1
fi


factory_code=$(curl $RPC_URL --location --header \
  'Content-Type: application/json' --data '{
                "jsonrpc": "2.0",
                "method": "eth_getCode",
                "params": ["'$FACTORY_ADDRESS'", "latest"],
                "id": "0x5afe"
            }')

if jq -e . >/dev/null 2>&1 <<< "$factory_code"; then
  factory_code=$(jq -r '.result' <<< "$factory_code")

  if [ "$factory_code" != "0x" ]; then
    echo "COMMENT_OUTPUT=\"**⛔️ Error:**<br/>The factory is already deployed. Please use the existing factory at $FACTORY_ADDRESS.\"" >> $GITHUB_ENV
    exit 1
  fi
fi

echo "$CHAIN_ID from the RPC URL is valid. Checking the chain in chainlist..."
chainlist_url="https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-$CHAIN_ID.json"

chainlist_status_code=$(trim "$(curl -LI $chainlist_url -o /dev/null -w '%{http_code}\n' -s)")

if [ "$chainlist_status_code" == "404" ]; then
  echo "Chain $CHAIN_ID is not in chainlist."
  echo "COMMENT_OUTPUT=\"$ERROR_MSG_CHAINLIST_FAILURE\"" >> $GITHUB_ENV
  exit 1
fi

json_request='[
    {
        "jsonrpc": "2.0",
        "method": "eth_gasPrice",
        "params": [],
        "id": 1
    },
    {
        "jsonrpc": "2.0",
        "method": "eth_estimateGas",
        "params": [
            {
                "from": "'$FACTORY_DEPLOYER_ADDRESS'",
                "data": "'$FACTORY_BYTECODE'"
            }
        ],
        "id": 2
    }
]'

response=$(curl "$RPC_URL" --location --header 'Content-Type: application/json' --data "$json_request")

if jq -e . >/dev/null 2>&1 <<< "$response"; then
  gas_price=$(jq -r '.[0].result' <<< "$response")
  echo "Current gas price: $gas_price"
  gas_limit=$(jq -r '.[1].result' <<< "$response")
  echo "Estimated deployment gas limit: $gas_limit"

  if [[ "$gas_price" == "null" || "$gas_limit" == "null" ]]; then
    echo "COMMENT_OUTPUT=\"$ERROR_MSG_PREFUND_CHECK\"" >> $GITHUB_ENV
    exit 1
  fi

  # We multiply the gas limit by 1.4, just like the deployment script does it
  gas_limit=$(( $gas_limit * 14 / 10 ))
  expected_prefund=$(($gas_limit * $gas_price))

  echo "Expected pre-fund: $expected_prefund"

  deployer_address_balance=$(curl $RPC_URL --location --header \
  'Content-Type: application/json' --data '{
                "jsonrpc": "2.0",
                "method": "eth_getBalance",
                "params": ["'$FACTORY_DEPLOYER_ADDRESS'", "latest"],
                "id": 5413
            }')

  if jq -e . >/dev/null 2>&1 <<< "$deployer_address_balance"; then
    deployer_address_balance=$(jq -r '.result' <<< "$deployer_address_balance")
    deployer_address_balance=${deployer_address_balance#0x}
    deployer_address_balance=$((16#$deployer_address_balance))
    echo "Deployer address balance: $deployer_address_balance"

    if [ "$deployer_address_balance" -lt "$expected_prefund" ]; then
      echo "COMMENT_OUTPUT=\"**⛔️ Error:**<br/>The deployer address is not pre-funded. Please send $expected_prefund wei to $FACTORY_DEPLOYER_ADDRESS and try again.\"" >> $GITHUB_ENV
      exit 1
    fi
  else
    echo "COMMENT_OUTPUT=\"$ERROR_MSG_PREFUND_CHECK\"" >> $GITHUB_ENV
    exit 1
  fi
else
  echo "COMMENT_OUTPUT=\"$ERROR_MSG_PREFUND_CHECK\"" >> $GITHUB_ENV
  exit 1
fi