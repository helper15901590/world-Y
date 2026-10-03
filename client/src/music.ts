/**
 * 背景音乐控制器（单例）。
 *
 * - 曲目：scripts/generate-bgm.py 生成的 16 秒循环（client/public/audio/bgm-light.wav）
 * - 浏览器禁止未经用户交互的自动播放：首次点击/按键时才开始播放
 * - 开关状态存在 localStorage，刷新后保持
 */

const BGM_SRC = "/audio/bgm-light.wav";
const STORAGE_KEY = "worldx:bgm";
const VOLUME = 0.32;

let audio: HTMLAudioElement | null = null;
let started = false;
let enabled = readEnabled();
const listeners = new Set<(on: boolean) => void>();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(BGM_SRC);
    audio.loop = true;
    audio.volume = VOLUME;
    audio.preload = "auto";
  }
  return audio;
}

function emit(): void {
  for (const fn of listeners) fn(enabled);
}

export function isMusicEnabled(): boolean {
  return enabled;
}

export function subscribeMusic(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function toggleMusic(): void {
  enabled = !enabled;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // 隐私模式下 localStorage 不可用，忽略
  }
  if (enabled) {
    started = true;
    void ensureAudio().play().catch(() => undefined);
  } else {
    audio?.pause();
  }
  emit();
}

/** 应用启动时调用：首次用户交互后开始播放（绕开浏览器自动播放限制） */
export function armMusicAutoStart(): void {
  if (!enabled || started) return;
  const start = () => {
    window.removeEventListener("pointerdown", start);
    window.removeEventListener("keydown", start);
    if (!enabled || started) return;
    started = true;
    void ensureAudio().play().catch(() => undefined);
  };
  window.addEventListener("pointerdown", start);
  window.addEventListener("keydown", start);
}
