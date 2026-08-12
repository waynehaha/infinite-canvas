package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const appName = "AI创作工作台"

type launcherOptions struct {
	action      string
	appDir      string
	dataDir     string
	webPort     int
	noBrowser   bool
	noDialog    bool
	noTray      bool
	trayPID     int
	waitTimeout time.Duration
}

type launcherState struct {
	APIPID    int       `json:"apiPid"`
	WebPID    int       `json:"webPid"`
	TrayPID   int       `json:"trayPid,omitempty"`
	APIPort   int       `json:"apiPort"`
	WebPort   int       `json:"webPort"`
	Version   string    `json:"version"`
	StartedAt time.Time `json:"startedAt"`
}

type desktopConfig struct {
	WebPort int `json:"webPort"`
}

func main() {
	options, err := parseOptions()
	if err == nil {
		err = run(options)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		recordLauncherError(options, err)
		if !options.noDialog {
			showMessage(appName, err.Error(), true)
		}
		os.Exit(1)
	}
}

func recordLauncherError(options launcherOptions, runErr error) {
	dataDir, err := resolveDataDir(options.dataDir)
	if err != nil {
		return
	}
	logDir := filepath.Join(dataDir, "logs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return
	}
	file, err := os.OpenFile(filepath.Join(logDir, "launcher.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer file.Close()
	fmt.Fprintf(file, "%s %s\n", time.Now().Format(time.RFC3339), runErr)
}

func parseOptions() (launcherOptions, error) {
	var options launcherOptions
	var waitSeconds int
	flag.StringVar(&options.action, "action", actionFromExecutable(), "start, open, restart, stop or status")
	flag.StringVar(&options.appDir, "app-dir", "", "application bundle directory")
	flag.StringVar(&options.dataDir, "data-dir", "", "application data directory")
	flag.IntVar(&options.webPort, "web-port", 0, "persistent web port used to recover browser data")
	flag.BoolVar(&options.noBrowser, "no-browser", false, "do not open the browser")
	flag.BoolVar(&options.noDialog, "no-dialog", false, "do not show native dialogs")
	flag.BoolVar(&options.noTray, "no-tray", false, "start services without a system tray")
	flag.IntVar(&waitSeconds, "wait-timeout", 120, "startup timeout in seconds")
	flag.Parse()
	options.action = strings.ToLower(strings.TrimSpace(options.action))
	if options.action != "start" && options.action != "open" && options.action != "restart" && options.action != "stop" && options.action != "status" {
		return options, fmt.Errorf("不支持的操作：%s", options.action)
	}
	if options.webPort < 0 || options.webPort > 65535 {
		return options, fmt.Errorf("网页端口必须在 1 到 65535 之间")
	}
	if waitSeconds < 5 {
		waitSeconds = 5
	}
	options.waitTimeout = time.Duration(waitSeconds) * time.Second
	return options, nil
}

func actionFromExecutable() string {
	name := strings.ToLower(filepath.Base(os.Args[0]))
	if strings.Contains(name, "stop") || strings.Contains(name, "停止") {
		return "stop"
	}
	return "start"
}

func run(options launcherOptions) error {
	appDir, err := resolveAppDir(options.appDir)
	if err != nil {
		return err
	}
	dataDir, err := resolveDataDir(options.dataDir)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "run"), 0o755); err != nil {
		return fmt.Errorf("无法创建运行目录：%w", err)
	}
	statePath := filepath.Join(dataDir, "run", "state.json")
	switch options.action {
	case "open":
		return openRunningWorkbench(statePath)
	case "restart":
		return withLauncherLock(dataDir, func() error { return restartServices(appDir, dataDir, statePath, options) })
	case "stop":
		return withLauncherLock(dataDir, func() error { return stopServices(statePath, options.noDialog, true) })
	case "status":
		state, _ := readState(statePath)
		if state != nil && stateHealthy(*state) {
			fmt.Printf("running http://127.0.0.1:%d/\n", state.WebPort)
			return nil
		}
		return errors.New("未运行")
	default:
		runTrayAfterStart := false
		if !options.noTray {
			options.trayPID = os.Getpid()
		}
		if err := withLauncherLock(dataDir, func() error {
			state, _ := readState(statePath)
			runTrayAfterStart = !options.noTray && (state == nil || !stateHealthy(*state) || state.TrayPID <= 0 || !processAlive(state.TrayPID))
			if err := startServices(appDir, dataDir, statePath, options); err != nil {
				return err
			}
			if runTrayAfterStart {
				state, err = readState(statePath)
				if err != nil {
					return err
				}
				state.TrayPID = options.trayPID
				return writeState(statePath, *state)
			}
			return nil
		}); err != nil {
			return err
		}
		if runTrayAfterStart {
			if err := runTray(trayRuntime{appDir: appDir, dataDir: dataDir, statePath: statePath, options: options}); err != nil {
				_ = withLauncherLock(dataDir, func() error { return stopServices(statePath, true, false) })
				return err
			}
		}
		return nil
	}
}

