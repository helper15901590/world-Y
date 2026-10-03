import { Router } from "express";
import type { Request, Response } from "express";
import {
  isAdminAuthRequired,
  isValidAdminToken,
  verifyAdminPassword,
  issueAdminToken,
  revokeAdminToken,
} from "../../services/admin-auth.js";

const router = Router();

/**
 * GET /api/admin/session — 前端启动时询问：是否需要密码、当前是否已解锁
 */
router.get("/session", (req: Request, res: Response) => {
  const required = isAdminAuthRequired();
  res.json({
    required,
    authenticated: !required || isValidAdminToken(req.header("x-admin-token")),
  });
});

/**
 * POST /api/admin/login — body: { password }
 * 密码正确时返回会话令牌（客户端随后通过 x-admin-token 头携带）
 */
router.post("/login", (req: Request, res: Response) => {
  if (!isAdminAuthRequired()) {
    res.json({ ok: true, required: false, token: null });
    return;
  }
  if (!verifyAdminPassword(req.body?.password)) {
    res.status(401).json({ error: "invalid admin password", code: "ADMIN_PASSWORD_WRONG" });
    return;
  }
  res.json({ ok: true, required: true, token: issueAdminToken() });
});

/**
 * POST /api/admin/logout — 使当前令牌失效（重新上锁）
 */
router.post("/logout", (req: Request, res: Response) => {
  revokeAdminToken(req.header("x-admin-token"));
  res.json({ ok: true });
});

export default router;
