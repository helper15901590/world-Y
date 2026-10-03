export interface GameTime {
  day: number;
  tick: number;
}

export interface MultiDayConfig {
  enabled: boolean;
  endOfDayText: string;
  newDayText: string;
  nextDayStartTime: string;
}

export interface SceneConfigInfo {
  sceneType: string;
  startTime: string;
  tickDurationMinutes: number;
  maxTicks: number | null;
  displayFormat: string;
  description: string;
  multiDay: MultiDayConfig;
}

export interface SceneRuntimeInfo {
  bounded: boolean;
  cycleTicks: number;
  naturalDayTicks: number;
  transitionEnabled: boolean;
}

export interface EnvironmentObjectInfo {
  id: string;
  name: string;
  /** 运行时状态（如 available / broken），角色可感知 */
  state: string;
  /** 状态描述，直接显示给角色 */
  stateDescription: string;
  capacity: number;
  currentUsers: string[];
}

export interface EnvironmentLocationInfo {
  id: string;
  name: string;
  description: string;
  objects: EnvironmentObjectInfo[];
}

export interface WorldPromptInfo {
  worldName: string;
  worldDescription: string;
  /** 实际生效的"世界背景"提示词（已应用"留空回退到世界简介"规则） */
  worldSocialContext: string;
}

export interface CharacterInfo {
  id: string;
  name: string;
  role: string;
  nickname: string;
  location: string;
  mainAreaPointId?: string | null;
  emotion: string;
  currentAction: string | null;
  currentActionLabel?: string | null;
  anchor?: { type: "region" | "element"; targetId: string } | null;
  /** 核心任务命中的地点/物件（闲逛时会偏向这些位置；无任务或没有命中时为 null） */
  questFocus?: { locationIds: string[]; objectIds: string[] } | null;
}

export interface CharacterInitialMemory {
  type?: string;
  content: string;
  importance?: number;
  tags?: string[];
}

export interface CharacterProfile {
  id: string;
  name: string;
  role: string;
  nickname: string;
  backstory?: string;
  appearanceHint?: string;
  gender?: string;
  age?: string;
  department?: string;
  position?: string;
  jobTitle?: string;
  coreMotivation: string;
  coreValues: string[];
  speakingStyle: string;
  skills?: string[];
  preferredActivities?: string[];
  fears: string[];
  dislikes?: string[];
  initialMemories?: CharacterInitialMemory[];
  iconicCues?: {
    speechQuirks?: string[];
    catchphrases?: string[];
    behavioralTics?: string[];
  };
  canonicalRefs?: {
    source?: string;
    keyRelationships?: string[];
    signatureMoments?: string[];
  };
  socialStyle: string;
  tags: string[];
  anchor?: { type: string; targetId: string } | null;
  /** 核心任务：填写即启动（清空即停止），会注入决策/对话提示词并影响移动方向 */
  coreQuest?: string;
  /** 服务端只在公开档案里返回该标志，密码本身不下发 */
  hasEditPassword?: boolean;
  [key: string]: unknown;
}

export interface CharacterDetail {
  profile: CharacterProfile;
  state: {
    location: string;
    mainAreaPointId?: string | null;
    currentAction: string | null;
    currentActionLabel?: string | null;
    emotionValence: number;
    emotionArousal: number;
    curiosity: number;
  };
  emotionLabel: string;
  /** 核心任务的行动步骤（AI 规划、角色可自行修订；无任务时为 null） */
  questPlan?: {
    quest: string;
    steps: string[];
    updatedDay: number;
    updatedTick: number;
  } | null;
}

export interface DiaryEntry {
  day: number;
  content: string;
  createdAt: string;
}

export interface MemoryEntry {
  type: string;
  content: string;
  importance: number;
  createdAt: string;
}

export interface DialogueTurn {
  speaker: string;
  content: string;
  innerMonologue?: string;
}

export interface DialogueEventData {
  conversationId: string;
  phase: "turn" | "complete";
  turns: DialogueTurn[];
  turnIndexStart: number;
  isFinal: boolean;
  participants: string[];
  memoriesGenerated?: Record<string, string>;
  endReason?: string;
}

export interface SimulationEvent {
  id: string;
  type: string;
  gameDay: number;
  gameTick: number;
  timeString?: string;
  period?: string;
  actorId?: string;
  targetId?: string;
  location?: string;
  data: any | DialogueEventData;
  innerMonologue?: string;
  dramScore?: number;
  createdAt: string;
}

export interface WorldTimeInfo extends GameTime {
  timeString: string;
  period: string;
}

export interface LocationInfo {
  id: string;
  name: string;
  description: string;
}

export interface MainAreaPointInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  adjacentPointIds: string[];
}

export interface TimelineMeta {
  id: string;
  worldId: string;
  createdAt: string;
  updatedAt: string;
  lastGameTime: GameTime;
  tickCount: number;
  status: "recording" | "stopped";
}

export interface TimelineWithWorld {
  worldId: string;
  worldName: string;
  source?: "user" | "library";
  isCurrent: boolean;
  timelines: TimelineMeta[];
}

export interface TimelineInitFrame {
  type: "init";
  gameTime: GameTime;
  characters: {
    id: string;
    name: string;
    location: string;
    mainAreaPointId: string | null;
  }[];
}

export interface TimelineTickFrame {
  type: "tick";
  gameTime: GameTime;
  events: SimulationEvent[];
}

export type TimelineFrame = TimelineInitFrame | TimelineTickFrame;
