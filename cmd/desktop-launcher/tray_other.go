//go:build !darwin && !windows

package main

import "errors"

type trayRuntime struct {
	appDir    string
	dataDir   string
	statePath string
	options   launcherOptions
}

func runTray(trayRuntime) error {
	return errors.New("当前系统不支持桌面托盘，请使用 --no-tray 启动")
}
