export const USER_LOGIN_ENABLED = false;

export function shouldShowUserAccount(role?: string) {
    return USER_LOGIN_ENABLED || role === "admin";
}

export function shouldClearUserSession(role?: string) {
    return !USER_LOGIN_ENABLED && Boolean(role) && role !== "admin";
}

export function shouldUseAccountProxy(channelMode: "remote" | "local", hasToken: boolean) {
    return channelMode === "remote" || (USER_LOGIN_ENABLED && hasToken);
}

export function isAdminLoginRedirect(path: string) {
    return path === "/admin" || path.startsWith("/admin/");
}