func withLauncherLock(dataDir string, action func() error) error {
	releaseLock, err := acquireLock(filepath.Join(dataDir, "run", "launcher.lock"))
	if err != nil {
		return err
	}
	defer releaseLock()
	return action()
}

func startServices(appDir string, dataDir string, statePath string, options launcherOptions) error {
	configPath := filepath.Join(dataDir, "desktop.json")
	legacyWebPort := 0
	if state, _ := readState(statePath); state != nil {
		if stateHealthy(*state) {
			if options.webPort > 0 && options.webPort != state.WebPort {
				return fmt.Errorf("软件正在端口 %d 运行，请先停止后再切换到端口 %d", state.WebPort, options.webPort)
			}
			if err := preserveWebPort(configPath, state.WebPort); err != nil {
				return err
			}
			if !options.noBrowser {
				return openBrowser(fmt.Sprintf("http://127.0.0.1:%d/", state.WebPort))
			}
			return nil
		}
		legacyWebPort = state.WebPort
		_ = terminateState(*state)
		_ = os.Remove(statePath)
	}

	paths, err := validateBundle(appDir)
	if err != nil {
		return err
	}
	if err := prepareDataDir(dataDir); err != nil {
		return err
	}
	webPort, err := persistentWebPort(configPath, options.webPort, legacyWebPort)
	if err != nil {
		return err
	}
	apiPort, err := availablePortExcept(webPort)
	if err != nil {
		return err
	}

	apiLog, err := openLog(filepath.Join(dataDir, "logs", "api.log"))
	if err != nil {
		return err
	}
	defer apiLog.Close()
	webLog, err := openLog(filepath.Join(dataDir, "logs", "web.log"))
	if err != nil {
		return err
	}
	defer webLog.Close()

	api := exec.Command(paths.server)
	api.Dir = dataDir
	api.Env = withEnv(os.Environ(), map[string]string{
		"PORT":            strconv.Itoa(apiPort),
		"LISTEN_ADDRESS":  "127.0.0.1",
		"STORAGE_DRIVER":  "sqlite",
		"DATABASE_DSN":    filepath.Join(dataDir, "data", "infinite-canvas.db"),
		"AI_LOG_DIR":      filepath.Join(dataDir, "logs", "ai-calls"),
		"PROMPT_DATA_DIR": filepath.Join(dataDir, "data", "prompts"),
	})
	api.Stdout, api.Stderr = apiLog, apiLog
	configureDetachedProcess(api)
	if err := api.Start(); err != nil {
		return fmt.Errorf("后端服务启动失败：%w", err)
	}
	apiPID := api.Process.Pid
	_ = api.Process.Release()

	if err := waitForURL(fmt.Sprintf("http://127.0.0.1:%d/api/health", apiPort), options.waitTimeout/2); err != nil {
		_ = terminateProcessTree(apiPID)
		return fmt.Errorf("后端服务未准备好，请查看 %s", apiLog.Name())
	}

	web := exec.Command(paths.node, "server.js")
	web.Dir = paths.web
	webOrigin := fmt.Sprintf("http://127.0.0.1:%d", webPort)
	web.Env = withEnv(os.Environ(), map[string]string{
		"NODE_ENV":                    "production",
		"HOSTNAME":                    "127.0.0.1",
		"PORT":                        strconv.Itoa(webPort),
		"API_BASE_URL":                fmt.Sprintf("http://127.0.0.1:%d", apiPort),
		"INFINITE_CANVAS_APP_VERSION": readVersion(appDir),
		"INFINITE_CANVAS_DATA_DIR":    dataDir,
		"INFINITE_CANVAS_WEB_ORIGIN":  webOrigin,
	})
	web.Stdout, web.Stderr = webLog, webLog
	configureDetachedProcess(web)
	if err := web.Start(); err != nil {
		_ = terminateProcessTree(apiPID)
		return fmt.Errorf("网页服务启动失败：%w", err)
	}
	webPID := web.Process.Pid
	_ = web.Process.Release()

	state := launcherState{APIPID: apiPID, WebPID: webPID, TrayPID: options.trayPID, APIPort: apiPort, WebPort: webPort, Version: readVersion(appDir), StartedAt: time.Now()}
	if err := writeState(statePath, state); err != nil {
		_ = terminateState(state)
		return err
	}
	if err := waitForURL(fmt.Sprintf("http://127.0.0.1:%d/", webPort), options.waitTimeout); err != nil {
		_ = terminateState(state)
		_ = os.Remove(statePath)
		return fmt.Errorf("网页服务未准备好，请查看 %s", webLog.Name())
	}
	if !options.noBrowser {
		return openBrowser(fmt.Sprintf("http://127.0.0.1:%d/", webPort))
	}
	return nil
}

