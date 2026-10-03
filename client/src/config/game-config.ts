export const TILE_SIZE = 32;

export const SPRITE_FRAME_WIDTH = 170;
export const SPRITE_FRAME_HEIGHT = 204;
export const SPRITE_COLUMNS = 6;
export const SPRITE_ROWS = 5;
export const SPRITE_WALK_FRAME_RATE = 8;

/**
 * 角色高度 = 地图高度 × 该比例。
 *
 * 旧公式是 (mapWidth + mapHeight) * 0.04，在标准地图 2752×1536 上等于 171.5px。
 * 但横向拼接扩展的地图（例如三倍宽 8256×1536）会让这个公式把角色放大 2.3 倍——
 * 而底图的像素比例其实没变，角色应该保持原大小。
 * 因此改为只依赖地图高度：标准地图下数值与旧公式完全一致，横向扩展时角色不再变形。
 */
const CHARACTER_HEIGHT_MAP_RATIO = (0.04 * (2752 + 1536)) / 1536; // ≈ 0.11167

export interface CharacterDisplayMetrics {
  spriteWidth: number;
  spriteHeight: number;
  hitWidth: number;
  hitHeight: number;
  hitTopY: number;
  circleRadius: number;
  circleStrokeWidth: number;
  circleHighlightRadius: number;
  circleHighlightOffsetX: number;
  circleHighlightOffsetY: number;
  shadowWidth: number;
  shadowHeight: number;
  shadowOffsetY: number;
  bubbleOffsetY: number;
  bubbleFontSize: number;
  bubbleWrapWidth: number;
  bubblePadding: number;
  bubbleTailHeight: number;
  bubbleCornerRadius: number;
  labelNameWorldSize: number;
  labelMbtiWorldSize: number;
  labelIconWorldSize: number;
  labelGapWorld: number;
  labelMbtiPadXWorld: number;
  labelMbtiPadYWorld: number;
  sortFootYOffset: number;
}

export function createCharacterDisplayMetrics(
  mapWidth: number,
  mapHeight: number,
): CharacterDisplayMetrics {
  void mapWidth; // 角色尺寸只跟地图高度走（见 CHARACTER_HEIGHT_MAP_RATIO 的说明）
  const spriteHeight = mapHeight * CHARACTER_HEIGHT_MAP_RATIO;
  const spriteWidth = spriteHeight * (SPRITE_FRAME_WIDTH / SPRITE_FRAME_HEIGHT);

  return {
    spriteWidth,
    spriteHeight,
    hitWidth: spriteWidth * 0.75,
    hitHeight: spriteHeight * 0.95,
    hitTopY: -spriteHeight * 0.8,
    circleRadius: spriteWidth * 0.45,
    circleStrokeWidth: Math.max(1.5, spriteWidth * 0.075),
    circleHighlightRadius: spriteWidth * 0.2,
    circleHighlightOffsetX: -spriteWidth * 0.125,
    circleHighlightOffsetY: -spriteWidth * 0.125,
    shadowWidth: spriteWidth * 0.3,
    shadowHeight: Math.max(2, spriteWidth * 0.125),
    shadowOffsetY: Math.max(2, spriteWidth * 0.1),
    bubbleOffsetY: -spriteHeight * 1.12,
    // 对话气泡字号：中文是满格方块字，同样磅值比拉丁字母显大，
    // 因此按 0.12 比例（标准地图 ≈20.6 世界单位）而不是原来的 0.17（≈29.2）。
    bubbleFontSize: Math.max(13, spriteHeight * 0.12),
    bubbleWrapWidth: Math.max(spriteWidth * 1.65, spriteHeight * 2.1),
    bubblePadding: Math.max(7, spriteHeight * 0.05),
    bubbleTailHeight: Math.max(4, spriteHeight * 0.035),
    bubbleCornerRadius: Math.max(6, spriteHeight * 0.045),
    labelNameWorldSize: spriteWidth * 0.20,
    labelMbtiWorldSize: spriteWidth * 0.20,
    labelIconWorldSize: spriteWidth * 0.21,
    labelGapWorld: spriteWidth * 0.07,
    labelMbtiPadXWorld: spriteWidth * 0.14,
    labelMbtiPadYWorld: spriteWidth * 0.045,
    sortFootYOffset: spriteHeight * 0.16,
  };
}

export const CHARACTER_COLORS = [
  0x6c5ce7, 0x74b9ff, 0xd63031, 0xe17055,
  0x00b894, 0xfd79a8, 0xfdcb6e, 0xe84393,
];

export const ACTION_EMOJI: Record<string, string> = {
  cook: "🍳", eat: "🍽️", read: "📖",
  read_bulletin: "📰", write_diary: "📝", talk: "💬", talking: "💬", in_conversation: "💬", idle: "💭",
  fish: "🎣", explore: "🔍", repair: "🔧",
  think_in_bed: "💭", post_dialogue: "🙂", traveling: "🚶",
  people_watch: "👀", use_computer: "💻", have_drink: "☕", craft: "🔨", stroll: "🚶", tend_garden: "🌱", post_message: "📌",
  garden: "🌱", water_plants: "💧", plant_seeds: "🌱", harvest_crops: "🥕",
  buy_goods: "🛒", stock_shelves: "📦", clean_shop: "🧹",
  rest: "🛋️", sleep: "😴", relax: "🌿", sit: "🪑",
  pray: "🙏", perform: "🎭", play_music: "🎵",
  train: "💪", work: "🧰", study: "📚", observe: "👀",
};

export function actionToEmoji(action: string | null): string {
  if (!action) return "";
  return ACTION_EMOJI[action] || "";
}

export function getCharacterColor(index: number): number {
  return CHARACTER_COLORS[index % CHARACTER_COLORS.length];
}
