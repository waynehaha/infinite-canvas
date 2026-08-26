import { createFile, type MP4BoxBuffer, type Movie } from "mp4box";

import type { VideoFrameRateMetadata } from "@/types/media";

const CHUNK_BYTES = 1024 * 1024;

export async function analyzeVideoFrameRate(blob: Blob): Promise<VideoFrameRateMetadata> {
    const file = createFile();
    let result: VideoFrameRateMetadata | null = null;
    file.onReady = (info) => {
        result = frameRateMetadata(file, info);
    };
    file.onError = () => {
        result = { frameRateStatus: "failed" };
    };

    let offset = 0;
    while (offset < blob.size && !result) {
        const end = Math.min(blob.size, offset + CHUNK_BYTES);
        const buffer = (await blob.slice(offset, end).arrayBuffer()) as MP4BoxBuffer;
        buffer.fileStart = offset;
        const nextOffset = file.appendBuffer(buffer);
        offset = Math.max(end, Number.isFinite(nextOffset) ? nextOffset : end);
    }
    if (!result) file.flush();
    return result || { frameRateStatus: "failed" };
}

export function frameRateMetadataFromSamples(durations: number[], timescale: number): VideoFrameRateMetadata {
    const validDurations = durations.filter((duration) => duration > 0);
    if (!validDurations.length || !timescale) return { frameRateStatus: "failed" };
    const totalDuration = validDurations.reduce((sum, duration) => sum + duration, 0);
    const frameRate = (validDurations.length * timescale) / totalDuration;
    const sortedDurations = [...validDurations].sort((a, b) => a - b);
    const lowerDuration = percentile(sortedDurations, 0.05);
    const upperDuration = percentile(sortedDurations, 0.95);
    const minFrameRate = timescale / upperDuration;
    const maxFrameRate = timescale / lowerDuration;
    const medianRate = timescale / percentile(sortedDurations, 0.5);
    const tolerance = Math.max(0.01, medianRate * 0.01);
    const mismatches = validDurations.filter((duration) => Math.abs(timescale / duration - medianRate) > tolerance).length;
    const variable = mismatches >= Math.max(2, Math.ceil(validDurations.length * 0.01));
    return {
        frameRate: roundFrameRate(frameRate),
        minFrameRate: roundFrameRate(minFrameRate),
        maxFrameRate: roundFrameRate(maxFrameRate),
        frameRateMode: variable ? "variable" : "constant",
        frameCount: validDurations.length,
        frameRateStatus: "measured",
    };
}

function percentile(sorted: number[], ratio: number) {
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
}

function frameRateMetadata(file: ReturnType<typeof createFile>, info: Movie): VideoFrameRateMetadata {
    const videoTrack = info.videoTracks[0];
    if (!videoTrack) return { frameRateStatus: "unsupported" };
    const samples = file.getTrackById(videoTrack.id).samples || [];
    return frameRateMetadataFromSamples(
        samples.map((sample) => sample.duration),
        videoTrack.timescale || samples[0]?.timescale || 0,
    );
}

function roundFrameRate(value: number) {
    return Number(value.toFixed(3));
}
