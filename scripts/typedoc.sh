#!/bin/bash
set -euo pipefail

# generate declaration files via typedoc

ENGINE_PATH="$(pwd)"
TYPEDOC="typedoc@0.23.28"

# Set default output directory if not provided
OUTPUT_DIR=${1:-./api}

for directory in ${ENGINE_PATH}/packages/*
do
  if [ -d $directory ]; then
    bn=`basename $directory`;
    echo "typedoc compiling $directory"
    pnpx $TYPEDOC --version
    pnpx $TYPEDOC --json ${OUTPUT_DIR}/$bn.json --tsconfig $directory/tsconfig.json $directory/src/index.ts;
    SUCCESS+=("${OUTPUT_DIR}/$bn.json")
  fi
done

echo "============"
for f in ${SUCCESS[@]}; do
  echo "[typedoc] $f";
done
echo "============"