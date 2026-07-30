#!/bin/zsh

set -u

ACTION="${1:-start}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.desktop.yml"
PROJECT_NAME="infinite-canvas-desktop"
PORT_FILE="$ROOT_DIR/data/.desktop-port"

cd "$ROOT_DIR" || exit 1

docker_command() {
    if command -v docker >/dev/null 2>&1; then
        command -v docker
        return
    fi
    if [ -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]; then
        echo "/Applications/Docker.app/Contents/Resources/bin/docker"
        return
    fi
    return 1
}

install_docker() {
    echo "未检测到 Docker Desktop。"
    read -r "answer?是否自动下载并打开安装包？[Y/n] "
    if [[ "${answer:-Y}" == [nN] ]]; then
        open "https://docs.docker.com/desktop/setup/install/mac-install/"
        return 1
    fi
    local arch download_url installer
    arch="$(uname -m)"
    if [ "$arch" = "arm64" ]; then
        download_url="https://desktop.docker.com/mac/main/arm64/Docker.dmg"
    else
        download_url="https://desktop.docker.com/mac/main/amd64/Docker.dmg"
    fi
    installer="$HOME/Downloads/Docker.dmg"
    echo "正在下载 Docker Desktop，请稍候……"
    if ! curl -fL --progress-bar "$download_url" -o "$installer"; then
        echo "自动下载失败，已打开官方下载页面。"
        open "https://docs.docker.com/desktop/setup/install/mac-install/"
        return 1
    fi
    open "$installer"
    echo "请完成 Docker Desktop 安装并启动它，然后再次双击启动入口。"
    return 1
}

wait_for_docker() {
    local docker_bin="$1"
    if "$docker_bin" info >/dev/null 2>&1; then
        return 0
    fi
    if [ -d "/Applications/Docker.app" ]; then
        echo "正在启动 Docker Desktop……"
        open -a Docker >/dev/null 2>&1 || true
    fi
    local attempt
    for attempt in {1..90}; do
        if "$docker_bin" info >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
    done
    echo "Docker Desktop 尚未准备好，请确认它已经启动后重试。"
    return 1
}

compose() {
    "$DOCKER_BIN" compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

running_port() {
    local published
    if ! compose ps --status running --services 2>/dev/null | grep -qx "app"; then
        return
    fi
    published="$(compose port app 3000 2>/dev/null | head -n 1)"
    if [[ "$published" =~ :([0-9]+)$ ]]; then
        echo "${match[1]}"
    fi
}

port_is_free() {
    ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

choose_port() {
    local saved_port port
    saved_port=""
    if [ -f "$PORT_FILE" ]; then
        saved_port="$(tr -dc '0-9' < "$PORT_FILE")"
    fi
    if [[ "$saved_port" =~ ^[0-9]+$ ]] && port_is_free "$saved_port"; then
        echo "$saved_port"
        return
    fi
    for port in {3001..3099}; do
        if port_is_free "$port"; then
            echo "$port"
            return
        fi
    done
    return 1
}

wait_for_web() {
    local port="$1" attempt
    for attempt in {1..120}; do
        if curl -fsS --max-time 3 "http://127.0.0.1:$port/" >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
    done
    return 1
}

start_services() {
    local port="$1" attempt
    for attempt in 1 2 3; do
        if INFINITE_CANVAS_PORT="$port" compose up -d --build; then
            return 0
        fi
        if [ "$attempt" -lt 3 ]; then
            echo "Docker 下载或构建失败，正在自动重试（$attempt/3）……"
            sleep 5
        fi
    done
    echo "启动失败。请检查网络和 Docker Desktop，稍后再次双击启动入口。"
    return 1
}

DOCKER_BIN="$(docker_command)" || true
if [ -z "$DOCKER_BIN" ]; then
    if [ "$ACTION" = "stop" ]; then
        echo "无限画布没有运行。"
        exit 0
    fi
    install_docker
    exit $?
fi

if [ "$ACTION" = "stop" ]; then
    if "$DOCKER_BIN" info >/dev/null 2>&1; then
        compose stop >/dev/null
    fi
    echo "无限画布已经停止，数据不会被删除。"
    exit 0
fi

wait_for_docker "$DOCKER_BIN" || exit 1

PORT="$(running_port)"
if [ -n "$PORT" ]; then
    echo "无限画布已经在运行，正在打开网页……"
    open "http://127.0.0.1:$PORT/"
    exit 0
fi

PORT="$(choose_port)" || {
    echo "没有找到可用端口，请关闭部分本地服务后重试。"
    exit 1
}

mkdir -p "$ROOT_DIR/data"
echo "$PORT" > "$PORT_FILE"
if [ ! -f "$ROOT_DIR/.env" ]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
fi

echo "正在启动无限画布。首次构建可能需要几分钟……"
start_services "$PORT" || exit 1

if ! wait_for_web "$PORT"; then
    echo "服务启动超时，请把当前窗口内容发给维护人员。"
    compose logs --tail 80
    exit 1
fi

echo "启动成功：http://127.0.0.1:$PORT/"
open "http://127.0.0.1:$PORT/"
