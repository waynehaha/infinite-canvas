"use client";

import { App, Button, Empty, Modal, Popconfirm, Select } from "antd";
import { CheckCircle2, FileDown, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { saveAs } from "file-saver";

import { clearDiagnosticTasks, createDiagnosticExport, listDiagnosticTasks, subscribeDiagnosticTasks, type DiagnosticTask } from "@/services/diagnostic-log";

export function DiagnosticLogModal({ open, canvasId, canvasTitle, onClose }: { open: boolean; canvasId: string; canvasTitle: string; onClose: () => void }) {
    const { message } = App.useApp();
    const [tasks, setTasks] = useState<DiagnosticTask[]>([]);
    const [selectedTaskId, setSelectedTaskId] = useState("");
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const next = await listDiagnosticTasks(canvasId);
            setTasks(next);
            setSelectedTaskId((current) => (next.some((task) => task.id === current) ? current : next[0]?.id || ""));
        } finally {
            setRefreshing(false);
        }
    }, [canvasId]);

    useEffect(() => {
        if (!open) return;
        return subscribeDiagnosticTasks(() => void refresh());
    }, [open, refresh]);

    const exportSelected = async () => {
        if (!selectedTaskId) {
            message.warning("当前画布还没有可以导出的诊断任务");
            return;
        }
        setLoading(true);
        try {
            const result = await createDiagnosticExport(selectedTaskId);
            saveAs(result.blob, result.fileName);
            message.success("诊断日志已导出，API Key 等敏感信息已自动排除");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "诊断日志导出失败");
        } finally {
            setLoading(false);
        }
    };

    const clearCurrentCanvas = async () => {
        await clearDiagnosticTasks(canvasId);
        setTasks([]);
        setSelectedTaskId("");
        message.success("当前画布的诊断日志已清空");
    };

    const selectedTask = tasks.find((task) => task.id === selectedTaskId);

    return (
        <Modal
            title={
                <div>
                    <div className="flex items-center gap-2 text-lg font-semibold">
                        <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
                        诊断日志
                    </div>
                    <div className="mt-1 text-xs font-normal text-stone-500">当前画布：{canvasTitle}</div>
                </div>
            }
            open={open}
            width={760}
            centered
            footer={null}
            onCancel={onClose}
            afterOpenChange={(visible) => {
                if (visible) void refresh();
            }}
        >
            <div className="pt-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-xl text-sm leading-6 text-stone-600 dark:text-stone-400">按每次提交记录生成步骤，帮助判断问题发生在软件、素材、请求、任务查询还是结果保存阶段。打开后会自动读取最新任务。</div>
                    <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={refreshing} onClick={() => void refresh()}>
                        刷新
                    </Button>
                </div>

                {tasks.length ? (
                    <>
                        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                            <div>
                                <div className="mb-1.5 text-xs font-medium text-stone-700 dark:text-stone-300">选择一次提交</div>
                                <Select className="w-full" value={selectedTaskId || undefined} options={tasks.map((task) => ({ value: task.id, label: taskOptionLabel(task) }))} onChange={setSelectedTaskId} />
                            </div>
                            <Button type="primary" icon={<FileDown className="size-4" />} loading={loading} disabled={!selectedTaskId} onClick={() => void exportSelected()}>
                                导出诊断日志
                            </Button>
                        </div>

                        {selectedTask ? (
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                                <span>模型：{selectedTask.model || "未确定"}</span>
                                <span>步骤：{selectedTask.events.length}</span>
                                <span className={selectedTask.status === "failed" ? "text-red-600 dark:text-red-400" : selectedTask.status === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>{taskStatusLabel(selectedTask.status)}</span>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <div className="mt-5 rounded-xl border border-dashed border-stone-200 py-5 dark:border-stone-800">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-sm text-stone-500">当前画布还没有诊断任务</span>} />
                    </div>
                )}

                <div className="mt-5 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/25">
                    <div className="flex items-start gap-2.5">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <div className="text-xs leading-5 text-emerald-950 dark:text-emerald-100">
                            <div className="font-medium">导出内容与安全说明</div>
                            <div className="mt-1 text-emerald-800/80 dark:text-emerald-200/75">日志会包含本次任务的提示词正文，便于排查请求问题；不会包含 API Key、鉴权信息或素材内容。日志仅下载到本机，不会自动上传。</div>
                        </div>
                    </div>
                </div>

                <div className="mt-3 flex justify-end">
                    <Popconfirm title="清空当前画布的诊断日志？" description="清空后无法恢复，不会影响画布和生成记录。" okText="清空" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void clearCurrentCanvas()}>
                        <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} disabled={!tasks.length}>
                            清空日志
                        </Button>
                    </Popconfirm>
                </div>
            </div>
        </Modal>
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
