import type {
  CharacterProfile,
  CharacterState,
  CharacterAnchor,
  GameTime,
  SimulationEvent,
  DiaryEntry,
} from "../types/index.js";
import type { WorldManager } from "./world-manager.js";
import {
  loadCharacterProfiles,
  persistCharacterProfilePatch,
  createCharacterConfigFile,
  deleteCharacterFiles,
  normalizeCharacterProfile,
} from "../utils/config-loader.js";
import { generateId } from "../utils/id-generator.js";
import * as charStateStore from "../store/character-state-store.js";
import { MemoryManager } from "./memory-manager.js";
import { generateEditPassword } from "../utils/password.js";
import { decayNeeds } from "./needs-manager.js";
import { decayEmotion } from "./emotion-manager.js";
import { getDb } from "../store/db.js";
import * as memoryStore from "../store/memory-store.js";

export interface CreateCharacterInput {
  name: string;
  nickname?: string;
  appearanceHint?: string;
  gender?: string;
  age?: string;
  department?: string;
  position?: string;
  jobTitle?: string;
  backstory?: string;
  startPosition?: string;
  /** 核心任务：有文字即启动（填写即生效，清空即停止） */
  coreQuest?: string;
}

export class CharacterManager {
  memoryManager: MemoryManager;

  private profiles: Map<string, CharacterProfile> = new Map();

  constructor(private worldManager: WorldManager) {
    this.memoryManager = new MemoryManager();
  }

  initialize(): void {
    const profiles = loadCharacterProfiles();

    for (const p of profiles) {
      // 每个角色都必须有一个 12 位编辑密码：缺失时自动生成并写回配置文件
      if (!p.editPassword) {
        p.editPassword = generateEditPassword();
        persistCharacterProfilePatch(p.id, { editPassword: p.editPassword });
      }
      this.profiles.set(p.id, p);
    }

    const occupiedPointIds = new Set<string>();
    const spawnSeedSalt = `init:${Date.now().toString(36)}`;
    for (const profile of profiles) {
      const state = buildInitialCharacterState(
        profile,
        this.worldManager,
        occupiedPointIds,
        spawnSeedSalt,
      );
      if (state.mainAreaPointId) {
        occupiedPointIds.add(state.mainAreaPointId);
      }
      charStateStore.initCharacterState(state);

      for (const initMem of profile.initialMemories) {
        if (
          memoryStore.hasMemory(
            profile.id,
            initMem.type,
            initMem.content,
            1,
            0,
          )
        ) {
          continue;
        }

        this.memoryManager.addMemory({
          characterId: profile.id,
          type: initMem.type,
          content: initMem.content,
          gameTime: { day: 1, tick: 0 },
          importance: initMem.importance,
          emotionalValence: initMem.emotionalValence,
          emotionalIntensity: initMem.emotionalIntensity,
          relatedCharacters: initMem.relatedCharacters,
          relatedLocation: initMem.relatedLocation,
          relatedObjects: initMem.relatedObjects,
          tags: initMem.tags,
        });
      }

      // 背景故事只作为「个人档案」的一部分注入提示词；
      // 不再自动写入记忆，避免同一段文字在"你记得的事"里重复出现。
    }

  }

  getProfile(charId: string): CharacterProfile {
    const p = this.profiles.get(charId);
    if (!p) throw new Error(`Profile not found: ${charId}`);
    return p;
  }

  getAllProfiles(): CharacterProfile[] {
    return Array.from(this.profiles.values());
  }

  /** Editable subset of CharacterProfile fields. */
  static readonly EDITABLE_FIELDS = [
    "name", "role", "nickname", "appearanceHint",
    "coreMotivation", "coreValues", "speakingStyle",
    "fears", "backstory", "socialStyle", "tags",
    "gender", "age", "department", "position", "jobTitle",
    "dislikes", "skills", "preferredActivities",
    "initialMemories", "iconicCues", "canonicalRefs",
    "anchor",
    "coreQuest",
  ] as const;

