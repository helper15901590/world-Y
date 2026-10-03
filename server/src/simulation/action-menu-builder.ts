import type { Perception } from "../types/index.js";
import type { WorldManager } from "../core/world-manager.js";
import type { CharacterManager } from "../core/character-manager.js";
import {
  buildQuestNavHints,
  computeQuestFocus,
  questMentions,
  questMentionsPerson,
} from "../core/quest-focus.js";
import type { QuestNavTarget } from "../core/quest-focus.js";
import * as eventStore from "../store/event-store.js";

const INTERACTION_COOLDOWN_TICKS = 4;
/** 菜单里回显任务文本的长度上限（完整任务已在提示词正文中） */
const QUEST_ECHO_MAX_CHARS = 60;

export function buildActionMenu(
  charId: string,
  perception: Perception,
  worldManager: WorldManager,
  characterManager: CharacterManager,
): string {
  const state = characterManager.getState(charId);
  const profile = characterManager.getProfile(charId);
  const gameTime = worldManager.getCurrentTime();

  const recentInteractionIds = getRecentInteractionIds(charId, gameTime);
  const isAnchored = !!profile.anchor;
  const canInitiateDialogue = canInitiateDialogueHere(profile.anchor, state.location);

  const lines: string[] = [];
  let idx = 1;
  const sceneConfig = worldManager.getSceneConfig();

  // 核心任务：只在有文字时生效。任务相关的地点/物件/人物会带 ★ 标记，
  // 让"优先推进任务"在可选动作层面可见，而不仅是提示词里的原则。
  const allLocations = worldManager.getAllLocations();
  const questFocus = computeQuestFocus(profile, allLocations);

  // 任务里提到的人：按姓名/昵称与任务文本匹配（排除自己）。
  // 与"看得见的人"取交集——角色只能朝看得见/听说过位置的人走过去，不做上帝视角。
  const questPeople = questFocus.active
    ? characterManager
        .getAllProfiles()
        .filter(
          (p) => p.id !== charId && questMentionsPerson(questFocus.quest, p),
        )
    : [];
  const visibleIds = new Set(perception.charactersHere.map((c) => c.id));
  const visibleQuestPeople = questPeople.filter((p) => visibleIds.has(p.id));
  const locationName = (locId: string) =>
    worldManager.getLocation(locId)?.name ?? locId;

  const navTargets: QuestNavTarget[] = [];
  const seenNavIds = new Set<string>();
  const addNavTarget = (id: string, label: string) => {
    if (!id || seenNavIds.has(id)) return;
    seenNavIds.add(id);
    navTargets.push({ id, label });
  };
  for (const p of visibleQuestPeople) {
    addNavTarget(characterManager.getState(p.id).location, `去找「${p.name}」`);
  }
  for (const locId of questFocus.locationIds) {
    addNavTarget(locId, `通往「${locationName(locId)}」`);
  }
  for (const locId of questFocus.objectLocationIds) {
    addNavTarget(locId, `通往「${locationName(locId)}」`);
  }
  const navHints =
    navTargets.length > 0
      ? buildQuestNavHints(state.location, navTargets, allLocations)
      : new Map<string, string>();

  if (questFocus.active) {
    const echo =
      questFocus.quest.length > QUEST_ECHO_MAX_CHARS
        ? `${questFocus.quest.slice(0, QUEST_ECHO_MAX_CHARS)}…`
        : questFocus.quest;
    lines.push(`【核心任务（最高优先级）】${echo}`);
    if (questFocus.labels.length > 0) {
      lines.push(`（★ = 与任务直接相关：${questFocus.labels.join("、")}）`);
    } else {
      lines.push("（没有直接相关的选项时，也优先选择你认为最能推进任务的地点、人或物件。）");
    }
    // 任务里提到的人：看得见就把位置直接告诉角色；看不见就给一条"怎么找"的指引
    const distantVisible = visibleQuestPeople
      .map((p) => ({ profile: p, state: characterManager.getState(p.id) }))
      .filter((entry) => entry.state.location !== state.location);
    if (distantVisible.length > 0) {
      const where = distantVisible
        .map((entry) => `${entry.profile.name}现在在${locationName(entry.state.location)}`)
        .join("；");
      lines.push(`（任务里的${where}）`);
    } else if (questPeople.length > 0 && visibleQuestPeople.length === 0) {
      const hubName = worldManager.getLocation("main_area")?.name;
      const hubHint = hubName ? `先去「${hubName}」这类人多的地方` : "先去人多的地方";
      lines.push(`（你在任务里要找的人不在眼前——${hubHint}打听，或问问眼前的人。）`);
    }
  }

  const questTagForCharacter = (id: string): string => {
    if (!questFocus.active) return "";
    try {
      return questMentionsPerson(questFocus.quest, characterManager.getProfile(id))
        ? " ★任务相关"
        : "";
    } catch {
      return "";
    }
  };

  const worldActionLines: string[] = [];
  const worldActions = worldManager.getWorldActions();
  for (const action of worldActions) {
    if (!action.repeatable && recentInteractionIds.has(action.id)) continue;

    const durationMin = action.duration * sceneConfig.tickDurationMinutes;
    const durationStr =
      durationMin >= 60
        ? `约${(durationMin / 60).toFixed(1).replace(/\.0$/, "")}小时`
        : `约${durationMin}分钟`;

    const questTag =
      questFocus.active && questMentions(questFocus.quest, action.name)
        ? " ★任务相关"
        : "";
    worldActionLines.push(
      `${idx}. [world_action] "${action.name}"(${action.id})（${durationStr}）${questTag}`,
    );
    idx++;
  }

  if (worldActionLines.length > 0) {
    lines.push("【全局功能】");
    lines.push(...worldActionLines);
  }

  // Build anchor map: objectId / regionId → anchored character id
  const anchorCharMap = new Map<string, string>();
  for (const p of characterManager.getAllProfiles()) {
    if (p.anchor) {
      anchorCharMap.set(p.anchor.targetId, p.id);
    }
  }

  // Collect requiresAnchor interactions that should become talk_to motivations
  // key = anchored character id, value = list of interaction descriptions
  const anchorInteractionsByChar = new Map<string, string[]>();

  const objectLines: string[] = [];
  const objects = worldManager.getLocationObjects(state.location);
  for (const obj of objects) {
    if (obj.currentUsers.length >= obj.capacity) continue;

    const interactions = worldManager.getAvailableInteractions(obj.id);
    for (const inter of interactions) {
      if (!inter.repeatable && recentInteractionIds.has(inter.id)) continue;

      if (inter.requiresAnchor) {
        const anchoredCharId = anchorCharMap.get(obj.id);
        if (anchoredCharId && anchoredCharId !== charId) {
          const anchoredState = characterManager.getState(anchoredCharId);
          if (anchoredState.currentAction !== "in_conversation") {
            const existing = anchorInteractionsByChar.get(anchoredCharId) ?? [];
            existing.push(inter.name);
            anchorInteractionsByChar.set(anchoredCharId, existing);
            continue;
          }
        }
        // Fallback: no anchored character found, or character is busy —
        // show as normal interact_object for non-anchored visitors only.
      }

      if (isAnchored) continue;

      const durationMin = inter.duration * sceneConfig.tickDurationMinutes;
      const durationStr =
        durationMin >= 60
          ? `约${(durationMin / 60).toFixed(1).replace(/\.0$/, "")}小时`
          : `约${durationMin}分钟`;

      const questTag = questFocus.objectIds.includes(obj.id)
        ? " ★任务相关"
        : "";
      objectLines.push(
        `${idx}. [interact_object] ${obj.name}(${obj.id}) → "${inter.name}"(${inter.id})（${durationStr}）${questTag}`,
      );
      idx++;
    }
  }

  if (objectLines.length > 0) {
    lines.push("【可交互物件】");
    lines.push(...objectLines);
  }

  if (!isAnchored) {
    const charLines: string[] = [];
    for (const c of perception.charactersHere) {
      const otherState = characterManager.getState(c.id);
      if (!isLegalDirectTalkTarget(state.location, otherState.location)) continue;
      if (otherState.currentAction === "in_conversation") continue;
      const actionStr = c.currentAction ? `正在${c.currentAction}` : "空闲";
      const anchorServices = anchorInteractionsByChar.get(c.id);
      const serviceHint = anchorServices
        ? ` [可交互：${anchorServices.join("、")}]`
        : "";
      charLines.push(
        `${idx}. [talk_to] ${c.name}(${c.id}) — ${actionStr}${serviceHint}${questTagForCharacter(c.id)}`,
      );
      idx++;
    }

    // Also list anchored characters with services even if they weren't in
    // perception.charactersHere (e.g. just outside conversable range but the
    // character has anchor interactions available — rare but possible)
    for (const [ancCharId, services] of anchorInteractionsByChar) {
      if (charLines.some((line) => line.includes(ancCharId))) continue;
      const ancProfile = characterManager.getProfile(ancCharId);
      const ancState = characterManager.getState(ancCharId);
      if (!isLegalDirectTalkTarget(state.location, ancState.location)) continue;
      if (ancState.currentAction === "in_conversation") continue;
      const actionStr = ancState.currentAction ? `正在${ancState.currentAction}` : "空闲";
      charLines.push(
        `${idx}. [talk_to] ${ancProfile.name}(${ancCharId}) — ${actionStr} [可交互：${services.join("、")}]${questTagForCharacter(ancCharId)}`,
      );
      idx++;
    }

    if (charLines.length > 0) {
      lines.push("【在场的人】");
      lines.push(...charLines);
    }
  }

  if (canInitiateDialogue && isAnchored) {
    const charLines: string[] = [];
    for (const c of perception.charactersHere) {
      const otherState = characterManager.getState(c.id);
      if (!isLegalDirectTalkTarget(state.location, otherState.location)) continue;
      if (otherState.currentAction === "in_conversation") continue;
      const actionStr = c.currentAction ? `正在${c.currentAction}` : "空闲";
      const anchorServices = anchorInteractionsByChar.get(c.id);
      const serviceHint = anchorServices
        ? ` [可交互：${anchorServices.join("、")}]`
        : "";
      charLines.push(
        `${idx}. [talk_to] ${c.name}(${c.id}) — ${actionStr}${serviceHint}${questTagForCharacter(c.id)}`,
      );
      idx++;
    }

    if (charLines.length > 0) {
      lines.push("【在场的人】");
      lines.push(...charLines);
    }
  }

  if (!isAnchored) {
    const adjacent = worldManager.getAdjacentLocations(state.location);
    const moveLines: string[] = [];
    if (state.location === "main_area" && worldManager.hasMultipleMainAreaPoints()) {
      const zones = worldManager.getAvailableMainAreaZones();
      const myZone = worldManager.getMainAreaPointZone(state.mainAreaPointId);
      if (zones.length > 1) {
        for (const z of zones) {
          if (z === myZone) continue;
          const label = z === "中" ? "中央" : `${z}侧`;
          moveLines.push(`${idx}. [move_within_main_area] 走到主区域${label}(main_area:${z})`);
          idx++;
        }
      } else {
        moveLines.push(`${idx}. [move_within_main_area] 在主区域内换个地方活动(main_area)`);
        idx++;
      }
    }
    if (adjacent.length > 0) {
      for (const locId of adjacent) {
        const loc = worldManager.getLocation(locId);
        if (loc) {
          const navTarget = navHints.get(locId);
          const navTag = navTarget ? ` ★任务方向（${navTarget}）` : "";
          moveLines.push(`${idx}. [move_to] ${loc.name}(${locId})${navTag}`);
          idx++;
        }
      }
    }
    if (moveLines.length > 0) {
      lines.push("【移动】");
      lines.push(...moveLines);
    }
  }

  lines.push("【其他】");
  lines.push(`${idx}. [idle] 原地发呆/思考`);

  return lines.join("\n");
}

function getRecentInteractionIds(
  charId: string,
  gameTime: { day: number; tick: number },
): Set<string> {
  const fromTick = Math.max(0, gameTime.tick - INTERACTION_COOLDOWN_TICKS);
  const events = eventStore.queryEvents({
    actorId: charId,
    type: "action_start",
    fromDay: gameTime.day,
    fromTick,
    toDay: gameTime.day,
    toTick: gameTime.tick,
  });

  const ids = new Set<string>();
  for (const e of events) {
    if (
      (e.data?.actionType === "interact_object" || e.data?.actionType === "world_action") &&
      e.data?.interactionId
    ) {
      ids.add(e.data.interactionId as string);
    }
  }
  return ids;
}

function isLegalDirectTalkTarget(
  initiatorLocation: string,
  targetLocation: string,
): boolean {
  return initiatorLocation === targetLocation;
}

function canInitiateDialogueHere(
  anchor: { type: string; targetId: string } | undefined,
  currentLocation: string,
): boolean {
  if (!anchor) return true;
  return (
    anchor.type === "region" &&
    currentLocation !== "main_area" &&
    currentLocation === anchor.targetId
  );
}
