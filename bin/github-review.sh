#!/usr/bin/env bash

set -euo pipefail

usage() {
    cat <<EOF
Verify a Safe singleton factory deployment PR

This tool wraps the NPM script 'verify' and:
1. Parses the RPC URL from a GitHub PR and referenced issue
2. Automatically approves the GitHub PR

USAGE
    github-review.sh PR

ARGUMENTS
    PR          The GitHub PR number to review.

EXAMPLES
    Automatically review Safe singleton factory deployment GitHub PR #42:
        github-review.sh 42
EOF
}

if [[ -f .env ]]; then
    echo "ERROR: Please remove '.env' file as it interferes with this script" 1>&2
    exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
    echo "ERROR: Dirty Git index, please commit all changes before continuing" 1>&2
    exit 1
fi
if ! command -v gh &> /dev/null; then
    echo "ERROR: Please install the 'gh' GitHub CLI" 1>&2
    exit 1
fi

pr=0
case $# in
    1)
        if ! [[ $1 =~ ^[0-9]+$ ]]; then
            echo "ERROR: $1 is not a valid GitHub PR number" 1>&2
            usage
            exit 1
        fi
        pr=$1
        ;;
    *)
        usage
        exit 1
        ;;
esac

echo "### Fetching RPC URL"
issue="$(gh pr view $pr --json body --jq .body | sed -n 's/^.*Fixes #\([0-9][0-9]*\).*$/\1/p' | head -1)"
rpc="$(gh issue view $issue | grep -E -o 'https?://[^ ]+' -m 1 | head -1)"
files="$(gh pr view $pr --json files --jq [.files[].path])"
echo "=> #$issue: $rpc"
echo "$files" | jq -r '.[] | "    - \(.)"'

echo "### Verifying Deployment Artifacts"
gh pr diff $pr --patch | git apply --include 'artifacts/**'
RPC="$rpc" yarn -s verify
git clean -fd -- artifacts

echo "### Approving PR"
approve=1
if [[ -n "$(git status --porcelain)" ]]; then
    echo "WARN: This PR modified an existing deployment" 1>&2
    git restore -- artifacts
    approve=0
fi
if [[ "$(echo "$files" | jq -r .[] | grep -E '^artifacts/[0-9]+/deployment.json$' | wc -l)" -ne 1 ]]; then
    echo "WARN: Not exactly one deployment artifact changed"
    approve=0
fi
if [[ "$(echo "$files" | jq length)" -ne 1 ]]; then
    echo "WARN: Non deployment files changed"
    approve=0
fi
if [[ $approve -eq 1 ]]; then
    gh pr review $pr --approve
else
    echo "WARN: Cannot automatically approve"
fi
