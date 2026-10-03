import { loadPromptTemplate } from "../utils/config-loader.js";
import { getCoreQuest } from "../core/quest-focus.js";
import {
  tickToSceneTimeWithPeriod,
  getSceneEndingHint,
} from "../utils/time-helpers.js";
import type {
  CharacterProfile,
  CharacterState,
  GameTime,
  Perception,
} from "../types/index.js";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

const TEMPLATE_NAMES = [
  "reactive-decision",
  "dialogue",
  "dialogue-turn",
  "dialogue-finalize",
  "diary",
  "memory-eval",
  "micro-reflection",
  "reflection",
  "sandbox-chat",
  "quest-plan",
];

let initialized = false;

const ENGLISH_LANG_HINT =
  "\n\n[LANGUAGE] This world uses English. ALL your output — dialogue lines, action labels, inner monologue, reasoning, memory summaries, and every other user-visible string — MUST be written in English.";

export class PromptBuilder {
  private contentLanguage: "zh" | "en" = "zh";

  initialize(): void {
    for (const name of TEMPLATE_NAMES) {
      loadPromptTemplate(name);
    }
    initialized = true;
  }

  setContentLanguage(lang: "zh" | "en"): void {
    this.contentLanguage = lang;
  }

  build(templateName: string, variables: Record<string, string>): string {
    const template = loadPromptTemplate(templateName);
    let result = template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      return variables[key] ?? `{{${key}}}`;
    });
    if (this.contentLanguage === "en") {
      result += ENGLISH_LANG_HINT;
    }
    return result;
  }

  buildReactiveDecisionMessages(params: {
    profile: CharacterProfile;
    state: CharacterState;
    gameTime: GameTime;
    perception: Perception;
    relevantMemories: string;
    actionMenu: string;
    currentFocus?: string;
    worldSocialContext?: string;
    questPlan?: string[];
  }): Message[] {
    const { profile, state, gameTime, perception } = params;

    const emotionLabel = getEmotionLabelSimple(
      state.emotionValence,
      state.emotionArousal,
    );
    const timeString = tickToSceneTimeWithPeriod(gameTime.tick);

    const perceptionText = formatPerception(perception);

    const sceneEndingHint = getSceneEndingHint(gameTime.tick);

    const content = this.build("reactive-decision", {
      name: profile.name,
      day: String(gameTime.day),
      timeString,
      sceneEndingHint,
      currentLocation: perception.currentLocation,
      emotionLabel,
      currentFocus: params.currentFocus || "",
      worldSocialContext: formatWorldSocialContext(params.worldSocialContext),
      perceptionText,
      relevantMemories: params.relevantMemories || "（无相关记忆）",
      actionMenu: params.actionMenu,
      iconicCuesBlock: formatIconicCuesBlock(profile),
      personaBlock: formatPersonaBlock(profile) || "（无）",
      questBlock: formatQuestBlock(profile) || "（当前没有特别的任务）",
      planBlock: formatPlanBlock(params.questPlan) || "（还没有明确的步骤——先想一个大概方向，动手做第一步。）",
    });

    return [{ role: "user", content }];
  }

  buildQuestPlanMessages(params: {
    profile: CharacterProfile;
    gameTime: GameTime;
    currentLocation: string;
    worldKnowledge: string;
    previousSteps?: string[];
  }): Message[] {
    const { profile, gameTime } = params;

    const quest = getCoreQuest(profile);
    const previousSteps = (params.previousSteps ?? []).filter(
      (s) => typeof s === "string" && s.trim().length > 0,
    );
    const previousPlanBlock =
      quest && previousSteps.length > 0
        ? [
            "",
            "## 你之前的计划（可以沿用、合并或重排）",
            ...previousSteps.map((step, i) => `${i + 1}. ${step.trim()}`),
          ].join("\n")
        : "";

    const content = this.build("quest-plan", {
      name: profile.name,
      personaBlock: formatPersonaBlock(profile) || "（无）",
      questText: quest || "（没有明确任务）",
      worldKnowledge: params.worldKnowledge || "（陌生的小世界）",
      previousPlanBlock,
      day: String(gameTime.day),
      timeString: tickToSceneTimeWithPeriod(gameTime.tick),
      currentLocation: params.currentLocation,
    });

    return [{ role: "user", content }];
  }

  buildDialogueMessages(params: {
    participants: {
      profile: CharacterProfile;
      state: CharacterState;
      memoriesAboutOther: string;
    }[];
    location: string;
    initiatorId: string;
    initiatorMotivation: string;
    gameTime: GameTime;
    worldSocialContext?: string;
  }): Message[] {
    const { participants, location, initiatorId, gameTime } = params;

    const a = participants.find((p) => p.profile.id === initiatorId)!;
    const b = participants.find((p) => p.profile.id !== initiatorId)!;

    const timeString = tickToSceneTimeWithPeriod(gameTime.tick);

    const content = this.build("dialogue", {
      nameA: a.profile.name,
      personaA: formatPersonaInline(a.profile) || "（无）",
      questA: formatQuestInline(a.profile) || "（无）",
      emotionA: getEmotionLabelSimple(
        a.state.emotionValence,
        a.state.emotionArousal,
      ),
      memoriesAaboutB: a.memoriesAboutOther || "（无）",
      motivation: params.initiatorMotivation,

      nameB: b.profile.name,
      personaB: formatPersonaInline(b.profile) || "（无）",
      questB: formatQuestInline(b.profile) || "（无）",
      emotionB: getEmotionLabelSimple(
        b.state.emotionValence,
        b.state.emotionArousal,
      ),
      memoriesBaboutA: b.memoriesAboutOther || "（无）",

      worldSocialContext: formatWorldSocialContext(params.worldSocialContext),
      location,
      day: String(gameTime.day),
      timeString,
    });

    return [{ role: "user", content }];
  }

  buildDialogueTurnMessages(params: {
    participants: {
      profile: CharacterProfile;
      state: CharacterState;
      memoriesAboutOther: string;
    }[];
    location: string;
    initiatorId: string;
    initiatorMotivation: string;
    gameTime: GameTime;
    transcript: { speaker: string; content: string }[];
    nextSpeaker: string;
    totalTurns: number;
    hearsayA?: string;
    hearsayB?: string;
    worldSocialContext?: string;
    knownCharacters?: string;
    knownLocations?: string;
  }): Message[] {
    const { participants, location, initiatorId, gameTime } = params;

    const a = participants.find((p) => p.profile.id === initiatorId)!;
    const b = participants.find((p) => p.profile.id !== initiatorId)!;
    const nextSpeakerProfile = participants.find(
      (p) => p.profile.id === params.nextSpeaker,
    )?.profile;
    const timeString = tickToSceneTimeWithPeriod(gameTime.tick);
    const sceneEndingHint = getSceneEndingHint(gameTime.tick);

    const content = this.build("dialogue-turn", {
      nameA: a.profile.name,
      idA: a.profile.id,
      personaA: formatPersonaInline(a.profile) || "（无）",
      questA: formatQuestInline(a.profile) || "（无）",
      emotionA: getEmotionLabelSimple(
        a.state.emotionValence,
        a.state.emotionArousal,
      ),
      memoriesAaboutB: a.memoriesAboutOther || "（无）",
      hearsayA: params.hearsayA || "（无）",
      motivation: params.initiatorMotivation,

      nameB: b.profile.name,
      idB: b.profile.id,
      personaB: formatPersonaInline(b.profile) || "（无）",
      questB: formatQuestInline(b.profile) || "（无）",
      emotionB: getEmotionLabelSimple(
        b.state.emotionValence,
        b.state.emotionArousal,
      ),
      memoriesBaboutA: b.memoriesAboutOther || "（无）",
      hearsayB: params.hearsayB || "（无）",

      worldSocialContext: formatWorldSocialContext(params.worldSocialContext),
      location,
      day: String(gameTime.day),
      timeString,
      sceneEndingHint,
      transcript: formatTranscript(params.transcript),
      nextSpeakerId: params.nextSpeaker,
      nextSpeakerName: nextSpeakerProfile?.name ?? params.nextSpeaker,
      currentTurnCount: String(params.totalTurns),
      knownCharacters: params.knownCharacters || "（无）",
      knownLocations: params.knownLocations || "（无）",
      iconicCuesBlock: formatIconicCuesBlockForPair(a.profile, b.profile),
    });

    return [{ role: "user", content }];
  }

  buildDialogueFinalizeMessages(params: {
    participants: {
      profile: CharacterProfile;
      state: CharacterState;
      memoriesAboutOther: string;
    }[];
    location: string;
    initiatorId: string;
    initiatorMotivation: string;
    gameTime: GameTime;
    transcript: { speaker: string; content: string }[];
    endReason?: string;
    worldSocialContext?: string;
  }): Message[] {
    const { participants, location, initiatorId, gameTime } = params;

    const a = participants.find((p) => p.profile.id === initiatorId)!;
    const b = participants.find((p) => p.profile.id !== initiatorId)!;
    const timeString = tickToSceneTimeWithPeriod(gameTime.tick);

    const content = this.build("dialogue-finalize", {
      nameA: a.profile.name,
      idA: a.profile.id,
      nameB: b.profile.name,
      idB: b.profile.id,
      worldSocialContext: formatWorldSocialContext(params.worldSocialContext),
      location,
      day: String(gameTime.day),
      timeString,
      motivation: params.initiatorMotivation,
      transcript: formatTranscript(params.transcript),
      endReason: params.endReason || "自然结束",
    });

    return [{ role: "user", content }];
  }

  buildDiaryMessages(params: {
    profile: CharacterProfile;
    todayMemories: string;
    gameDay: number;
  }): Message[] {
    const { profile, gameDay } = params;

    const content = this.build("diary", {
      name: profile.name,
      day: String(gameDay),
      todayMemories: params.todayMemories || "（今天没什么特别的事）",
    });

    return [{ role: "user", content }];
  }

  buildMemoryEvalMessages(params: {
    memories: { id: string; content: string }[];
  }): Message[] {
    const memoryList = params.memories
      .map((m) => `- [${m.id}] ${m.content}`)
      .join("\n");

    const content = this.build("memory-eval", {
      memoryList,
    });

    return [{ role: "user", content }];
  }

  buildSandboxChatMessages(params: {
    profile: CharacterProfile;
    state: CharacterState;
    memoriesBlock: string;
    userIdentity: string;
    transcript: { role: "user" | "character"; content: string }[];
    latestUserMessage: string;
  }): Message[] {
    const { profile, state } = params;

    const emotionLabel = getEmotionLabelSimple(
      state.emotionValence,
      state.emotionArousal,
    );

    const transcriptText =
      params.transcript.length === 0
        ? "（对话刚刚开始）"
        : params.transcript
            .map((t) => {
              const speaker = t.role === "user" ? "【对方】" : `【${profile.name}】`;
              return `${speaker} ${t.content}`;
            })
            .join("\n");

    const userIdentityBlock =
      params.userIdentity.trim().length > 0
        ? params.userIdentity.trim()
        : "对方没有给出具体身份——把 ta 当作一个忽然出现、你不太清楚底细的陌生对话者。";

    const content = this.build("sandbox-chat", {
      name: profile.name,
      emotionLabel,
      memoriesBlock: params.memoriesBlock || "（没什么特别相关的记忆浮上来）",
      iconicCuesBlock: formatIconicCuesBlock(profile),
      personaBlock: formatPersonaBlock(profile) || "（无）",
      questBlock: formatQuestBlock(profile, "chat") || "（当前没有特别的任务）",
      userIdentityBlock,
      transcript: transcriptText,
      latestUserMessage: params.latestUserMessage,
    });

    return [{ role: "user", content }];
  }

  buildMicroReflectionMessages(params: {
    profile: CharacterProfile;
    gameDay: number;
    timeString?: string;
    currentFocus?: string;
    recentMemories: string;
  }): Message[] {
    const { profile, gameDay } = params;

    const content = this.build("micro-reflection", {
      name: profile.name,
      day: String(gameDay),
      timeString: params.timeString || "此刻",
      currentFocus: params.currentFocus || "（此刻没有特别明确的牵挂）",
      recentMemories: params.recentMemories || "（这段时间没什么值得多想的）",
    });

    return [{ role: "user", content }];
  }

  buildReflectionMessages(params: {
    profile: CharacterProfile;
    gameDay: number;
    recentMemories: string;
  }): Message[] {
    const { profile, gameDay } = params;

    const content = this.build("reflection", {
      name: profile.name,
      day: String(gameDay),
      recentMemories: params.recentMemories || "（今天没什么特别的事）",
    });

    return [{ role: "user", content }];
  }
}

