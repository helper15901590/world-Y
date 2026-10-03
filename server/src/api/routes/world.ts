import fs from "node:fs";
import path from "node:path";
import { Router, type Response } from "express";
import { appContext } from "../../services/app-context.js";
import {
  getActiveSimulationTicks,
  getSimulationBusyMessage,
  isSimulationBusy,
} from "../../services/simulation-activity.js";
import { buildSceneRuntimeInfo, buildWorldTimeInfo } from "../../utils/time-helpers.js";
import * as worldStateStore from "../../store/world-state-store.js";
import {
  GENERATED_WORLDS_DIR,
  LIBRARY_WORLDS_DIR,
  listGeneratedWorlds,
  listLibraryWorlds,
  findWorldById,
} from "../../utils/world-directories.js";
import { persistWorldConfigPatch, persistEnvironmentPatch } from "../../utils/config-loader.js";
import { requireAdmin } from "../../services/admin-auth.js";

const router = Router();

function rejectIfSimulationBusy(res: Response): boolean {
  if (!isSimulationBusy()) return false;
  res.status(409).json({
    error: getSimulationBusyMessage(),
    activeSimulationTicks: getActiveSimulationTicks(),
    canSwitchContext: false,
  });
  return true;
}

router.get("/time", (_req, res) => {
  if (!appContext.hasWorld) {
    res.status(503).json({ error: "No world loaded" });
    return;
  }
  res.json(buildWorldTimeInfo(appContext.worldManager.getCurrentTime()));
});

/**
 * GET /api/world/prompt — 读取"发给大模型"的世界设定（管理面板「世界设定」用）。
 * worldSocialContext 返回的是**实际生效**的文本（已应用"留空回退到世界简介"规则）。
 */
router.get("/prompt", requireAdmin, (_req, res) => {
  if (!appContext.hasWorld) {
    res.status(503).json({ error: "No world loaded" });
    return;
  }
  const wm = appContext.worldManager;
  res.json({
    worldName: wm.getWorldName(),
    worldDescription: wm.getWorldDescription(),
    worldSocialContext: wm.getWorldSocialContext(),
  });
});

/**
 * PATCH /api/world/prompt — 修改世界设定，立即生效（下一次 LLM 调用即使用新内容），
 * 并写回世界目录的 world.json；worldSocialContext 留空时回退到「世界简介」。
 */
router.patch("/prompt", requireAdmin, (req, res) => {
  if (!appContext.hasWorld) {
    res.status(503).json({ error: "No world loaded" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: {
    worldName?: string;
    worldDescription?: string;
    worldSocialContext?: string;
  } = {};

  for (const key of ["worldName", "worldDescription", "worldSocialContext"] as const) {
    if (!(key in body)) continue;
    if (typeof body[key] !== "string") {
      res.status(400).json({ error: `${key} must be a string` });
      return;
    }
    patch[key] = body[key] as string;
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "nothing to update" });
    return;
  }

  const wm = appContext.worldManager;
  wm.updateWorldPrompt(patch);

  // 写回配置文件：只写用户实际提交的键，社交背景写"原文"（保留留空回退语义）
  const filePatch: Record<string, unknown> = {};
  if (patch.worldName !== undefined) filePatch.worldName = wm.getWorldName();
  if (patch.worldDescription !== undefined) filePatch.worldDescription = wm.getWorldDescription();
  if (patch.worldSocialContext !== undefined) filePatch.worldSocialContext = patch.worldSocialContext.trim();

  const persisted = persistWorldConfigPatch(filePatch);

  res.json({
    ok: true,
    persisted,
    worldName: wm.getWorldName(),
    worldDescription: wm.getWorldDescription(),
    worldSocialContext: wm.getWorldSocialContext(),
  });
});

function toEnvironmentObjectInfo(obj: {
  id: string;
  name: string;
  state: string;
  stateDescription: string;
  capacity: number;
  currentUsers: string[];
}) {
  return {
    id: obj.id,
    name: obj.name,
    state: obj.state,
    stateDescription: obj.stateDescription,
    capacity: obj.capacity,
    currentUsers: obj.currentUsers,
  };
}

/**
 * GET /api/world/environment — 环境与物品一览（地点 + 可交互物件，含运行时状态）
 */
router.get("/environment", (_req, res) => {
  if (!appContext.hasWorld) {
    res.status(503).json({ error: "No world loaded" });
    return;
  }
  const wm = appContext.worldManager;
  res.json({
    locations: wm.getAllLocations().map((loc) => ({
      id: loc.id,
      name: loc.name,
      description: loc.description,
      objects: wm.getLocationObjects(loc.id).map(toEnvironmentObjectInfo),
    })),
  });
});

/**
 * PATCH /api/world/environment/location/:id — 修改地点名称/描述
 * 立即生效（角色感知随之变化）并写回 world.json。
 */
router.patch("/environment/location/:id", requireAdmin, (req, res) => {
  if (!appContext.hasWorld) {
    res.status(503).json({ error: "No world loaded" });
    return;
  }
  const locationId = String(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const wm = appContext.worldManager;

  if (!wm.getAllLocations().some((l) => l.id === locationId)) {
    res.status(404).json({ error: "location not found" });
    return;
  }

  const patch: { name?: string; description?: string } = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      res.status(400).json({ error: "name must be a non-empty string" });
      return;
    }
    patch.name = body.name.trim();
  }
  if ("description" in body) {
    if (typeof body.description !== "string") {
      res.status(400).json({ error: "description must be a string" });
      return;
    }
    patch.description = body.description.trim();
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "nothing to update" });
    return;
  }

  wm.updateLocationMeta(locationId, patch);
  const persisted = persistEnvironmentPatch({
    locationId,
    patch: patch as Record<string, unknown>,
  });
  const updated = wm.getAllLocations().find((l) => l.id === locationId);
  res.json({
    ok: true,
    persisted,
    location: {
      id: locationId,
      name: updated?.name ?? "",
      description: updated?.description ?? "",
    },
  });
});

