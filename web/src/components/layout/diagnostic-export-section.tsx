"use client";

import { App, Button, Checkbox, Popconfirm, Select } from "antd";
import { CheckCircle2, FileDown, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { saveAs } from "file-saver";

import { clearDiagnosticTasks, createDiagnosticExport, listDiagnosticTasks, type DiagnosticTask } from "@/services/diagnostic-log";

export function DiagnosticExportSection({ active }: { active: boolean }) {
    const { message } = App.useApp();
    const [tasks, setTasks] = useState<DiagnosticTask[]>([]);
    const [selectedTaskId, setSelectedTaskId] = useState("");
    const [includePrompt, setIncludePrompt] = useState(false);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        const next = await listDiagnosticTasks();
        setTasks(next);
        setSelectedTaskId((current) => (next.some((task) => task.id === current) ? current : next[0]?.id || ""));
    }, []);

    useEffect(() => {
        if (active) void refresh();
    }, [active, refresh]);

    const exportSelected = async () => {
        if (!selectedTaskId) {
            message.warning("还没有可以导出的诊断任务");
            return;
        }
        setLoading(true);
        try {
            const result = await createDiagnosticExport(selectedTaskId, includePrompt);
            saveAs(result.blob, result.fileName);
            message.success("诊断日志已安全导出，敏感信息已自动排除");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "诊断日志导出失败");
        } finally {
            setLoading(false);
        }
    };

    const clearAll = async () => {
        await clearDiagnosticTasks();
        setTasks([]);
        setSelectedTaskId("");
        message.success("诊断日志已清空");
    };

    const selectedTask = tasks.find((task) => task.id === selectedTaskId);

    return (
        <section className="mt-5 rounded-xl border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-900/50">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-stone-950 dark:text-stone-100">
                        <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                        诊断与日志
                    </div>
                    <div className="mt-1 text-xs leading-5 text-stone-500">按每次提交记录生成步骤，帮助判断问题发生在软件、素材、请求、任务查询还是结果保存阶段。</div>
                </div>
                <Button size="small" icon={<RefreshCw className="size-3.5" />} onClick={() => void refresh()}>
                    刷新
                </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div>
                    <div className="mb-1.5 text-xs font-medium text-stone-700 dark:text-stone-300">选择一次提交</div>
                    <Select className="w-full" value={selectedTaskId || undefined} placeholder="还没有诊断任务，生成一次图片或视频后即可导出" options={tasks.map((task) => ({ value: task.id, label: taskOptionLabel(task) }))} onChange={setSelectedTaskId} />
                </div>
                <Button type="primary" icon={<FileDown className="size-4" />} loading={loading} disabled={!selectedTaskId} onClick={() => void exportSelected()}>
                    安全导出
                </Button>
            </div>

            {selectedTask ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                    <span>画布：{selectedTask.canvasTitle}</span>
                    <span>模型：{selectedTask.model || "未确定"}</span>
                    <span className={selectedTask.status === "failed" ? "text-red-600 dark:text-red-400" : selectedTask.status === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                        {taskStatusLabel(selectedTask.status)}
                    </span>
                </div>
            ) : null}

            <div className="mt-4 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/25">
                <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div className="text-xs leading-5 text-emerald-950 dark:text-emerald-100">
                        <div className="font-medium">日志经过安全处理</div>
                        <div className="mt-1 text-emerald-800/80 dark:text-emerald-200/75">不包含 API Key、登录凭证、Cookie、鉴权请求头、参考素材或生成结果内容；完整本地路径、Base64 和链接查询参数也会自动隐藏。</div>
                    </div>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <Checkbox checked={includePrompt} onChange={(event) => setIncludePrompt(event.target.checked)}>
                    <span className="text-xs">包含提示词正文（可能涉及隐私，默认不选）</span>
                </Checkbox>
                <Popconfirm title="清空全部诊断日志？" description="清空后无法恢复，不会影响画布和生成记录。" okText="清空" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void clearAll()}>
                    <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} disabled={!tasks.length}>
                        清空日志
                    </Button>
                </Popconfirm>
            </div>
        </section>
    );
}

function taskOptionLabel(task: DiagnosticTask) {
    const time = new Date(task.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    const mode = ({ image: "图片", video: "视频", audio: "音频", text: "文本", workflow: "工作流" } as const)[task.mode];
    return `${time} · ${mode} · ${task.model || "未确定"} · ${taskStatusLabel(task.status)}`;
}

function taskStatusLabel(status: DiagnosticTask["status"]) {
    return ({ running: "进行中", success: "成功", failed: "失败" } as const)[status];
}