function getEmotionLabelSimple(valence: number, arousal: number): string {
  if (arousal > 6) {
    if (valence > 1) return "兴奋";
    if (valence < -1) return "愤怒";
    return "紧张";
  }
  if (arousal > 3) {
    if (valence > 1) return "满足";
    if (valence < -1) return "沮丧";
    return "平静";
  }
  if (valence > 1) return "安宁";
  if (valence < -1) return "悲伤";
  return "无聊";
}

function formatPerception(p: Perception): string {
  const lines: string[] = [];
  const zoneSuffix = p.myZone ? `，你在${zoneLabel(p.myZone)}` : "";
  lines.push(`位置：${p.currentLocation}（${p.locationDescription}）${zoneSuffix}`);

  if (p.objectsHere.length > 0) {
    lines.push("可见物件：");
    for (const obj of p.objectsHere) {
      const interactions =
        obj.availableInteractions.length > 0
          ? `（可：${obj.availableInteractions.join("、")}）`
          : "";
      lines.push(
        `  - ${obj.name}（${obj.state}）${obj.stateDescription ? " " + obj.stateDescription : ""}${interactions}`,
      );
    }
  }

  if (p.charactersHere.length > 0) {
    lines.push("能看到的人：");
    for (const c of p.charactersHere) {
      const detailParts: string[] = [];
      if (c.zone) {
        detailParts.push(`在${zoneLabel(c.zone)}`);
      } else if (c.locationName && c.locationName !== p.currentLocation) {
        detailParts.push(`在${c.locationName}`);
      }
      if (c.currentAction) {
        detailParts.push(`正在${c.currentAction}`);
      }
      if (c.appearanceHint) {
        detailParts.push(c.appearanceHint);
      }
      if (c.emotionLabel) {
        detailParts.push(`看起来${c.emotionLabel}`);
      }
      lines.push(`  - ${c.name}${detailParts.length > 0 ? `（${detailParts.join("；")}）` : ""}`);
    }
  }

  if (p.recentEnvironmentChanges.length > 0) {
    lines.push("最近变化：" + p.recentEnvironmentChanges.join("；"));
  }

  if (p.recentActions && p.recentActions.length > 0) {
    lines.push("你最近做过的事：" + p.recentActions.join("→"));
  }

  return lines.join("\n");
}

