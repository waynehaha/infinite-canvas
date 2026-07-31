//go:build !windows

package main

import (
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"syscall"
	"time"
)

func configureDetachedProcess(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}

func processAlive(pid int) bool {
	return pid > 0 && syscall.Kill(pid, 0) == nil
}

func terminateProcessTree(pid int) error {
	if !processAlive(pid) {
		return nil
	}
	_ = syscall.Kill(-pid, syscall.SIGTERM)
	for attempt := 0; attempt < 50; attempt++ {
		if !processAlive(pid) {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	if err := syscall.Kill(-pid, syscall.SIGKILL); err != nil && processAlive(pid) {
		return fmt.Errorf("无法停止进程 %d：%w", pid, err)
	}
	return nil
}

func openBrowser(url string) error {
	command := "xdg-open"
	if runtime.GOOS == "darwin" {
		command = "open"
	}
	return exec.Command(command, url).Start()
}

func showMessage(title string, message string, isError bool) {
	if runtime.GOOS != "darwin" {
		fmt.Printf("%s: %s\n", title, message)
		return
	}
	icon := "note"
	if isError {
		icon = "stop"
	}
	script := `display dialog ` + strconv.Quote(message) + ` with title ` + strconv.Quote(title) + ` buttons {"好"} default button "好" with icon ` + icon
	_ = exec.Command("osascript", "-e", script).Run()
}
