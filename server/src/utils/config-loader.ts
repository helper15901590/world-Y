import fs from "node:fs";
import path from "node:path";
import type { WorldConfig, CharacterProfile, SceneConfig } from "../types/index.js";
import type { IconicCues, CanonicalRefs, CharacterAnchor } from "../types/character.js";

let worldDir: string | null = null;
let cachedWorldConfig: WorldConfig | null = null;
let cachedCharacterProfiles: CharacterProfile[] | null = null;
let cachedPromptTemplates: Map<string, string> = new Map();
let cachedSceneConfig: SceneConfig | null = null;

const CONFIGS_DIR = fs.existsSync(path.resolve("configs"))
  ? path.resolve("configs")
  : path.resolve("../configs");

export function setWorldDir(dir: string): void {
  worldDir = dir;
  reloadConfigs();
}

export function getWorldDir(): string | null {
  return worldDir;
}

/**
 * 把运行期的角色修改写回世界目录里的角色配置文件（持久化）。
 *
 * - 采用"合并写入"：只覆盖被修改的字段，保留文件里原有的其它键
 *   （如 startPosition 的原始形态、traits 等生成期信息）。
 * - 先写临时文件再 rename，避免中断导致原文件损坏。
 * - 找不到世界目录或该角色的配置文件时返回 false（不抛错，调用方决定如何提示）。
 */
export function persistCharacterProfilePatch(
  charId: string,
  patch: Record<string, unknown>,
): boolean {
  if (!worldDir) return false;

  const candidates = [
    path.join(worldDir, "config", "characters"),
    path.join(worldDir, "characters"),
  ];

  for (const dir of candidates) {
    const filePath = path.join(dir, `${charId}.json`);
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
      const merged = { ...raw, ...patch };
      // coreQuestActive 已废弃（任务是否启动只看 coreQuest 文本），顺手清掉历史遗留键
      if ("coreQuest" in patch) {
        delete merged.coreQuestActive;
      }
      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
      fs.renameSync(tmpPath, filePath);
      return true;
    } catch (err) {
      console.warn(`[World-Y] 角色 ${charId} 的人设写回配置文件失败:`, err);
      return false;
    }
  }

  return false;
}

/**
 * 新建角色的配置文件（管理面板「创建角色」）。已存在同名文件时返回 false，避免覆盖。
 */