function zoneLabel(zone: string): string {
  return zone === "中" ? "中央" : `${zone}侧`;
}

function formatTranscript(turns: { speaker: string; content: string }[]): string {
  if (turns.length === 0) return "（对话尚未开始）";
  return turns.map((turn) => `- ${turn.speaker}: ${turn.content}`).join("\n");
}

function formatWorldSocialContext(context?: string): string {
  const trimmed = typeof context === "string" ? context.trim() : "";
  if (trimmed) return trimmed;
  return "这是一个有自身日常秩序的小世界。让背景只作为处事底色，别机械复述设定。";
}

function formatIconicCuesBlock(profile: CharacterProfile): string {
  return buildIconicCuesText(profile) || "（无）";
}

function formatIconicCuesBlockForPair(
  a: CharacterProfile,
  b: CharacterProfile,
): string {
  const textA = buildIconicCuesText(a);
  const textB = buildIconicCuesText(b);
  if (!textA && !textB) return "（无）";
  const sections: string[] = [];
  if (textA) sections.push(`### ${a.name}\n${textA}`);
  if (textB) sections.push(`### ${b.name}\n${textB}`);
  return sections.join("\n\n");
}

function buildIconicCuesText(profile: CharacterProfile): string {
  const lines: string[] = [];
  const cues = profile.iconicCues;

  if (cues) {
    if (cues.speechQuirks && cues.speechQuirks.length > 0) {
      lines.push(`- 说话习惯：${cues.speechQuirks.join("；")}`);
    }
    if (cues.catchphrases && cues.catchphrases.length > 0) {
      lines.push(`- 口头禅（最多 2 个，不要每次都说）：${cues.catchphrases.join(" / ")}`);
    }
  }

  return lines.join("\n");
}