  patchProfile(
    charId: string,
    patch: Partial<Pick<CharacterProfile, (typeof CharacterManager.EDITABLE_FIELDS)[number]>>,
  ): CharacterProfile {
    const existing = this.profiles.get(charId);
    if (!existing) throw new Error(`Profile not found: ${charId}`);
    const cleaned: Record<string, unknown> = {};
    for (const key of CharacterManager.EDITABLE_FIELDS) {
      if (key in patch) cleaned[key] = (patch as Record<string, unknown>)[key];
    }
    const updated = { ...existing, ...cleaned };

    // 改名时，若昵称只是沿用旧名字（默认值），一并同步为新名字，
    // 避免对话里出现「新名字，又称旧名字」这种残留。
    const nextName = typeof updated.name === "string" ? updated.name.trim() : "";
    if (nextName && nextName !== existing.name && updated.nickname === existing.name) {
      updated.nickname = nextName;
      cleaned.nickname = nextName;
    }

    // 锚定变更：非法值一律视为「解除锚定」；配置里写成 null 便于显式清除
    if ("anchor" in cleaned) {
      const rawAnchor = cleaned.anchor as { type?: unknown; targetId?: unknown } | null;
      const validAnchor =
        rawAnchor &&
        typeof rawAnchor === "object" &&
        (rawAnchor.type === "region" || rawAnchor.type === "element") &&
        typeof rawAnchor.targetId === "string" &&
        rawAnchor.targetId.length > 0
          ? { type: rawAnchor.type as "region" | "element", targetId: rawAnchor.targetId }
          : undefined;
      (updated as { anchor?: CharacterAnchor }).anchor = validAnchor;
      cleaned.anchor = validAnchor ?? null;
      this.applyAnchorToState(charId, validAnchor);
    }

    this.profiles.set(charId, updated);

    if ("initialMemories" in cleaned) {
      this.syncInitialMemories(charId, updated.initialMemories);
    }

    // 写回世界目录里的角色配置文件：界面上的修改立即生效，且重启后不丢失。
    if (!persistCharacterProfilePatch(charId, cleaned)) {
      console.warn(
        `[WorldX] 角色 ${charId} 的人设已生效，但未能写回配置文件（重启后会恢复为文件内容）。`,
      );
    }

    return updated;
  }

  /**
   * 把「记忆」表单内容同步到记忆库，让配置的记忆真正出现在提示词的"你记得的事"里：
   * - 新增：列表里有、库里没有的（按内容匹配）
   * - 删除：带 background 标签、但列表里已被移除的
   */
  private syncInitialMemories(
    charId: string,
    desired: CharacterProfile["initialMemories"],
  ): void {
    const list = Array.isArray(desired) ? desired : [];
    const desiredContents = new Set(
      list.map((item) => (item?.content ?? "").trim()).filter(Boolean),
    );

    const existing = memoryStore.getMemoriesByCharacter(charId, { tags: ["background"] });
    const existingContents = new Set(existing.map((m) => m.content.trim()));

    for (const memory of existing) {
      if (!desiredContents.has(memory.content.trim())) {
        memoryStore.deleteMemory(memory.id);
      }
    }

    const startPosition = this.profiles.get(charId)?.startPosition ?? "";
    for (const item of list) {
      const content = (item?.content ?? "").trim();
      if (!content || existingContents.has(content)) continue;
      this.memoryManager.addMemory({
        characterId: charId,
        type: item.type || "reflection",
        content,
        gameTime: { day: 1, tick: 0 },
        importance: typeof item.importance === "number" ? item.importance : 6,
        emotionalValence: item.emotionalValence ?? 0,
        emotionalIntensity: item.emotionalIntensity ?? 1,
        relatedCharacters: item.relatedCharacters ?? [],
        relatedLocation: item.relatedLocation || startPosition,
        relatedObjects: item.relatedObjects ?? [],
        tags: Array.from(new Set(["background", ...(item.tags ?? [])])),
      });
    }

    this.memoryManager.clearCache();
  }

