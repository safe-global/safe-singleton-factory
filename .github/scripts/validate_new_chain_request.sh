#!/usr/bin/env bash

# This script is used to validate a GitHub issue for a new chain request.
# What it does:
# 1. Extracts the RPC URL from the issue body
# 2. Extracts the chain ID from the RPC URL
# 3. Checks if the chain ID is in chainlist
# 4. Checks if the factory is already deployed
# 5. Checks if the deployer address is pre-funded
#
# If any of the above checks fails, the script will exit with an error code and set an environment variable
# `COMMENT_OUTPUT` with an error message. The GitHub action will then use this variable to post a comment.
# For the above reason, the script needs to be executed in the GitHub's action shell, for example:
# ```
# . ./.github/scripts/validate_new_chain_request.sh
# ```
#
# The script expects the following environment variables to be set:
# - `ISSUE_BODY` - the body of the issue
# - `GITHUB_ENV` - the GitHub environment file
# - `FACTORY_ADDRESS` (optional) - the address of the factory contract
# - `FACTORY_DEPLOYER_ADDRESS` (optional) - the address of the factory deployer
# - `FACTORY_BYTECODE` (optional) - the bytecode of the factory contract


# Check if we are in "debug" mode - this makes it easier to test changes to this
# script without needing to manually populate the environment variables.
if [ "$1" == "--debug" ]; then
    NUMBER="$2"
    ISSUE_BODY="$(gh issue view $2 --json body --jq .body)"
    GITHUB_ENV="/dev/stdout"
fi

FACTORY_ADDRESS="${FACTORY_ADDRESS:-0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7}"
FACTORY_BYTECODE="${FACTORY_BYTECODE:-0x604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3}"
FACTORY_DEPLOYER_ADDRESS="${FACTORY_DEPLOYER_ADDRESS:-0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37}"

ERROR_MSG_RPC_FAILURE=\
"**⛔️ Error:**<br>"\
"Could not fetch the chain ID from the RPC URL.<br>"\
"Either the RPC URL is missing, or the RPC is not responding.<br>"\
"**Make sure your issue follows the issue template and includes the RPC URL.**<br>"\
":sparkles: You can edit the issue to trigger the check again. :sparkles:"
ERROR_MSG_CHAINLIST_FAILURE=\
"**⛔️ Error:**<br>"\
"Couldn't find the chain in the chainlist. Please make sure it's added to the chainlist.<br>"\
"For more information on how to add a chain, please refer to the [chainlist repository](https://github.com/ethereum-lists/chains).<br>"\
":sparkles: You can edit the issue to trigger the check again. :sparkles:"
ERROR_MSG_PREFUND_CHECK=\
"**⛔️ Error:**<br>"\
"There was an error while estimating the deployment transaction and checking the pre-fund. Please make sure that the RPC URL is valid and reachable.<br>"\
":sparkles: You can edit the issue to trigger the check again. :sparkles:"
SUCCESS_MSG=\
"**✅ Success:**<br>"\
"The issue description is valid:<br>"\
"- The RPC URL is valid<br>"\
"- The chain is in the chainlist<br>"\
"- The deployer address is pre-funded<br>"\
":sparkles: The team will be in touch with you soon :sparkles:"
ADDRESS_NOT_PREFUNDED_ERR_MSG() {
    echo "**💸 Pre-fund needed:**<br/>We need a pre-fund to deploy the factory. Please send $1 wei to $FACTORY_DEPLOYER_ADDRESS and check the checkbox in the issue."
}
FACTORY_ALREADY_DEPLOYED_ERR_MSG="**⛔️ Error:**<br/>The factory is already deployed. Please use the existing factory at $FACTORY_ADDRESS."


