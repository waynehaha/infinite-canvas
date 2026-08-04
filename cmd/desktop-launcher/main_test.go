package main

import (
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAvailablePort(t *testing.T) {
	port, err := availablePort()
	if err != nil || port <= 0 {
		t.Fatalf("availablePort() = %d, %v", port, err)
	}
}

func TestAvailablePortsAreDistinct(t *testing.T) {
	ports, err := availablePorts(2)
	if err != nil || len(ports) != 2 || ports[0] == ports[1] {
		t.Fatalf("availablePorts(2) = %v, %v", ports, err)
	}
}

func TestWithEnvReplacesExistingValue(t *testing.T) {
	result := withEnv([]string{"PORT=1", "KEEP=yes"}, map[string]string{"PORT": "2"})
	joined := strings.Join(result, "\n")
	if strings.Contains(joined, "PORT=1") || !strings.Contains(joined, "PORT=2") || !strings.Contains(joined, "KEEP=yes") {
		t.Fatalf("unexpected environment: %v", result)
	}
}

func TestPrepareDataDirKeepsSecret(t *testing.T) {
	dir := t.TempDir()
	if err := prepareDataDir(dir); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, ".env")
	first, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := prepareDataDir(dir); err != nil {
		t.Fatal(err)
	}
	second, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(first) != string(second) || !strings.HasPrefix(string(first), "JWT_SECRET=") {
		t.Fatal("JWT secret was not preserved")
	}
}

func TestPersistentWebPortSurvivesRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "desktop.json")
	first, err := persistentWebPort(path, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	second, err := persistentWebPort(path, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatalf("web port changed from %d to %d", first, second)
	}
}

func TestPersistentWebPortInheritsLegacyState(t *testing.T) {
	path := filepath.Join(t.TempDir(), "desktop.json")
	legacy, err := availablePort()
	if err != nil {
		t.Fatal(err)
	}
	port, err := persistentWebPort(path, 0, legacy)
	if err != nil {
		t.Fatal(err)
	}
	if port != legacy {
		t.Fatalf("web port = %d, want %d", port, legacy)
	}
}

func TestPersistentWebPortDoesNotReplaceOccupiedPort(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	path := filepath.Join(t.TempDir(), "desktop.json")
	if err := writeDesktopConfig(path, desktopConfig{WebPort: port}); err != nil {
		t.Fatal(err)
	}
	if _, err := persistentWebPort(path, 0, 0); err == nil || !strings.Contains(err.Error(), "不会自动更换端口") {
		t.Fatalf("expected occupied-port protection, got %v", err)
	}
}