export function createCharacterConfigFile(
  charId: string,
  data: Record<string, unknown>,
): boolean {
  if (!worldDir) return false;

  try {
    const dir = path.join(worldDir, "config", "characters");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${charId}.json`);
    if (fs.existsSync(filePath)) return false;
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
    return true;
  } catch (err) {
    console.warn(`[World-Y] 角色 ${charId} 的配置文件创建失败:`, err);
    return false;
  }
}

/**
 * 新角色的美术资源登记：
 * - 可选：复制某个现有角色的精灵图（创建角色时"沿用现有形象"，省去生图模型）
 * - 追加到 characters/characters.json 清单（与生成管线保持一致）
 */
export function registerNewCharacterAssets(params: {
  id: string;
  name: string;
  description?: string;
  spriteSourceId?: string;
}): { spriteCopied: boolean; manifestUpdated: boolean } {
  const result = { spriteCopied: false, manifestUpdated: false };
  if (!worldDir) return result;

  const charactersDir = path.join(worldDir, "characters");

  if (params.spriteSourceId) {
    try {
      const srcSheet = path.join(charactersDir, params.spriteSourceId, "spritesheet.png");
      if (fs.existsSync(srcSheet)) {
        const dstDir = path.join(charactersDir, params.id);
        fs.mkdirSync(dstDir, { recursive: true });
        fs.copyFileSync(srcSheet, path.join(dstDir, "spritesheet.png"));

        const srcMetaPath = path.join(charactersDir, params.spriteSourceId, "metadata.json");
        if (fs.existsSync(srcMetaPath)) {
          const meta = JSON.parse(fs.readFileSync(srcMetaPath, "utf-8")) as Record<string, unknown>;
          fs.writeFileSync(
            path.join(dstDir, "metadata.json"),
            `${JSON.stringify(
              { ...meta, id: params.id, name: params.name, description: params.description ?? meta.description },
              null,
              2,
            )}\n`,
            "utf-8",
          );
        }
        result.spriteCopied = true;
      }
    } catch (err) {
      console.warn(`[World-Y] 复制精灵资源失败（${params.spriteSourceId} → ${params.id}）:`, err);
    }
  }

  try {
    const manifestPath = path.join(charactersDir, "characters.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      if (Array.isArray(manifest) && !manifest.some((c: any) => c?.id === params.id)) {
        manifest.push({
          id: params.id,
          name: params.name,
          description: params.description ?? "",
          createdAt: new Date().toISOString(),
        });
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
        result.manifestUpdated = true;
      }
    }
  } catch (err) {
    console.warn(`[World-Y] 更新角色清单失败（${params.id}）:`, err);
  }

  return result;
}

/** 角色 id 的合法形态（用于校验，同时防止路径穿越） */
export const CHARACTER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * 把「环境物品」的修改写回 world.json 的 locations 数组（嵌套合并写入）。
 * 传 objectId 时修改该地点下的物件，否则修改地点本身。
 */
export function persistEnvironmentPatch(params: {
  locationId: string;
  objectId?: string;
  patch: Record<string, unknown>;
}): boolean {
  if (!worldDir) return false;

  const candidates = [
    path.join(worldDir, "config", "world.json"),
    path.join(worldDir, "world.json"),
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
      const locations = Array.isArray(raw.locations) ? (raw.locations as any[]) : null;
      if (!locations) return false;

      const location = locations.find((l) => l?.id === params.locationId);
      if (!location) return false;

      if (params.objectId) {
        const objects = Array.isArray(location.objects) ? (location.objects as any[]) : null;
        const object = objects?.find((o) => o?.id === params.objectId);
        if (!object) return false;
        Object.assign(object, params.patch);
      } else {
        Object.assign(location, params.patch);
      }

      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");
      fs.renameSync(tmpPath, filePath);
      return true;
    } catch (err) {
      console.warn("[World-Y] 环境/物件配置写回失败:", err);
      return false;
    }
  }

  return false;
}

/**
 * 删除角色在世界目录里的文件：配置文件、立绘目录、characters.json 清单条目。
 * 用于管理面板「删除角色」。
 */
export function deleteCharacterFiles(charId: string): {
  configRemoved: boolean;
  assetsRemoved: boolean;
  manifestUpdated: boolean;
} {
  const result = { configRemoved: false, assetsRemoved: false, manifestUpdated: false };
  if (!worldDir || !CHARACTER_ID_PATTERN.test(charId)) return result;

  const configPath = path.join(worldDir, "config", "characters", `${charId}.json`);
  if (fs.existsSync(configPath)) {
    try {
      fs.rmSync(configPath, { force: true });
      result.configRemoved = true;
    } catch (err) {
      console.warn(`[World-Y] 删除角色配置失败（${charId}）:`, err);
    }
  }

  const assetDir = path.join(worldDir, "characters", charId);
  if (fs.existsSync(assetDir)) {
    try {
      fs.rmSync(assetDir, { recursive: true, force: true });
      result.assetsRemoved = true;
    } catch (err) {
      console.warn(`[World-Y] 删除角色立绘失败（${charId}）:`, err);
    }
  }

  try {
    const manifestPath = path.join(worldDir, "characters", "characters.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      if (Array.isArray(manifest)) {
        const next = manifest.filter((c: any) => c?.id !== charId);
        if (next.length !== manifest.length) {
          fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
          result.manifestUpdated = true;
        }
      }
    }
  } catch (err) {
    console.warn(`[World-Y] 更新角色清单失败（${charId}）:`, err);
  }

  return result;
}

/**
 * 把运行期修改的世界设定写回世界目录里的 world.json（合并写入，保留其余键）。
 * 用于管理面板的「世界设定」编辑。返回是否成功写入。
 */
export function persistWorldConfigPatch(patch: Record<string, unknown>): boolean {
  if (!worldDir) return false;

  const candidates = [
    path.join(worldDir, "config", "world.json"),
    path.join(worldDir, "world.json"),
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
      const merged = { ...raw, ...patch };
      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
      fs.renameSync(tmpPath, filePath);
      return true;
    } catch (err) {
      console.warn("[World-Y] 世界设定写回配置文件失败:", err);
      return false;
    }
  }

  return false;
}

export function loadWorldConfig(): WorldConfig {
  if (cachedWorldConfig) return cachedWorldConfig;

  const candidates = [
    worldDir ? path.join(worldDir, "world.json") : null,
    worldDir ? path.join(worldDir, "config", "world.json") : null,
    path.join(CONFIGS_DIR, "world.json"),
  ].filter(Boolean) as string[];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      cachedWorldConfig = JSON.parse(raw) as WorldConfig;
      return cachedWorldConfig;
    }
  }
  throw new Error("world.json not found");
}

export function loadCharacterProfiles(): CharacterProfile[] {
  if (cachedCharacterProfiles) return cachedCharacterProfiles;

  const candidates = [
    worldDir ? path.join(worldDir, "config", "characters") : null,
    worldDir ? path.join(worldDir, "characters") : null,
    path.join(CONFIGS_DIR, "characters"),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (fs.existsSync(dir!)) {
      const files = fs.readdirSync(dir!).filter((f) => f.endsWith(".json"));
      cachedCharacterProfiles = files
        .map((f) => {
        const raw = fs.readFileSync(path.join(dir!, f), "utf-8");
          return normalizeCharacterProfile(JSON.parse(raw));
        })
        .filter(Boolean) as CharacterProfile[];
      if (cachedCharacterProfiles.length > 0) {
      return cachedCharacterProfiles;
      }
    }
  }
  throw new Error("Characters directory not found");
}

export function loadSceneConfig(): SceneConfig {
  if (cachedSceneConfig) return cachedSceneConfig;

  const wc = loadWorldConfig();
  let sceneFromFile: Record<string, unknown> | null = null;

  const candidates = [
    worldDir ? path.join(worldDir, "scene.json") : null,
    worldDir ? path.join(worldDir, "config", "scene.json") : null,
    path.join(CONFIGS_DIR, "scene.json"),
  ].filter(Boolean) as string[];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath!)) {
      const raw = fs.readFileSync(filePath!, "utf-8");
      sceneFromFile = JSON.parse(raw) as Record<string, unknown>;
      break;
    }
  }

  const worldScene =
    wc.scene && typeof wc.scene === "object"
      ? (wc.scene as unknown as Record<string, unknown>)
      : null;
  const mergedScene = {
    ...(sceneFromFile ?? {}),
    ...(worldScene ?? {}),
    multiDay: {
      ...((sceneFromFile?.multiDay as Record<string, unknown> | undefined) ?? {}),
      ...((worldScene?.multiDay as Record<string, unknown> | undefined) ?? {}),
    },
  };

  cachedSceneConfig = normalizeSceneConfig(mergedScene);
  return cachedSceneConfig;
}

export function loadPromptTemplate(name: string): string {
  if (cachedPromptTemplates.has(name)) return cachedPromptTemplates.get(name)!;
  const filePath = path.join(CONFIGS_DIR, "prompts", `${name}.md`);
  const content = fs.readFileSync(filePath, "utf-8");
  cachedPromptTemplates.set(name, content);
  return content;
}

export function reloadConfigs(): void {
  cachedWorldConfig = null;
  cachedCharacterProfiles = null;
  cachedSceneConfig = null;
  cachedPromptTemplates.clear();
}

export function normalizeCharacterProfile(raw: any): CharacterProfile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !raw.id || !raw.name) {
    return null;
  }

  const startLocation = normalizeStartLocation(raw.startPosition);
  const socialStyle = normalizeSocialStyle(raw.socialStyle);
  const extraversionLevel = normalizeExtraversionLevel(raw.extraversionLevel, socialStyle);
  const intuitionLevel = normalizeIntuitionLevel(raw.intuitionLevel, raw);

  return {
    id: raw.id,
    name: raw.name,
    role: raw.role || "NPC",
    nickname: raw.nickname || raw.name,
    startPosition: startLocation,
    backstory: typeof raw.backstory === "string" ? raw.backstory : undefined,
    appearanceHint:
      typeof raw.appearanceHint === "string" && raw.appearanceHint.trim()
        ? raw.appearanceHint.trim()
        : undefined,
    gender: optionalText(raw.gender),
    age: optionalText(raw.age),
    department: optionalText(raw.department),
    position: optionalText(raw.position),
    jobTitle: optionalText(raw.jobTitle),
    dislikes: toStringArray(raw.dislikes),
    coreMotivation: raw.coreMotivation || raw.motivation || raw.role || "在这个世界中过好自己的生活",
    coreValues: Array.isArray(raw.coreValues) ? raw.coreValues : [],
    speakingStyle:
      raw.speakingStyle ||
      (typeof raw.socialStyle === "string" ? raw.socialStyle : "") ||
      raw.personality ||
      "自然、贴近角色设定",
    fears: Array.isArray(raw.fears) ? raw.fears : [],
    preferredLocations: Array.isArray(raw.preferredLocations)
      ? raw.preferredLocations
      : [startLocation],
    preferredActivities: toStringArray(raw.preferredActivities ?? raw.hobbies),
    socialStyle,
    extraversionLevel,
    intuitionLevel,
    skills: toStringArray(raw.skills ?? raw.coreAbilities),
    writeDiary: raw.writeDiary ?? true,
    fourthWallCandidate: raw.fourthWallCandidate ?? false,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    initialMemories: normalizeInitialMemories(raw.initialMemories, startLocation),
    anchor: normalizeAnchor(raw.anchor),
    coreQuest: optionalText(raw.coreQuest),
    editPassword:
      typeof raw.editPassword === "string" && raw.editPassword.trim()
        ? raw.editPassword.trim()
        : undefined,
    iconicCues: normalizeIconicCues(raw.iconicCues),
    canonicalRefs: normalizeCanonicalRefs(raw.canonicalRefs),
  };
}

function normalizeAnchor(raw: unknown): CharacterAnchor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const type = r.type;
  const targetId = r.targetId;
  if ((type === "region" || type === "element") && typeof targetId === "string" && targetId.length > 0) {
    return { type, targetId };
  }
  return undefined;
}

function normalizeIconicCues(raw: unknown): IconicCues | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const speechQuirks = toStringArray(r.speechQuirks);
  const catchphrases = toStringArray(r.catchphrases).slice(0, 2);
  const behavioralTics = toStringArray(r.behavioralTics);
  if (speechQuirks.length === 0 && catchphrases.length === 0 && behavioralTics.length === 0) {
    return undefined;
  }
  return { speechQuirks, catchphrases, behavioralTics };
}

function normalizeCanonicalRefs(raw: unknown): CanonicalRefs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const source = typeof r.source === "string" ? r.source.trim() : "";
  const keyRelationships = toStringArray(r.keyRelationships);
  const signatureMoments = toStringArray(r.signatureMoments).slice(0, 2);
  if (!source && keyRelationships.length === 0 && signatureMoments.length === 0) {
    return undefined;
  }
  return {
    source: source || undefined,
    keyRelationships,
    signatureMoments,
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
}

/** 选填文本字段：接受字符串或数字（如 age），去空白后为空则视为未填写。 */
function optionalText(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStartLocation(startPosition: unknown): string {
  if (typeof startPosition === "string" && startPosition) {
    return startPosition;
  }
  if (
    startPosition &&
    typeof startPosition === "object" &&
    "locationId" in startPosition &&
    typeof (startPosition as { locationId?: unknown }).locationId === "string"
  ) {
    return (startPosition as { locationId: string }).locationId;
  }
  return "main_area";
}

function normalizeSocialStyle(value: unknown): CharacterProfile["socialStyle"] {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (text.includes("introvert_selective") || text.includes("selective")) {
    return "introvert_selective";
  }
  if (text.includes("introvert") || text.includes("内向")) {
    return "introvert";
  }
  if (text.includes("ambivert") || text.includes("中间") || text.includes("外冷内热")) {
    return "introvert_selective";
  }
  return "extrovert";
}

function normalizeExtraversionLevel(
  value: unknown,
  socialStyle: CharacterProfile["socialStyle"],
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }

  switch (socialStyle) {
    case "extrovert":
      return 0.8;
    case "introvert_selective":
      return 0.55;
    case "introvert":
    default:
      return 0.25;
  }
}

function normalizeIntuitionLevel(value: unknown, raw: any): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }

  const haystack = `${raw?.personality || ""} ${(raw?.traits || []).join(" ")}`.toLowerCase();
  if (
    haystack.includes("好奇") ||
    haystack.includes("curious") ||
    haystack.includes("creative") ||
    haystack.includes("创意")
  ) {
    return 0.7;
  }
  return 0.5;
}

function normalizeInitialMemories(
  initialMemories: unknown,
  startLocation: string,
): CharacterProfile["initialMemories"] {
  if (!Array.isArray(initialMemories)) return [];

  return initialMemories
    .filter((item) => item && typeof item === "object" && typeof item.content === "string")
    .map((item: any) => ({
      type: item.type || "reflection",
      content: item.content,
      importance: typeof item.importance === "number" ? item.importance : 6,
      emotionalValence:
        typeof item.emotionalValence === "number" ? item.emotionalValence : 0,
      emotionalIntensity:
        typeof item.emotionalIntensity === "number" ? item.emotionalIntensity : 1,
      relatedCharacters: Array.isArray(item.relatedCharacters) ? item.relatedCharacters : [],
      relatedLocation:
        typeof item.relatedLocation === "string" ? item.relatedLocation : startLocation,
      relatedObjects: Array.isArray(item.relatedObjects) ? item.relatedObjects : [],
      tags: Array.isArray(item.tags) ? item.tags : [],
    }));
}

function normalizeSceneConfig(raw: Record<string, unknown> | null | undefined): SceneConfig {
  const sceneType = raw?.sceneType === "open" ? "open" : "closed";
  const startTime = typeof raw?.startTime === "string" && raw.startTime ? raw.startTime : "08:00";
  const tickDurationMinutes =
    typeof raw?.tickDurationMinutes === "number" && Number.isFinite(raw.tickDurationMinutes)
      ? Math.max(1, Math.floor(raw.tickDurationMinutes))
      : 15;

  let maxTicks: number | null = null;
  if (sceneType === "open") {
    if (typeof raw?.maxTicks === "number" && Number.isFinite(raw.maxTicks)) {
      maxTicks = Math.max(1, Math.floor(raw.maxTicks));
    } else if (typeof raw?.endTime === "string" && raw.endTime) {
      maxTicks = deriveTicksFromTimeRange(startTime, raw.endTime as string, tickDurationMinutes);
    } else {
      maxTicks = Math.round((12 * 60) / tickDurationMinutes);
    }
  }

  return {
    sceneType,
    startTime,
    tickDurationMinutes,
    maxTicks,
    displayFormat:
      raw?.displayFormat === "ancient_chinese" || raw?.displayFormat === "fantasy"
        ? raw.displayFormat
        : "modern",
    description: typeof raw?.description === "string" ? raw.description : "",
    multiDay: normalizeMultiDay(raw?.multiDay, startTime, maxTicks, sceneType),
  };
}

function normalizeMultiDay(
  raw: unknown,
  startTime: string,
  _maxTicks: number | null,
  sceneType: SceneConfig["sceneType"],
): SceneConfig["multiDay"] {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const enabled = sceneType === "open";
  const nextDayStartTime = sceneType === "open" ? startTime : "00:00";

  return {
    enabled,
    endOfDayText:
      typeof data.endOfDayText === "string" ? data.endOfDayText : "",
    newDayText:
      typeof data.newDayText === "string" ? data.newDayText : (typeof data.dayTransitionText === "string" ? data.dayTransitionText : ""),
    nextDayStartTime:
      typeof data.nextDayStartTime === "string" && data.nextDayStartTime
        ? data.nextDayStartTime
        : nextDayStartTime,
  };
}

function deriveTicksFromTimeRange(
  startTime: string,
  endTime: string,
  tickDurationMinutes: number,
): number {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const diffMinutes = (endMinutes - startMinutes + 24 * 60) % (24 * 60);
  const windowMinutes = diffMinutes === 0 ? 24 * 60 : diffMinutes;
  return Math.max(1, Math.round(windowMinutes / tickDurationMinutes));
}

function parseTimeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return ((h * 60 + m) % (24 * 60) + 24 * 60) % (24 * 60);
}
