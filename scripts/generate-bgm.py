#!/usr/bin/env python3
"""
生成一段轻松活泼的背景音乐循环（8-bit / chiptune 风格），输出 WAV。

- 调性：C 大调，和声进行 I–V–vi–IV（明亮、经典）
- 速度：120 BPM，8 小节 ≈ 16 秒，首尾可无缝循环
- 声部：方波主旋律 + 三角波贝斯 + 弦垫 + 轻打击
- 依赖：numpy（pip install numpy）

用法：python scripts/generate-bgm.py [-o client/public/audio/bgm-light.wav]
"""

import argparse
import struct
import sys
import wave
from pathlib import Path

import numpy as np

# Windows 控制台默认 cp936/cp950，打印中文会报错；统一切到 UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

RATE = 22050
BPM = 120
BEAT = 60.0 / BPM          # 0.5s
BAR = BEAT * 4             # 2.0s
BARS = 8
DURATION = BAR * BARS

NOTES = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6,
         "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def freq(note: str) -> float:
    """'E4' -> 频率"""
    name, octave = note[:-1], int(note[-1])
    midi = 12 * (octave + 1) + NOTES[name]
    return 440.0 * 2 ** ((midi - 69) / 12)


def env(n: int, attack=0.008, decay=0.09, sustain=0.55, release=0.12) -> np.ndarray:
    """简单 ADSR 包络（采样点数按 n 计算）"""
    a = max(1, int(attack * RATE))
    d = max(1, int(decay * RATE))
    r = max(1, int(release * RATE))
    s = max(1, n - a - d - r)
    return np.concatenate([
        np.linspace(0, 1, a),
        np.linspace(1, sustain, d),
        np.full(s, sustain),
        np.linspace(sustain, 0, r),
    ])[:n]


def square(f: float, dur: float, duty=0.5, vol=0.3) -> np.ndarray:
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    wave_ = np.where((t * f) % 1.0 < duty, 1.0, -1.0)
    return wave_ * env(n) * vol


def triangle(f: float, dur: float, vol=0.3) -> np.ndarray:
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    wave_ = 2 * np.abs(2 * ((t * f) % 1.0) - 1) - 1
    return wave_ * env(n, attack=0.01, decay=0.12, sustain=0.5, release=0.15) * vol


def pad(f: float, dur: float, vol=0.12) -> np.ndarray:
    """柔和的弦垫：正弦 + 一点二次谐波"""
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    wave_ = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
    return wave_ * env(n, attack=0.05, decay=0.2, sustain=0.6, release=0.3) * vol


def kick(dur=0.12, vol=0.35) -> np.ndarray:
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    return np.sin(2 * np.pi * (110 * np.exp(-t * 22)) * t) * np.exp(-t * 18) * vol


def hat(dur=0.05, vol=0.09) -> np.ndarray:
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    rng = np.random.default_rng(7)
    return rng.uniform(-1, 1, n) * np.exp(-t * 90) * vol


def add(track: np.ndarray, sound: np.ndarray, at: float) -> None:
    i = int(at * RATE)
    j = min(len(track), i + len(sound))
    if i < len(track):
        track[i:j] += sound[: j - i]


# 和声：每小节一个和弦（I–V–vi–IV，重复两遍）
CHORDS = [
    ("C", ["C4", "E4", "G4"]), ("G", ["B3", "D4", "G4"]),
    ("Am", ["A3", "C4", "E4"]), ("F", ["A3", "C4", "F4"]),
    ("C", ["C4", "E4", "G4"]), ("G", ["B3", "D4", "G4"]),
    ("Am", ["A3", "C4", "E4"]), ("F", ["A3", "C4", "F4"]),
]
BASS = ["C3", "G2", "A2", "F2", "C3", "G2", "A2", "F2"]

# 主旋律：每小节 4 组八分音符（"-" 表示休止）
MELODY = [
    ["E4", "G4", "E4", "D4", "C4", "D4", "E4", "-"],
    ["D4", "B3", "D4", "G4", "E4", "D4", "B3", "-"],
    ["C4", "E4", "A4", "G4", "E4", "C4", "D4", "E4"],
    ["F4", "A4", "G4", "F4", "E4", "D4", "C4", "-"],
    ["E4", "G4", "A4", "G4", "E4", "D4", "E4", "-"],
    ["G4", "B4", "D5", "B4", "G4", "E4", "D4", "-"],
    ["E4", "C4", "A4", "G4", "E4", "D4", "C4", "D4"],
    ["E4", "F4", "G4", "A4", "C5", "-", "-", "-"],
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("-o", "--out", default="client/public/audio/bgm-light.wav")
    args = parser.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    track = np.zeros(int(DURATION * RATE))

    for bar, ((_, notes), bass, mel) in enumerate(zip(CHORDS, BASS, MELODY)):
        start = bar * BAR
        # 贝斯：第 1、3 拍
        add(track, triangle(freq(bass), BEAT * 0.9, vol=0.42), start)
        add(track, triangle(freq(bass), BEAT * 0.9, vol=0.34), start + BEAT * 2)
        # 弦垫：整小节
        for note in notes:
            add(track, pad(freq(note), BAR * 0.95), start)
        # 主旋律：八分音符
        for i, note in enumerate(mel):
            if note == "-":
                continue
            add(track, square(freq(note), BEAT * 0.46, duty=0.5, vol=0.22), start + i * BEAT / 2)
        # 打击：底鼓 1/3 拍，踩镲每个八分音符
        add(track, kick(), start)
        add(track, kick(vol=0.28), start + BEAT * 2)
        for i in range(8):
            add(track, hat(vol=0.055 if i % 2 else 0.09), start + i * BEAT / 2)

    # 归一化 + 收尾淡出（保证循环点无爆音）
    track = np.tanh(track * 1.1)                    # 轻微软削波，避免叠加爆音
    track = track / max(1e-9, np.max(np.abs(track))) * 0.85
    tail = int(0.04 * RATE)
    track[-tail:] *= np.linspace(1, 0.55, tail)     # 尾巴略收，接回开头更自然

    pcm = (track * 32767).astype("<i2")
    with wave.open(str(out_path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(pcm.tobytes())

    size_kb = out_path.stat().st_size / 1024
    print(f"已生成: {out_path} | {DURATION:.1f}s | {RATE}Hz 单声道 | {size_kb:.0f} KB")


if __name__ == "__main__":
    sys.exit(main())
