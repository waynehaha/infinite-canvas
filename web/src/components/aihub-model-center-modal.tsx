"use client";

import { Button, Input, Modal, Segmented, Tag } from "antd";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { AIHubModelCatalog } from "@/lib/aihub-model-catalog";
import type { AIHubRemoteConfigStatus } from "@/lib/aihub-remote-config";

type Filter = "all" | "image" | "video" | "text" | "audio";

const kindLabel = { image: "图片", video: "视频", text: "文本", audio: "音乐" } as const;

export function AIHubModelCenterModal({ open, catalog, status, loading, onClose, onRefresh }: { open: boolean; catalog: AIHubModelCatalog; status: AIHubRemoteConfigStatus | null; loading: boolean; onClose: () => void; onRefresh: () => void }) {
    const [filter, setFilter] = useState<Filter>("all");
    const [query, setQuery] = useState("");
    const models = useMemo(() => {
        const needle = searchable(query);
        return catalog.models.filter((entry) => (filter === "all" || entry.kind === filter) && (!needle || [entry.model, entry.displayName, entry.description].some((value) => searchable(value || "").includes(needle))));
    }, [catalog.models, filter, query]);

    return (
        <Modal
            open={open}
            onCancel={onClose}
            width={900}
            centered
            title={
                <div>
                    <div className="text-lg font-semibold">AIHub 模型中心</div>
                    <div className="mt-1 text-xs font-normal text-stone-500">模型能力与文档会在后台自动保持最新</div>
                </div>
            }
            footer={<Button onClick={onClose}>关闭</Button>}
            styles={{ body: { maxHeight: "72vh", overflowY: "auto" } }}
        >
            <div className="sticky top-0 z-10 -mx-1 mb-4 space-y-3 bg-white px-1 pb-3 pt-1 dark:bg-[#141414]">
                <div className="flex flex-wrap items-center gap-2">
                    <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Search size={14} />} placeholder="搜索模型或能力" className="min-w-[240px] flex-1" />
                    <Button icon={<RefreshCw size={14} />} loading={loading} onClick={onRefresh}>
                        立即检查
                    </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Segmented value={filter} onChange={(value) => setFilter(value as Filter)} options={[{ label: "全部", value: "all" }, { label: "图片", value: "image" }, { label: "视频", value: "video" }, { label: "文本", value: "text" }, { label: "音乐", value: "audio" }]} />
                    <span className="text-xs text-stone-500">{status?.message || `本地内置配置 · ${catalog.models.length} 个模型`}</span>
                </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                {models.map((entry) => (
                    <div key={entry.model} className="group rounded-xl border border-stone-200 bg-stone-50/60 p-4 transition-colors hover:border-stone-300 hover:bg-white dark:border-stone-800 dark:bg-stone-900/60 dark:hover:border-stone-700 dark:hover:bg-stone-900">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-semibold" title={entry.model}>{entry.displayName || entry.model}</div>
                                {entry.displayName ? <div className="mt-0.5 truncate font-mono text-[11px] text-stone-500">{entry.model}</div> : null}
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <Tag className="m-0">{kindLabel[entry.kind]}</Tag>
                                <Tag className="m-0" color={entry.enabled ? "success" : "default"}>{entry.enabled ? "已启用" : "当前 Key 不可用"}</Tag>
                            </div>
                        </div>
                        <p className="mb-0 mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-stone-500">{entry.description || entry.capability?.fixedSummary.join(" · ") || "使用 AIHub 标准接口调用"}</p>
                        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-stone-400">
                            <span>{entry.capability?.endpoint || "OpenAI 兼容接口"}</span>
                            {entry.documentationUrl ? (
                                <Button type="link" size="small" className="h-auto p-0 text-xs" icon={<ExternalLink size={12} />} iconPlacement="end" onClick={() => window.open(entry.documentationUrl, "_blank", "noopener,noreferrer")}>查看文档</Button>
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>
            {!models.length ? <div className="py-16 text-center text-sm text-stone-500">没有找到匹配的模型</div> : null}
        </Modal>
    );
}

function searchable(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}
