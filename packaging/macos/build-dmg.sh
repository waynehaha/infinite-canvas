#!/bin/bash

set -euo pipefail

BUNDLE_DIR="${1:?bundle directory is required}"
OUTPUT_DIR="${2:?output directory is required}"
VERSION="${3:?version is required}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
WORK_DIR="$OUTPUT_DIR/macos-dmg-work"
APP="$WORK_DIR/AI创作工作台.app"
STOP_APP="$WORK_DIR/停止AI创作工作台.app"
DMG="$OUTPUT_DIR/AI-Creative-Workbench-v$VERSION-macOS-Apple-Silicon.dmg"

rm -rf "$WORK_DIR" "$DMG"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app" "$STOP_APP/Contents/MacOS" "$STOP_APP/Contents/Resources"
cp -R "$BUNDLE_DIR"/. "$APP/Contents/Resources/app/"
mv "$APP/Contents/Resources/app/launcher" "$APP/Contents/MacOS/ai-creative-workbench"
cp "$APP/Contents/MacOS/ai-creative-workbench" "$STOP_APP/Contents/MacOS/stop-launcher"
cp "$ROOT_DIR/packaging/assets/icons/open.icns" "$APP/Contents/Resources/open.icns"
cp "$ROOT_DIR/packaging/assets/icons/stop.icns" "$STOP_APP/Contents/Resources/stop.icns"

verify_native_launcher() {
    local launcher="$1"
    if ! file "$launcher" | grep -Eq 'Mach-O .* executable'; then
        echo "错误：macOS 包入口不是原生可执行程序：$launcher" >&2
        exit 1
    fi
    if strings "$launcher" | grep -Eiq 'docker compose|Docker Desktop|docker-compose|open -a Docker'; then
        echo "错误：原生 macOS 包混入了 Docker 启动器：$launcher" >&2
        exit 1
    fi
}

verify_native_launcher "$APP/Contents/MacOS/ai-creative-workbench"
verify_native_launcher "$STOP_APP/Contents/MacOS/stop-launcher"

sed "s/__APP_VERSION__/$VERSION/g" "$ROOT_DIR/packaging/macos/App-Info.plist" > "$APP/Contents/Info.plist"
sed "s/__APP_VERSION__/$VERSION/g" "$ROOT_DIR/packaging/macos/Stop-Info.plist" > "$STOP_APP/Contents/Info.plist"
chmod +x "$APP/Contents/MacOS/ai-creative-workbench" "$STOP_APP/Contents/MacOS/stop-launcher"
ln -s /Applications "$WORK_DIR/Applications"
codesign --force --deep --sign - "$APP"
codesign --force --deep --sign - "$STOP_APP"
hdiutil create -volname "AI创作工作台" -srcfolder "$WORK_DIR" -ov -format UDZO "$DMG"
shasum -a 256 "$DMG" > "$DMG.sha256"
echo "$DMG"
