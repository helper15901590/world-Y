#!/usr/bin/env python3
"""把「胜利之后的像素小镇」世界本地化为中文（一次性脚本）。

只翻译真正影响提示词与界面的文本：
  world.json  世界名/简介/世界背景/地点/物件/交互/全局动作/转场文案 + contentLanguage=zh
  scene.json  同步世界名与描述
  角色配置     name / role / personality / appearanceHint / motivation / initialMemories
保留：socialStyle（加载器靠英文关键词解析）、id、run 相关字段（不翻译）。
"""
import io
import json
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

WORLD_DIR = Path(sys.argv[1] if len(sys.argv) > 1 else
                 "output/worlds/world_2026-04-19T17-12-41_wide3")

NAME_SUFFIXES = ["（西）", "（东）"]

WORLD_TEXTS = {
    "worldNameBase": "胜利之后的像素小镇",
    "worldDescription": "一座像素风的 RPG 小镇。英雄拯救世界后离开了，居民们正重新寻找生活的意义。中央广场矗立着英雄的巨大石像，每个角落都留着冒险时代的痕迹。",
    "worldSocialContext": "居民们早在怪物横行、英雄远征的年代就已相识多年。如今世界彻底安全了，每个人却都悄悄对自己的人生目标感到迷茫，闲谈时常不知不觉聊起英雄当年的功绩。",
    "endOfDayText": "夕阳沉入山后，村民纷纷锁好家门，回屋歇息。",
    "newDayText": "黎明鸡鸣，小镇又迎来一个安静祥和的日子。",
}

LOCATIONS = {
    "main_area": ("主区域", None),  # None = 用 worldDescription
    "central_plaza": ("中央广场", "小镇中心的开阔公共空间，正中央矗立着英雄的巨大石像。"),
    "blacksmith_forge": ("铁匠铺", "西侧的打铁工坊。铁匠曾在这里为英雄打造传说中的宝剑，如今改打家用汤匙。"),
    "healer_cottage": ("医者小屋", "东侧的小屋。医者曾在这里救治受伤的冒险者，如今大多闲置着。"),
}

OBJECTS = {
    "admire_hero_statue": ("英雄石像", "瞻仰英雄石像", "站在石像前，端详雕刻出的英雄容貌。"),
    "browse_handmade_spoons": ("手打汤匙", "翻看手工汤匙", "看看铁匠做的那些码放整齐、做工扎实的汤匙。"),
    "browse_herb_shelves": ("药草架", "翻看药草架", "看看架上码放整齐的干药材。"),
}

WORLD_ACTIONS = {
    "stroll_around_village": ("在村里闲逛", "沿着村里的小路漫步，看看周围的风景和居民。"),
    "discuss_hero_stories": ("聊聊英雄的故事", "和附近的村民聊聊英雄当年的冒险与胜利。"),
    "ponder_life_purpose": ("思考人生的意义", "站定下来想一想：在这个已被拯救的太平世界里，自己该做些什么。"),
}