trim() {
    # 3.5.3 Shell Parameter Expansion at https://www.gnu.org/software/bash/manual/bash.html
    local var="$*"
    # remove leading whitespace characters
    var="${var#"${var%%[![:space:]]*}"}"
    # remove trailing whitespace characters
    var="${var%"${var##*[![:space:]]}"}"
    echo "$var"
}

report_error() {
    echo "COMMENT_OUTPUT=$1" >> $GITHUB_ENV
    echo "LABEL_OPERATION=--remove-label" >> $GITHUB_ENV
    exit 1
}

rpc_url=$(echo "$ISSUE_BODY" | grep -E -o 'https?://[^ ]+' -m 1 | head -1)

if [ -z "$rpc_url" ]; then
    echo "Failed to parse RPC URL from issue body"
    report_error "$ERROR_MSG_RPC_FAILURE"
fi

rpc_url="$(trim "$rpc_url")"
echo "Extracted RPC url: $rpc_url. Trying to get the chain id..."
response=$(curl -s "$rpc_url" --location --header \
    'Content-Type: application/json' --data '{
                          "jsonrpc": "2.0",
                          "method": "eth_chainId",
                          "params": [],
                          "id": 5413
}')


if jq -e . >/dev/null 2>&1 <<< "$response"; then
  chain_id=$(( $(echo "$response" | jq -r '.result') ))
else
    echo "Failed to parse JSON, or got false/null"
    report_error "$ERROR_MSG_RPC_FAILURE"
fi


factory_code=$(curl -s "$rpc_url" --location --header \
  'Content-Type: application/json' --data '{
                "jsonrpc": "2.0",
                "method": "eth_getCode",
                "params": ["'"$FACTORY_ADDRESS"'", "latest"],
                "id": "0x5afe"
            }')

if jq -e . >/dev/null 2>&1 <<< "$factory_code"; then
  factory_code=$(jq -r '.result' <<< "$factory_code")

  if [ "$factory_code" != "0x" ] && [ "$factory_code" != "" ]; then
    report_error "$FACTORY_ALREADY_DEPLOYED_ERR_MSG"
  fi
fi

echo "$chain_id from the RPC URL is valid. Checking the chain in chainlist..."
chainlist_url="https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-$chain_id.json"

chainlist_status_code=$(trim "$(curl -sLI "$chainlist_url" -o /dev/null -w '%{http_code}\n' -s)")

if [ "$chainlist_status_code" == "404" ]; then
  echo "Chain $chain_id is not in chainlist."
  report_error "$ERROR_MSG_CHAINLIST_FAILURE"
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

response=$(curl -s "$rpc_url" --location --header 'Content-Type: application/json' --data "$json_request")

if jq -e . >/dev/null 2>&1 <<< "$response"; then
  gas_price=$(jq -r '.[0].result' <<< "$response")
  echo "Current gas price: $gas_price"
  gas_limit=$(jq -r '.[1].result' <<< "$response")
  echo "Estimated deployment gas limit: $gas_limit"

  if [[ "$gas_price" == "null" || "$gas_limit" == "null" ]]; then
    report_error "$ERROR_MSG_PREFUND_CHECK"
  fi

  # We multiply the gas limit by 1.4, just like the deployment script does it
  gas_limit=$(( gas_limit * 14 / 10 ))
  expected_prefund=$((gas_limit * gas_price))

  echo "Expected pre-fund: $expected_prefund"

  deployer_address_balance=$(curl -s "$rpc_url" --location --header \
  'Content-Type: application/json' --data '{
                "jsonrpc": "2.0",
                "method": "eth_getBalance",
                "params": ["'$FACTORY_DEPLOYER_ADDRESS'", "latest"],
                "id": 5413
            }')

  if jq -e . >/dev/null 2>&1 <<< "$deployer_address_balance"; then
    deployer_address_balance=$(( $(echo "$deployer_address_balance" | jq -r '.result') ))
    echo "Deployer address balance: $deployer_address_balance"

    if [ "$deployer_address_balance" -lt "$expected_prefund" ]; then
      report_error "$(ADDRESS_NOT_PREFUNDED_ERR_MSG $expected_prefund)"
    fi
  else
    report_error "$ERROR_MSG_PREFUND_CHECK"
  fi
else
  report_error "$ERROR_MSG_PREFUND_CHECK"
fi

echo "COMMENT_OUTPUT=$SUCCESS_MSG" >> $GITHUB_ENV
echo "LABEL_OPERATION=--add-label" >> $GITHUB_ENV
