//go:build darwin || windows

package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"sync/atomic"

	"github.com/getlantern/systray"
)

const trayTemplateIconBase64 = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAARElEQVR4nO3WSwoAIAhF0bv/Tb9GzftICN0DDRWh1EBSQ1k8VXH9Cpi2A6rzxALwCvARYhvGQYSj+N7xFsz3/wFJvDAAvFmHeT3wja0AAAAASUVORK5CYII="

type trayRuntime struct {
	appDir    string
	dataDir   string
	statePath string
	options   launcherOptions
}

func runTray(runtime trayRuntime) error {
	icon, err := os.ReadFile(filepath.Join(runtime.appDir, "open.ico"))
	if err != nil {
		return fmt.Errorf("无法读取菜单栏图标：%w", err)
	}
	templateIcon, err := base64.StdEncoding.DecodeString(trayTemplateIconBase64)
	if err != nil {
		return fmt.Errorf("无法读取菜单栏模板图标：%w", err)
	}
	systray.Run(func() {
		systray.SetTemplateIcon(templateIcon, icon)
		systray.SetTooltip(appName)

		statusItem := systray.AddMenuItem("服务运行中", "")
		statusItem.Disable()
		openItem := systray.AddMenuItem("打开工作台", "在浏览器中打开工作台")
		restartItem := systray.AddMenuItem("重启服务", "保持工作台地址不变并重启本地服务")
		systray.AddSeparator()
		quitItem := systray.AddMenuItem("退出并停止服务", "退出软件并停止本地服务")

		go handleTrayActions(runtime, statusItem, openItem, restartItem, quitItem)
	}, nil)
	return nil
}

func handleTrayActions(runtime trayRuntime, statusItem, openItem, restartItem, quitItem *systray.MenuItem) {
	var busy atomic.Bool
	for {
		select {
		case <-openItem.ClickedCh:
			if err := openRunningWorkbench(runtime.statePath); err != nil {
				showMessage(appName, err.Error(), true)
			}
		case <-restartItem.ClickedCh:
			if !busy.CompareAndSwap(false, true) {
				continue
			}
			if !confirmServiceRestart(appName, "重启会短暂关闭本地服务，正在提交或生成中的任务可能中断。确认当前没有重要任务后再继续。", "重启") {
				busy.Store(false)
				continue
			}
			statusItem.SetTitle("正在重启服务...")
			openItem.Disable()
			restartItem.Disable()
			quitItem.Disable()
			err := withLauncherLock(runtime.dataDir, func() error {
				return restartServices(runtime.appDir, runtime.dataDir, runtime.statePath, runtime.options)
			})
			if err == nil {
				statusItem.SetTitle("服务运行中")
				_ = openRunningWorkbench(runtime.statePath)
			} else {
				statusItem.SetTitle("服务异常")
				showMessage(appName, "重启失败："+err.Error(), true)
			}
			openItem.Enable()
			restartItem.Enable()
			quitItem.Enable()
			busy.Store(false)
		case <-quitItem.ClickedCh:
			if !busy.CompareAndSwap(false, true) {
				continue
			}
			if !confirmQuit(appName, "退出会停止本地服务，正在进行的生成任务可能中断。是否继续？") {
				busy.Store(false)
				continue
			}
			statusItem.SetTitle("正在退出...")
			openItem.Disable()
			restartItem.Disable()
			quitItem.Disable()
			if err := withLauncherLock(runtime.dataDir, func() error {
				return stopServices(runtime.statePath, true, false)
			}); err != nil {
				statusItem.SetTitle("服务异常")
				showMessage(appName, "退出失败："+err.Error(), true)
				openItem.Enable()
				restartItem.Enable()
				quitItem.Enable()
				busy.Store(false)
				continue
			}
			systray.Quit()
			return
		}
	}
}
