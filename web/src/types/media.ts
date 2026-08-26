export type VideoFrameRateMetadata = {
    frameRate?: number;
    minFrameRate?: number;
    maxFrameRate?: number;
    frameRateMode?: "constant" | "variable";
    frameCount?: number;
    frameRateStatus?: "measured" | "unsupported" | "failed";
};

export function videoFrameRateMetadata(value: Record<string, unknown> | Partial<VideoFrameRateMetadata>): VideoFrameRateMetadata {
    return {
        frameRate: typeof value.frameRate === "number" ? value.frameRate : undefined,
        minFrameRate: typeof value.minFrameRate === "number" ? value.minFrameRate : undefined,
        maxFrameRate: typeof value.maxFrameRate === "number" ? value.maxFrameRate : undefined,
        frameRateMode: value.frameRateMode === "constant" || value.frameRateMode === "variable" ? value.frameRateMode : undefined,
        frameCount: typeof value.frameCount === "number" ? value.frameCount : undefined,
        frameRateStatus: value.frameRateStatus === "measured" || value.frameRateStatus === "unsupported" || value.frameRateStatus === "failed" ? value.frameRateStatus : undefined,
    };
}

export type ReferenceVideo = VideoFrameRateMetadata & {
    id: string;
    name: string;
    type: string;
    url: string;
    storageKey?: string;
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
};

export type ReferenceAudio = {
    id: string;
    name: string;
    type: string;
    url: string;
    storageKey?: string;
    durationMs?: number;
};
