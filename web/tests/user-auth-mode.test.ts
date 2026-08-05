import assert from "node:assert/strict";
import test from "node:test";

import { USER_LOGIN_ENABLED, isAdminLoginRedirect, shouldClearUserSession, shouldShowUserAccount, shouldUseAccountProxy } from "../src/lib/user-auth-mode.ts";

test("普通用户登录入口暂时关闭", () => {
    assert.equal(USER_LOGIN_ENABLED, false);
    assert.equal(shouldShowUserAccount("user"), false);
    assert.equal(shouldShowUserAccount(), false);
    assert.equal(shouldShowUserAccount("admin"), true);
});

test("只清理普通用户会话，保留管理员会话", () => {
    assert.equal(shouldClearUserSession("user"), true);
    assert.equal(shouldClearUserSession("guest"), true);
    assert.equal(shouldClearUserSession("admin"), false);
    assert.equal(shouldClearUserSession(), false);
});

test("本地渠道不因遗留 token 改走账号代理", () => {
    assert.equal(shouldUseAccountProxy("local", true), false);
    assert.equal(shouldUseAccountProxy("local", false), false);
    assert.equal(shouldUseAccountProxy("remote", true), true);
});

test("普通登录隐藏时仍保留管理后台登录路径", () => {
    assert.equal(isAdminLoginRedirect("/admin"), true);
    assert.equal(isAdminLoginRedirect("/admin/settings"), true);
    assert.equal(isAdminLoginRedirect("/"), false);
    assert.equal(isAdminLoginRedirect("/administrator"), false);
});