/**
 * PATCH /api/world/environment/object/:id — 修改物件
 * - name：静态配置，写回 world.json
 * - state / stateDescription：运行时状态（当前时间线），立即影响角色感知
 */
router.patch("/environment/object/:id", requireAdmin, (req, res) => {
  if (!appContext.hasWorld) {
    res.status(503).json({ error: "No world loaded" });
    return;
  }
  const objectId = String(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const wm = appContext.worldManager;

  const location = wm.getAllLocations().find((l) => l.objects.some((o) => o.id === objectId));
  if (!location) {
    res.status(404).json({ error: "object not found" });
    return;
  }

  const staticPatch: { name?: string } = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      res.status(400).json({ error: "name must be a non-empty string" });
      return;
    }
    staticPatch.name = body.name.trim();
  }

  const runtimeState = "state" in body ? body.state : undefined;
  const runtimeDesc = "stateDescription" in body ? body.stateDescription : undefined;
  if (runtimeState !== undefined && (typeof runtimeState !== "string" || !runtimeState.trim())) {
    res.status(400).json({ error: "state must be a non-empty string" });
    return;
  }
  if (runtimeDesc !== undefined && typeof runtimeDesc !== "string") {
    res.status(400).json({ error: "stateDescription must be a string" });
    return;
  }

  if (
    Object.keys(staticPatch).length === 0 &&
    runtimeState === undefined &&
    runtimeDesc === undefined
  ) {
    res.status(400).json({ error: "nothing to update" });
    return;
  }

  let persisted = false;
  if (Object.keys(staticPatch).length > 0) {
    wm.updateObjectMeta(objectId, staticPatch);
    persisted = persistEnvironmentPatch({
      locationId: location.id,
      objectId,
      patch: staticPatch as Record<string, unknown>,
    });
  }

  if (runtimeState !== undefined || runtimeDesc !== undefined) {
    const current = wm.getLocationObjects(location.id).find((o) => o.id === objectId);
    wm.updateObjectState(
      objectId,
      typeof runtimeState === "string" ? runtimeState.trim() : current?.state ?? "available",
      typeof runtimeDesc === "string" ? runtimeDesc.trim() : undefined,
    );
  }

  const refreshed = wm.getLocationObjects(location.id).find((o) => o.id === objectId);
  res.json({
    ok: true,
    persisted,
    object: refreshed ? toEnvironmentObjectInfo(refreshed) : null,
  });
});

router.get("/info", (_req, res) => {
  if (!appContext.hasWorld) {
    res.status(503).json({ error: "No world loaded" });
    return;
  }
  const wm = appContext.worldManager;
  const currentWorldDir = appContext.getWorldDir();
  res.json({
    worldName: wm.getWorldName(),
    worldDescription: wm.getWorldDescription(),
    originalPrompt: wm.getOriginalPrompt(),
    currentWorldId: currentWorldDir ? path.basename(currentWorldDir) : null,
    currentTimelineId: appContext.timelineManager.getCurrentTimelineId(),
    sceneConfig: wm.getSceneConfig(),
    sceneRuntime: buildSceneRuntimeInfo(wm.getSceneConfig()),
    worldActions: wm.getWorldActions(),
    mainAreaPoints: wm.getMainAreaPoints(),
    worldSize: wm.getWorldSize(),
    mainAreaDialogueRadiusPx: wm.getMainAreaDialogueDistanceThreshold(),
    timelineTickCount: appContext.timelineManager.getTickCount(),
  });
});

