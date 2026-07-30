#!/bin/zsh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT_DIR/scripts/desktop/macos-launcher.sh" start
STATUS=$?
if [ $STATUS -ne 0 ]; then
    echo
    read -r "reply?启动未完成，按回车键关闭窗口。"
fi
exit $STATUS
