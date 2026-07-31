#!/bin/zsh

set -u

ACTION="${1:-start}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.desktop.yml"
PROJECT_NAME="infinite-canvas-desktop"
PORT_FILE="$ROOT_DIR/data/.desktop-port"
IMAGE_NAME="ghcr.io/waynehaha/infinite-canvas:desktop-latest"
LOG_DIR="$ROOT_DIR/data/launcher-logs"

cd "$ROOT_DIR" || exit 1
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/macos-$(date '+%Y%m%d-%H%M%S').log"
exec > >(tee -a "$LOG_FILE") 2>&1

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

image_exists() {
    "$DOCKER_BIN" image inspect "$IMAGE_NAME" >/dev/null 2>&1
}

pull_image() {
    local attempt pull_error output
    pull_error=""
    echo "正在获取最新版 AI 创作工作台，首次下载约 120MB……"
    for attempt in 1 2 3; do
        output="$(compose pull app 2>&1)"
        if [ $? -eq 0 ]; then
            [ -n "$output" ] && echo "$output"
            return 0
        fi
        echo "$output"
        pull_error="$output"
        if [ "$attempt" -lt 3 ]; then
            echo "下载中断，正在自动重试（$attempt/3）……"
            sleep 5
        fi
    done
    if image_exists; then
        echo "暂时无法连接 GitHub，已改用电脑中现有的版本。"
        return 0
    fi
    if [[ "$pull_error" == *"denied"* || "$pull_error" == *"unauthorized"* ]]; then
        echo "发布镜像尚未开放下载，请联系维护人员更新发布状态。"
        echo "诊断日志已保存到：$LOG_FILE"
        return 1
    fi
    echo "无法从 GitHub 下载 AI 创作工作台。"
    echo "请确认网络可以访问 ghcr.io，或在 Docker Desktop 中配置代理后重试。"
    echo "诊断日志已保存到：$LOG_FILE"
    return 1
}

start_services() {
    local port="$1" attempt
    for attempt in 1 2; do
        if INFINITE_CANVAS_PORT="$port" compose up -d; then
            return 0
        fi
        if [ "$attempt" -lt 2 ]; then
            echo "服务启动中断，正在自动重试……"
            sleep 3
        fi
    done
    echo "AI 创作工作台启动失败。诊断日志已保存到：$LOG_FILE"
    compose logs --tail 80 || true
    return 1
}

DOCKER_BIN="$(docker_command)" || true
if [ -z "$DOCKER_BIN" ]; then
    if [ "$ACTION" = "stop" ]; then
        echo "AI 创作工作台没有运行。"
        exit 0
    fi
    install_docker
    exit $?
fi

if [ "$ACTION" = "stop" ]; then
    if "$DOCKER_BIN" info >/dev/null 2>&1; then
        compose stop >/dev/null
    fi
    echo "AI 创作工作台已经停止，数据不会被删除。"
    exit 0
fi

wait_for_docker "$DOCKER_BIN" || exit 1

PORT="$(running_port)"
if [ -n "$PORT" ]; then
    echo "AI 创作工作台已经在运行，正在打开网页……"
    open "http://127.0.0.1:$PORT/"
    exit 0
fi

mkdir -p "$ROOT_DIR/data"
if [ ! -f "$ROOT_DIR/.env" ]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
fi
pull_image || exit 1

PORT="$(choose_port)" || {
    echo "没有找到可用端口，请关闭部分本地服务后重试。"
    exit 1
}
echo "$PORT" > "$PORT_FILE"

echo "正在启动 AI 创作工作台……"
start_services "$PORT" || exit 1

if ! wait_for_web "$PORT"; then
    echo "服务启动超时，诊断日志已保存到：$LOG_FILE"
    compose logs --tail 80
    exit 1
fi

echo "AI 创作工作台启动成功：http://127.0.0.1:$PORT/"
open "http://127.0.0.1:$PORT/"
