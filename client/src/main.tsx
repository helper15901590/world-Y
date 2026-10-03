import "./i18n";
import Phaser from "phaser";
import { createRoot } from "react-dom/client";
import { BootScene } from "./scenes/BootScene";
import { WorldScene } from "./scenes/WorldScene";
import { App } from "./ui/App";
import { EventBus } from "./EventBus";
import { armMusicAutoStart } from "./music";

// 背景音乐：首次点击/按键后自动开始（浏览器不允许未经交互的自动播放）
armMusicAutoStart();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: "game-root",
  transparent: true,
  render: { antialias: true, roundPixels: false },
  scale: { mode: Phaser.Scale.RESIZE },
  scene: [BootScene, WorldScene],
});

const uiRoot = document.getElementById("ui-root")!;
createRoot(uiRoot).render(<App eventBus={EventBus.instance} />);