CHARACTERS = {
    "char_1776618841565": {  # Tobias
        "name": "托比亚斯", "role": "游商",
        "personality": "开朗但有点迷茫。以前专给冒险者卖补给品，如今没有货可卖，喜欢和遇到的每个村民聊天。",
        "appearanceHint": "背着空空的藤编货篮，穿着走了很多路的旧外套，一看就是整天四处闲逛的人。",
        "motivation": "为这个太平的村子找到新的有用货物，或者给自己找一条全新的路。",
        "memories": [
            "世界被拯救之前，他常把治疗药水、剑和箭卖给冒险者",
            "英雄打败魔王之后，他已经三个月没有货可卖了",
            "村里每个人的英雄冒险故事，他都记得清清楚楚",
        ],
    },
    "char_1776618856794": {  # Elara
        "name": "艾拉", "role": "村医",
        "personality": "温柔有耐心。因为再没有人受伤打怪，她觉得自己没用了，空闲时喜欢打理药草园。",
        "appearanceHint": "穿着淡绿色长裙，身上有干草药的味道，看起来很温和恬静。",
        "motivation": "找到新办法用自己的医术帮助村子，哪怕再没有受伤的冒险者需要治疗。",
        "memories": [
            "英雄讨伐黑暗领主时，她为他处理过三次伤口",
            "自从最后一只怪物被杀，她的病床已经空了六个月",
            "她在试着用草药煮茶给村民喝，而不是做治疗药水",
        ],
    },
    "char_1776618873346": {  # Gareth
        "name": "加雷斯", "role": "铁匠",
        "personality": "沉默寡言。为打造过英雄的传说之剑而自豪，又有点不好意思如今只打汤匙；无论做什么都极其认真。",
        "appearanceHint": "身材魁梧、满身煤灰的壮汉，围着厚皮围裙，看起来非常有力气。",
        "motivation": "学会为打制日常用品而自豪，而不只是武器；将来把这门手艺传给一个年轻学徒。",
        "memories": [
            "他花了两年为英雄打造那把击败黑暗领主的传说之剑",
            "英雄离开村子后，他已经打了 472 把汤匙",
            "他留着一小片传说之剑的原料金属作纪念",
        ],
    },
    "char_1776618891290": {  # Lira
        "name": "莉拉", "role": "吟游诗人",
        "personality": "开朗、爱演。只会唱一首《英雄之歌》，一有机会就唱，还有点没意识到大家已经听过几十遍了。",
        "appearanceHint": "穿着亮黄色短衫，背着一把小鲁特琴，看起来活泼又爱表现。",
        "motivation": "写一首配得上这个太平新世界的新歌，或者找一个还没听过《英雄之歌》的人。",
        "memories": [
            "六个月前的英雄庆功宴上，她唱了《英雄之歌》",
            "她把以前会唱的歌都忘光了，只记得《英雄之歌》",
            "她曾经在中央广场一口气唱了三个小时的《英雄之歌》",
        ],
    },
    "char_1776618907756": {  # Milo
        "name": "米洛", "role": "立志成为下一个英雄的孩子",
        "personality": "精力旺盛、倔强。即使已经没有怪物了，他也坚信自己会成为下一个英雄，喜欢举着木剑在村里到处跑。",
        "appearanceHint": "举着木剑的小孩子，总是在奔跑，一副正在冒险的样子。",
        "motivation": "证明自己配得上当下一个英雄，找到一个需要打败的新邪恶来保护村子。",
        "memories": [
            "他已经听过 127 遍《英雄之歌》，每一句都会背",
            "他的木剑是自己削的，照着英雄那把传说之剑的样子",
            "他相信黑暗领主总有一天会回来，而只有他能打败它",
        ],
    },
    "char_1776618925039": {  # Owen
        "name": "欧文", "role": "村卫兵",
        "personality": "沉默、极其尽责。没有犯罪也没有怪物袭击，他有点无聊，巡逻时会不自觉重复以前那句口头话。",
        "appearanceHint": "穿着有凹痕的铁甲，手持长矛，即使什么事都不会发生也一副警觉的样子。",
        "motivation": "哪怕没什么可打的，也要守护村子的安全；在巡逻路上给自己找些新的正经事做。",
        "memories": [
            "对抗黑暗领主的那场战争里，他每晚都在村口巡逻",
            "他已经连续六个月没有任何情况可以上报",
            "每次巡逻他仍然会去查看村口三次，就像战争时期一样",
        ],
    },
    "char_1776618939731": {  # Alaric
        "name": "阿拉里克", "role": "哲思村长",
        "personality": "深思、有智慧。大部分时间都在思考和平的意义，喜欢坐在广场长椅上看来来往往的村民。",
        "appearanceHint": "白胡子老人，拄着一根刻花木杖，看起来深思而睿智。",
        "motivation": "帮村民在这个和平的世界里找到新的意义，带领村子在没有邪恶威胁的情况下也繁荣下去。",
        "memories": [
            "十年前，是他送英雄踏上讨伐黑暗领主的征途",
            "他一直在写一本日记，记录关于「被拯救之后的世界有何意义」的思考",
            "他相信村子接下来的伟大冒险，是学会如何和平地生活",
        ],
    },
}


