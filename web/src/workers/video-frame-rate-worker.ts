import { analyzeVideoFrameRate } from "@/lib/video-frame-rate";
import type { VideoFrameRateMetadata } from "@/types/media";

type AnalyzeRequest = { id: string; blob: Blob };
type AnalyzeResponse = { id: string; metadata: VideoFrameRateMetadata };

self.onmessage = async (event: MessageEvent<AnalyzeRequest>) => {
    const { id, blob } = event.data;
    const metadata = await analyzeVideoFrameRate(blob).catch(() => ({ frameRateStatus: "failed" as const }));
    self.postMessage({ id, metadata } satisfies AnalyzeResponse);
};