router.post("/dev/tick-duration", requireAdmin, (req, res) => {
  if (!appContext.hasWorld) {
    res.status(503).json({ error: "No world loaded" });
    return;
  }

  const tickDurationMinutes = Number(req.body?.tickDurationMinutes);
  if (![15, 30, 60].includes(tickDurationMinutes)) {
    res.status(400).json({ error: "tickDurationMinutes must be one of 15, 30, 60" });
    return;
  }
  if (rejectIfSimulationBusy(res)) return;

  appContext.setDevTickDurationMinutes(tickDurationMinutes);
  const wm = appContext.worldManager;
  res.json({
    ok: true,
    gameTime: buildWorldTimeInfo(wm.getCurrentTime(), wm.getSceneConfig()),
    sceneConfig: wm.getSceneConfig(),
    sceneRuntime: buildSceneRuntimeInfo(wm.getSceneConfig()),
  });
});

router.get("/worlds", (_req, res) => {
  const currentWorldDir = appContext.getWorldDir();
  const currentWorldId = currentWorldDir ? path.basename(currentWorldDir) : null;

  const mapWorld = (world: { id: string; worldName: string; dir: string; source: string }) => ({
    id: world.id,
    worldName: world.worldName,
    source: world.source,
    isCurrent: world.id === currentWorldId,
    timelineCount: appContext.timelineManager.listTimelines(world.dir).length,
  });

  res.json({
    currentWorldId,
    currentTimelineId: appContext.timelineManager.getCurrentTimelineId(),
    worlds: listGeneratedWorlds().map(mapWorld),
    libraryWorlds: listLibraryWorlds().map(mapWorld),
  });
});

router.post("/select", (req, res) => {
  const worldId = typeof req.body?.worldId === "string" ? req.body.worldId : "";
  if (!worldId) {
    res.status(400).json({ error: "worldId is required" });
    return;
  }

  const world = findWorldById(worldId);
  if (!world) {
    res.status(404).json({ error: "World not found" });
    return;
  }
  if (rejectIfSimulationBusy(res)) return;

  appContext.switchWorld(world.dir);
  res.json({
    ok: true,
    currentWorldId: world.id,
    worldName: world.worldName,
  });
});

router.delete("/worlds/:worldId", (req, res) => {
  const worldId = String(req.params.worldId);
  if (!worldId || worldId.includes("..") || worldId.includes("/") || worldId.includes("\\")) {
    res.status(400).json({ error: "Invalid world id" });
    return;
  }

  const world = findWorldById(worldId);
  if (!world) {
    res.status(404).json({ error: "World not found" });
    return;
  }

  if (world.source === "library") {
    res.status(403).json({ error: "Sample worlds cannot be deleted" });
    return;
  }

  const resolvedDir = path.resolve(world.dir);
  const resolvedRoot = path.resolve(GENERATED_WORLDS_DIR);
  if (!resolvedDir.startsWith(`${resolvedRoot}${path.sep}`)) {
    res.status(400).json({ error: "World path is outside the generated worlds directory" });
    return;
  }

  const currentWorldDir = appContext.getWorldDir();
  if (currentWorldDir && path.resolve(currentWorldDir) === resolvedDir) {
    res.status(409).json({
      error: "Cannot delete the currently active world. Switch to another world first.",
    });
    return;
  }

  try {
    fs.rmSync(resolvedDir, { recursive: true, force: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to delete world: ${message}` });
    return;
  }

  res.json({ ok: true, deletedWorldId: worldId });
});

router.get("/locations", (_req, res) => {
  if (!appContext.hasWorld) {
    res.status(503).json({ error: "No world loaded" });
    return;
  }
  res.json(appContext.worldManager.getAllLocations());
});

router.get("/locations/:id/state", (req, res) => {
  if (!appContext.hasWorld) {
    res.status(503).json({ error: "No world loaded" });
    return;
  }
  const loc = appContext.worldManager.getLocation(req.params.id);
  if (!loc) {
    res.status(404).json({ error: "Location not found" });
    return;
  }

  const objects = appContext.worldManager.getLocationObjects(loc.id);
  const chars = appContext.characterManager.getCharactersAtLocation(loc.id);

  res.json({
    location: loc,
    objects: objects.map((o) => ({
      objectId: o.objectId,
      state: o.state,
      stateDescription: o.stateDescription,
      currentUsers: o.currentUsers,
    })),
    characters: chars.map((c) => ({
      id: c.profile.id,
      name: c.profile.name,
      action: c.state.currentAction,
    })),
  });
});

router.get("/global-state", (_req, res) => {
  if (!appContext.hasWorld) {
    res.status(503).json({ error: "No world loaded" });
    return;
  }
  res.json(worldStateStore.getAllGlobalState());
});

export default router;
