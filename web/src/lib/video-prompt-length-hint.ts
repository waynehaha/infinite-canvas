import { getAIHubVideoCapability } from "@/lib/aihub-model-capabilities";
import { diagnosticTextStats } from "@/lib/diagnostic-log-safety";

export type VideoPromptLengthHint = {
    current: number;
    hint: number;
    overBy: number;
};

export function getVideoPromptLengthHint(model: string, prompt: string): VideoPromptLengthHint | null {
    const hint = getAIHubVideoCapability(model)?.promptLengthHint;
    const current = diagnosticTextStats(prompt).characterCount;
    if (!hint || current <= hint) return null;
    return { current, hint, overBy: current - hint };
}

export function videoPromptLengthHintText(value: VideoPromptLengthHint) {
    return `当前模型已知的提示词参考上限约为 ${value.hint} 个字符，本次为 ${value.current} 个，超出约 ${value.overBy} 个。该上限可能随上游调整，这只是提交前提示，不会强制拦截。是否继续提交？`;
}
