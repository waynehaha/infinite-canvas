"use client";

import { App, Button, Checkbox, Empty, Modal, Popconfirm, Select } from "antd";
import { AlertTriangle, CheckCircle2, FileDown, FileSearch, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { saveAs } from "file-saver";

import { clearDiagnosticTasks, createDiagnosticExport, listDiagnosticTasks, subscribeDiagnosticTasks, type DiagnosticTask } from "@/services/diagnostic-log";

const DIAGNOSTIC_EXPORT_NOTICE_KEY = "infinite-canvas:diagnostic-export-notice:reference-originals-v1";

export function DiagnosticLogModal({ open, scopeId, scopeTitle, scopeLabel = "画布", onClose }: { open: boolean; scopeId: string; scopeTitle: string; scopeLabel?: "画布" | "工作台"; onClose: () => void }) {
    const { message } = App.useApp();
    const [tasks, setTasks] = useState<DiagnosticTask[]>([]);
    const [selectedTaskId, setSelectedTaskId] = useState("");
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [exportNoticeOpen, setExportNoticeOpen] = useState(false);
    const [skipFutureNotice, setSkipFutureNotice] = useState(true);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const next = await listDiagnosticTasks(scopeId);
            setTasks(next);
            setSelectedTaskId((current) => (next.some((task) => task.id === current) ? current : next[0]?.id || ""));
        } finally {
            setRefreshing(false);
        }
    }, [scopeId]);

    useEffect(() => {
        if (!open) return;
        return subscribeDiagnosticTasks(() => void refresh());
    }, [open, refresh]);

    const exportSelected = async () => {
        if (!selectedTaskId) {
            message.warning(`当前${scopeLabel}还没有可以导出的诊断任务`);
            return false;
        }
        setLoading(true);
        try {
            const result = await createDiagnosticExport(selectedTaskId);
            saveAs(result.blob, result.fileName);
            message.success("诊断日志已导出，软件配置中的 API Key 和鉴权信息已自动排除");
            return true;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "诊断日志导出失败");
            return false;
        } finally {
            setLoading(false);
        }
    };

    const requestExport = () => {
        if (!selectedTaskId) {
            message.warning(`当前${scopeLabel}还没有可以导出的诊断任务`);
            return;
        }
        if (!hasAcceptedDiagnosticExportNotice()) {
            setSkipFutureNotice(true);
            setExportNoticeOpen(true);
            return;
        }
        void exportSelected();
    };

    const confirmExport = async () => {
        setExportNoticeOpen(false);
        const exported = await exportSelected();
        if (exported && skipFutureNotice) acceptDiagnosticExportNotice();
    };

    const clearCurrentScope = async () => {
        await clearDiagnosticTasks(scopeId);
        setTasks([]);
        setSelectedTaskId("");
        message.success(`当前${scopeLabel}的诊断日志已清空`);
    };

    const selectedTask = tasks.find((task) => task.id === selectedTaskId);

    return (
        <>
            <Modal
                title={
                    <div>
                        <div className="flex items-center gap-2 text-lg font-semibold">
                            <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
                            诊断日志
                        </div>
                        <div className="mt-1 text-xs font-normal text-stone-500">当前{scopeLabel}：{scopeTitle}</div>
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
                            <Button type="primary" icon={<FileDown className="size-4" />} loading={loading} disabled={!selectedTaskId} onClick={requestExport}>
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
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-sm text-stone-500">当前{scopeLabel}还没有诊断任务</span>} />
                    </div>
                )}

                <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/60">
                    <div className="flex items-start gap-2.5">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-500 dark:text-amber-400" />
                        <div className="text-xs leading-5">
                            <div className="font-medium text-amber-600 dark:text-amber-400">导出内容与安全说明</div>
                            <div className="mt-1 text-stone-600 dark:text-stone-400">诊断包会包含提示词正文、本地参考图和参考视频原文件、原文件名及媒体元数据；公网参考素材只记录链接。软件不会额外写入 API Key 或请求鉴权信息，日志仅下载到本机，不会自动上传。</div>
                        </div>
                    </div>
                </div>

                <div className="mt-3 flex justify-end">
                    <Popconfirm title={`清空当前${scopeLabel}的诊断日志？`} description={`清空后无法恢复，不会影响${scopeLabel}和生成记录。`} okText="清空" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void clearCurrentScope()}>
                        <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} disabled={!tasks.length}>
                            清空日志
                        </Button>
                    </Popconfirm>
                </div>
                </div>
            </Modal>
            <Modal
                title={
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="size-5 text-amber-500 dark:text-amber-400" />
                        <span>确认导出诊断日志</span>
                    </div>
                }
                open={exportNoticeOpen}
                width={520}
                centered
                okText="确认并导出"
                cancelText="取消"
                confirmLoading={loading}
                onOk={() => void confirmExport()}
                onCancel={() => setExportNoticeOpen(false)}
                destroyOnHidden
            >
                <div className="space-y-4 pt-2 text-sm text-stone-700 dark:text-stone-300">
                    <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/70">
                        <div className="font-medium text-stone-900 dark:text-stone-100">诊断包将包含</div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 leading-6 text-stone-600 dark:text-stone-400">
                            <li>本次任务的提示词正文；</li>
                            <li>本地参考图和参考视频原文件、原文件名及媒体元数据；</li>
                            <li>公网参考素材链接，以及每个素材的尺寸、大小、格式和请求使用情况。</li>
                        </ul>
                    </div>
                    <div className="text-xs leading-5 text-stone-500">软件不会额外写入 API Key、登录凭证或请求鉴权信息，诊断包只会下载到本机。参考图和参考视频的画面、声音、原文件名及拍摄时间、位置等元数据会原样保留，请确认后再发送给他人。</div>
                    <Checkbox checked={skipFutureNotice} onChange={(event) => setSkipFutureNotice(event.target.checked)}>
                        下次不再提醒
                    </Checkbox>
                </div>
            </Modal>
        </>
    );
}

export function WorkbenchDiagnosticLogButton({ scopeId, scopeTitle }: { scopeId: "image-workbench" | "video-workbench"; scopeTitle: string }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button type="text" size="small" icon={<FileSearch className="size-3.5" />} onClick={() => setOpen(true)}>
                日志
            </Button>
            <DiagnosticLogModal open={open} scopeId={scopeId} scopeTitle={scopeTitle} scopeLabel="工作台" onClose={() => setOpen(false)} />
        </>
    );
}

function taskOptionLabel(task: DiagnosticTask) {
    const time = new Date(task.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    const mode = ({ image: "图片", video: "视频", audio: "音频", text: "文本", workflow: "工作流" } as const)[task.mode];
    return `${time} · ${mode} · ${task.model || "未确定"} · ${task.reconstructed ? "历史补充 · " : ""}${taskStatusLabel(task.status)}`;
}

function taskStatusLabel(status: DiagnosticTask["status"]) {
    return ({ running: "进行中", success: "成功", failed: "失败" } as const)[status];
}

function hasAcceptedDiagnosticExportNotice() {
    try {
        return window.localStorage?.getItem(DIAGNOSTIC_EXPORT_NOTICE_KEY) === "accepted";
    } catch {
        return false;
    }
}

function acceptDiagnosticExportNotice() {
    try {
        window.localStorage?.setItem(DIAGNOSTIC_EXPORT_NOTICE_KEY, "accepted");
    } catch {
        // Restricted browser contexts will show the notice again next time.
    }
}
