#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${HOME}/.config/galacean-flash-app"
CONFIG_FILE="${CONFIG_DIR}/afts.env"

mkdir -p "${CONFIG_DIR}"
chmod 700 "${CONFIG_DIR}"

printf "请输入 AFTS_BIZSECRET（输入时不回显，不会进入命令历史或仓库）: "
IFS= read -rs SECRET
printf "\n"

if [ -z "${SECRET}" ]; then
  echo "未输入密钥，已取消。" >&2
  exit 1
fi

umask 077
cat > "${CONFIG_FILE}" <<EOF
AFTS_APPID=${AFTS_APPID:-apwallet}
AFTS_BIZKEY=${AFTS_BIZKEY:-asap_serivce}
AFTS_BIZSECRET=${SECRET}
EOF
chmod 600 "${CONFIG_FILE}"

echo "已安全写入 ${CONFIG_FILE}（权限 600，位于仓库外部）。"
echo "接下来可执行: python3 world/scripts/sync-flash-app-cdn-assets.py --apply（需安装 httpx，或使用已安装 httpx 的 Python 解释器）。"
