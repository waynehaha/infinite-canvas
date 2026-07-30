#!/bin/zsh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT_DIR/scripts/desktop/macos-launcher.sh" stop
STATUS=$?
if [ $STATUS -ne 0 ]; then
    echo
    read -r "reply?停止未完成，按回车键关闭窗口。"
fi
exit $STATUS