def base_id(raw: str) -> tuple[str, str]:
    for suffix in NAME_SUFFIXES:
        if raw.endswith(suffix):
            return raw[: -len(suffix)], suffix
    return raw, ""


def localize_world_json() -> None:
    path = WORLD_DIR / "config" / "world.json"
    wc = json.loads(path.read_text(encoding="utf-8"))

    wc["contentLanguage"] = "zh"
    wide_suffix = " · 三倍宽" if "三倍宽" in wc.get("worldName", "") else ""
    wc["worldName"] = WORLD_TEXTS["worldNameBase"] + wide_suffix
    wc["worldDescription"] = WORLD_TEXTS["worldDescription"]
    wc["worldSocialContext"] = WORLD_TEXTS["worldSocialContext"]

    scene = wc.get("scene", {})
    scene["description"] = WORLD_TEXTS["worldDescription"]
    multi_day = scene.setdefault("multiDay", {})
    multi_day["endOfDayText"] = WORLD_TEXTS["endOfDayText"]
    multi_day["newDayText"] = WORLD_TEXTS["newDayText"]

    for loc in wc.get("locations", []):
        lid, suffix = base_id(loc["id"])
        if lid in LOCATIONS:
            name, desc = LOCATIONS[lid]
            loc["name"] = name + suffix
            loc["description"] = desc or WORLD_TEXTS["worldDescription"]
        for obj in loc.get("objects", []):
            oid, osuffix = base_id(obj["id"])
            if oid in OBJECTS:
                obj_name, inter_name, inter_desc = OBJECTS[oid]
                obj["name"] = obj_name + osuffix
                for inter in obj.get("interactions", []):
                    inter["name"] = inter_name
                    inter["description"] = inter_desc

    for action in wc.get("worldActions", []):
        if action["id"] in WORLD_ACTIONS:
            action["name"], action["description"] = WORLD_ACTIONS[action["id"]]

    path.write_text(json.dumps(wc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[world.json] {wc['worldName']} | contentLanguage={wc['contentLanguage']}")

    scene_path = WORLD_DIR / "config" / "scene.json"
    if scene_path.exists():
        scene_data = json.loads(scene_path.read_text(encoding="utf-8"))
        scene_data["worldName"] = wc["worldName"]
        if "worldDescription" in scene_data:
            scene_data["worldDescription"] = WORLD_TEXTS["worldDescription"]
        if "description" in scene_data:
            scene_data["description"] = WORLD_TEXTS["worldDescription"]
        scene_path.write_text(json.dumps(scene_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("[scene.json] 已同步")


def localize_characters() -> None:
    for char_id, texts in CHARACTERS.items():
        path = WORLD_DIR / "config" / "characters" / f"{char_id}.json"
        if not path.exists():
            print(f"  ! 跳过（不存在）: {char_id}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        data["name"] = texts["name"]
        data["role"] = texts["role"]
        data["personality"] = texts["personality"]
        data["appearanceHint"] = texts["appearanceHint"]
        data["motivation"] = texts["motivation"]
        for memory, content in zip(data.get("initialMemories", []), texts["memories"]):
            memory["content"] = content
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"  {texts['name']}（{texts['role']}）✓")

    meta_path = WORLD_DIR / "characters" / "characters.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        for entry in meta:
            if entry["id"] in CHARACTERS:
                entry["name"] = CHARACTERS[entry["id"]]["name"]
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("[characters.json] 名字已同步")


if __name__ == "__main__":
    print(f"目标世界：{WORLD_DIR}\n")
    localize_world_json()
    print("\n角色：")
    localize_characters()
    print("\n完成 ✓  需要在界面里重新加载该世界（切走再切回，或重启服务）")
