export function isAIHubMusicModel(model: string) {
    return model.trim().toLowerCase() === "gemini-music";
}

export function createAIHubMusicBody(model: string, prompt: string) {
    return { model, messages: [{ role: "user", content: prompt }] };
}

export function extractAIHubAudioSource(payload: unknown) {
    const candidates: string[] = [];
    const visit = (value: unknown, depth = 0) => {
        if (depth > 7 || value == null) return;
        if (typeof value === "string") {
            const direct = value.trim();
            if (/^(https?:\/\/|data:audio\/)/i.test(direct)) candidates.push(direct);
            for (const match of value.matchAll(/(?:https?:\/\/[^\s)"']+|data:audio\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+)/gi)) candidates.push(match[0]);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((item) => visit(item, depth + 1));
            return;
        }
        if (typeof value !== "object") return;
        const record = value as Record<string, unknown>;
        for (const key of ["audio_url", "url", "choices", "message", "content", "data", "result", "output"]) visit(record[key], depth + 1);
    };
    visit(payload);
    return candidates[0] || "";
}