  /**
   * 管理面板「创建角色」：生成档案 → 写入配置文件 → 注册到运行时 → 初始化状态。
   * 状态初始化与 initialize() 走同一套逻辑（自动分配出生点）。
   */
  createCharacter(input: CreateCharacterInput): {
    profile: CharacterProfile;
    persisted: boolean;
  } {
    const id = this.allocateCharacterId();
    const rawConfig: Record<string, unknown> = {
      id,
      name: input.name.trim(),
      // role 已不再进入提示词，这里用职位/岗位兜底，仅供界面上显示"身份"
      role: input.jobTitle?.trim() || input.position?.trim() || "NPC",
      startPosition: input.startPosition?.trim() || "main_area",
      initialMemories: [],
      editPassword: generateEditPassword(),
      createdAt: new Date().toISOString(),
    };

    const optionalFields: [string, string | undefined][] = [
      ["nickname", input.nickname],
      ["appearanceHint", input.appearanceHint],
      ["gender", input.gender],
      ["age", input.age],
      ["department", input.department],
      ["position", input.position],
      ["jobTitle", input.jobTitle],
      ["backstory", input.backstory],
    ];
    for (const [key, value] of optionalFields) {
      const trimmed = typeof value === "string" ? value.trim() : "";
      if (trimmed) rawConfig[key] = trimmed;
    }

    // 核心任务：填写即启动——只在有文字时写入，空任务不产生任何配置
    const quest = typeof input.coreQuest === "string" ? input.coreQuest.trim() : "";
    if (quest) {
      rawConfig.coreQuest = quest;
    }

    const profile = normalizeCharacterProfile(rawConfig);
    if (!profile) {
      throw new Error("创建角色失败：档案不合法");
    }

    // 先落盘配置文件，再注册到运行时；写盘失败也不阻断（重启后会丢失）
    const persisted = createCharacterConfigFile(id, rawConfig);

    this.profiles.set(id, profile);

    const occupiedPointIds = new Set(
      this.getAllStates()
        .map((state) => state.mainAreaPointId)
        .filter((pid): pid is string => typeof pid === "string" && pid.length > 0),
    );
    const state = buildInitialCharacterState(
      profile,
      this.worldManager,
      occupiedPointIds,
      `create:${Date.now().toString(36)}`,
    );
    charStateStore.initCharacterState(state);

    for (const initMem of profile.initialMemories) {
      this.memoryManager.addMemory({
        characterId: id,
        type: initMem.type,
        content: initMem.content,
        gameTime: { day: 1, tick: 0 },
        importance: initMem.importance,
        emotionalValence: initMem.emotionalValence,
        emotionalIntensity: initMem.emotionalIntensity,
        relatedCharacters: initMem.relatedCharacters,
        relatedLocation: initMem.relatedLocation,
        relatedObjects: initMem.relatedObjects,
        tags: initMem.tags,
      });
    }
    this.memoryManager.clearCache();

    return { profile, persisted };
  }

  /**
   * 锚定变更后把角色移到锚点所在位置：
   * - region 锚 → 置于该区域
   * - element 锚 → 置于 main_area 中该元素所在的点位
   * - 解除锚定（undefined）→ 原地不动
   */
  private applyAnchorToState(
    charId: string,
    anchor: { type: "region" | "element"; targetId: string } | undefined,
  ): void {
    if (!anchor) return;
    try {
      if (anchor.type === "region") {
        if (!this.worldManager.getLocation(anchor.targetId)) return;
        charStateStore.updateCharacterState(charId, {
          location: anchor.targetId,
          mainAreaPointId: null,
          currentAction: null,
          currentActionTarget: null,
          actionStartTick: 0,
          actionEndTick: 0,
        });
        return;
      }

      const elementPointId = `element_${anchor.targetId}`;
      if (!this.worldManager.getMainAreaPoint(elementPointId)) return;
      charStateStore.updateCharacterState(charId, {
        location: "main_area",
        mainAreaPointId: elementPointId,
        currentAction: null,
        currentActionTarget: null,
        actionStartTick: 0,
        actionEndTick: 0,
      });
    } catch (err) {
      console.warn(`[WorldX] 应用锚定失败（${charId}）:`, err);
    }
  }