/**
 * 核心任务块：仅当 coreQuest 有文字时注入——填写即启动，清空即停止，没有单独的开关。
 * 措辞兼顾"强引导"（尤其影响移动方向）与"不变成任务机器"。
 */
function formatQuestBlock(
  profile: CharacterProfile,
  kind: "decision" | "chat" = "decision",
): string {
  const quest = getCoreQuest(profile);
  if (!quest) return "";
  if (kind === "chat") {
    return [
      `- 你当前最上心的任务：${quest}`,
      "",
      "（这是你此刻的首要目标：聊天时只要不突兀，就自然地把话题往这个方向带，或说起相关的打算；",
      "但不要逢人就复述任务原文，也不要为了它做出违背你性格的事。）",
    ].join("\n");
  }
  return [
    `- 你当前最上心的任务：${quest}`,
    "",
    "（这是你此刻的**首要目标**，优先于日常活动——它决定你接下来做什么、往哪走：",
    "  · 行动：优先选能推进它的动作——去相关的地方、找相关的人、接触相关的物件；行动菜单里带 ★ 的选项与它直接相关，优先考虑。",
    "  · 移动：如果相关地点不在眼前，就一步一步往那个方向走，别因为怕麻烦停在原地；",
    "  · 说话：只要不突兀就往这个方向打听或试探；有人问你在做什么、有什么打算时，可以自然地说起这件事。",
    "  · 边界：任务暂时无从推进时，才回到日常活动；不要逢人就复述任务原文，也不要为了任务做出违背你性格的事。）",
  ].join("\n");
}

