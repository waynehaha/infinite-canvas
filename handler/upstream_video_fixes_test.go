package handler

import "testing"

func TestApplyAPIMartMiniMaxH3Resolution(t *testing.T) {
	low := map[string]any{"resolution": "720p"}
	applyAPIMartVideoDefaults(low, "minimax-h3")
	if low["resolution"] != "768P" {
		t.Fatalf("low resolution = %v, want 768P", low["resolution"])
	}

	high := map[string]any{"resolution": "1080p"}
	applyAPIMartVideoDefaults(high, "minimax-h3")
	if high["resolution"] != "2K" {
		t.Fatalf("high resolution = %v, want 2K", high["resolution"])
	}
}

func TestNormalizeKIEMiniMaxH3VideoResolution(t *testing.T) {
	cases := map[string]string{
		"480p":  "768P",
		"768":   "768P",
		"1080p": "2K",
		"2k":    "2K",
	}
	for input, expected := range cases {
		if actual := normalizeKIEMiniMaxH3VideoResolution(input); actual != expected {
			t.Fatalf("normalizeKIEMiniMaxH3VideoResolution(%q) = %q, want %q", input, actual, expected)
		}
	}
}

func TestNormalizeAPIMartSizeRatioAllowsSmallDimensionDrift(t *testing.T) {
	if actual := normalizeAPIMartSizeRatio(1280, 700); actual != "16:9" {
		t.Fatalf("ratio = %q, want 16:9", actual)
	}
}
