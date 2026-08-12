package main

import "strings"

func versionsDiffer(running string, installed string) bool {
	return normalizeVersion(running) != normalizeVersion(installed)
}

func normalizeVersion(version string) string {
	return strings.TrimPrefix(strings.TrimSpace(version), "v")
}
