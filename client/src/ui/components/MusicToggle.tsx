import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CSSProperties } from "react";
import { isMusicEnabled, subscribeMusic, toggleMusic } from "../../music";

/** 背景音乐开关（在工具栏的锁定/解锁两种状态下都会显示） */
export function MusicToggle({ style }: { style?: CSSProperties }) {
  const { t } = useTranslation();
  const [on, setOn] = useState(isMusicEnabled);

  useEffect(() => subscribeMusic(setOn), []);

  return (
    <button
      onClick={toggleMusic}
      title={on ? t("music.on") : t("music.off")}
      aria-label={on ? t("music.on") : t("music.off")}
      style={{
        background: on ? "rgba(116,185,255,0.16)" : "rgba(255,255,255,0.08)",
        border: `1px solid ${on ? "rgba(116,185,255,0.4)" : "rgba(255,255,255,0.18)"}`,
        color: "#dbe4ff",
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 13,
        lineHeight: 1,
        cursor: "pointer",
        transition: "all 0.15s",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {on ? "🔊" : "🔇"}
    </button>
  );
}
