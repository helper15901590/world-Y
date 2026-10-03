import { Router } from "express";
import type { Request, Response } from "express";
import { appContext } from "../../services/app-context.js";
import { getEmotionLabel } from "../../core/emotion-manager.js";
import { CharacterManager } from "../../core/character-manager.js";
import { resolveActionLabel } from "../../utils/action-labels.js";
import { registerNewCharacterAssets } from "../../utils/config-loader.js";
import { isSimulationBusy, getSimulationBusyMessage } from "../../services/simulation-activity.js";
import { requireAdmin } from "../../services/admin-auth.js";
import { computeQuestFocus } from "../../core/quest-focus.js";
import { CHARACTER_ID_PATTERN } from "../../utils/config-loader.js";
import type { CharacterProfile } from "../../types/index.js";

/**
 * 对外暴露的角色档案：剔除编辑密码本身，只保留「是否已设置」的标志。
 * 密码只通过管理员接口（/characters/:id/edit-password）提供。
 */
function toPublicProfile(profile: CharacterProfile) {
  const { editPassword, ...rest } = profile;
  return { ...rest, hasEditPassword: Boolean(editPassword) };
}

/**
 * 姓名查重：返回已占用该姓名的角色名（没冲突返回 null）。
 * 比较时忽略大小写与首尾空格；excludeId 用于"改名成自己原来的名字"。
 */
function findCharacterNameConflict(name: string, excludeId?: string): string | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  for (const p of appContext.characterManager.getAllProfiles()) {
    if (excludeId && p.id === excludeId) continue;
    if ((p.name ?? "").trim().toLowerCase() === normalized) return p.name;
  }
  return null;
}

const router = Router();

// GET /characters
router.get("/", (_req, res) => {
  const profiles = appContext.characterManager.getAllProfiles();
  const locations = appContext.worldManager.getAllLocations();
  const result = profiles.map((p) => {
    const s = appContext.characterManager.getState(p.id);
    const currentActionLabel = resolveActionLabel({
      actionId: s.currentAction,
      targetId: s.currentActionTarget,
      locationId: s.location,
      getWorldAction: (actionId) => appContext.worldManager.getWorldAction(actionId),
      getLocationObjects: (locationId) => appContext.worldManager.getLocationObjects(locationId),
    });
    // 核心任务命中的地点/物件：客户端用它把"闲逛"偏向任务相关的位置
    const focus = computeQuestFocus(p, locations);
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      nickname: p.nickname,
      location: s.location,
      mainAreaPointId: s.mainAreaPointId,
      emotion: getEmotionLabel(s.emotionValence, s.emotionArousal),
      currentAction: s.currentAction,
      currentActionLabel,
      anchor: p.anchor || null,
      questFocus: focus.active
        ? { locationIds: focus.locationIds, objectIds: focus.objectIds }
        : null,
    };
  });
  res.json(result);
});

/**
 * POST /characters — 管理面板「创建角色」
 * body: { name*, nickname?, appearanceHint?, gender?, age?, department?, position?,
 *         jobTitle?, backstory?, startPosition?, spriteSourceId? }
 * spriteSourceId：复制现有角色的精灵图（无生图模型时的"沿用现有形象"方案）
 */
