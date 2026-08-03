#!/bin/zsh

set -u

ACTION="${1:-start}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
STATE_DIR="$ROOT_DIR/data/dev-preview"
BACKEND_PID_FILE="$STATE_DIR/backend.pid"
FRONTEND_PID_FILE="$STATE_DIR/frontend.pid"
BACKEND_LOG="$STATE_DIR/backend.log"
FRONTEND_LOG="$STATE_DIR/frontend.log"
BACKEND_URL="http://127.0.0.1:8080/api/health"
FRONTEND_URL="http://127.0.0.1:3000"

mkdir -p "$STATE_DIR"

pid_is_running() {
    local pid="$1"
    [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" >/dev/null 2>&1
}

read_pid() {
    local file="$1"
    [ -f "$file" ] && tr -dc '0-9' < "$file"
}

kill_process_tree() {
    local pid="$1" child
    pid_is_running "$pid" || return 0
    for child in $(pgrep -P "$pid" 2>/dev/null); do
        kill_process_tree "$child"
    done
    kill "$pid" >/dev/null 2>&1 || true
}

stop_owned_process() {
    local name="$1" file="$2" pid
    pid="$(read_pid "$file")"
    if [ -n "$pid" ] && pid_is_running "$pid"; then
        echo "正在停止${name}……"
        kill_process_tree "$pid"
    fi
    rm -f "$file"
}

backend_is_ready() {
    [ "$(curl -fsS --max-time 2 "$BACKEND_URL" 2>/dev/null)" = "ok" ]
}

frontend_is_ready() {
    curl -fsS --max-time 3 "$FRONTEND_URL/" >/dev/null 2>&1 &&
        [ "$(curl -fsS --max-time 3 "$FRONTEND_URL/api/health" 2>/dev/null)" = "ok" ]
}

port_is_busy() {
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

wait_until() {
    local check="$1" attempts="$2"
    while [ "$attempts" -gt 0 ]; do
        "$check" && return 0
        sleep 1
        attempts=$((attempts - 1))
    done
    return 1
}

show_failure() {
    local message="$1"
    echo
    echo "$message"
    echo "后端日志：$BACKEND_LOG"
    echo "前端日志：$FRONTEND_LOG"
    return 1
}

if [ "$ACTION" = "stop" ]; then
    stop_owned_process "前端预览" "$FRONTEND_PID_FILE"
    stop_owned_process "后端预览" "$BACKEND_PID_FILE"
    if frontend_is_ready || backend_is_ready; then
        echo "检测到由其他方式启动的开发服务，本入口未结束它们。"
    else
        echo "开发预览已经停止，数据不会被删除。"
    fi
    exit 0
fi

if [ "$ACTION" != "start" ]; then
    echo "不支持的操作：$ACTION"
    exit 1
fi

if frontend_is_ready; then
    echo "开发预览已经在运行，正在打开网页……"
    open "$FRONTEND_URL/"
    exit 0
fi

for command_name in go curl lsof; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        show_failure "缺少开发工具：$command_name"
        exit 1
    fi
done

if ! command -v bun >/dev/null 2>&1 && ! command -v npm >/dev/null 2>&1; then
    show_failure "缺少 Bun 或 npm，请先安装 Node.js 或 Bun。"
    exit 1
fi

if port_is_busy 8080 && ! backend_is_ready; then
    show_failure "8080 端口已被其他程序占用，请关闭占用程序后重试。"
    exit 1
fi
if port_is_busy 3000; then
    show_failure "3000 端口已被其他程序占用，请关闭占用程序后重试。"
    exit 1
fi

cd "$ROOT_DIR" || exit 1
if [ ! -f "$ROOT_DIR/.env" ]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
fi

if ! backend_is_ready; then
    echo "正在启动后端预览……"
    : > "$BACKEND_LOG"
    nohup go run . >> "$BACKEND_LOG" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    if ! wait_until backend_is_ready 60; then
        stop_owned_process "后端预览" "$BACKEND_PID_FILE"
        show_failure "后端预览启动失败。"
        exit 1
    fi
fi

if [ ! -x "$ROOT_DIR/web/node_modules/.bin/next" ]; then
    echo "首次运行，正在安装前端依赖……"
    if command -v bun >/dev/null 2>&1; then
        (cd "$ROOT_DIR/web" && bun install) || {
            show_failure "前端依赖安装失败。"
            exit 1
        }
    else
        (cd "$ROOT_DIR/web" && npm install --no-package-lock) || {
            show_failure "前端依赖安装失败。"
            exit 1
        }
    fi
fi

echo "正在启动网页预览……"
: > "$FRONTEND_LOG"
cd "$ROOT_DIR/web" || exit 1
if command -v bun >/dev/null 2>&1; then
    nohup bun run dev >> "$FRONTEND_LOG" 2>&1 &
else
    nohup npm run dev >> "$FRONTEND_LOG" 2>&1 &
fi
echo $! > "$FRONTEND_PID_FILE"

if ! wait_until frontend_is_ready 90; then
    stop_owned_process "前端预览" "$FRONTEND_PID_FILE"
    stop_owned_process "后端预览" "$BACKEND_PID_FILE"
    show_failure "网页预览启动失败。"
    exit 1
fi

echo "开发预览启动成功：$FRONTEND_URL/"
open "$FRONTEND_URL/"
