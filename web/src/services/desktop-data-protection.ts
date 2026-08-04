import localforage from "localforage";

const STORE_NAMES = ["app_state", "image_files", "media_files", "image_generation_logs", "image_generation_categories", "video_generation_logs", "creative_workflows", "diagnostic_logs", "diagnostic_reference_assets"] as const;
const LOCAL_STORAGE_STORE = "__local_storage__";
const INTERNAL_KEY_PREFIX = "infinite-canvas:desktop-data:";

type BackupEntry = {
    file: string;
    key: string;
    kind: "blob" | "json";
    mimeType: string;
    sha256: string;
    size: number;
    store: string;
};

type BackupManifest = {
    appVersion: string;
    completedAt: string;
    createdAt: string;
    entries: BackupEntry[];
    id: string;
    origin: string;
    schemaVersion: 1;
};

type LatestBackup = { backupId: string | null; manifest: BackupManifest | null };
type DesktopStatus = { appVersion: string; enabled: boolean; origin: string };

function encodeHeader(value: string) {
    return encodeURIComponent(value);
}

function decodeHeader(value: string) {
    return decodeURIComponent(value);
}

function store(name: string) {
    return localforage.createInstance({ name: "infinite-canvas", storeName: name });
}

async function requestJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`桌面数据保护请求失败：${response.status}`);
    return response.json() as Promise<T>;
}

async function uploadEntry(session: string, storeName: string, key: string, value: unknown) {
    const blob = value instanceof Blob ? value : new Blob([JSON.stringify(value)], { type: "application/json" });
    const response = await fetch("/api/desktop-data", {
        method: "PUT",
        body: blob,
        headers: {
            "x-backup-key": encodeHeader(key),
            "x-backup-kind": value instanceof Blob ? "blob" : "json",
            "x-backup-mime": value instanceof Blob ? value.type || "application/octet-stream" : "application/json",
            "x-backup-session": session,
            "x-backup-store": encodeHeader(storeName),
        },
    });
    if (!response.ok) throw new Error(`备份 ${storeName}/${key} 失败：${response.status}`);
}

async function createBackup(status: DesktopStatus) {
    const marker = `${INTERNAL_KEY_PREFIX}backup:${status.appVersion}:${location.origin}`;
    if (localStorage.getItem(marker)) return;
    const { id } = await requestJson<{ id: string }>("/api/desktop-data?action=start", { method: "POST" });

    for (const storeName of STORE_NAMES) {
        const instance = store(storeName);
        for (const key of await instance.keys()) {
            const value = await instance.getItem(key);
            if (value !== null && value !== undefined) await uploadEntry(id, storeName, key, value);
        }
    }
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith("infinite-canvas") || key.startsWith(INTERNAL_KEY_PREFIX)) continue;
        await uploadEntry(id, LOCAL_STORAGE_STORE, key, localStorage.getItem(key));
    }
    await requestJson("/api/desktop-data?action=finish", { method: "POST", headers: { "x-backup-session": id } });
    localStorage.setItem(marker, new Date().toISOString());
}

function equal(left: unknown, right: unknown) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function recoveredCopy<T extends Record<string, unknown>>(value: T) {
    return {
        ...value,
        id: crypto.randomUUID(),
        ...(typeof value.title === "string" ? { title: `${value.title}（恢复副本）` } : {}),
        ...(typeof value.name === "string" && typeof value.title !== "string" ? { name: `${value.name}（恢复副本）` } : {}),
    };
}

export function mergeWithoutOverwrite(current: unknown, incoming: unknown): unknown {
    if (current === null || current === undefined) return incoming;
    if (Array.isArray(current) && Array.isArray(incoming)) {
        const result = [...current];
        const byId = new Map(current.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && "id" in item)).map((item) => [String(item.id), item]));
        for (const item of incoming) {
            if (!item || typeof item !== "object" || !("id" in item)) {
                if (!result.some((existing) => equal(existing, item))) result.push(item);
                continue;
            }
            const existing = byId.get(String(item.id));
            if (!existing) {
                result.push(item);
            } else if (!equal(existing, item)) {
                result.push(recoveredCopy(item as Record<string, unknown>));
            }
        }
        return result;
    }
    if (current && incoming && typeof current === "object" && typeof incoming === "object" && !Array.isArray(current) && !Array.isArray(incoming)) {
        const result = { ...(current as Record<string, unknown>) };
        for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
            result[key] = key in result ? mergeWithoutOverwrite(result[key], value) : value;
        }
        return result;
    }
    return current;
}

function mergeAppState(current: unknown, incoming: unknown) {
    if (typeof current !== "string" || typeof incoming !== "string") return current ?? incoming;
    try {
        const currentValue = JSON.parse(current) as unknown;
        const incomingValue = JSON.parse(incoming) as unknown;
        return JSON.stringify(mergeWithoutOverwrite(currentValue, incomingValue));
    } catch {
        return current;
    }
}

async function sha256(blob: Blob) {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function downloadEntry(backupId: string, entry: BackupEntry) {
    const query = new URLSearchParams({ action: "entry", backup: backupId, file: entry.file });
    const response = await fetch(`/api/desktop-data?${query}`);
    if (!response.ok) throw new Error(`读取备份条目失败：${response.status}`);
    const blob = await response.blob();
    if (blob.size !== entry.size || (await sha256(blob)) !== entry.sha256) throw new Error("备份条目校验失败");
    return entry.kind === "blob" ? new Blob([blob], { type: entry.mimeType }) : JSON.parse(await blob.text());
}

async function hasBusinessData() {
    for (const storeName of STORE_NAMES) {
        const keys = await store(storeName).keys();
        if (storeName === "app_state") {
            if (keys.some((key) => key === "infinite-canvas:canvas_store" || key === "infinite-canvas:asset_store")) return true;
        } else if (keys.length > 0) {
            return true;
        }
    }
    return false;
}

async function restoreBackup(backup: LatestBackup) {
    if (!backup.backupId || !backup.manifest) return false;
    const marker = `${INTERNAL_KEY_PREFIX}restored:${backup.backupId}`;
    if (localStorage.getItem(marker)) return false;
    if (backup.manifest.origin === location.origin && (await hasBusinessData())) return false;

    for (const entry of backup.manifest.entries) {
        const storeName = decodeHeader(entry.store);
        const key = decodeHeader(entry.key);
        const incoming = await downloadEntry(backup.backupId, entry);
        if (storeName === LOCAL_STORAGE_STORE) {
            if (localStorage.getItem(key) === null) localStorage.setItem(key, String(incoming));
            continue;
        }
        const instance = store(storeName);
        const current = await instance.getItem(key);
        const merged = storeName === "app_state" ? mergeAppState(current, incoming) : mergeWithoutOverwrite(current, incoming);
        if (!equal(current, merged)) await instance.setItem(key, merged);
    }
    localStorage.setItem(marker, new Date().toISOString());
    return true;
}

export async function runDesktopDataProtection() {
    const status = await requestJson<DesktopStatus>("/api/desktop-data?action=status").catch(() => null);
    if (!status?.enabled) return false;
    const latest = await requestJson<LatestBackup>("/api/desktop-data?action=latest");
    const restored = await restoreBackup(latest);
    if (!restored) await createBackup(status);
    return restored;
}