type bundlePaths struct {
	server string
	node   string
	web    string
}

func validateBundle(appDir string) (bundlePaths, error) {
	serverName, nodePath := "server", filepath.Join(appDir, "runtime", "bin", "node")
	if runtime.GOOS == "windows" {
		serverName, nodePath = "server.exe", filepath.Join(appDir, "runtime", "node.exe")
	}
	paths := bundlePaths{server: filepath.Join(appDir, serverName), node: nodePath, web: filepath.Join(appDir, "web")}
	for _, path := range []string{paths.server, paths.node, filepath.Join(paths.web, "server.js")} {
		if info, err := os.Stat(path); err != nil || info.IsDir() {
			return bundlePaths{}, fmt.Errorf("安装包不完整，缺少：%s", path)
		}
	}
	return paths, nil
}

func resolveAppDir(value string) (string, error) {
	if value == "" {
		value = os.Getenv("INFINITE_CANVAS_APP_DIR")
	}
	if value != "" {
		return filepath.Abs(value)
	}
	executable, err := os.Executable()
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(executable)
	if runtime.GOOS == "darwin" && filepath.Base(dir) == "MacOS" {
		dir = filepath.Join(dir, "..", "Resources", "app")
	}
	return filepath.Abs(dir)
}

func resolveDataDir(value string) (string, error) {
	if value == "" {
		value = os.Getenv("INFINITE_CANVAS_DATA_DIR")
	}
	if value != "" {
		return filepath.Abs(value)
	}
	var base string
	if runtime.GOOS == "windows" {
		base = os.Getenv("LOCALAPPDATA")
	} else if runtime.GOOS == "darwin" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		base = filepath.Join(home, "Library", "Application Support")
	} else {
		var err error
		base, err = os.UserConfigDir()
		if err != nil {
			return "", err
		}
	}
	if base == "" {
		return "", errors.New("无法确定应用数据目录")
	}
	return filepath.Join(base, appName), nil
}

func prepareDataDir(dataDir string) error {
	for _, dir := range []string{filepath.Join(dataDir, "data"), filepath.Join(dataDir, "data", "prompts"), filepath.Join(dataDir, "logs"), filepath.Join(dataDir, "logs", "ai-calls"), filepath.Join(dataDir, "run"), filepath.Join(dataDir, "backups", "browser-data")} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	envPath := filepath.Join(dataDir, ".env")
	if _, err := os.Stat(envPath); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return err
	}
	content := "JWT_SECRET=" + base64.RawURLEncoding.EncodeToString(secret) + "\n"
	return os.WriteFile(envPath, []byte(content), 0o600)
}

func persistentWebPort(configPath string, requested int, legacy int) (int, error) {
	configured := 0
	if data, err := os.ReadFile(configPath); err == nil {
		var config desktopConfig
		if json.Unmarshal(data, &config) == nil {
			configured = config.WebPort
		}
	} else if !os.IsNotExist(err) {
		return 0, err
	}

	port := requested
	if port == 0 {
		port = configured
	}
	if port == 0 {
		port = legacy
	}
	if port == 0 {
		var err error
		port, err = availablePort()
		if err != nil {
			return 0, err
		}
	}
	if port < 1 || port > 65535 {
		return 0, fmt.Errorf("已保存的网页端口无效：%d", port)
	}
	if !portAvailable(port) {
		return 0, fmt.Errorf("固定网页端口 %d 已被其他程序占用。请关闭占用程序后重试；为保护浏览器本地数据，软件不会自动更换端口", port)
	}
	if requested > 0 || configured == 0 {
		if err := writeDesktopConfig(configPath, desktopConfig{WebPort: port}); err != nil {
			return 0, err
		}
	}
	return port, nil
}

func preserveWebPort(configPath string, port int) error {
	if data, err := os.ReadFile(configPath); err == nil {
		var config desktopConfig
		if json.Unmarshal(data, &config) == nil && config.WebPort == port {
			return nil
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	return writeDesktopConfig(configPath, desktopConfig{WebPort: port})
}

func writeDesktopConfig(path string, config desktopConfig) error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, data, 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}

func portAvailable(port int) bool {
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	_ = listener.Close()
	return true
}

func availablePortExcept(excluded int) (int, error) {
	for attempt := 0; attempt < 10; attempt++ {
		port, err := availablePort()
		if err != nil {
			return 0, err
		}
		if port != excluded {
			return port, nil
		}
	}
	return 0, errors.New("无法分配独立的后端端口")
}

func availablePort() (int, error) {
	ports, err := availablePorts(1)
	if err != nil {
		return 0, err
	}
	return ports[0], nil
}

func availablePorts(count int) ([]int, error) {
	listeners := make([]net.Listener, 0, count)
	defer func() {
		for _, listener := range listeners {
			_ = listener.Close()
		}
	}()
	ports := make([]int, 0, count)
	for len(ports) < count {
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return nil, fmt.Errorf("无法分配本地端口：%w", err)
		}
		listeners = append(listeners, listener)
		ports = append(ports, listener.Addr().(*net.TCPAddr).Port)
	}
	return ports, nil
}

