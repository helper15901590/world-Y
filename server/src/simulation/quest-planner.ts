import type { LLMClient } from "../llm/llm-client.js";
import type { PromptBuilder } from "../llm/prompt-builder.js";
import type { CharacterManager } from "../core/character-manager.js";
import type { WorldManager } from "../core/world-manager.js";
import { QuestPlanSchema } from "../llm/output-schemas.js";
import { getCoreQuest } from "../core/quest-focus.js";
import { absoluteTick } from "../utils/time-helpers.js";

/**
 * 核心任务的「行动步骤」：任务一旦有了文字，角色先给自己规划 3-6 步，
 * 之后每个决策回合都带着这份路线走；执行中可以自行修订（决策输出里的 questPlan 字段）。
 *
 * 存储：世界全局状态 `quest_plan:<charId>`（JSON），随世界/时间线一起走。
 * 失效：任务的文字变了 → 重新规划（把旧步骤作为参考一起给模型）。
 */
export interface QuestPlan {
  /** 规划时对应的任务文本：任务改了就要重新规划 */
  quest: string;
  steps: string[];
  updatedDay: number;
  updatedTick: number;
}

const PLAN_KEY_PREFIX = "quest_plan:";
/** 生成失败后的冷却回合数（避免失败时每个回合都重试） */
const FAILURE_COOLDOWN_TICKS = 4;

export class QuestPlanner {
  private inFlight = new Map<string, Promise<QuestPlan | null>>();
  private failedAtAbsTick = new Map<string, number>();

  constructor(
    private llmClient: LLMClient,
    private promptBuilder: PromptBuilder,
    private characterManager: CharacterManager,
    private worldManager: WorldManager,
  ) {}

  getPlan(charId: string): QuestPlan | null {
    const raw = this.worldManager.getGlobal(`${PLAN_KEY_PREFIX}${charId}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as QuestPlan;
      if (
        typeof parsed?.quest === "string" &&
        Array.isArray(parsed.steps) &&
        parsed.steps.length > 0
      ) {
        return parsed;
      }
    } catch {
      // 脏数据按无计划处理
    }
    return null;
  }

  /** 直接写入一份计划（角色在决策里修订，或规划器生成后落盘） */
  applyPlan(charId: string, quest: string, steps: string[]): QuestPlan {
    const time = this.worldManager.getCurrentTime();
    const plan: QuestPlan = {
      quest,
      steps: steps
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .slice(0, 8),
      updatedDay: time.day,
      updatedTick: time.tick,
    };
    this.worldManager.setGlobal(`${PLAN_KEY_PREFIX}${charId}`, JSON.stringify(plan));
    return plan;
  }

  clearPlan(charId: string): void {
    this.worldManager.setGlobal(`${PLAN_KEY_PREFIX}${charId}`, "");
  }

  /**
   * 确保角色有一份与当前任务一致的步骤；没有任务则清空计划。
   * 同一角色并发只跑一次生成；生成失败后冷却几个回合再重试。
   */
  async ensurePlan(charId: string): Promise<QuestPlan | null> {
    const profile = this.characterManager.getProfile(charId);
    const quest = getCoreQuest(profile);

    if (!quest) {
      if (this.getPlan(charId)) this.clearPlan(charId);
      return null;
    }

    const existing = this.getPlan(charId);
    if (existing && existing.quest === quest) return existing;

    const pending = this.inFlight.get(charId);
    if (pending) return pending;

    const now = absoluteTick(this.worldManager.getCurrentTime());
    const failedAt = this.failedAtAbsTick.get(charId);
    if (failedAt != null && now - failedAt < FAILURE_COOLDOWN_TICKS) return null;

    const task = this.generatePlan(charId, quest, existing?.steps)
      .then((plan) => {
        this.failedAtAbsTick.delete(charId);
        return plan;
      })
      .catch((err) => {
        this.failedAtAbsTick.set(charId, absoluteTick(this.worldManager.getCurrentTime()));
        console.error(`[QuestPlanner] 为 ${charId} 生成行动计划失败:`, err);
        return null;
      })
      .finally(() => {
        this.inFlight.delete(charId);
      });
    this.inFlight.set(charId, task);
    return task;
  }

  private async generatePlan(
    charId: string,
    quest: string,
    previousSteps?: string[],
  ): Promise<QuestPlan | null> {
    const profile = this.characterManager.getProfile(charId);
    const state = this.characterManager.getState(charId);
    const gameTime = this.worldManager.getCurrentTime();
    const currentLocation =
      this.worldManager.getLocation(state.location)?.name ?? state.location;

    const messages = this.promptBuilder.buildQuestPlanMessages({
      profile,
      gameTime,
      currentLocation,
      worldKnowledge: this.buildWorldKnowledge(charId),
      previousSteps,
    });

    const result = await this.llmClient.call({
      messages,
      schema: QuestPlanSchema,
      options: { taskType: "quest_plan", characterId: charId },
    });

    return this.applyPlan(charId, quest, result.data.steps);
  }

  /** 紧凑的"角色眼中的世界"：地点（带一句描述）、物件（在哪）、其他人物（带身份）。 */
  private buildWorldKnowledge(charId: string): string {
    const lines: string[] = [];
    const locations = this.worldManager.getAllLocations();

    const trimDesc = (text: string | undefined): string =>
      typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, 40) : "";

    lines.push("地点：");
    for (const loc of locations) {
      const desc = trimDesc(loc.description);
      lines.push(`- ${loc.name}${desc ? `（${desc}）` : ""}`);
    }

    const objectLines: string[] = [];
    for (const loc of locations) {
      for (const obj of loc.objects ?? []) {
        objectLines.push(`- ${obj.name}（在${loc.name}）`);
      }
    }
    if (objectLines.length > 0) {
      lines.push("", "物件：");
      lines.push(...objectLines);
    }

    const peopleLines: string[] = [];
    for (const p of this.characterManager.getAllProfiles()) {
      if (p.id === charId) continue;
      const tag = p.jobTitle || p.position || p.department || p.role || "";
      peopleLines.push(`- ${p.name}${tag ? `（${tag}）` : ""}`);
    }
    if (peopleLines.length > 0) {
      lines.push("", "人物：");
      lines.push(...peopleLines);
    }

    return lines.join("\n");
  }
}
