#!/usr/bin/env bash
set -euo pipefail

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

# Ensure package.json exists
if [[ ! -f "package.json" ]]; then
  echo "Error: package.json not found."
  exit 1
fi

# Ensure jq is available
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required but not installed."
  exit 1
fi

# Determine if this is a production release or a beta build
if [[ $GITHUB_REF == refs/tags/v* ]]; then
  IS_BETA=false
  RELEASE_TAG=${GITHUB_REF#refs/tags/}
  VERSION_RAW=${RELEASE_TAG#v}

  # Validate tag version with strict semver regex
  if [[ ! "$VERSION_RAW" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[A-Za-z0-9.-]+)?(\+[A-Za-z0-9.-]+)?$ ]]; then
    echo "Error: Tag version $VERSION_RAW is not a valid semver string (leading zeros are not allowed)."
    exit 1
  fi

  # Core version for consistency
  VERSION_CLEAN="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.${BASH_REMATCH[3]}"
  RELEASE_NAME="Release $RELEASE_TAG"
else
  IS_BETA=true
  # Extract version for beta build
  BASE_VERSION=$(jq -r .version package.json)
  
  if [[ -z "$BASE_VERSION" || "$BASE_VERSION" == "null" ]]; then
    echo "Error: Could not determine version from package.json."
    exit 1
  fi

  # Validate BASE_VERSION with strict semver regex (no leading zeros in numeric identifiers)
  if [[ ! "$BASE_VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[A-Za-z0-9.-]+)?(\+[A-Za-z0-9.-]+)?$ ]]; then
    echo "Error: BASE_VERSION $BASE_VERSION is not a valid semver string (leading zeros are not allowed)."
    exit 1
  fi

  # Strip existing prerelease/build metadata for a clean beta tag
  CORE_VERSION="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.${BASH_REMATCH[3]}"
  VERSION_CLEAN="$CORE_VERSION-beta.$RUN_NUMBER"
  RELEASE_TAG="latest-beta"
  RELEASE_NAME="Beta Development Build (Run $RUN_NUMBER)"
fi

# Derive artifact name from package.json
PACKAGE_NAME=$(jq -r .name package.json)
if [[ -z "$PACKAGE_NAME" || "$PACKAGE_NAME" == "null" ]]; then
  echo "Error: Could not determine package name from package.json."
  exit 1
fi

# Construct URLs
MANIFEST_URL="https://github.com/$REPOSITORY/releases/download/$RELEASE_TAG/module.json"
DOWNLOAD_URL="https://github.com/$REPOSITORY/releases/download/$RELEASE_TAG/${PACKAGE_NAME}.zip"

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
