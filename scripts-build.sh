#!/usr/bin/env bash
# 统一构建脚本：把 TMP 指向项目内，避免沙箱环境的临时目录写入限制
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  export PATH="/c/Users/Lenovo/.dsh/dsh-runtimes/dsh-next-primary-runtime/dependencies/node/bin:$PATH"
fi
mkdir -p .tmp
export TMP="$PWD/.tmp" TEMP="$PWD/.tmp" TMPDIR="$PWD/.tmp"
npm run build
