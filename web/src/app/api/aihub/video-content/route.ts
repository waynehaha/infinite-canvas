import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const AIHUB_API_BASE_URL = "https://aihubcc.cc/v1";
const AIHUB_RESULT_CONNECT_TIMEOUT_MS = 20_000;

export async function GET(request: NextRequest) {
    const taskId = request.nextUrl.searchParams.get("taskId")?.trim() || "";
    const authorization = request.headers.get("authorization") || "";
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(taskId)) return Response.json({ message: "视频任务 ID 无效" }, { status: 400 });
    if (!authorization) return Response.json({ message: "缺少 AIHub API Key" }, { status: 401 });

    try {
        const response = await fetch(`${AIHUB_API_BASE_URL}/videos/${encodeURIComponent(taskId)}/content`, {
            headers: { Authorization: authorization, Accept: "video/*,image/*,*/*" },
            cache: "no-store",
            redirect: "follow",
            signal: AbortSignal.timeout(AIHUB_RESULT_CONNECT_TIMEOUT_MS),
        });
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        headers.delete("content-encoding");
        headers.delete("transfer-encoding");
        headers.set("cache-control", "no-store");
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch {
        return Response.json({ message: "AIHub 视频结果下载失败" }, { status: 502 });
    }
}
