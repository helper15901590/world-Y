import type { LLMClient } from "../llm/llm-client.js";
import type { PromptBuilder } from "../llm/prompt-builder.js";
import type { QuestPlanner } from "./quest-planner.js";
import { getCoreQuest } from "../core/quest-focus.js";
import { ActionDecisionSchema } from "../llm/output-schemas.js";
import type { CharacterManager } from "../core/character-manager.js";
import type { WorldManager } from "../core/world-manager.js";
import type {
  ActionDecision,
  GameTime,
  Perception,
} from "../types/index.js";
import { relativeTimeLabel } from "../utils/time-helpers.js";

export class DecisionMaker {
  constructor(
    private llmClient: LLMClient,
    private promptBuilder: PromptBuilder,
    private characterManager: CharacterManager,
    private worldManager: WorldManager,
    private questPlanner: QuestPlanner,
  ) {}

  async makeDecision(
    charId: string,
    perception: Perception,
    actionMenu: string,
    gameTime: GameTime,
  ): Promise<ActionDecision> {
    const profile = this.characterManager.getProfile(charId);
    const state = this.characterManager.getState(charId);

    const contextKeywords: string[] = [perception.currentLocation];
    for (const c of perception.charactersHere) {
      contextKeywords.push(c.name, c.id);
      if (c.locationId) contextKeywords.push(c.locationId);
      if (c.locationName) contextKeywords.push(c.locationName);
    }

    const memories = this.characterManager.memoryManager.retrieveMemories({
      characterId: charId,
      currentTime: gameTime,
      contextKeywords,
      relatedLocation: state.location,
      topK: 5,
    });

    const relevantMemories =
      memories.length > 0
        ? memories
            .map(
              (m) =>
                `- [${relativeTimeLabel(m.gameDay, m.gameTick, gameTime)}] ${m.content}`,
            )
            .join("\n")
        : "";

    const currentFocus = this.worldManager.getGlobal(`current_focus:${charId}`) ?? undefined;

    // 核心任务的行动步骤：有任务但还没有计划时先规划一份（幂等，随任务文本变化重算）
    const questPlan = await this.questPlanner.ensurePlan(charId).catch(() => null);

    const messages = this.promptBuilder.buildReactiveDecisionMessages({
      profile,
      state,
      gameTime,
      perception,
      relevantMemories,
      actionMenu,
      currentFocus,
      worldSocialContext: this.worldManager.getWorldSocialContext(),
      questPlan: questPlan?.steps,
    });

    const result = await this.llmClient.call({
      messages,
      schema: ActionDecisionSchema,
      options: { taskType: "reactive_decision", characterId: charId },
    });

    // 角色在决策里修订了行动步骤：覆盖存储（修订只在它主动给出时发生）
    if (result.data.questPlan && result.data.questPlan.length > 0) {
      const quest = getCoreQuest(profile);
      if (quest) this.questPlanner.applyPlan(charId, quest, result.data.questPlan);
    }

    return result.data;
  }
}
