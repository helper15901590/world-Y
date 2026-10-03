import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { HELP_CONTENT } from "../../config/help-content";

/**
 * 「玩法说明」弹窗：分组列出游戏的主要玩法。
 * 内容来自 config/help-content.ts（按当前界面语言选择 zh / en）。
 * 由调用方放进 createPortal 渲染（与上帝面板等一致）。
 */
export function HelpModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || i18n.language || "zh").startsWith("en")
    ? "en"
    : "zh";
  const sections = HELP_CONTENT[lang];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4,6,14,0.72)",
        backdropFilter: "blur(2px)",
        zIndex: 4000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="custom-scrollbar"
        style={{
          width: "min(780px, 96vw)",
          maxHeight: "86vh",
          overflowY: "auto",
          background: "linear-gradient(180deg, rgba(17,21,38,0.99), rgba(12,15,28,0.99))",
          border: "1px solid rgba(116,185,255,0.28)",
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          padding: "18px 22px 20px",
          color: "#dfe6f2",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
            📖 {t("help.title")}
          </span>
          <button
            onClick={onClose}
            title={t("help.close")}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#e0e0e0",
              borderRadius: 999,
              padding: "4px 12px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {t("help.close")}
          </button>
        </div>

        {sections.map((section, si) => (
          <div key={si} style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span style={{ width: 3, height: 14, background: "rgba(116,185,255,0.75)", borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#8fd3ff" }}>{section.title}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 11 }}>
              {section.items.map((item, ii) => (
                <div key={ii} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.65, color: "#cfd6e4" }}>
                  <span style={{ color: "rgba(116,185,255,0.6)", flexShrink: 0 }}>•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 4, fontSize: 11, color: "#666", textAlign: "right" }}>
          {t("help.escHint")}
        </div>
      </div>
    </div>
  );
}
