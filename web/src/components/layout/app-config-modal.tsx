"use client";

import { App, Button, Dropdown, Form, Input, Modal, Segmented, Select, Switch } from "antd";
import { useEffect, useRef, useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { fetchImageModels, ModelListRequestError } from "@/services/api/image";
import { fetchUserConfig, measureUserStorageProvider, syncUserModelConfig, syncUserStorageProvider } from "@/services/api/user-config";
import { clearStorageConfigCache as clearFileStorageCache } from "@/services/file-storage";
import { clearStorageConfigCache as clearImageStorageCache, defaultUserStorageProvider, loadStorageConfig, saveUserStorageProvider, USER_STORAGE_PROVIDER_KEY, type UserStorageProvider } from "@/services/image-storage";
import { audioFormatOptions, audioVoiceOptions, normalizeAudioSpeedValue } from "@/lib/audio-generation";
import { applyAIHubModelCatalog, buildBuiltInAIHubModelCatalog, clearPersistedAIHubModelCatalog, loadPersistedAIHubModelCatalog, type AIHubModelCatalog } from "@/lib/aihub-model-catalog";
import { buildAIHubServiceConfig, buildBuiltInAIHubServiceConfig, diffAIHubServiceConfig, parseAIHubServiceConfig, serviceConfigCatalog, type AIHubServiceConfig } from "@/lib/aihub-service-config";
import { USER_LOGIN_ENABLED } from "@/lib/user-auth-mode";
import { filterModelsByCapability, normalizeLocalChannels, useConfigStore, useEffectiveConfig, type AiConfig, type LocalModelChannel, type ModelCapability } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type ModelGroup = {
    capability: ModelCapability;
    modelKey: "imageModel" | "videoModel" | "textModel" | "audioModel";
    channelKey: "imageChannelId" | "videoChannelId" | "textChannelId" | "audioChannelId";
    modelsKey: "imageModels" | "videoModels" | "textModels" | "audioModels";
    defaultLabel: string;
    optionsLabel: string;
};

type ChannelConnectionFeedback = {
    tone: "success" | "warning" | "error";
    text: string;
};

const modelGroups: ModelGroup[] = [
    { capability: "image", modelKey: "imageModel", channelKey: "imageChannelId", modelsKey: "imageModels", defaultLabel: "默认生图模型", optionsLabel: "生图模型可选项" },
    { capability: "video", modelKey: "videoModel", channelKey: "videoChannelId", modelsKey: "videoModels", defaultLabel: "默认视频模型", optionsLabel: "视频模型可选项" },
    { capability: "text", modelKey: "textModel", channelKey: "textChannelId", modelsKey: "textModels", defaultLabel: "默认文本模型", optionsLabel: "文本模型可选项" },
    { capability: "audio", modelKey: "audioModel", channelKey: "audioChannelId", modelsKey: "audioModels", defaultLabel: "默认音频模型", optionsLabel: "音频模型可选项" },
];

export function AppConfigModal() {
    const { message, modal } = App.useApp();
    const [loadingModels, setLoadingModels] = useState(false);
    const [testingChannelId, setTestingChannelId] = useState("");
    const [channelConnectionFeedback, setChannelConnectionFeedback] = useState<Record<string, ChannelConnectionFeedback>>({});
    const [savingConfig, setSavingConfig] = useState(false);
    const [remoteStorageSyncEnabled, setRemoteStorageSyncEnabled] = useState(false);
    const [allowUserStorageProvider, setAllowUserStorageProvider] = useState(false);
    const [userStorage, setUserStorage] = useState<UserStorageProvider>(() => defaultUserStorageProvider());
    const [measuringStorage, setMeasuringStorage] = useState(false);
    const [storageUsageText, setStorageUsageText] = useState("");
    const [modelCatalog, setModelCatalog] = useState<AIHubModelCatalog | null>(null);
    const [serviceConfig, setServiceConfig] = useState<AIHubServiceConfig | null>(null);
    const modelCatalogInputRef = useRef<HTMLInputElement>(null);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const token = useUserStore((state) => (USER_LOGIN_ENABLED ? state.token : ""));
    const user = useUserStore((state) => state.user);
    const effectiveConfig = useEffectiveConfig();
    const modelChannel = publicSettings?.modelChannel;
    const isLoggedIn = Boolean(token && user);
    const canUseRemoteChannel = isLoggedIn && (user?.role === "admin" || modelChannel?.allowUserRemoteChannel === true);
    const allowCustomChannel = isLoggedIn && modelChannel?.allowCustomChannel === true;
    const effectiveMode = canUseRemoteChannel ? (allowCustomChannel ? config.channelMode : "remote") : "local";
    const localModelConfig: AiConfig = effectiveMode === "local" && config.channelMode !== "local" ? { ...config, channelMode: "local" } : config;
    const modelConfig = effectiveMode === "remote" ? effectiveConfig : localModelConfig;
    const canUseUserStorageProvider = isLoggedIn && allowUserStorageProvider;

    useEffect(() => {
        if (!isConfigOpen) return;
        const catalog = loadPersistedAIHubModelCatalog();
        setModelCatalog(catalog);
        setServiceConfig(
            buildAIHubServiceConfig(catalog || buildBuiltInAIHubModelCatalog(), normalizeLocalChannels(config)[0]?.baseUrl || config.baseUrl, { image: config.imageModel, video: config.videoModel, text: config.textModel, audio: config.audioModel }),
        );
    }, [config.audioModel, config.baseUrl, config.imageModel, config.textModel, config.videoModel, isConfigOpen]);

    useEffect(() => {
        try {
            setUserStorage({ ...defaultUserStorageProvider(), ...JSON.parse(window.localStorage.getItem(USER_STORAGE_PROVIDER_KEY) || "{}") });
        } catch {
            setUserStorage(defaultUserStorageProvider());
        }
        if (!isConfigOpen || !token) return;
        let canceled = false;
        void fetchUserConfig(token)
            .then((payload) => {
                if (canceled) return;
                const remoteConfig = payload.modelConfig;
                const shouldSync = remoteConfig?.syncModelConfig === true;
                const shouldSyncStorage = remoteConfig?.syncStorageConfig === true;
                setRemoteStorageSyncEnabled(shouldSyncStorage);
                if (remoteConfig) {
                    Object.entries(remoteConfig)
                        .filter(([key]) => shouldSync || !["apiKey", "baseUrl", "localChannels"].includes(key))
                        .forEach(([key, value]) => updateConfig(key as keyof AiConfig, value as never));
                } else {
                    updateConfig("syncModelConfig", false);
                }
                updateConfig("syncStorageConfig", shouldSyncStorage);
                if (shouldSyncStorage && payload.storageProvider) {
                    const next = {
                        ...defaultUserStorageProvider(),
                        ...payload.storageProvider,
                        enabled: payload.storageProvider.enabled !== undefined ? payload.storageProvider.enabled : true,
                    };
                    setUserStorage(next);
                    saveUserStorageProvider(next);
                }
            })
            .catch(() => {});
        return () => {
            canceled = true;
        };
    }, [isConfigOpen, token, updateConfig]);

    useEffect(() => {
        if (!isConfigOpen) return;
        let canceled = false;
        void loadStorageConfig()
            .then((storage) => {
                if (!canceled) setAllowUserStorageProvider(storage.allowUserProvider === true);
            })
            .catch(() => {
                if (!canceled) setAllowUserStorageProvider(false);
            });
        return () => {
            canceled = true;
        };
    }, [isConfigOpen]);

    const finishConfig = async () => {
        const localIncomplete = effectiveMode === "local" && normalizeLocalChannels(config).some((channel) => !channel.baseUrl.trim() || !channel.apiKey.trim());
        const modelIncomplete = !modelConfig.imageModel.trim() || !modelConfig.videoModel.trim() || !modelConfig.textModel.trim();
        if (!canUseRemoteChannel && config.channelMode !== "local") updateConfig("channelMode", "local");
        else if (canUseRemoteChannel && !allowCustomChannel && config.channelMode !== "remote") updateConfig("channelMode", "remote");
        if (canUseUserStorageProvider) saveUserStorageProvider(userStorage);
        setSavingConfig(true);
        try {
            if (token) {
                const configToSave = effectiveMode === "local" && config.channelMode !== "local" ? { ...config, channelMode: "local" as const } : config;
                const shouldSaveLocalSecrets = effectiveMode === "local" && config.syncModelConfig;
                await syncUserModelConfig(
                    token,
                    shouldSaveLocalSecrets
                        ? configToSave
                        : {
                              ...configToSave,
                              channelMode: canUseRemoteChannel ? "remote" : "local",
                              apiKey: "",
                              baseUrl: "",
                              localChannels: [],
                          },
                );
            }
            if (token && canUseUserStorageProvider && (config.syncStorageConfig || remoteStorageSyncEnabled)) {
                await syncUserStorageProvider(token, config.syncStorageConfig ? userStorage : { ...userStorage, enabled: false, endpoint: "", bucket: "", accessKeyId: "", secretAccessKey: "" });
                setRemoteStorageSyncEnabled(config.syncStorageConfig);
            }
            clearImageStorageCache();
            clearFileStorageCache();
            setConfigDialogOpen(false);
            if (USER_LOGIN_ENABLED && (config.syncModelConfig || config.syncStorageConfig) && !token) message.warning("请登录后再同步配置");
            else if (localIncomplete || modelIncomplete) message.warning("部分模型或本地渠道密钥尚未配置完整，配置已保存");
            else message.success(shouldPromptContinue ? "配置已保存，请继续刚才的请求" : "配置已保存");
            clearPromptContinue();
        } catch (error) {
            message.error(error instanceof Error ? "同步配置失败：" + error.message : "同步配置失败");
        } finally {
            setSavingConfig(false);
        }
    };

    const refreshModels = async () => {
        if (effectiveMode === "remote") return;
        const channels = normalizeLocalChannels(config);
        if (channels.some((channel) => !channel.baseUrl.trim() || !channel.apiKey.trim())) {
            message.error("请先填写所有本地渠道的 Base URL 和 API Key");
            return;
        }
        setLoadingModels(true);
        try {
            const nextChannels = await Promise.all(channels.map(async (channel) => ({ ...channel, models: await fetchImageModels(configForLocalChannel(config, channel)) })));
            updateLocalChannels(nextChannels);
            message.success("全部渠道模型已更新");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取模型失败");
        } finally {
            setLoadingModels(false);
        }
    };

    const applyServiceConfig = (next: AIHubServiceConfig) => {
        const enabledModels = next.models.filter((entry) => entry.enabled).map((entry) => entry.model);
        const channels = normalizeLocalChannels(config);
        const nextChannels = channels.map((channel) => (channel.id === "aihub" ? { ...channel, baseUrl: next.service.baseUrl, models: enabledModels } : channel));
        applyAIHubModelCatalog(serviceConfigCatalog(next));
        setModelCatalog(serviceConfigCatalog(next));
        setServiceConfig(next);
        updateLocalChannels(nextChannels);
        updateConfig("imageModel", next.defaults.image);
        updateConfig("videoModel", next.defaults.video);
        updateConfig("textModel", next.defaults.text);
        updateConfig("audioModel", next.defaults.audio);
    };

    const importServiceConfig = async (file: File) => {
        try {
            const current =
                serviceConfig ||
                buildAIHubServiceConfig(modelCatalog || buildBuiltInAIHubModelCatalog(), normalizeLocalChannels(config)[0]?.baseUrl || config.baseUrl, {
                    image: config.imageModel,
                    video: config.videoModel,
                    text: config.textModel,
                    audio: config.audioModel,
                });
            const next = parseAIHubServiceConfig(await file.text(), { baseUrl: current.service.baseUrl, defaults: current.defaults });
            const diff = diffAIHubServiceConfig(current, next);
            const changes = `新增模型：${diff.added} 个 · 更新模型：${diff.updated} 个 · 停用/移除：${diff.disabled} 个`;
            const baseUrlText = diff.baseUrlChanged ? `\nBase URL：${diff.previousBaseUrl} → ${diff.nextBaseUrl}\n请确认新的服务地址可信。` : "\nBase URL：未变化";
            modal.confirm({
                title: "确认应用 AIHub 服务配置？",
                content: (
                    <div className="whitespace-pre-line text-sm text-stone-500">
                        {changes}
                        {baseUrlText}
                    </div>
                ),
                okText: "确认应用",
                cancelText: "取消",
                onOk: () => {
                    applyServiceConfig(next);
                    message.success(`AIHub 服务配置已应用，共 ${next.models.filter((entry) => entry.enabled).length} 个可用模型`);
                },
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AIHub 服务配置导入失败");
        } finally {
            if (modelCatalogInputRef.current) modelCatalogInputRef.current.value = "";
        }
    };

    const exportServiceConfig = () => {
        const current =
            serviceConfig ||
            buildAIHubServiceConfig(modelCatalog || buildBuiltInAIHubModelCatalog(), normalizeLocalChannels(config)[0]?.baseUrl || config.baseUrl, { image: config.imageModel, video: config.videoModel, text: config.textModel, audio: config.audioModel });
        const blob = new Blob([JSON.stringify(current, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `aihub-service-config-${current.updatedAt.slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        message.success("AIHub 服务配置已导出");
    };

    const restoreBuiltInServiceConfig = () => {
        clearPersistedAIHubModelCatalog();
        applyServiceConfig(buildBuiltInAIHubServiceConfig());
        setModelCatalog(null);
        message.success("已恢复内置 AIHub 服务配置");
    };

    const updateLocalChannels = (channels: LocalModelChannel[]) => {
        const normalized = channels.length ? channels : normalizeLocalChannels({ baseUrl: config.baseUrl, apiKey: config.apiKey, models: config.models });
        const models = uniqueModels(normalized.flatMap((channel) => channel.models));
        const nextImageModels = filterModelsByCapability(models, "image");
        const nextVideoModels = filterModelsByCapability(models, "video");
        const nextTextModels = filterModelsByCapability(models, "text");
        const nextAudioModels = filterModelsByCapability(models, "audio");
        const imageModel = nextImageModels.includes(config.imageModel) ? config.imageModel : nextImageModels[0] || "";
        const videoModel = nextVideoModels.includes(config.videoModel) ? config.videoModel : nextVideoModels[0] || "";
        const textModel = nextTextModels.includes(config.textModel) ? config.textModel : nextTextModels[0] || "";
        const audioModel = nextAudioModels.includes(config.audioModel) ? config.audioModel : nextAudioModels[0] || "";
        updateConfig("localChannels", normalized);
        updateConfig("models", models);
        updateConfig("imageModels", nextImageModels);
        updateConfig("videoModels", nextVideoModels);
        updateConfig("textModels", nextTextModels);
        updateConfig("audioModels", nextAudioModels);
        updateConfig("imageModel", imageModel);
        updateConfig("videoModel", videoModel);
        updateConfig("textModel", textModel);
        updateConfig("audioModel", audioModel);
        updateConfig("imageChannelId", channelIdForLocalModel(normalized, imageModel, config.imageChannelId));
        updateConfig("videoChannelId", channelIdForLocalModel(normalized, videoModel, config.videoChannelId));
        updateConfig("textChannelId", channelIdForLocalModel(normalized, textModel, config.textChannelId));
        updateConfig("audioChannelId", channelIdForLocalModel(normalized, audioModel, config.audioChannelId));
        updateConfig("baseUrl", normalized[0]?.baseUrl || config.baseUrl);
        updateConfig("apiKey", normalized[0]?.apiKey || config.apiKey);
    };

    const patchLocalChannel = (id: string, patch: Partial<LocalModelChannel>) => {
        if ("baseUrl" in patch || "apiKey" in patch) {
            setChannelConnectionFeedback((current) => {
                const next = { ...current };
                delete next[id];
                return next;
            });
        }
        updateLocalChannels(normalizeLocalChannels(config).map((channel) => (channel.id === id ? { ...channel, ...patch } : channel)));
    };

    const addLocalChannel = () => {
        updateLocalChannels([...normalizeLocalChannels(config), { id: "local-" + Date.now(), name: "新渠道", baseUrl: "", apiKey: "", models: [] }]);
    };

    const removeLocalChannel = (id: string) => {
        updateLocalChannels(normalizeLocalChannels(config).filter((channel) => channel.id !== id));
    };

    const testLocalChannel = async (channel: LocalModelChannel) => {
        if (!channel.baseUrl.trim() || !channel.apiKey.trim()) {
            const text = "请先填写 Base URL 和 API Key";
            setChannelConnectionFeedback((current) => ({ ...current, [channel.id]: { tone: "error", text } }));
            message.error(text);
            return;
        }
        setTestingChannelId(channel.id);
        try {
            const models = await fetchImageModels(configForLocalChannel(config, channel));
            patchLocalChannel(channel.id, { models });
            const feedback: ChannelConnectionFeedback = models.length
                ? { tone: "success", text: `连接成功 · Key 可用 · 已同步 ${models.length} 个模型` }
                : { tone: "warning", text: "连接成功，但当前 Key 没有返回可用模型" };
            setChannelConnectionFeedback((current) => ({ ...current, [channel.id]: feedback }));
            if (models.length) message.success(`连接成功，已同步 ${models.length} 个模型`);
            else message.warning(feedback.text);
        } catch (error) {
            const text = modelConnectionErrorText(error);
            setChannelConnectionFeedback((current) => ({ ...current, [channel.id]: { tone: "error", text } }));
            message.error(text);
        } finally {
            setTestingChannelId("");
        }
    };


    const measureStorage = async () => {
        if (!token) {
            message.warning("请先登录后再统计容量");
            return;
        }
        setMeasuringStorage(true);
        try {
            const result = await measureUserStorageProvider(token, userStorage);
            setStorageUsageText(`${formatBytes(result.bytes)} / ${formatBytes(result.limitBytes)}${result.overLimit ? "，已达到上限" : ""}`);
            if (result.overLimit) {
                const next = { ...userStorage, enabled: false };
                setUserStorage(next);
                saveUserStorageProvider(next);
            }
            message.success("容量统计完成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "容量统计失败");
        } finally {
            setMeasuringStorage(false);
        }
    };

    return (
        <Modal
            title={
                <div>
                    <div className="text-lg font-semibold">配置与用户偏好</div>
                    <div className="mt-1 text-xs font-normal text-stone-500">模型、渠道和画布默认行为</div>
                </div>
            }
            open={isConfigOpen}
            width={960}
            centered
            onCancel={() => setConfigDialogOpen(false)}
            styles={{ body: { maxHeight: "72vh", overflowY: "auto", paddingRight: 18 } }}
            footer={
                <Button type="primary" loading={savingConfig} onClick={() => void finishConfig()}>
                    完成
                </Button>
            }
        >
            <div className="pt-1">
                <Form layout="vertical" requiredMark={false}>
                    {allowCustomChannel && canUseRemoteChannel ? (
                        <Form.Item label="渠道模式" className="mb-5">
                            <Segmented
                                block
                                size="middle"
                                value={effectiveMode}
                                onChange={(value) => updateConfig("channelMode", value as AiConfig["channelMode"])}
                                options={[
                                    { label: "本地直连", value: "local" },
                                    { label: "云端渠道", value: "remote" },
                                ]}
                            />
                        </Form.Item>
                    ) : null}
                    {effectiveMode === "local" ? (
                        <>
                            <div className="mb-5 space-y-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-medium">本地模型渠道</div>
                                        <div className="mt-1 text-xs text-stone-500">可为生图、视频、文本、音频分别选择不同渠道的模型。</div>
                                    </div>
                                    <Button size="small" onClick={addLocalChannel}>
                                        新增渠道
                                    </Button>
                                </div>
                                {normalizeLocalChannels(config).map((channel, index) => (
                                    <div key={channel.id} className="space-y-2 rounded-md bg-stone-50 p-2 dark:bg-stone-900">
                                        <div className="grid gap-2 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_auto]">
                                            <Input value={channel.name} placeholder="渠道名称" onChange={(event) => patchLocalChannel(channel.id, { name: event.target.value })} />
                                            <Input value={channel.baseUrl} placeholder="Base URL" onChange={(event) => patchLocalChannel(channel.id, { baseUrl: event.target.value })} />
                                            <Input.Password value={channel.apiKey} placeholder="API Key" onChange={(event) => patchLocalChannel(channel.id, { apiKey: event.target.value })} />
                                            <div className="flex gap-2">
                                                <Button size="small" loading={testingChannelId === channel.id} disabled={loadingModels || Boolean(testingChannelId && testingChannelId !== channel.id)} onClick={() => void testLocalChannel(channel)}>
                                                    测试连接
                                                </Button>
                                                <Button size="small" danger disabled={index === 0 && normalizeLocalChannels(config).length === 1} onClick={() => removeLocalChannel(channel.id)}>
                                                    删除
                                                </Button>
                                            </div>
                                        </div>
                                        <ChannelConnectionStatus channel={channel} feedback={channelConnectionFeedback[channel.id]} />
                                    </div>
                                ))}
                            </div>
                            <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-800">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium">模型目录</div>
                                    <div className="mt-1 text-xs text-stone-500">当前已保存 {config.models.length} 个模型 · AIHub 服务配置</div>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                    {USER_LOGIN_ENABLED ? (
                                        <>
                                            <span className="text-xs text-stone-500">自动同步</span>
                                            <Switch size="small" checked={config.syncModelConfig} onChange={(checked) => updateConfig("syncModelConfig", checked)} />
                                        </>
                                    ) : null}
                                    <Button size="small" loading={loadingModels} disabled={Boolean(testingChannelId)} onClick={() => void refreshModels()}>
                                        更新全部模型
                                    </Button>
                                    <Dropdown
                                        menu={{
                                            items: [{ key: "import", label: "导入 AIHub 服务配置" }, { key: "export", label: "导出 AIHub 服务配置" }, ...(modelCatalog ? [{ key: "restore", label: "恢复内置服务配置" }] : [])],
                                            onClick: ({ key }) => {
                                                if (key === "import") modelCatalogInputRef.current?.click();
                                                if (key === "export") exportServiceConfig();
                                                if (key === "restore") restoreBuiltInServiceConfig();
                                            },
                                        }}
                                        trigger={["click"]}
                                    >
                                        <Button size="small">更多</Button>
                                    </Dropdown>
                                </div>
                            </div>
                            <input
                                ref={modelCatalogInputRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) void importServiceConfig(file);
                                }}
                            />
                        </>
                    ) : (
                        <div className="mb-5 rounded-lg border border-stone-200 p-3 text-sm text-stone-500 dark:border-stone-800">
                            <div className="font-medium text-stone-900 dark:text-stone-100">云端渠道</div>
                            <div className="mt-1">由系统后台渠道转发请求，当前可用 {modelChannel?.availableModels.length || 0} 个模型。</div>
                        </div>
                    )}
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {modelGroups.map((group) => (
                            <Form.Item key={group.modelKey} label={group.defaultLabel} className="mb-4">
                                <ModelPicker config={modelConfig} value={modelConfig[group.modelKey]} channelId={modelConfig[group.channelKey]} onChange={(model, channelId) => { updateConfig(group.modelKey, model); if (channelId) updateConfig(group.channelKey, channelId); }} capability={group.capability} fullWidth />
                            </Form.Item>
                        ))}
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                        <Form.Item label="画布默认生图张数" extra="新建画布生图和配置节点默认使用，单个节点仍可单独覆盖。" className="mb-4">
                            <Input
                                type="number"
                                min={1}
                                max={15}
                                value={config.canvasImageCount}
                                onChange={(event) => updateConfig("canvasImageCount", event.target.value)}
                                onBlur={(event) => updateConfig("canvasImageCount", normalizeImageCount(event.target.value))}
                            />
                        </Form.Item>
                        <Form.Item label="默认音频声音" className="mb-4">
                            <Select value={config.audioVoice} options={audioVoiceOptions} onChange={(value) => updateConfig("audioVoice", value)} />
                        </Form.Item>
                        <Form.Item label="默认音频格式" className="mb-4">
                            <Select value={config.audioFormat} options={audioFormatOptions} onChange={(value) => updateConfig("audioFormat", value)} />
                        </Form.Item>
                        <Form.Item label="默认音频语速" className="mb-4">
                            <Input
                                type="number"
                                min={0.25}
                                max={4}
                                step={0.05}
                                value={config.audioSpeed}
                                onChange={(event) => updateConfig("audioSpeed", event.target.value)}
                                onBlur={(event) => updateConfig("audioSpeed", normalizeAudioSpeedValue(event.target.value))}
                            />
                        </Form.Item>
                    </div>
                    <div className="mb-4 grid gap-3 md:grid-cols-3">
                        <FeatureSwitch title="流式传输" description="开启后请求中追加 stream，支持读取中间图片事件并避免长时间无数据。" checked={Boolean(config.streamImages)} onChange={(checked) => updateConfig("streamImages", checked ? "1" : "")} />
                        <FeatureSwitch title="返回 Base64 图片数据" description="开启后 Image API 请求会追加 response_format: b64_json。" checked={Boolean(config.responseFormatB64Json)} onChange={(checked) => updateConfig("responseFormatB64Json", checked ? "1" : "")} />
                        <FeatureSwitch title="Codex CLI 兼容模式" description="开启后减少不兼容参数，并追加防提示词改写前缀。" checked={Boolean(config.codexCli)} onChange={(checked) => updateConfig("codexCli", checked ? "1" : "")} />
                    </div>
                    {canUseUserStorageProvider ? (
                        <section className="mb-5 mt-4 rounded-xl border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/50">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-medium">用户 S3/R2 存储</div>
                                    <div className="mt-1 text-xs text-stone-500">开启后，新生成图片和媒体文件会优先保存到你的 S3 兼容对象存储。{storageUsageText ? `当前容量：${storageUsageText}` : ""}</div>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                    <Button size="small" loading={measuringStorage} onClick={() => void measureStorage()}>
                                        统计容量
                                    </Button>
                                    <span className="text-xs text-stone-500">自动同步</span>
                                    <Switch size="small" checked={config.syncStorageConfig} onChange={(checked) => updateConfig("syncStorageConfig", checked)} />
                                    <Switch checked={userStorage.enabled} onChange={(enabled) => setUserStorage((value) => ({ ...value, enabled }))} />
                                </div>
                            </div>
                            {userStorage.enabled ? (
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <Input value={userStorage.name} placeholder="配置名称" onChange={(event) => setUserStorage((value) => ({ ...value, name: event.target.value }))} />
                                    <Input value={userStorage.endpoint} placeholder="Endpoint，例如 https://<account>.r2.cloudflarestorage.com" onChange={(event) => setUserStorage((value) => ({ ...value, endpoint: event.target.value }))} />
                                    <Input value={userStorage.region} placeholder="Region，R2 通常为 auto" onChange={(event) => setUserStorage((value) => ({ ...value, region: event.target.value }))} />
                                    <Input value={userStorage.bucket} placeholder="Bucket 名称" onChange={(event) => setUserStorage((value) => ({ ...value, bucket: event.target.value }))} />
                                    <Input value={userStorage.accessKeyId} placeholder="Access Key ID" onChange={(event) => setUserStorage((value) => ({ ...value, accessKeyId: event.target.value }))} />
                                    <Input.Password value={userStorage.secretAccessKey} placeholder="Secret Access Key" onChange={(event) => setUserStorage((value) => ({ ...value, secretAccessKey: event.target.value }))} />
                                    <Input value={userStorage.publicBaseUrl} placeholder="公开访问地址，例如 https://pub-xxx.r2.dev" onChange={(event) => setUserStorage((value) => ({ ...value, publicBaseUrl: event.target.value }))} />
                                    <Input value={userStorage.pathPrefix} placeholder="保存路径前缀，例如 images" onChange={(event) => setUserStorage((value) => ({ ...value, pathPrefix: event.target.value }))} />
                                </div>
                            ) : null}
                        </section>
                    ) : null}
                    <Form.Item label="默认音频指令" className="mb-4">
                        <Input.TextArea rows={2} value={config.audioInstructions} placeholder="例如：自然、温暖、适合旁白。" onChange={(event) => updateConfig("audioInstructions", event.target.value)} />
                    </Form.Item>
                    {effectiveMode === "local" ? (
                        <Form.Item label="系统提示词" className="mb-0">
                            <Input.TextArea rows={3} value={config.systemPrompt} placeholder="例如：你是一位擅长电影感写实摄影的视觉导演。" onChange={(event) => updateConfig("systemPrompt", event.target.value)} />
                        </Form.Item>
                    ) : null}
                </Form>
            </div>
        </Modal>
    );
}

function FeatureSwitch({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <div className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-800">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{title}</div>
                <Switch checked={checked} onChange={onChange} />
            </div>
            <div className="mt-1 text-xs leading-5 text-stone-500">{description}</div>
        </div>
    );
}

function ChannelConnectionStatus({ channel, feedback }: { channel: LocalModelChannel; feedback?: ChannelConnectionFeedback }) {
    const text = feedback?.text || (channel.id === "aihub" ? `已预置 ${channel.models.length} 个模型，填好 Key 后可直接使用` : `已保存 ${channel.models.length} 个模型`);
    const toneClass = feedback?.tone === "success" ? "text-green-600 dark:text-green-400" : feedback?.tone === "warning" ? "text-amber-600 dark:text-amber-400" : feedback?.tone === "error" ? "text-red-600 dark:text-red-400" : "text-stone-500";
    return <div className={`text-xs ${toneClass}`}>{text}</div>;
}

function modelConnectionErrorText(error: unknown) {
    if (error instanceof ModelListRequestError) {
        if (error.status === 401) return "Key 无效或已过期，请重新检查";
        if (error.status === 403) return "当前 Key 无权限，请检查分组或模型权限";
        if (error.status === 404) return "没有找到模型接口，请检查 Base URL";
        if (error.status === 0) return "无法连接，请检查 Base URL、网络或代理设置";
        if (error.status >= 500) return "渠道服务暂时不可用，请稍后重试";
        return `连接失败：${error.message}`;
    }
    return error instanceof Error ? `连接失败：${error.message}` : "连接失败，请稍后重试";
}

function configForLocalChannel(config: AiConfig, channel: LocalModelChannel): AiConfig {
    return {
        ...config,
        channelMode: "local",
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        localChannels: [{ ...channel }],
        imageChannelId: channel.id,
        videoChannelId: channel.id,
        textChannelId: channel.id,
        audioChannelId: channel.id,
        model: channel.models[0] || config.model,
    };
}

function channelIdForLocalModel(channels: LocalModelChannel[], model: string, currentId: string) {
    if (!channels.length) return "";
    if (channels.some((channel) => channel.id === currentId && (!model || channel.models.includes(model)))) return currentId;
    return channels.find((channel) => model && channel.models.includes(model))?.id || channels[0].id;
}

function normalizeImageCount(value: string) {
    return String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 3))));
}


function uniqueModels(models: string[]) {
    return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
