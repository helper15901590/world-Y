#!/usr/bin/env python3
"""
把某个世界的地图左右各镜像延伸一块（宽度变 3 倍），生成一个新的可玩世界。

布局：[ 原图的镜像 | 原图（坐标整体右移一个面板宽） | 原图的镜像 ]

同时重写：
  - map/06-background.png   横向三倍拼接
  - map/06-final.tmj        collision 每行「镜像+原样+镜像」；regions / interactive_objects 三份拷贝
                            （左右两份 id 加 _w / _e 后缀，中间一份保持原 id 不变）
  - config/world.json       worldSize / locations / mainAreaPoints 同步三份，
                            并在两条接缝处补「桥接点位」把三段点位图连成连通图
  - config/scene.json、config/characters/*、characters/**  原样拷贝

依赖：Python 3 + Pillow（pip install pillow）
用法：
  python scripts/extend-world-width.py <世界目录或世界id> [-o 输出id]
"""

import argparse
import copy
import json
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("需要 Pillow：pip install pillow")

# Windows 控制台默认可能是 cp936/cp950，打印中文会报错；统一切到 UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

ROOT = Path(__file__).resolve().parent.parent
WORLD_ROOTS = [ROOT / "library" / "worlds", ROOT / "output" / "worlds"]
OUTPUT_ROOT = ROOT / "output" / "worlds"


def resolve_world_dir(ref: str) -> Path:
    for base in WORLD_ROOTS:
        candidate = base / ref
        if (candidate / "config" / "world.json").exists():
            return candidate
    candidate = Path(ref)
    if (candidate / "config" / "world.json").exists():
        return candidate
    sys.exit(f"找不到世界：{ref}")


# ---------- 图片 ----------

def build_extended_image(src_png: Path, dst_png: Path) -> tuple[int, int]:
    img = Image.open(src_png).convert("RGBA")
    panel_w, height = img.size
    mirrored = img.transpose(Image.FLIP_LEFT_RIGHT)
    out = Image.new("RGBA", (panel_w * 3, height))
    out.paste(mirrored, (0, 0))
    out.paste(img, (panel_w, 0))
    out.paste(mirrored, (panel_w * 2, 0))
    out.save(dst_png)
    return panel_w, height


# ---------- TMJ ----------

def copy_tiled_object(obj: dict, dx: int, mirror_at: int | None, suffix: str,
                      name_suffix: str, tiled_id: int) -> dict:
    """拷贝一个 Tiled 对象；mirror_at 不为空时按 mirror_at - (x + width) 水平镜像。"""
    new_obj = copy.deepcopy(obj)
    new_obj["id"] = tiled_id
    if mirror_at is not None:
        new_obj["x"] = mirror_at - (obj["x"] + obj.get("width", 0))
    else:
        new_obj["x"] = obj["x"] + dx
    if name_suffix:
        new_obj["name"] = f"{obj['name']}{name_suffix}"

    for prop in new_obj.get("properties", []):
        name, value = prop.get("name"), prop.get("value")
        if name in ("id", "objectId") and isinstance(value, str):
            prop["value"] = f"{value}{suffix}"
        elif name in ("actions", "adjacentRegions", "interactions") and isinstance(value, str):
            try:
                items = json.loads(value)
            except (ValueError, TypeError):
                continue
            if isinstance(items, list):
                prop["value"] = json.dumps(
                    [f"{i}{suffix}" if isinstance(i, str) else i for i in items]
                )
    return new_obj


