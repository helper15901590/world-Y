import type {
  CharacterInfo,
  CharacterDetail,
  DiaryEntry,
  MemoryEntry,
  SimulationEvent,
  WorldTimeInfo,
  LocationInfo,
  GameTime,
  MainAreaPointInfo,
  SceneConfigInfo,
  SceneRuntimeInfo,
  TimelineMeta,
  TimelineWithWorld,
  TimelineFrame,
  WorldPromptInfo,
  EnvironmentLocationInfo,
  EnvironmentObjectInfo,
} from "../../types/api";

const API_BASE = "/api";

/**
 * 管理员会话令牌（内存保存，刷新页面即失效）。
 * 解锁 TopBar 后由 adminLogin 返回，随每个请求以 x-admin-token 头发送。
 */
let adminToken: string | null = null;
let onAdminRequired: (() => void) | null = null;

export function setAdminToken(token: string | null): void {
  adminToken = token;
}

/** 令牌失效（服务端要求重新鉴权）时的回调：界面重新上锁 */
export function setAdminRequiredHandler(handler: (() => void) | null): void {
  onAdminRequired = handler;
}

/**
 * API 错误：携带 HTTP 状态码与服务端结构化错误码（如 NAME_TAKEN / EDIT_PASSWORD_REQUIRED）。
 * message 保持 "API <status>: <error>" 格式，方便旧代码按文本匹配。
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function requestJSON<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (adminToken) headers.set("x-admin-token", adminToken);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = "";
    let body: { error?: string; code?: string } | null = null;
    try {
      body = await res.json();
      detail = body?.error ? `: ${body.error}` : "";
    } catch {
      // Ignore non-JSON error bodies.
    }
    if (res.status === 401 && body?.code === "ADMIN_REQUIRED") {
      adminToken = null;
      onAdminRequired?.();
    }
    throw new ApiError(res.status, `API ${res.status}${detail}`, body?.code ?? null);
  }
  return res.json();
}

function fetchJSON<T>(path: string): Promise<T> {
  return requestJSON(path);
}

function postJSON<T>(path: string, body?: unknown): Promise<T> {
  return requestJSON(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function deleteJSON<T>(path: string): Promise<T> {
  return requestJSON(path, { method: "DELETE" });
}

function patchJSON<T>(path: string, body?: unknown): Promise<T> {
  return requestJSON(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export interface WorldInfo {
  worldName: string;
  worldDescription: string;
  originalPrompt?: string;
  currentWorldId?: string | null;
  currentTimelineId?: string | null;
  sceneConfig: SceneConfigInfo;
  sceneRuntime: SceneRuntimeInfo;
  mainAreaPoints?: MainAreaPointInfo[];
  timelineTickCount?: number;
}

export type WorldSource = "user" | "library";

export interface GeneratedWorldSummary {
  id: string;
  worldName: string;
  source: WorldSource;
  isCurrent: boolean;
  timelineCount?: number;
}

export interface GeneratedWorldListResponse {
  currentWorldId: string | null;
  currentTimelineId: string | null;
  worlds: GeneratedWorldSummary[];
  libraryWorlds: GeneratedWorldSummary[];
}

export type CreateJobSizeK = 1 | 2 | 4;

export type CreateJobPhase = 1 | 2 | 3 | 4;

export type CreateJobEvent =
  | { kind: "job_started"; at: number; jobId: string; prompt: string; sizeK: CreateJobSizeK }
  | { kind: "phase"; at: number; phase: CreateJobPhase; label: string }
  | { kind: "step"; at: number; phase: CreateJobPhase; step: string; label: string }
  | { kind: "info"; at: number; label: string }
  | { kind: "world_id"; at: number; worldId: string }
  | { kind: "log"; at: number; stream: "stdout" | "stderr"; line: string }
  | { kind: "job_done"; at: number; worldId: string; worldName?: string }
  | { kind: "job_error"; at: number; message: string; tail: string[] };

export interface CreateJobSnapshot {
  jobId: string;
  status: "running" | "done" | "error";
  prompt: string;
  sizeK: CreateJobSizeK;
  phase: CreateJobPhase | null;
  step: string | null;
  startedAt: number;
  finishedAt: number | null;
  worldId: string | null;
  worldName: string | null;
  error: string | null;
}

export class JobConflictError extends Error {
  activeJobId: string;
  constructor(message: string, activeJobId: string) {
    super(message);
    this.name = "JobConflictError";
    this.activeJobId = activeJobId;
  }
}

export const apiClient = {
  getWorldTime(): Promise<WorldTimeInfo> {
    return fetchJSON("/world/time");
  },

  getWorldInfo(): Promise<WorldInfo> {
    return fetchJSON("/world/info");
  },

  getWorldPrompt(): Promise<WorldPromptInfo> {
    return fetchJSON("/world/prompt");
  },

  getEnvironment(): Promise<{ locations: EnvironmentLocationInfo[] }> {
    return fetchJSON("/world/environment");
  },

  updateEnvironmentLocation(
    locationId: string,
    patch: { name?: string; description?: string },
  ): Promise<{ ok: boolean; persisted: boolean; location: { id: string; name: string; description: string } }> {
    return patchJSON(`/world/environment/location/${locationId}`, patch);
  },

  updateEnvironmentObject(
    objectId: string,
    patch: { name?: string; state?: string; stateDescription?: string },
  ): Promise<{ ok: boolean; persisted: boolean; object: EnvironmentObjectInfo | null }> {
    return patchJSON(`/world/environment/object/${objectId}`, patch);
  },

  updateWorldPrompt(
    patch: Partial<WorldPromptInfo>,
  ): Promise<WorldPromptInfo & { ok: boolean; persisted: boolean }> {
    return patchJSON("/world/prompt", patch);
  },

  getGeneratedWorlds(): Promise<GeneratedWorldListResponse> {
    return fetchJSON("/world/worlds");
  },

  createCharacter(payload: {
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
    spriteSourceId?: string;
    coreQuest?: string;
  }): Promise<{
    ok: boolean;
    persisted: boolean;
    spriteCopied: boolean;
    character: { id: string; name: string; hasSprite: boolean };
  }> {
    return postJSON("/characters", payload);
  },

  /** 管理员：读取某角色的编辑密码（用于分发给玩家） */
  getCharacterEditPassword(id: string): Promise<{ ok: boolean; characterId: string; editPassword: string | null }> {
    return fetchJSON(`/characters/${id}/edit-password`);
  },

  /** 管理员会话：是否需要密码、当前是否已解锁 */
  getAdminSession(): Promise<{ required: boolean; authenticated: boolean }> {
    return fetchJSON("/admin/session");
  },

  adminLogin(password: string): Promise<{ ok: boolean; required: boolean; token: string | null }> {
    return postJSON("/admin/login", { password });
  },

  adminLogout(): Promise<{ ok: boolean }> {
    return postJSON("/admin/logout");
  },

  /** 校验角色的编辑密码（「改人设」的进门校验） */
  verifyCharacterEditPassword(id: string, editPassword: string): Promise<{ ok: boolean }> {
    return postJSON(`/characters/${id}/edit-password/verify`, { editPassword });
  },

  /** 管理员：重置某角色的编辑密码 */
  regenerateCharacterEditPassword(id: string): Promise<{ ok: boolean; characterId: string; editPassword: string }> {
    return postJSON(`/characters/${id}/edit-password/regenerate`);
  },

  deleteCharacter(id: string): Promise<{
    ok: boolean;
    deleted: { id: string; name: string };
    memoriesRemoved: number;
  }> {
    return deleteJSON(`/characters/${id}`);
  },

  getLocations(): Promise<LocationInfo[]> {
    return fetchJSON("/world/locations");
  },

  getCharacters(): Promise<CharacterInfo[]> {
    return fetchJSON("/characters");
  },

  getCharacterDetail(id: string): Promise<CharacterDetail> {
    return fetchJSON(`/characters/${id}`);
  },


  getDiary(id: string, day?: number): Promise<DiaryEntry[]> {
    const q = day != null ? `?day=${day}` : "";
    return fetchJSON(`/characters/${id}/diary${q}`);
  },

  getMemories(id: string): Promise<MemoryEntry[]> {
    return fetchJSON(`/characters/${id}/memories`);
  },

  getEvents(params: {
    fromDay?: number;
    toDay?: number;
    type?: string;
    actorId?: string;
    limit?: number;
    offset?: number;
  }): Promise<SimulationEvent[]> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null) q.set(k, String(v));
    }
    return fetchJSON(`/events?${q}`);
  },

  getEventsByRange(from: GameTime, to: GameTime): Promise<SimulationEvent[]> {
    const q = new URLSearchParams({
      fromDay: String(from.day),
      fromTick: String(from.tick),
      toDay: String(to.day),
      toTick: String(to.tick),
    });
    return fetchJSON(`/events/range?${q}`);
  },

  getHighlights(minScore = 6, limit = 20): Promise<SimulationEvent[]> {
    return fetchJSON(`/events/highlights?minScore=${minScore}&limit=${limit}`);
  },

  simulateTick(context: {
    worldId: string;
    timelineId: string;
  }): Promise<{
    ok: boolean;
    gameTime: WorldTimeInfo;
    eventCount: number;
    events: SimulationEvent[];
    activeSimulationTicks?: number;
    canSwitchContext?: boolean;
  }> {
    return postJSON("/simulation/tick", context);
  },

  simulateDay(): Promise<{ ok: boolean; gameTime: WorldTimeInfo; eventCount: number }> {
    return postJSON("/simulation/day");
  },

  switchWorld(worldId: string): Promise<{
    ok: boolean;
    currentWorldId: string;
    worldName: string;
  }> {
    return postJSON("/world/select", { worldId });
  },

  resetWorld(): Promise<{ ok: boolean; gameTime: WorldTimeInfo }> {
    return postJSON("/simulation/reset");
  },

  setDevTickDurationMinutes(tickDurationMinutes: 15 | 30 | 60): Promise<{
    ok: boolean;
    gameTime: WorldTimeInfo;
    sceneConfig: SceneConfigInfo;
    sceneRuntime: SceneRuntimeInfo;
  }> {
    return postJSON("/world/dev/tick-duration", { tickDurationMinutes });
  },

  godBroadcast(params: {
    content: string;
    scope?: string;
    tone?: string;
    tags?: string[];
    writeMemory?: boolean;
  }): Promise<{ ok: boolean; event: SimulationEvent; memoryWrittenTo: number }> {
    return postJSON("/god/broadcast", params);
  },

  godWhisper(params: {
    characterId: string;
    content: string;
    importance?: number;
    type?: "observation" | "dream" | "reflection" | "experience";
    tags?: string[];
    emotionalValence?: number;
    emotionalIntensity?: number;
  }): Promise<{ ok: boolean; memory: MemoryEntry }> {
    return postJSON("/god/whisper", params);
  },

  sandboxChatStart(params: {
    characterId: string;
    userIdentity?: string;
  }): Promise<{
    ok: boolean;
    sessionId: string;
    character: { id: string; name: string; role: string };
  }> {
    return postJSON("/sandbox/chat/start", params);
  },

  sandboxChatSend(params: {
    sessionId: string;
    message: string;
  }): Promise<{
    ok: boolean;
    reply: string;
    character: { id: string; name: string };
  }> {
    return postJSON("/sandbox/chat/message", params);
  },

  sandboxChatGet(sessionId: string): Promise<{
    ok: boolean;
    sessionId: string;
    characterId: string;
    userIdentity: string;
    history: Array<{ role: "user" | "character"; content: string }>;
  }> {
    return fetchJSON(`/sandbox/chat/${sessionId}`);
  },

  sandboxChatClose(sessionId: string): Promise<{ ok: boolean }> {
    return postJSON("/sandbox/chat/close", { sessionId });
  },

  patchCharacterProfile(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<{ ok: boolean; profile: Record<string, unknown> }> {
    return patchJSON(`/characters/${id}/profile`, patch);
  },

  patchCharacterRuntimeState(
    id: string,
    patch: { mainAreaPointId?: string | null },
  ): Promise<{ ok: boolean; state: Record<string, unknown> }> {
    return patchJSON(`/characters/${id}/runtime-state`, patch);
  },

  async createWorld(params: {
    prompt: string;
    sizeK: CreateJobSizeK;
    keepArtifacts?: boolean;
  }): Promise<{ ok: boolean; jobId: string }> {
    const res = await fetch(`${API_BASE}/worlds/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (res.status === 409) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      throw new JobConflictError(
        typeof body.error === "string" ? body.error : "Generation already running",
        typeof body.activeJobId === "string" ? body.activeJobId : "",
      );
    }
    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = body.error ? `: ${body.error}` : "";
      } catch {
        // Ignore.
      }
      throw new Error(`API ${res.status}${detail}`);
    }
    return res.json();
  },

  getCurrentJob(): Promise<{ jobId: string | null; snapshot?: CreateJobSnapshot }> {
    return fetchJSON("/worlds/jobs/current");
  },

  getJobStatus(jobId: string): Promise<CreateJobSnapshot> {
    return fetchJSON(`/worlds/jobs/${encodeURIComponent(jobId)}`);
  },

  cancelCreateWorld(jobId: string): Promise<{ ok: boolean }> {
    return postJSON(`/worlds/jobs/${encodeURIComponent(jobId)}/cancel`);
  },

  subscribeJobEvents(
    jobId: string,
    onEvent: (event: CreateJobEvent) => void,
    onError?: (event: Event) => void,
  ): () => void {
    const url = `${API_BASE}/worlds/jobs/${encodeURIComponent(jobId)}/events`;
    const source = new EventSource(url);
    source.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as CreateJobEvent;
        onEvent(parsed);
      } catch (err) {
        console.warn("[api-client] Failed to parse job event:", err);
      }
    };
    if (onError) {
      source.onerror = onError;
    }
    return () => {
      source.close();
    };
  },

  deleteWorld(worldId: string): Promise<{ ok: boolean; deletedWorldId: string }> {
    return deleteJSON(`/world/worlds/${encodeURIComponent(worldId)}`);
  },

  // --- Timeline APIs ---

  getTimelines(): Promise<{ timelines: TimelineMeta[]; currentTimelineId: string | null }> {
    return fetchJSON("/timelines");
  },

  getCurrentTimeline(): Promise<{ timeline: TimelineMeta }> {
    return fetchJSON("/timelines/current");
  },

  createNewTimeline(): Promise<{ ok: boolean; timelineId: string }> {
    return postJSON("/timelines");
  },

  loadTimeline(timelineId: string): Promise<{ ok: boolean }> {
    return postJSON(`/timelines/${encodeURIComponent(timelineId)}/load`);
  },

  deleteTimeline(timelineId: string): Promise<{ ok: boolean }> {
    return deleteJSON(`/timelines/${encodeURIComponent(timelineId)}`);
  },

  getTimelineEvents(timelineId: string): Promise<{ frames: TimelineFrame[] }> {
    return fetchJSON(`/timelines/${encodeURIComponent(timelineId)}/events`);
  },

  getAllTimelinesGrouped(): Promise<{
    groups: TimelineWithWorld[];
    currentTimelineId: string | null;
  }> {
    return fetchJSON("/timelines/all");
  },

  deleteTimelineFromWorld(
    worldId: string,
    timelineId: string,
  ): Promise<{ ok: boolean }> {
    return deleteJSON(
      `/timelines/world/${encodeURIComponent(worldId)}/${encodeURIComponent(timelineId)}`,
    );
  },
};
