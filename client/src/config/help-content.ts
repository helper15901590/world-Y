/**
 * 「玩法说明」帮助文档内容（帮助按钮打开的弹窗使用）。
 * 文案直接写在这里而不是 i18n JSON：内容较长，集中维护更清晰；
 * 语言按当前界面语言选择（zh / en）。
 */

export interface HelpSection {
  title: string;
  items: string[];
}

export const HELP_CONTENT: Record<"zh" | "en", HelpSection[]> = {
  zh: [
    {
      title: "这是什么",
      items: [
        "WorldX 是一个「一句话生成一个活的 AI 世界」的模拟器：你描述一个小镇，AI 会生成地图、角色和他们的生活。",
        "世界里的居民会自己决定去哪里、做什么、和谁说话——你可以像看一部慢直播一样观察他们。",
        "世界靠「回合」推进：每个回合代表世界里的十几到几十分钟，角色每回合做一次决定。",
      ],
    },
    {
      title: "开始 / 暂停",
      items: [
        "工具栏右上角的「开始/暂停」按钮控制世界的自动推进。",
        "工具栏左侧显示当前世界名、运行状态和世界内的时间。",
        "「Run / Replay」切换实时模式和回放模式；回放可以重看过去任意一段时间的世界。",
      ],
    },
    {
      title: "看人物",
      items: [
        "每个角色头顶都有状态小标志：💭 空闲、💬 对话中、🚶 移动中，或正在做的事对应的动作图标（如 🔨 打铁）；金色的 ★ 表示 ta 身负核心任务。",
        "点击地图上的角色，右侧面板会显示 ta 的心情、位置、当前动作。",
        "「历史」页签是这个人经历过的事（含对话原文）；「记忆」页签是 ta 记得的事情。",
        "「计划」页签是 ta 为实现核心任务给自己列的步骤——由 AI 规划，执行中会自行调整。",
      ],
    },
    {
      title: "核心任务：让人物「有事可做」",
      items: [
        "在人物的设定里填「核心任务」，填写即启动，清空即停止，没有单独的开关。",
        "任务产生后，角色会先规划自己的行动步骤，然后按步骤行动，并在过程中围绕任务调整步骤。",
        "任务会明确影响三件事：做什么（优先推进任务）、往哪走（移动选项会标注任务方向）、说什么（话题自然靠拢任务）。",
        "行动菜单里带 ★ 的选项与任务直接相关：★任务相关 = 能做任务的行动；★任务方向 = 朝任务地点/人物移动的下一步。",
        "任务里写到某个人的名字时，角色会认得那个人：对方在场会优先搭话；在「主区域」能看到全镇人的位置，别处则要先去人多的地方或问人打听。",
        "任务不是让别人替你完成：角色仍会吃饭、闲逛、维持人设，只是把任务当成优先事项。",
      ],
    },
    {
      title: "和角色面对面（架空对话）",
      items: [
        "工具栏的「架空对话」可以随时和任意角色说话——像一段「时间胶囊」里的独立对话。",
        "这段对话不会进入角色的正式记忆，也不会改变世界里的计划；适合聊天、试探设定。",
        "角色会按自己的人设、情绪和记忆回答你；对方身份（朋友/陌生人）会影响 ta 的坦诚程度。",
      ],
    },
    {
      title: "记忆与日记",
      items: [
        "角色经历过的事会沉淀成记忆，重要的事情记得更久；记忆会参与 ta 之后的决定和对话。",
        "每天结束时，角色会写日记，并做一次反思——你可以在角色的面板里看到。",
        "「你记得的事」也可以在人设里手动补充（初始记忆），会成为角色的背景知识。",
      ],
    },
    {
      title: "捏人与改人设",
      items: [
        "每个角色都有一串 12 位的「编辑密码」（管理员在上帝面板里查看），拥有密码才能修改这个角色的设定。",
        "可改的内容：姓名、性别、年龄、部门/岗位/职位、核心能力、爱好、害怕、厌恶、背景、价值观、说话特点、当前任务、锚定位置等。",
        "姓名全局唯一：不能改成其他角色已在用的名字。",
        "人设字段里可编辑的内容会作为提示词发给 AI——你写得越具体，角色演得越像（不填的字段就不出现）。",
        "改完立即生效，并且会写回世界配置：重启后依然保留。",
      ],
    },
    {
      title: "管理员功能（上帝面板）",
      items: [
        "工具栏默认锁定：输入管理员密码（在后台配置文件中设置）后解锁完整菜单。",
        "上帝面板可以：发广播、和某个角色密语、修改世界设定提示词、创建/删除角色、编辑地点与物件、查看角色密码。",
        "「世界设定提示词」是给所有角色看的背景底色（社会氛围、常识）；修改它会影响所有人的举止与话题。",
        "删除角色会同时移除 ta 的立绘与配置，历史事件仍会保留。",
      ],
    },
    {
      title: "常见问题",
      items: [
        "角色为什么站着不动？—— 他们在执行某个动作（约 X 小时）或正在对话中；动作结束就会继续活动。",
        "为什么两个人没有搭上话？—— 对话需要双方在同一位置、都在空闲状态，且距离足够近。",
        "世界推进得很慢？—— 每个回合都要调用 AI 为每个角色做决定，人数越多越慢；可以暂停后用「单回合推进」小步观察。",
        "时间线是什么？—— 每条时间线是这个世界的一次独立运行记录；可以随时切换、回放，或新建一条从头开始。",
      ],
    },
  ],
  en: [
    {
      title: "What this is",
      items: [
        "WorldX turns one sentence into a living AI world: describe a town, and AI generates the map, the residents and their daily lives.",
        "Residents decide on their own where to go, what to do and whom to talk to — you watch it like a slow livestream.",
        "The world advances in ticks: each tick is tens of minutes of world time, and every character makes one decision per tick.",
      ],
    },
    {
      title: "Play / pause",
      items: [
        "The Play/Pause button at the top right controls automatic advancement.",
        "The left side of the toolbar shows the world name, run status and in-world time.",
        "Use Run / Replay to switch between live mode and replaying any earlier stretch of the world.",
      ],
    },
    {
      title: "Watching characters",
      items: [
        "Every character shows a small status icon above their head: 💭 idle, 💬 in conversation, 🚶 moving, or the icon of whatever they're doing; a gold ★ means they carry a core quest.",
        "Click a character on the map to see their mood, location and current action in the side panel.",
        "The History tab lists what they lived through (including dialogue); the Memory tab shows what they remember.",
        "The Plan tab shows the steps they set for their core quest — planned by AI and revised as they go.",
      ],
    },
    {
      title: "Core quests: giving characters something to do",
      items: [
        "Type a core quest in a character's settings to start it; clear the text to stop it — there is no separate switch.",
        "Once a quest exists, the character first plans its own action steps, then follows them and adjusts along the way.",
        "A quest clearly affects three things: what they do (task first), where they move (quest directions are tagged), and what they talk about.",
        "Options marked with ★ are tied to the quest: ★任务相关 = an action that advances it; ★任务方向 = the next hop toward the place or person the quest needs.",
        "If the quest names someone, the character recognizes them: they will approach them when present; at the Main Area they can see where everyone is, elsewhere they must go where people gather or ask around.",
        "A quest doesn't turn characters into robots: they still eat, wander and stay in character — the quest is just the priority.",
      ],
    },
    {
      title: "Talking to a character (sandbox chat)",
      items: [
        "The Sandbox Chat button lets you talk to any character — a self-contained chat in a 'time capsule'.",
        "It never enters their real memory and doesn't change their plans in the world; great for probing a character.",
        "They answer in character, shaped by their persona, mood and memories; who you claim to be affects how open they are.",
      ],
    },
    {
      title: "Memory and diaries",
      items: [
        "What characters live through becomes memories; important things stick longer, and memories feed their later decisions and talks.",
        "At the end of each day they write a diary and reflect — visible in their panel.",
        "You can also seed 'things you remember' in their settings (initial memories) as background knowledge.",
      ],
    },
    {
      title: "Creating and editing characters",
      items: [
        "Every character has a 12-character edit password (admins can look it up in the God panel); it's required to change their settings.",
        "Editable: name, gender, age, department/position/title, skills, hobbies, fears, dislikes, background, values, speech habits, current quest, anchored location, and more.",
        "Names are globally unique: you can't take a name another character already uses.",
        "Editable profile fields are sent to the AI as prompts — the more specific you write, the better they play. Empty fields are simply omitted.",
        "Edits apply immediately and are written back to the world config, so they survive restarts.",
      ],
    },
    {
      title: "Admin features (God panel)",
      items: [
        "The toolbar locks by default: enter the admin password (set in the backend config) to unlock the full menu.",
        "The God panel can: broadcast, whisper to a character, edit the world prompt, create/delete characters, edit locations and objects, and look up character passwords.",
        "The world prompt is the shared background (social mood, common sense) for everyone — changing it shifts how all characters behave and talk.",
        "Deleting a character removes their sprite and config; historical events are kept.",
      ],
    },
    {
      title: "FAQ",
      items: [
        "Why is a character standing still? — They are executing an action (about X hours) or in a conversation; they resume afterwards.",
        "Why didn't two characters talk? — Both must be at the same location, idle, and close enough to each other.",
        "Why is the world slow? — Every tick calls the AI once per character; more characters means slower ticks. Pause and step tick-by-tick to watch closely.",
        "What is a timeline? — Each timeline is one independent run of the world. Switch, replay, or start a fresh one any time.",
      ],
    },
  ],
};
