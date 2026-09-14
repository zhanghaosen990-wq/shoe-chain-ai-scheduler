#!/bin/zsh
set -eu
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_NODE="/Users/a1/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

if [ ! -x "$RUNTIME_NODE" ]; then
  echo "未找到原型运行所需的 Node 环境。请在 Codex 桌面应用中打开本项目后再试。"
  read -k 1 "?按任意键关闭"
  exit 1
fi

cd "$PROJECT_DIR"
echo "鞋链智排原型正在启动……"
echo "请在浏览器打开：http://localhost:4173"
echo "保持此窗口打开；按 Control + C 可停止服务。"
"$RUNTIME_NODE" app/server.js
