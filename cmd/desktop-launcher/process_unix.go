//go:build !windows

package main

import (
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func configureDetachedProcess(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}

func processAlive(pid int) bool {
	if pid <= 0 || syscall.Kill(pid, 0) != nil {
		return false
	}
	// macOS may keep an exited child as a zombie briefly; it is no longer a
	// running service and should not block state cleanup.
	state, err := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "state=").Output()
	if err != nil {
		return false
	}
	return !strings.HasPrefix(strings.TrimSpace(string(state)), "Z")
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

func terminateSingleProcess(pid int) error {
	if !processAlive(pid) {
		return nil
	}
	_ = syscall.Kill(pid, syscall.SIGTERM)
	for attempt := 0; attempt < 50; attempt++ {
		if !processAlive(pid) {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	if err := syscall.Kill(pid, syscall.SIGKILL); err != nil && processAlive(pid) {
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

func confirmQuit(title string, message string) bool {
	if runtime.GOOS != "darwin" {
		return true
	}
	script := `button returned of (display dialog ` + strconv.Quote(message) + ` with title ` + strconv.Quote(title) + ` buttons {"取消", "退出"} default button "退出" cancel button "取消" with icon caution)`
	output, err := exec.Command("osascript", "-e", script).Output()
	return err == nil && strings.TrimSpace(string(output)) == "退出"
}
