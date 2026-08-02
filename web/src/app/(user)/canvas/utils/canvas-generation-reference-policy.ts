import { getAIHubImageCapability, getAIHubVideoCapability } from "@/lib/aihub-model-capabilities";
import { getAIHubImageReferenceError, getAIHubVideoReferenceError } from "@/lib/aihub-reference-policy";
import { supportsVideoFrameReferences } from "@/lib/video-model-capabilities";
import type { NodeGenerationInput } from "../components/canvas-node-generation";

export type CanvasGenerationInputSummary = {
    textCount: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
};

export type CanvasVideoReferencePolicy = {
    activeInputs: NodeGenerationInput[];
    connectedSummary: CanvasGenerationInputSummary;
    unsupportedConnectedTypes: Set<NodeGenerationInput["type"]>;
    error: string;
};

export type CanvasFrameSelection = {
    firstFrameNodeId?: string;
    lastFrameNodeId?: string;
};

const referencePattern = /@\[node:([^\]]+)\]/g;

export function buildCanvasVideoReferencePolicy(model: string, inputs: NodeGenerationInput[], composerContent: string, frames: CanvasFrameSelection = {}): CanvasVideoReferencePolicy {
    const capability = getAIHubVideoCapability(model);
    const activeInputs = composerContent.trim() ? referencedInputs(inputs, composerContent) : inputs;
    const connectedSummary = summarizeCanvasGenerationInputs(inputs);
    if (!capability) return { activeInputs, connectedSummary, unsupportedConnectedTypes: new Set(), error: "" };

    const unsupportedConnectedTypes = new Set(
        inputs.filter((input) => !isCanvasVideoReferenceInputSupported(model, input)).map((input) => input.type),
    );
    const inputById = new Map(inputs.map((input) => [input.nodeId, input]));
    const frameNodeIds = new Set([frames.firstFrameNodeId, frames.lastFrameNodeId].filter((id): id is string => Boolean(id)));
    const referenceInputs = activeInputs.filter((input) => !frameNodeIds.has(input.nodeId));
    const error = getAIHubVideoReferenceError(model, {
        images: referenceInputs.flatMap((input) => input.image ? [input.image] : []),
        videos: referenceInputs.flatMap((input) => input.video ? [input.video] : []),
        audios: referenceInputs.flatMap((input) => input.audio ? [input.audio] : []),
        firstFrame: frames.firstFrameNodeId ? inputById.get(frames.firstFrameNodeId)?.image : null,
        lastFrame: frames.lastFrameNodeId ? inputById.get(frames.lastFrameNodeId)?.image : null,
    });

    return { activeInputs, connectedSummary, unsupportedConnectedTypes, error };
}

export function buildCanvasImageReferencePolicy(model: string, inputs: NodeGenerationInput[], composerContent: string): CanvasVideoReferencePolicy {
    const activeInputs = composerContent.trim() ? referencedInputs(inputs, composerContent) : inputs;
    return {
        activeInputs,
        connectedSummary: summarizeCanvasGenerationInputs(inputs),
        unsupportedConnectedTypes: new Set(inputs.filter((input) => !isCanvasImageReferenceInputSupported(model, input)).map((input) => input.type)),
        error: getAIHubImageReferenceError(model, activeInputs.flatMap((input) => input.image ? [input.image] : [])),
    };
}

export function isCanvasVideoReferenceInputSupported(model: string, input: NodeGenerationInput) {
    if (input.type === "text") return true;
    const capability = getAIHubVideoCapability(model);
    if (!capability) return true;
    if (input.type === "image") return Boolean(capability.references?.images?.max);
    if (input.type === "video") return Boolean(capability.references?.videos?.max);
    return Boolean(capability.references?.audios?.max);
}

export function isCanvasImageReferenceInputSupported(model: string, input: NodeGenerationInput) {
    if (input.type === "text") return true;
    if (input.type !== "image") return false;
    const capability = getAIHubImageCapability(model);
    return capability ? Boolean(capability.references?.images.max) : true;
}

export function resolveCanvasVideoImageReferences<T>(model: string, references: T[], firstFrame: T | null | undefined, lastFrame: T | null | undefined) {
    const capability = getAIHubVideoCapability(model);
    const frameReferencesEnabled = capability ? capability.references?.frames?.mode === "pair" : supportsVideoFrameReferences(model);
    const imageReferencesEnabled = capability ? Boolean(capability.references?.images?.max) : true;
    const staleFrames = [firstFrame, lastFrame].filter((reference): reference is T => Boolean(reference));

    return {
        references: imageReferencesEnabled ? (frameReferencesEnabled ? references : [...references, ...staleFrames]) : [],
        firstFrame: frameReferencesEnabled ? firstFrame || null : null,
        lastFrame: frameReferencesEnabled ? lastFrame || null : null,
    };
}

export function summarizeCanvasGenerationInputs(inputs: NodeGenerationInput[]): CanvasGenerationInputSummary {
    return {
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: inputs.filter((input) => input.type === "image").length,
        videoCount: inputs.filter((input) => input.type === "video").length,
        audioCount: inputs.filter((input) => input.type === "audio").length,
    };
}

function referencedInputs(inputs: NodeGenerationInput[], composerContent: string) {
    const inputById = new Map(inputs.map((input) => [input.nodeId, input]));
    const seen = new Set<string>();
    return Array.from(composerContent.matchAll(referencePattern)).flatMap((match) => {
        const input = inputById.get(match[1]);
        if (!input || seen.has(input.nodeId)) return [];
        seen.add(input.nodeId);
        return [input];
    });
}
