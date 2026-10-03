import type { CharacterProfile, LocationConfig } from "../types/index.js";

/**
 * 核心任务 → 世界焦点 的纯函数映射（不依赖运行时状态，便于测试与复用）。
 *
 * 设计：
 * - 任务「是否启动」完全由文本决定：coreQuest 非空即激活，界面上没有单独的开关。
 * - 焦点用两级匹配：任务文本直接提到某个地名/物件名，或名称里的 2 字以上片段
 *   被任务文本提到（例：物件「档案柜」被任务里的「档案」命中）。
 * - 命中只是「加权提示」（菜单里的 ★），不改变任何引擎规则；
 *   语义上的关联交给 LLM 自己判断。
 */

export interface QuestFocus {
  active: boolean;
  quest: string;
  /** 任务文本提到的地点 id（含 main_area 与各功能区） */
  locationIds: string[];
  /** 任务文本提到的物件 id（任意地点） */
  objectIds: string[];
  /** 命中的物件所在区域：导航时和 locationIds 一起作为目标（找物件 = 去那个地方） */
  objectLocationIds: string[];
  /** 命中的地点/物件名（去重后），用于菜单图例 */
  labels: string[];
}

/** 核心任务的规范化文本（无任务时为空串）。任务是否生效只看这段文字。 */
export function getCoreQuest(profile: CharacterProfile): string {
  return typeof profile.coreQuest === "string" ? profile.coreQuest.trim() : "";
}

/** 任务文本是否"提到"了某个候选名称（直接包含，或名称里 2 字以上片段被包含）。 */
export function questMentions(quest: string, candidate: string): boolean {
  const q = typeof quest === "string" ? quest.trim() : "";
  const c = typeof candidate === "string" ? candidate.trim() : "";
  if (!q || c.length < 2) return false;
  if (q.includes(c)) return true;
  for (let i = 0; i + 2 <= c.length; i++) {
    if (q.includes(c.slice(i, i + 2))) return true;
  }
  return false;
}

/** 任务文本是否提到了某个角色（按姓名或昵称匹配）。 */
export function questMentionsPerson(
  quest: string,
  person: { name?: string; nickname?: string },
): boolean {
  if (typeof person.name === "string" && questMentions(quest, person.name)) return true;
  return typeof person.nickname === "string" && questMentions(quest, person.nickname);
}

export function computeQuestFocus(
  profile: CharacterProfile,
  locations: LocationConfig[],
): QuestFocus {
  const quest = getCoreQuest(profile);
  if (!quest) {
    return {
      active: false,
      quest: "",
      locationIds: [],
      objectIds: [],
      objectLocationIds: [],
      labels: [],
    };
  }

  const locationIds: string[] = [];
  const objectIds: string[] = [];
  const objectLocationIds: string[] = [];
  const labels: string[] = [];

  for (const loc of locations) {
    if (questMentions(quest, loc.name)) {
      locationIds.push(loc.id);
      labels.push(loc.name);
    }
    for (const obj of loc.objects ?? []) {
      if (questMentions(quest, obj.name)) {
        objectIds.push(obj.id);
        objectLocationIds.push(loc.id);
        labels.push(obj.name);
      }
    }
  }

  return {
    active: true,
    quest,
    locationIds,
    objectIds,
    objectLocationIds: Array.from(new Set(objectLocationIds)),
    labels: Array.from(new Set(labels)),
  };
}

/** 导航目标：id 是地点 id（人物目标用"那个人现在所在的区域"），label 直接写进菜单提示。 */
export interface QuestNavTarget {
  id: string;
  label: string;
}

/**
 * 从当前位置出发，哪些相邻地点是"朝任务目标方向"的下一步。
 * 返回：相邻地点 id → 该方向的提示语（如 通往「医者小屋」 / 去找「123」）。
 * 已经在目标地点、或目标不可达时返回空 Map。
 */
export function buildQuestNavHints(
  currentLocationId: string,
  targets: QuestNavTarget[],
  locations: LocationConfig[],
): Map<string, string> {
  const hints = new Map<string, string>();
  const byId = new Map(locations.map((loc) => [loc.id, loc]));
  const valid = targets.filter((t) => byId.has(t.id));
  if (valid.length === 0) return hints;

  const adjacency = new Map<string, string[]>();
  for (const loc of locations) adjacency.set(loc.id, loc.adjacentLocations ?? []);
  if (!adjacency.has(currentLocationId)) return hints;

  // 距离用无向图算（只要任意一侧声明了相邻就算一条边），
  // 而候选移动只取当前位置自己声明的邻居——与引擎的移动规则保持一致。
  const undirected = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (!undirected.has(a)) undirected.set(a, new Set());
    undirected.get(a)!.add(b);
  };
  for (const [id, neighbors] of adjacency) {
    for (const other of neighbors) {
      addEdge(id, other);
      addEdge(other, id);
    }
  }

  // 多源 BFS：dist = 到最近任务目标的步数，label = 该目标的提示语
  const dist = new Map<string, number>();
  const label = new Map<string, string>();
  const queue: string[] = [];
  for (const target of valid) {
    dist.set(target.id, 0);
    label.set(target.id, target.label);
    queue.push(target.id);
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    for (const next of undirected.get(cur) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, d + 1);
      label.set(next, label.get(cur)!);
      queue.push(next);
    }
  }

  const currentDist = dist.get(currentLocationId);
  if (currentDist == null || currentDist === 0) return hints;
  for (const next of adjacency.get(currentLocationId) ?? []) {
    const d = dist.get(next);
    if (d != null && d < currentDist) {
      hints.set(next, label.get(next) ?? "");
    }
  }
  return hints;
}