func waitForURL(url string, timeout time.Duration) error {
	client := &http.Client{Timeout: 3 * time.Second}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		response, err := client.Get(url)
		if err == nil {
			io.Copy(io.Discard, response.Body)
			response.Body.Close()
			if response.StatusCode >= 200 && response.StatusCode < 500 {
				return nil
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return errors.New("等待服务超时")
}

func stateHealthy(state launcherState) bool {
	if !processAlive(state.APIPID) || !processAlive(state.WebPID) {
		return false
	}
	return waitForURL(fmt.Sprintf("http://127.0.0.1:%d/api/health", state.APIPort), time.Second) == nil && waitForURL(fmt.Sprintf("http://127.0.0.1:%d/", state.WebPort), time.Second) == nil
}

func openRunningWorkbench(statePath string) error {
	state, err := readState(statePath)
	if err != nil || state == nil || !stateHealthy(*state) {
		return errors.New("AI 创作工作台没有运行")
	}
	return openBrowser(fmt.Sprintf("http://127.0.0.1:%d/", state.WebPort))
}

func restartServices(appDir string, dataDir string, statePath string, options launcherOptions) error {
	state, err := readState(statePath)
	trayPID := options.trayPID
	if err == nil && state != nil {
		trayPID = state.TrayPID
		if err := stopServices(statePath, true, false); err != nil {
			return err
		}
	}
	options.action = "start"
	options.noBrowser = true
	options.noDialog = true
	options.noTray = true
	options.trayPID = trayPID
	return startServices(appDir, dataDir, statePath, options)
}

func stopServices(statePath string, noDialog bool, stopTray bool) error {
	state, err := readState(statePath)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if state == nil {
		if !noDialog {
			showMessage(appName, "AI 创作工作台没有运行。", false)
		}
		return nil
	}
	if err := terminateState(*state); err != nil {
		return err
	}
	if stopTray && state.TrayPID > 0 && state.TrayPID != os.Getpid() {
		if err := terminateSingleProcess(state.TrayPID); err != nil {
			return err
		}
	}
	if err := os.Remove(statePath); err != nil && !os.IsNotExist(err) {
		return err
	}
	if !noDialog {
		showMessage(appName, "AI 创作工作台已停止，数据不会被删除。", false)
	}
	return nil
}

func terminateState(state launcherState) error {
	var failures []string
	for _, pid := range []int{state.WebPID, state.APIPID} {
		if pid > 0 && processAlive(pid) {
			if err := terminateProcessTree(pid); err != nil {
				failures = append(failures, err.Error())
			}
		}
	}
	if len(failures) > 0 {
		return errors.New(strings.Join(failures, "; "))
	}
	return nil
}

func readState(path string) (*launcherState, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var state launcherState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

func writeState(path string, state launcherState) error {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, data, 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}

func acquireLock(path string) (func(), error) {
	for attempt := 0; attempt < 40; attempt++ {
		file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err == nil {
			fmt.Fprintln(file, os.Getpid(), time.Now().Unix())
			file.Close()
			return func() { _ = os.Remove(path) }, nil
		}
		if !os.IsExist(err) {
			return nil, err
		}
		if info, statErr := os.Stat(path); statErr == nil && time.Since(info.ModTime()) > 2*time.Minute {
			_ = os.Remove(path)
			continue
		}
		time.Sleep(250 * time.Millisecond)
	}
	return nil, errors.New("另一个启动或停止操作正在进行")
}

func openLog(path string) (*os.File, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	return os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
}

func withEnv(current []string, values map[string]string) []string {
	keys := make(map[string]struct{}, len(values))
	for key := range values {
		keys[strings.ToUpper(key)] = struct{}{}
	}
	result := make([]string, 0, len(current)+len(values))
	for _, item := range current {
		key := item
		if index := strings.IndexByte(item, '='); index >= 0 {
			key = item[:index]
		}
		if _, replaced := keys[strings.ToUpper(key)]; !replaced {
			result = append(result, item)
		}
	}
	for key, value := range values {
		result = append(result, key+"="+value)
	}
	return result
}

func readVersion(appDir string) string {
	data, err := os.ReadFile(filepath.Join(appDir, "VERSION"))
	if err != nil {
		return "dev"
	}
	return strings.TrimSpace(string(data))
}
