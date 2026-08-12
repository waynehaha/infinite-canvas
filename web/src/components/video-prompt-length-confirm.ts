import { Modal } from "antd";

import { getVideoPromptLengthHint, videoPromptLengthHintText } from "@/lib/video-prompt-length-hint";

export function confirmVideoPromptLength(model: string, prompt: string) {
    const hint = getVideoPromptLengthHint(model, prompt);
    if (!hint) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
        Modal.confirm({
            title: "提示词较长",
            content: videoPromptLengthHintText(hint),
            okText: "继续提交",
            cancelText: "返回修改",
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
        });
    });
}