/** 单行核心任务，用于对话模板里的角色条目行（避免多行破坏列表结构）。 */
function formatQuestInline(profile: CharacterProfile): string {
  const quest = getCoreQuest(profile);
  if (!quest) return "";
  return `最上心的任务：${quest}（优先推进它，但不要逢人就提，也不要为它违背性格）`;
}

/**
 * 行动步骤块：角色自己规划的任务路线（由 QuestPlanner 生成、角色自己可修订）。
 * 没有步骤时返回空串，由调用方给兜底文案。
 */
function formatPlanBlock(steps?: string[]): string {
  const list = (steps ?? [])
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());
  if (list.length === 0) return "";
  return [
    ...list.map((step, i) => `${i + 1}. ${step}`),
    "",
    "（这是你自己定的路线：按顺序推进，完成一步自然进入下一步；某一步走不通、或情况变了，就调整它——",
    "需要改步骤时，在本次输出的 `questPlan` 里给出修订后的完整步骤列表；步骤没变就不要输出这个字段。）",
  ].join("\n");
}

type PersonaEntry = { label: string; value: string };

/**
 * 收集角色「个人档案」字段（选填字段，未填写的自动跳过）。
 * 这些字段只影响角色的行为底色，不参与引擎逻辑。
 */
function collectPersonaEntries(profile: CharacterProfile): PersonaEntry[] {
  const entries: PersonaEntry[] = [];

  const push = (label: string, value?: string | string[]) => {
    if (Array.isArray(value)) {
      const joined = value
        .filter((v) => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim())
        .join("、");
      if (joined) entries.push({ label, value: joined });
      return;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      entries.push({ label, value: value.trim() });
    }
  };

  push("性别", profile.gender);
  push("年龄", profile.age);
  push("部门", profile.department);
  push("岗位", profile.position);
  push("职位", profile.jobTitle);
  push("核心能力", profile.skills);
  push("爱好", profile.preferredActivities);
  push("核心价值观", profile.coreValues);
  push("害怕", profile.fears);
  push("厌恶", profile.dislikes);
  push("背景", profile.backstory);
  return entries;
}

/**
 * 多行「个人档案」块，用于有独立小节的模板（决策 / 沙盒对话）。
 * 无任何有效字段时返回空串，由调用方决定兜底文案。
 */
function formatPersonaBlock(profile: CharacterProfile): string {
  return collectPersonaEntries(profile)
    .map((entry) => `- ${entry.label}：${entry.value}`)
    .join("\n");
}

/** 单行「个人档案」，用于对话模板里的角色条目行（避免多行破坏列表结构）。 */
function formatPersonaInline(profile: CharacterProfile): string {
  return collectPersonaEntries(profile)
    .map((entry) => `${entry.label}：${entry.value}`)
    .join("；");
}

export const promptBuilder = new PromptBuilder();