def build_extended_tmj(src_tmj: Path, dst_tmj: Path) -> dict:
    tmj = json.loads(src_tmj.read_text(encoding="utf-8"))
    grid_w, grid_h = tmj["width"], tmj["height"]
    tile_w = tmj["tilewidth"]
    panel_w = grid_w * tile_w

    tiled_id = 1
    for layer in tmj["layers"]:
        if layer["type"] == "tilelayer" and layer["name"] == "collision":
            data = layer["data"]
            new_data = []
            for y in range(grid_h):
                row = data[y * grid_w:(y + 1) * grid_w]
                new_data.extend(list(reversed(row)) + list(row) + list(reversed(row)))
            layer["data"] = new_data
            layer["width"] = grid_w * 3
        elif layer["type"] == "objectgroup":
            objects = []
            for obj in layer.get("objects", []):
                objects.append(copy_tiled_object(obj, 0, panel_w, "_w", "（西）", tiled_id))
                tiled_id += 1
                objects.append(copy_tiled_object(obj, panel_w, None, "", "", tiled_id))
                tiled_id += 1
                objects.append(copy_tiled_object(obj, panel_w * 2, None, "_e", "（东）", tiled_id))
                tiled_id += 1
            layer["objects"] = objects

    tmj["width"] = grid_w * 3
    dst_tmj.write_text(json.dumps(tmj, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"grid_w": grid_w * 3, "grid_h": grid_h, "tile_w": tile_w, "panel_w": panel_w}


# ---------- world.json ----------

def copy_location(loc: dict, suffix: str, name_suffix: str) -> dict:
    new_loc = copy.deepcopy(loc)
    new_loc["id"] = f"{loc['id']}{suffix}"
    new_loc["name"] = f"{loc['name']}{name_suffix}"
    new_loc["adjacentLocations"] = [
        (a if a == "main_area" else f"{a}{suffix}")
        for a in loc.get("adjacentLocations", [])
    ]
    for obj in new_loc.get("objects", []):
        obj["id"] = f"{obj['id']}{suffix}"
        obj["locationId"] = new_loc["id"]
    return new_loc


def copy_points(points: list, suffix: str, name_suffix: str, transform) -> list:
    out = []
    for p in points:
        q = copy.deepcopy(p)
        q["id"] = f"{p['id']}{suffix}"
        q["name"] = f"{p['name']}{name_suffix}"
        q["x"] = transform(p["x"])
        q["adjacentPointIds"] = [f"{a}{suffix}" for a in p.get("adjacentPointIds", [])]
        out.append(q)
    return out


def add_seam_bridges(points: list, collision: list, tile_w: int, seam_x: int,
                     tag: str, label: str, count: int = 4) -> list:
    """接缝桥接：在两侧都可行走的行里挑几处建点，各自连到左右最近的 3 个点位。"""
    grid_w = len(collision[0])
    seam_tile = seam_x // tile_w
    if not (0 < seam_tile < grid_w):
        return []

    candidates = [
        y for y in range(4, len(collision) - 4)
        if collision[y][seam_tile - 1] == 0 and collision[y][seam_tile] == 0
    ]
    if not candidates:
        print(f"  ! {label} 接缝处没有两侧都可走的行，跳过桥接")
        return []

    step = max(1, len(candidates) // count)
    bridges = []
    for idx, y in enumerate(candidates[::step][:count], start=1):
        x_px, y_px = seam_x, y * tile_w + tile_w // 2
        near = lambda pool: sorted(
            pool, key=lambda p: abs(p["x"] - x_px) + abs(p["y"] - y_px)
        )[:3]
        neighbours = near([p for p in points if p["x"] < seam_x]) + near([p for p in points if p["x"] > seam_x])

        bridge = {
            "id": f"main_area_point_seam_{tag}_{idx}",
            "name": f"接缝·{label}{idx}",
            "x": x_px,
            "y": y_px,
            "adjacentPointIds": [p["id"] for p in neighbours],
        }
        for p in neighbours:
            p.setdefault("adjacentPointIds", [])
            if bridge["id"] not in p["adjacentPointIds"]:
                p["adjacentPointIds"].append(bridge["id"])
        bridges.append(bridge)
    return bridges


def main() -> None:
    parser = argparse.ArgumentParser(description="地图左右镜像延伸（宽度 ×3）")
    parser.add_argument("world", help="世界 id 或目录")
    parser.add_argument("-o", "--out", help="输出世界 id（默认 <原id>_wide3）")
    args = parser.parse_args()

    src_dir = resolve_world_dir(args.world)
    dst_dir = OUTPUT_ROOT / (args.out or f"{src_dir.name}_wide3")
    if dst_dir.exists():
        sys.exit(f"输出目录已存在：{dst_dir}（先删除或换 -o）")

    print(f"源世界 : {src_dir}")
    print(f"输出   : {dst_dir}\n")

    # 1) 拷贝除 timelines（游玩记录）之外的全部内容
    shutil.copytree(src_dir, dst_dir, ignore=shutil.ignore_patterns("timelines"))

    # 2) 底图三倍拼接
    panel_w, height_px = build_extended_image(
        src_dir / "map" / "06-background.png", dst_dir / "map" / "06-background.png"
    )
    print(f"[图片] {panel_w}×{height_px}  →  {panel_w * 3}×{height_px}")

    # 3) TMJ
    layout = build_extended_tmj(src_dir / "map" / "06-final.tmj", dst_dir / "map" / "06-final.tmj")
    print(f"[TMJ ] 网格 {layout['grid_w']}×{layout['grid_h']}（每格 {layout['tile_w']}px）")

    # 4) world.json
    src_world = json.loads((src_dir / "config" / "world.json").read_text(encoding="utf-8"))

    tmj = json.loads((dst_dir / "map" / "06-final.tmj").read_text(encoding="utf-8"))
    collision_layer = next(l for l in tmj["layers"] if l["name"] == "collision")
    grid_w = tmj["width"]
    collision = [
        collision_layer["data"][y * grid_w:(y + 1) * grid_w] for y in range(tmj["height"])
    ]

    new_world = copy.deepcopy(src_world)
    new_world["worldName"] = f"{src_world.get('worldName', 'World')} · 三倍宽"
    new_world["worldSize"] = {
        "width": int((src_world.get("worldSize") or {}).get("width", panel_w)) * 3,
        "height": int((src_world.get("worldSize") or {}).get("height", height_px)),
        "tileSize": layout["tile_w"],
        "gridWidth": layout["grid_w"],
        "gridHeight": layout["grid_h"],
    }

    # 地点：main_area 不复制（它就是"所有非功能区可行走区"，天然横跨三块）
    locations = []
    for loc in src_world.get("locations", []):
        if loc.get("id") == "main_area":
            if loc.get("objects"):
                print("  ! 注意：原 main_area 的元素对象不会出现在左右两块里（仅中间保留）")
            locations.append(copy.deepcopy(loc))
            continue
        locations.append(copy_location(loc, "_w", "（西）"))
        locations.append(copy_location(loc, "", ""))
        locations.append(copy_location(loc, "_e", "（东）"))
    new_world["locations"] = locations

    # 主区点位：三份拷贝 + 两条接缝的桥接点
    points = src_world.get("mainAreaPoints", [])
    if points:
        new_points = []
        new_points += copy_points(points, "_w", "（西）", lambda x: panel_w - x)
        new_points += copy_points(points, "", "", lambda x: x + panel_w)
        new_points += copy_points(points, "_e", "（东）", lambda x: x + panel_w * 2)

        bridges = []
        bridges += add_seam_bridges(new_points, collision, layout["tile_w"], panel_w, "w", "中西")
        bridges += add_seam_bridges(new_points, collision, layout["tile_w"], panel_w * 2, "e", "中东")
        new_world["mainAreaPoints"] = new_points + bridges
    else:
        bridges = []
        print("  ! 原世界没有 mainAreaPoints，跳过点位复制")

    (dst_dir / "config" / "world.json").write_text(
        json.dumps(new_world, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"[配置] 地点 {len(new_world['locations'])} 个 | "
        f"点位 {len(new_world.get('mainAreaPoints', []))} 个（含 {len(bridges)} 个接缝桥接点）"
    )

    # 5) scene.json 里的世界名同步
    scene_path = dst_dir / "config" / "scene.json"
    if scene_path.exists():
        scene = json.loads(scene_path.read_text(encoding="utf-8"))
        if "worldName" in scene:
            scene["worldName"] = new_world["worldName"]
            scene_path.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\n完成 ✓  启动服务后在「世界」下拉里选择：{new_world['worldName']}")


if __name__ == "__main__":
    main()
