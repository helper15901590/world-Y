import { randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * 管理员密码（轻量鉴权）。
 *
 * - 密码在后台配置文件中设置：`.env` 的 `ADMIN_PASSWORD`
 * - 未配置（空）时视为**关闭限制**：TopBar 与管理接口都不做校验，避免把自己锁在外面
 * - 登录成功后签发会话令牌（进程内存保存，服务重启即失效）
 * - 客户端通过 `x-admin-token` 请求头携带令牌
 *
 * 注意：这是"把常用管理入口挡住"的软锁——服务本身没有账号体系，
 * 任何能读取 .env 或重启服务的人都可以绕过。
 */

const activeTokens = new Set<string>();

export function getAdminPassword(): string {
  return (process.env.ADMIN_PASSWORD ?? "").trim();
}

export function isAdminAuthRequired(): boolean {
  return getAdminPassword().length > 0;
}

export function verifyAdminPassword(provided: unknown): boolean {
  if (!isAdminAuthRequired()) return true;
  return typeof provided === "string" && provided === getAdminPassword();
}

/** 登录成功后签发令牌 */
export function issueAdminToken(): string {
  const token = randomBytes(24).toString("base64url");
  activeTokens.add(token);
  return token;
}

export function isValidAdminToken(token: unknown): boolean {
  return typeof token === "string" && activeTokens.has(token);
}

export function revokeAdminToken(token: unknown): void {
  if (typeof token === "string") activeTokens.delete(token);
}

/** Express 中间件：管理员接口的访问控制（未配置密码时直接放行） */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminAuthRequired()) {
    next();
    return;
  }
  if (isValidAdminToken(req.header("x-admin-token"))) {
    next();
    return;
  }
  res.status(401).json({ error: "admin authentication required", code: "ADMIN_REQUIRED" });
}
