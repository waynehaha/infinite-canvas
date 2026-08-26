"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { App } from "antd";

import { fetchUserConfig } from "@/services/api/user-config";
import { loadPersistedAIHubModelCatalog } from "@/lib/aihub-model-catalog";
import { AIHUB_REMOTE_CONFIG_CHECK_INTERVAL, applyAIHubRemoteServiceConfig, fetchAIHubRemoteServiceConfig, fetchAIHubVisibleModels, saveAIHubRemoteConfigFailure } from "@/lib/aihub-remote-config";
import { defaultUserStorageProvider, saveUserStorageProvider } from "@/services/image-storage";
import { runDesktopDataProtection } from "@/services/desktop-data-protection";
import { USER_LOGIN_ENABLED, shouldClearUserSession } from "@/lib/user-auth-mode";
import { normalizeLocalChannels, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const handledConfigParams = useRef(false);
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isUserReady = useUserStore((state) => state.isReady);
    const clearSession = useUserStore((state) => state.clearSession);
    const hydrateUser = useUserStore((state) => state.hydrateUser);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const channelMode = useConfigStore((state) => state.config.channelMode);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isLoginPage = pathname === "/login" || pathname === "/admin/login";
    const adminRemoteTokenRef = useRef("");

    useEffect(() => {
        loadPersistedAIHubModelCatalog();
        let canceled = false;
        const sync = async () => {
            try {
                const result = await fetchAIHubRemoteServiceConfig();
                if (canceled || !result.config) return;
                const current = useConfigStore.getState().config;
                const aiHubChannel = normalizeLocalChannels(current).find((channel) => channel.id === "aihub");
                const visibleModels = aiHubChannel ? await fetchAIHubVisibleModels(aiHubChannel.baseUrl || result.config.service.baseUrl, aiHubChannel.apiKey) : null;
                if (canceled) return;
                const patch = applyAIHubRemoteServiceConfig(useConfigStore.getState().config, result.config, visibleModels);
                Object.entries(patch).forEach(([key, value]) => updateConfig(key as keyof AiConfig, value as never));
            } catch (error) {
                saveAIHubRemoteConfigFailure(error);
            }
        };
        void sync();
        const interval = window.setInterval(() => void sync(), AIHUB_REMOTE_CONFIG_CHECK_INTERVAL);
        return () => {
            canceled = true;
            window.clearInterval(interval);
        };
    }, [updateConfig]);

    useEffect(() => {
        void runDesktopDataProtection()
            .then((restored) => {
                if (restored) window.location.reload();
            })
            .catch((error) => console.error("Desktop data protection failed", error));
    }, []);

    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);

    useEffect(() => {
        if (!isLoginPage) void hydrateUser();
    }, [hydrateUser, isLoginPage]);

    useEffect(() => {
        if (!isUserReady || !shouldClearUserSession(user?.role)) return;
        clearSession();
    }, [clearSession, isUserReady, user?.role]);

    useEffect(() => {
        if (!token || user?.role !== "admin" || adminRemoteTokenRef.current === token) return;
        adminRemoteTokenRef.current = token;
        if (channelMode !== "remote") updateConfig("channelMode", "remote");
    }, [channelMode, token, updateConfig, user?.role]);

    useEffect(() => {
        if (!token || !user?.id || (!USER_LOGIN_ENABLED && user.role !== "admin")) return;
        void fetchUserConfig(token)
            .then((payload) => {
                const syncModel = payload.modelConfig?.syncModelConfig === true;
                const syncStorage = payload.modelConfig?.syncStorageConfig === true;
                if (payload.modelConfig) {
                    Object.entries(payload.modelConfig)
                        .filter(([key]) => syncModel || !["apiKey", "baseUrl", "localChannels"].includes(key))
                        .forEach(([key, value]) => updateConfig(key as keyof AiConfig, value as never));
                } else {
                    updateConfig("syncModelConfig", false);
                }
                updateConfig("syncStorageConfig", syncStorage);
                if (syncStorage && payload.storageProvider) {
                    saveUserStorageProvider({
                        ...defaultUserStorageProvider(),
                        ...payload.storageProvider,
                        enabled: payload.storageProvider.enabled !== undefined ? payload.storageProvider.enabled : true,
                    });
                }
            })
            .catch(() => {});
    }, [token, updateConfig, user?.id]);

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        if (!baseUrl && !apiKey) return;
        if (!publicSettings) return;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        if (!publicSettings.modelChannel.allowCustomChannel) {
            openConfigDialog(false);
            message.error("后台未允许用户自定义渠道，请联系管理员进行配置");
            return;
        }
        updateConfig("channelMode", "local");
        if (baseUrl) updateConfig("baseUrl", baseUrl);
        if (apiKey) updateConfig("apiKey", apiKey);
        openConfigDialog(false);
    }, [message, openConfigDialog, publicSettings, updateConfig]);

    return <>{children}</>;
}
