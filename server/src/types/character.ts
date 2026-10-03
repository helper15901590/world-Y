export type MemoryType =
  | "observation"
  | "conversation"
  | "hearsay"
  | "experience"
  | "reflection"
  | "emotion"
  | "dream";

/** 角色人设配置（来自 JSON 文件，恒定层） */
export interface CharacterProfile {
  id: string;
  name: string;
  role: string;
  nickname: string;
  startPosition: string;
  backstory?: string;
  appearanceHint?: string;

  /** 以下为选填的个人档案字段，非空时会一并注入提示词（见 prompt-builder 的 formatPersonaBlock） */
  gender?: string;
  age?: string;
  department?: string;
  position?: string;
  jobTitle?: string;
  dislikes?: string[];

  coreMotivation: string;
  coreValues: string[];
  speakingStyle: string;
  fears: string[];

  preferredLocations: string[];
  preferredActivities: string[];
  socialStyle: "extrovert" | "introvert_selective" | "introvert";
  extraversionLevel: number;
  intuitionLevel: number;

  skills: string[];
  writeDiary: boolean;
  fourthWallCandidate: boolean;
  tags: string[];

  initialMemories: Omit<
    MemoryEntry,
    | "id"
    | "characterId"
    | "gameDay"
    | "gameTick"
    | "accessCount"
    | "isLongTerm"
    | "decayFactor"
  >[];

  /** 锚定：限制角色必须待在某个区域或可交互元素附近 */
  anchor?: CharacterAnchor;

  /**
   * 核心任务：填写即启动、清空即停止（没有单独的开关），会注入决策与对话提示词，
   * 角色的行动、移动方向与话题会围绕它展开。
   */
  coreQuest?: string;

  /**
   * 编辑密码：非管理员修改这个角色的设定时必须在 PATCH 请求里带上它。
   * 由服务端自动生成（12 位），管理员在上帝面板查看并分发给玩家。
   */
  editPassword?: string;

  /** 仅为知名 IP 角色而填，普通原创角色应为 undefined */
  iconicCues?: IconicCues;
  canonicalRefs?: CanonicalRefs;
}

export interface CharacterAnchor {
  type: "region" | "element";
  targetId: string;
}

export interface IconicCues {
  speechQuirks: string[];
  catchphrases: string[];
  behavioralTics: string[];
}

export interface CanonicalRefs {
  source?: string;
  keyRelationships: string[];
  signatureMoments: string[];
}

/** 角色运行时状态（存 DB，易变层） */
export interface CharacterState {
  characterId: string;
  location: string;
  mainAreaPointId: string | null;
  currentAction: string | null;
  currentActionTarget: string | null;
  actionStartTick: number;
  actionEndTick: number;

  emotionValence: number;
  emotionArousal: number;

  curiosity: number;

  dailyPlan: string | null;
}

/** 记忆条目 */
export interface MemoryEntry {
  id: string;
  characterId: string;
  type: MemoryType;
  content: string;
  gameDay: number;
  gameTick: number;
  importance: number;
  emotionalValence: number;
  emotionalIntensity: number;
  relatedCharacters: string[];
  relatedLocation: string;
  relatedObjects: string[];
  tags: string[];
  decayFactor: number;
  accessCount: number;
  isLongTerm: boolean;
  embedding?: number[];
}

/** 日程计划 */
export interface DailyPlan {
  characterId: string;
  gameDay: number;
  items: PlanItem[];
}

export interface PlanItem {
  period: "morning" | "midday" | "afternoon" | "evening" | "night";
  plan: string;
  motivation: string;
  location?: string;
}

/** 日记 */
export interface DiaryEntry {
  id: string;
  characterId: string;
  gameDay: number;
  content: string;
}
