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

func TestImageURLFromAIResponseEventStream(t *testing.T) {
	raw := []byte("\x89PNG\r\n\x1a\nstream image")
	encoded := base64.StdEncoding.EncodeToString(raw)
	payload := []byte("event: response.output_item.done\n" +
		`data: {"response":{"output":[{"type":"image_generation_call","result":"` + encoded + `"}]}}` + "\n\n" +
		"data: [DONE]\n\n")

	url, mimeType, bytes, err := imageURLFromAIResponse(payload, "text/event-stream; charset=utf-8")
	if err != nil {
		t.Fatal(err)
	}
	if url != "data:image/png;base64,"+encoded || mimeType != "image/png" || bytes != int64(len(raw)) {
		t.Fatalf("unexpected image result: url=%q mime=%q bytes=%d", url, mimeType, bytes)
	}
}

func TestImageURLFromAIResponseEventStreamError(t *testing.T) {
	payload := []byte("event: error\n" + `data: {"error":{"message":"上游生成失败"}}` + "\n\n")
	if _, _, _, err := imageURLFromAIResponse(payload, "text/event-stream"); err == nil || err.Error() != "上游生成失败" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestImageURLFromAIResponseJSON(t *testing.T) {
	url, _, _, err := imageURLFromAIResponse([]byte(`{"data":[{"url":"https://cdn.example.com/image.png"}]}`), "application/json")
	if err != nil {
		t.Fatal(err)
	}
	if url != "https://cdn.example.com/image.png" {
		t.Fatalf("unexpected image URL: %q", url)
	}
}