  /** 读取角色的编辑密码（管理员面板用）。 */
  getEditPassword(charId: string): string | undefined {
    return this.profiles.get(charId)?.editPassword;
  }

  /** 校验编辑密码；角色未设置密码时视为无需密码。 */
  verifyEditPassword(charId: string, provided: unknown): boolean {
    const required = this.profiles.get(charId)?.editPassword;
    if (!required) return true;
    return typeof provided === "string" && provided === required;
  }

  /** 重新生成编辑密码并写回配置文件（管理员操作），返回新密码。 */
  regenerateEditPassword(charId: string): string {
    const profile = this.profiles.get(charId);
    if (!profile) throw new Error(`Profile not found: ${charId}`);
    const password = generateEditPassword();
    profile.editPassword = password;
    persistCharacterProfilePatch(charId, { editPassword: password });
    return password;
  }

  /**
   * 管理面板「删除角色」：从运行时、当前时间线的数据库、世界文件三处移除。
   * 历史事件（events）保留——时间线与回放不受影响；仅清理状态/记忆/日记。
   */
  deleteCharacter(charId: string): {
    profile: CharacterProfile;
    files: { configRemoved: boolean; assetsRemoved: boolean; manifestUpdated: boolean };
    memoriesRemoved: number;
  } {
    const profile = this.profiles.get(charId);
    if (!profile) throw new Error(`Profile not found: ${charId}`);
    if (this.profiles.size <= 1) {
      throw new Error("cannot delete the last character");
    }

    // 终止该角色参与的对话，并释放其占用的物件
    for (const session of this.worldManager.listDialogueSessions()) {
      if (session.participants.includes(charId)) {
        this.worldManager.deleteDialogueSession(session.id);
      }
    }
    try {
      const state = charStateStore.getCharacterState(charId);
      // "world_action:" 前缀的目标不是物件，无需释放
      const target = state.currentActionTarget;
      if (target && !target.startsWith("world_action:")) {
        this.worldManager.characterStopUsingObject(target, charId);
      }
    } catch {
      // 状态可能已不存在，忽略
    }

    this.profiles.delete(charId);
    charStateStore.deleteCharacterState(charId);
    const memoriesRemoved = memoryStore.deleteMemoriesByCharacter(charId);
    this.deleteDiaryEntries(charId);
    this.memoryManager.clearCache();

    const files = deleteCharacterFiles(charId);

    return { profile, files, memoriesRemoved };
  }

  private deleteDiaryEntries(charId: string): void {
    try {
      getDb().prepare("DELETE FROM diary_entries WHERE character_id = ?").run(charId);
    } catch (err) {
      console.warn(`[WorldX] 删除角色 ${charId} 的日记失败:`, err);
    }
  }