router.post("/", requireAdmin, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const name = str(body.name);
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const nameConflict = findCharacterNameConflict(name);
  if (nameConflict) {
    res.status(409).json({
      error: `character name already exists: ${nameConflict}`,
      code: "NAME_TAKEN",
    });
    return;
  }

  const startPosition = str(body.startPosition) || "main_area";
  const locationIds = appContext.worldManager.getAllLocations().map((l) => l.id);
  if (!locationIds.includes(startPosition)) {
    res.status(400).json({ error: `unknown location: ${startPosition}` });
    return;
  }

  const spriteSourceId = str(body.spriteSourceId);
  if (spriteSourceId) {
    try {
      appContext.characterManager.getProfile(spriteSourceId);
    } catch {
      res.status(400).json({ error: `spriteSourceId not found: ${spriteSourceId}` });
      return;
    }
  }

  try {
    const { profile, persisted } = appContext.characterManager.createCharacter({
      name,
      nickname: str(body.nickname) || undefined,
      appearanceHint: str(body.appearanceHint) || undefined,
      gender: str(body.gender) || undefined,
      age: str(body.age) || undefined,
      department: str(body.department) || undefined,
      position: str(body.position) || undefined,
      jobTitle: str(body.jobTitle) || undefined,
      backstory: str(body.backstory) || undefined,
      startPosition,
      coreQuest: str(body.coreQuest) || undefined,
    });

    const assets = registerNewCharacterAssets({
      id: profile.id,
      name: profile.name,
      description: profile.appearanceHint,
      spriteSourceId: spriteSourceId || undefined,
    });

    // 有任务的角色：立即（异步）规划行动步骤，让第一个回合就能按步骤行动
    if (profile.coreQuest) {
      void appContext.questPlanner?.ensurePlan(profile.id).catch(() => {});
    }

    res.json({
      ok: true,
      persisted,
      spriteCopied: assets.spriteCopied,
      character: {
        id: profile.id,
        name: profile.name,
        hasSprite: assets.spriteCopied,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

/**
 * DELETE /characters/:id — 管理面板「删除角色」
 * 移除运行时档案 + 当前时间线的状态/记忆/日记 + 世界目录里的配置与立绘。
 * 历史事件保留。至少保留一个角色。
 */
router.delete("/:id", requireAdmin, (req: Request, res: Response) => {
  const rawId = req.params.id;
  const charId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!charId || !CHARACTER_ID_PATTERN.test(charId)) {
    res.status(400).json({ error: "invalid character id" });
    return;
  }

  try {
    appContext.characterManager.getProfile(charId);
  } catch {
    res.status(404).json({ error: "character not found" });
    return;
  }

  if (appContext.characterManager.getAllProfiles().length <= 1) {
    res.status(400).json({ error: "cannot delete the last character" });
    return;
  }

  if (isSimulationBusy()) {
    res.status(409).json({ error: getSimulationBusyMessage() });
    return;
  }

  try {
    const { profile, files, memoriesRemoved } = appContext.characterManager.deleteCharacter(charId);
    res.json({
      ok: true,
      deleted: { id: profile.id, name: profile.name },
      files,
      memoriesRemoved,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// GET /characters/:id
router.get("/:id", (req, res) => {
  try {
    const profile = appContext.characterManager.getProfile(req.params.id);
    const state = appContext.characterManager.getState(req.params.id);
    const currentActionLabel = resolveActionLabel({
      actionId: state.currentAction,
      targetId: state.currentActionTarget,
      locationId: state.location,
      getWorldAction: (actionId) => appContext.worldManager.getWorldAction(actionId),
      getLocationObjects: (locationId) => appContext.worldManager.getLocationObjects(locationId),
    });
    res.json({
      profile: toPublicProfile(profile),
      state: {
        ...state,
        currentActionLabel,
      },
      emotionLabel: getEmotionLabel(state.emotionValence, state.emotionArousal),
      questPlan: appContext.questPlanner?.getPlan(req.params.id) ?? null,
    });
  } catch {
    res.status(404).json({ error: "Character not found" });
  }
});

// GET /characters/:id/diary
router.get("/:id/diary", (req, res) => {
  const gameDay = req.query.day ? Number(req.query.day) : undefined;
  const entries = appContext.characterManager.getDiaryEntries(
    req.params.id,
    gameDay,
  );
  res.json(entries);
});

// GET /characters/:id/edit-password — 管理员读取该角色的编辑密码（用于分发给玩家）
router.get("/:id/edit-password", requireAdmin, (req, res) => {
  const rawId = req.params.id;
  const charId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!charId || !CHARACTER_ID_PATTERN.test(charId)) {
    res.status(400).json({ error: "invalid character id" });
    return;
  }
  try {
    appContext.characterManager.getProfile(charId);
  } catch {
    res.status(404).json({ error: "character not found" });
    return;
  }
  res.json({ ok: true, characterId: charId, editPassword: appContext.characterManager.getEditPassword(charId) ?? null });
});

// POST /characters/:id/edit-password/verify — 校验编辑密码（「改人设」的进门校验）
router.post("/:id/edit-password/verify", (req: Request, res: Response) => {
  const rawId = req.params.id;
  const charId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!charId || !CHARACTER_ID_PATTERN.test(charId)) {
    res.status(400).json({ error: "invalid character id" });
    return;
  }
  try {
    appContext.characterManager.getProfile(charId);
  } catch {
    res.status(404).json({ error: "character not found" });
    return;
  }
  const provided = (req.body ?? {}).editPassword;
  if (!appContext.characterManager.verifyEditPassword(charId, provided)) {
    res.status(403).json({ error: "edit password required", code: "EDIT_PASSWORD_REQUIRED" });
    return;
  }
  res.json({ ok: true });
});

// POST /characters/:id/edit-password/regenerate — 管理员重置编辑密码
router.post("/:id/edit-password/regenerate", requireAdmin, (req, res) => {
  const rawId = req.params.id;
  const charId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!charId || !CHARACTER_ID_PATTERN.test(charId)) {
    res.status(400).json({ error: "invalid character id" });
    return;
  }
  try {
    const editPassword = appContext.characterManager.regenerateEditPassword(charId);
    res.json({ ok: true, characterId: charId, editPassword });
  } catch {
    res.status(404).json({ error: "character not found" });
  }
});

// PATCH /characters/:id/profile
router.patch("/:id/profile", (req: Request, res: Response) => {
  const charId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  try {
    appContext.characterManager.getProfile(charId);
  } catch {
    return res.status(404).json({ error: "Character not found" });
  }
  const patch = { ...(req.body ?? {}) } as Record<string, unknown>;

  // 编辑密码：不属于可写字段，先取出再校验（角色未设密码时无需提供）
  const providedPassword = patch.editPassword;
  delete patch.editPassword;
  if (!appContext.characterManager.verifyEditPassword(charId, providedPassword)) {
    return res.status(403).json({
      error: "edit password required",
      code: "EDIT_PASSWORD_REQUIRED",
    });
  }

  const allowed = CharacterManager.EDITABLE_FIELDS as readonly string[];
  const unknown = Object.keys(patch).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    return res.status(400).json({ error: `Non-editable fields: ${unknown.join(", ")}` });
  }

  // 姓名查重：不允许改成别的角色已在用的名字（改成自己原名不算冲突）
  if (typeof patch.name === "string") {
    const nextName = patch.name.trim();
    if (!nextName) {
      return res.status(400).json({ error: "name cannot be empty" });
    }
    const conflict = findCharacterNameConflict(nextName, charId);
    if (conflict) {
      return res.status(409).json({
        error: `character name already exists: ${conflict}`,
        code: "NAME_TAKEN",
      });
    }
    patch.name = nextName;
  }

  // 锚定：null 表示解除；对象需形如 { type: "region"|"element", targetId }，且目标必须存在
  if ("anchor" in patch) {
    const anchor = patch.anchor;
    if (anchor !== null) {
      const type = (anchor as { type?: unknown })?.type;
      const targetId = (anchor as { targetId?: unknown })?.targetId;
      if (
        typeof anchor !== "object" ||
        (type !== "region" && type !== "element") ||
        typeof targetId !== "string" ||
        !targetId.trim()
      ) {
        return res.status(400).json({
          error: 'anchor must be null or { type: "region" | "element", targetId: string }',
        });
      }

      const trimmedId = targetId.trim();
      const exists =
        type === "region"
          ? !!appContext.worldManager.getLocation(trimmedId)
          : appContext.worldManager
              .getAllLocations()
              .some((loc) => loc.objects.some((o) => o.id === trimmedId));
      if (!exists) {
        return res.status(400).json({ error: `anchor target not found: ${trimmedId}` });
      }

      patch.anchor = { type, targetId: trimmedId };
    }
  }

  const updated = appContext.characterManager.patchProfile(charId, patch);

  // 任务有变动（或需要补规划）：异步生成/刷新行动步骤，幂等——任务文本没变时直接复用
  if ("coreQuest" in patch) {
    void appContext.questPlanner?.ensurePlan(charId).catch(() => {});
  }

  res.json({ ok: true, profile: updated });
});

// PATCH /characters/:id/runtime-state
router.patch("/:id/runtime-state", (req: Request, res: Response) => {
  const charId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  try {
    appContext.characterManager.getProfile(charId);
  } catch {
    return res.status(404).json({ error: "Character not found" });
  }

  const { mainAreaPointId } = req.body ?? {};
  if (mainAreaPointId !== undefined && mainAreaPointId !== null && typeof mainAreaPointId !== "string") {
    return res.status(400).json({ error: "mainAreaPointId must be a string or null" });
  }

  appContext.characterManager.updateState(charId, {
    mainAreaPointId: mainAreaPointId ?? null,
  });
  const state = appContext.characterManager.getState(charId);
  res.json({ ok: true, state });
});

// GET /characters/:id/memories — public memories (limited, excludes internal tags)
router.get("/:id/memories", (req, res) => {
  const memories = appContext.characterManager.memoryManager.getRecentMemories(
    req.params.id,
    20,
  );
  const result = memories.map((m) => ({
    content: m.content,
    gameDay: m.gameDay,
    type: m.type,
  }));
  res.json(result);
});

export default router;
