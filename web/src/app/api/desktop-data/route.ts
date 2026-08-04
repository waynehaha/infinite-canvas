import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    completedAt?: string;
    createdAt: string;
    entries: BackupEntry[];
    id: string;
    origin: string;
    schemaVersion: 1;
};

const MAX_ENTRY_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 100_000;
const SESSION_PATTERN = /^[a-f0-9-]{36}$/;
const BACKUP_PATTERN = /^[0-9TZ-]+_[A-Za-z0-9._-]+_[a-f0-9-]{36}$/;
const FILE_PATTERN = /^entry-[a-f0-9-]{36}\.bin$/;

function desktopContext(request: NextRequest) {
    const dataDir = process.env.INFINITE_CANVAS_DATA_DIR;
    const expectedOrigin = process.env.INFINITE_CANVAS_WEB_ORIGIN;
    if (!dataDir || !expectedOrigin || request.headers.get("host") !== new URL(expectedOrigin).host) return null;
    const origin = request.headers.get("origin");
    if (origin && origin !== expectedOrigin) return null;
    return {
        appVersion: process.env.INFINITE_CANVAS_APP_VERSION || "unknown",
        root: join(dataDir, "backups", "browser-data"),
        origin: expectedOrigin,
    };
}

function rejected() {
    return Response.json({ error: "桌面数据备份仅供当前本机应用使用" }, { status: 404 });
}

async function readManifest(path: string) {
    return JSON.parse(await readFile(path, "utf8")) as BackupManifest;
}

async function writeManifest(path: string, manifest: BackupManifest) {
    const temporary = `${path}.tmp`;
    await writeFile(temporary, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await rename(temporary, path);
}

function safeHeader(request: NextRequest, name: string, limit: number) {
    const value = request.headers.get(name) || "";
    return value.length > 0 && value.length <= limit ? value : null;
}

export async function POST(request: NextRequest) {
    const context = desktopContext(request);
    if (!context) return rejected();
    const action = request.nextUrl.searchParams.get("action");
    await mkdir(context.root, { recursive: true });

    if (action === "start") {
        const id = randomUUID();
        const directory = join(context.root, `.tmp-${id}`);
        await mkdir(directory, { recursive: false, mode: 0o700 });
        const manifest: BackupManifest = {
            appVersion: context.appVersion,
            createdAt: new Date().toISOString(),
            entries: [],
            id,
            origin: context.origin,
            schemaVersion: 1,
        };
        await writeManifest(join(directory, "manifest.json"), manifest);
        return Response.json({ id, appVersion: context.appVersion });
    }

    if (action === "finish") {
        const id = safeHeader(request, "x-backup-session", 36);
        if (!id || !SESSION_PATTERN.test(id)) return Response.json({ error: "备份会话无效" }, { status: 400 });
        const temporary = join(context.root, `.tmp-${id}`);
        const manifestPath = join(temporary, "manifest.json");
        const manifest = await readManifest(manifestPath);
        manifest.completedAt = new Date().toISOString();
        await writeManifest(manifestPath, manifest);
        const timestamp = manifest.createdAt.replace(/[:.]/g, "-");
        const finalName = `${timestamp}_${manifest.appVersion.replace(/[^A-Za-z0-9._-]/g, "-")}_${id}`;
        await rename(temporary, join(context.root, finalName));
        return Response.json({ backupId: finalName, entries: manifest.entries.length });
    }

    return Response.json({ error: "不支持的备份操作" }, { status: 400 });
}

export async function PUT(request: NextRequest) {
    const context = desktopContext(request);
    if (!context) return rejected();
    const id = safeHeader(request, "x-backup-session", 36);
    const store = safeHeader(request, "x-backup-store", 200);
    const key = safeHeader(request, "x-backup-key", 2_000);
    const kind = safeHeader(request, "x-backup-kind", 8);
    const mimeType = safeHeader(request, "x-backup-mime", 200) || "application/octet-stream";
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (!id || !SESSION_PATTERN.test(id) || !store || !key || (kind !== "blob" && kind !== "json")) {
        return Response.json({ error: "备份条目信息无效" }, { status: 400 });
    }
    if (!request.body || !Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_ENTRY_BYTES) {
        return Response.json({ error: "备份条目过大或内容为空" }, { status: 413 });
    }

    const directory = join(context.root, `.tmp-${id}`);
    const manifestPath = join(directory, "manifest.json");
    const manifest = await readManifest(manifestPath);
    if (manifest.entries.length >= MAX_ENTRIES) return Response.json({ error: "备份条目数量过多" }, { status: 413 });

    const file = `entry-${randomUUID()}.bin`;
    const filePath = join(directory, file);
    const hash = createHash("sha256");
    const hashing = new Transform({
        transform(chunk, _encoding, callback) {
            hash.update(chunk);
            callback(null, chunk);
        },
    });
    await pipeline(Readable.fromWeb(request.body as never), hashing, createWriteStream(filePath, { mode: 0o600 }));
    const info = await stat(filePath);
    if (info.size > MAX_ENTRY_BYTES) return Response.json({ error: "备份条目过大" }, { status: 413 });
    manifest.entries.push({ file, key, kind, mimeType, sha256: hash.digest("hex"), size: info.size, store });
    await writeManifest(manifestPath, manifest);
    return Response.json({ size: info.size });
}

export async function GET(request: NextRequest) {
    const context = desktopContext(request);
    if (!context) return rejected();
    const action = request.nextUrl.searchParams.get("action") || "status";
    await mkdir(context.root, { recursive: true });
    if (action === "status") return Response.json({ appVersion: context.appVersion, enabled: true, origin: context.origin });

    if (action === "latest") {
        const directories = (await readdir(context.root, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory() && BACKUP_PATTERN.test(entry.name))
            .map((entry) => entry.name)
            .sort()
            .reverse();
        for (const backupId of directories) {
            try {
                const manifest = await readManifest(join(context.root, backupId, "manifest.json"));
                if (manifest.completedAt) return Response.json({ backupId, manifest });
            } catch {}
        }
        return Response.json({ backupId: null, manifest: null });
    }

    if (action === "entry") {
        const backupId = basename(request.nextUrl.searchParams.get("backup") || "");
        const file = basename(request.nextUrl.searchParams.get("file") || "");
        if (!BACKUP_PATTERN.test(backupId) || !FILE_PATTERN.test(file)) return Response.json({ error: "备份文件无效" }, { status: 400 });
        const filePath = join(context.root, backupId, file);
        const info = await stat(filePath);
        return new Response(Readable.toWeb(createReadStream(filePath)) as BodyInit, {
            headers: { "content-length": String(info.size), "content-type": "application/octet-stream" },
        });
    }

    return Response.json({ error: "不支持的读取操作" }, { status: 400 });
}
