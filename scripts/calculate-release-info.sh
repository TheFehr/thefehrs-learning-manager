#!/usr/bin/env bash
set -e

# Positional arguments
GITHUB_REF=$1
RUN_NUMBER=$2
REPOSITORY=$3
OUTPUT_FILE=${4:-/dev/stdout}

# Minimal validation
if [[ -z "$GITHUB_REF" || -z "$RUN_NUMBER" || -z "$REPOSITORY" ]]; then
  echo "Error: Missing required arguments."
  echo "Usage: $0 <github_ref> <run_number> <repository> [output_file]"
  exit 1
fi

# Determine if this is a production release or a beta build
if [[ $GITHUB_REF == refs/tags/v* ]]; then
  IS_BETA=false
  RELEASE_TAG=${GITHUB_REF#refs/tags/}
  VERSION_CLEAN=${RELEASE_TAG#v}
  RELEASE_NAME="Release $RELEASE_TAG"
else
  IS_BETA=true
  # Use package.json version as base for beta
  if [[ -f "package.json" ]]; then
    BASE_VERSION=$(jq -r .version package.json)
  else
    BASE_VERSION="0.0.0"
  fi
  VERSION_CLEAN="$BASE_VERSION-beta.$RUN_NUMBER"
  RELEASE_TAG="latest-beta"
  RELEASE_NAME="Beta Development Build (Run $RUN_NUMBER)"
fi

# Construct URLs
MANIFEST_URL="https://github.com/$REPOSITORY/releases/download/$RELEASE_TAG/module.json"
DOWNLOAD_URL="https://github.com/$REPOSITORY/releases/download/$RELEASE_TAG/thefehrs-learning-manager.zip"

# Write to output file (usually GITHUB_OUTPUT)
{
  echo "VERSION_CLEAN=$VERSION_CLEAN"
  echo "MANIFEST_URL=$MANIFEST_URL"
  echo "DOWNLOAD_URL=$DOWNLOAD_URL"
  echo "IS_BETA=$IS_BETA"
  echo "RELEASE_NAME=$RELEASE_NAME"
  echo "RELEASE_TAG=$RELEASE_TAG"
} >> "$OUTPUT_FILE"

# Log to stdout for visibility in action logs
echo "Computed Release Info:"
echo "  IS_BETA: $IS_BETA"
echo "  RELEASE_TAG: $RELEASE_TAG"
echo "  VERSION_CLEAN: $VERSION_CLEAN"
echo "  RELEASE_NAME: $RELEASE_NAME"
