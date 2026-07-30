package handler

import (
	"encoding/base64"
	"testing"
)

func TestAudioFromAIResponseURL(t *testing.T) {
	payload := []byte(`{"choices":[{"message":{"content":"音乐已生成：[下载](https://cdn.example.com/music.mp3)"}}]}`)
	url, data, mimeType, err := audioFromAIResponse(payload)
	if err != nil {
		t.Fatal(err)
	}
	if url != "https://cdn.example.com/music.mp3" || len(data) != 0 || mimeType != "audio/mpeg" {
		t.Fatalf("unexpected audio result: url=%q bytes=%d mime=%q", url, len(data), mimeType)
	}
}

func TestAudioFromAIResponseDataURL(t *testing.T) {
	raw := []byte("test audio")
	payload := []byte(`{"data":{"audio_url":"data:audio/wav;base64,` + base64.StdEncoding.EncodeToString(raw) + `"}}`)
	_, data, mimeType, err := audioFromAIResponse(payload)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != string(raw) || mimeType != "audio/wav" {
		t.Fatalf("unexpected audio result: data=%q mime=%q", data, mimeType)
	}
}

func TestAudioFromAIResponseMissingURL(t *testing.T) {
	if _, _, _, err := audioFromAIResponse([]byte(`{"choices":[{"message":{"content":"生成完成"}}]}`)); err == nil {
		t.Fatal("expected missing audio URL error")
	}
}
