//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

const (
	createNewProcessGroup = 0x00000200
	detachedProcess       = 0x00000008
	createNoWindow        = 0x08000000
)

func configureDetachedProcess(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNewProcessGroup | detachedProcess | createNoWindow}
}

func processAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	output, err := exec.Command("tasklist", "/FI", "PID eq "+strconv.Itoa(pid), "/NH").Output()
	return err == nil && strings.Contains(string(output), strconv.Itoa(pid))
}

func terminateProcessTree(pid int) error {
	if !processAlive(pid) {
		return nil
	}
	output, err := exec.Command("taskkill", "/PID", strconv.Itoa(pid), "/T", "/F").CombinedOutput()
	if err != nil && processAlive(pid) {
		return fmt.Errorf("无法停止进程 %d：%s", pid, strings.TrimSpace(string(output)))
	}
	return nil
}

func openBrowser(url string) error {
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

func showMessage(title string, message string, isError bool) {
	flags := uintptr(0x00000040)
	if isError {
		flags = 0x00000010
	}
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBox := user32.NewProc("MessageBoxW")
	messagePointer, _ := syscall.UTF16PtrFromString(message)
	titlePointer, _ := syscall.UTF16PtrFromString(title)
	_, _, _ = messageBox.Call(0, uintptr(unsafe.Pointer(messagePointer)), uintptr(unsafe.Pointer(titlePointer)), flags)
}