  private allocateCharacterId(): string {
    let id = `char_${Date.now()}`;
    while (this.profiles.has(id)) {
      id = `char_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
    return id;
  }

  getState(charId: string): CharacterState {
    return charStateStore.getCharacterState(charId);
  }

  getAllStates(): CharacterState[] {
    return charStateStore.getAllCharacterStates();
  }

  resetStatesForNewScene(): void {
    const occupiedPointIds = new Set<string>();
    const currentTime = this.worldManager.getCurrentTime();
    const spawnSeedSalt = `scene:${currentTime.day}:${Date.now().toString(36)}`;

    for (const profile of this.getAllProfiles()) {
      const initialState = buildInitialCharacterState(
        profile,
        this.worldManager,
        occupiedPointIds,
        spawnSeedSalt,
      );
      if (initialState.mainAreaPointId) {
        occupiedPointIds.add(initialState.mainAreaPointId);
      }

      charStateStore.updateCharacterState(profile.id, {
        location: initialState.location,
        mainAreaPointId: initialState.mainAreaPointId,
        currentAction: initialState.currentAction,
        currentActionTarget: initialState.currentActionTarget,
        actionStartTick: initialState.actionStartTick,
        actionEndTick: initialState.actionEndTick,
        emotionValence: initialState.emotionValence,
        emotionArousal: initialState.emotionArousal,
        curiosity: initialState.curiosity,
        dailyPlan: initialState.dailyPlan,
      });
    }
  }

  updateState(charId: string, patch: Partial<CharacterState>): void {
    charStateStore.updateCharacterState(charId, patch);
  }

  tickPassiveUpdate(charId: string, currentTime: GameTime): SimulationEvent[] {
    const state = this.getState(charId);
    const profile = this.getProfile(charId);

    const needsPatch = decayNeeds(state, profile, currentTime.tick);
    const emotionResult = decayEmotion({
      valence: state.emotionValence,
      arousal: state.emotionArousal,
    });

    const fullPatch: Partial<CharacterState> = {
      ...needsPatch,
      emotionValence: emotionResult.valence,
      emotionArousal: emotionResult.arousal,
    };

    charStateStore.updateCharacterState(charId, fullPatch);
    return [];
  }

  getCharactersAtLocation(
    locationId: string,
  ): { profile: CharacterProfile; state: CharacterState }[] {
    const states = charStateStore.getCharactersByLocation(locationId);
    return states.map((s) => ({
      profile: this.getProfile(s.characterId),
      state: s,
    }));
  }

  addDiaryEntry(charId: string, gameDay: number, content: string): DiaryEntry {
    const entry: DiaryEntry = {
      id: generateId(),
      characterId: charId,
      gameDay,
      content,
    };

    getDb()
      .prepare(
        `INSERT INTO diary_entries (id, character_id, game_day, content) VALUES (?, ?, ?, ?)`,
      )
      .run(entry.id, entry.characterId, entry.gameDay, entry.content);

    return entry;
  }

  getDiaryEntries(charId: string, gameDay?: number): DiaryEntry[] {
    if (gameDay !== undefined) {
      return (
        getDb()
          .prepare(
            "SELECT * FROM diary_entries WHERE character_id = ? AND game_day = ? ORDER BY rowid",
          )
          .all(charId, gameDay) as any[]
      ).map(rowToDiary);
    }

    return (
      getDb()
        .prepare(
          "SELECT * FROM diary_entries WHERE character_id = ? ORDER BY game_day, rowid",
        )
        .all(charId) as any[]
    ).map(rowToDiary);
  }
}

function rowToDiary(row: any): DiaryEntry {
  return {
    id: row.id,
    characterId: row.character_id,
    gameDay: row.game_day,
    content: row.content,
  };
}

function buildInitialCharacterState(
  profile: CharacterProfile,
  worldManager: WorldManager,
  occupiedPointIds: Set<string>,
  spawnSeedSalt: string,
): CharacterState {
  const spawnSeed = `${profile.id}:${spawnSeedSalt}`;
  let mainAreaPointId: string | null = null;
  if (profile.startPosition === "main_area") {
    if (profile.anchor?.type === "element") {
      const elementPointId = `element_${profile.anchor.targetId}`;
      const point = worldManager.getMainAreaPoint(elementPointId);
      // Anchored characters always spawn at their anchor point, even if it's
      // in a small disconnected component of the point graph.
      mainAreaPointId = point
        ? elementPointId
        : worldManager.getSpreadMainAreaPointId(spawnSeed, occupiedPointIds);
    } else {
      mainAreaPointId = worldManager.getSpreadMainAreaPointId(spawnSeed, occupiedPointIds);
    }
  }

  return {
    characterId: profile.id,
    location: profile.startPosition,
    mainAreaPointId,
    currentAction: null,
    currentActionTarget: null,
    actionStartTick: 0,
    actionEndTick: 0,
    emotionValence: 1,
    emotionArousal: clampStat(3 + profile.extraversionLevel * 2),
    curiosity: clampStat(64 + profile.intuitionLevel * 20),
    dailyPlan: null,
  };
}

function clampStat(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
