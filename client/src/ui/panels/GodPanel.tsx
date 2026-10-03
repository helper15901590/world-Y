import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { apiClient, ApiError } from "../services/api-client";
import type { CharacterInfo, LocationInfo, EnvironmentLocationInfo } from "../../types/api";
import { EventBus } from "../../EventBus";

type TabKey = "broadcast" | "whisper" | "worldPrompt" | "createCharacter" | "deleteCharacter" | "environment" | "passwords";

const EMPTY_NEW_CHARACTER = {
  name: "",
  nickname: "",
  gender: "",
  age: "",
  department: "",
  position: "",
  jobTitle: "",
  appearanceHint: "",
  backstory: "",
  coreQuest: "",
};

/** 「创建角色」里的短文本字段（两列排列） */
const CREATE_SHORT_FIELDS: { key: keyof typeof EMPTY_NEW_CHARACTER; labelKey: string; phKey: string }[] = [
  { key: "nickname", labelKey: "god.charNickname", phKey: "charDetail.phNickname" },
  { key: "gender", labelKey: "god.charGender", phKey: "charDetail.phGender" },
  { key: "age", labelKey: "god.charAge", phKey: "charDetail.phAge" },
  { key: "department", labelKey: "god.charDepartment", phKey: "charDetail.phDepartment" },
  { key: "position", labelKey: "god.charPosition", phKey: "charDetail.phPosition" },
  { key: "jobTitle", labelKey: "god.charJobTitle", phKey: "charDetail.phJobTitle" },
];

const PRESET_CARD_KEYS = [
  { emoji: "☔", labelKey: "god.presetRain", contentKey: "god.presetRainContent", tone: "tense" },
  { emoji: "🔌", labelKey: "god.presetBlackout", contentKey: "god.presetBlackoutContent", tone: "eerie" },
  { emoji: "🚪", labelKey: "god.presetStranger", contentKey: "god.presetStrangerContent", tone: "mysterious" },
  { emoji: "📜", labelKey: "god.presetLetter", contentKey: "god.presetLetterContent", tone: "ominous" },
  { emoji: "🌪️", labelKey: "god.presetWind", contentKey: "god.presetWindContent", tone: "chaotic" },
  { emoji: "🐦", labelKey: "god.presetBirds", contentKey: "god.presetBirdsContent", tone: "eerie" },
];

export function GodPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>("broadcast");
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastBroadcastAt, setLastBroadcastAt] = useState<number | null>(null);

  const [broadcastContent, setBroadcastContent] = useState("");
  const [broadcastScope, setBroadcastScope] = useState("global");
  const [broadcastTone, setBroadcastTone] = useState("");

  const [whisperCharId, setWhisperCharId] = useState("");
  const [whisperContent, setWhisperContent] = useState("");
  const [whisperImportance, setWhisperImportance] = useState(8);
  const [whisperType, setWhisperType] = useState<"observation" | "dream" | "reflection" | "experience">("observation");

  // 「世界设定」标签页：发给大模型的世界名称/简介/背景提示词
  const [worldName, setWorldName] = useState("");
  const [worldDescription, setWorldDescription] = useState("");
  const [worldSocialContext, setWorldSocialContext] = useState("");
  const [worldPromptLoaded, setWorldPromptLoaded] = useState(false);

  useEffect(() => {
    apiClient
      .getWorldPrompt()
      .then((info) => {
        setWorldName(info.worldName ?? "");
        setWorldDescription(info.worldDescription ?? "");
        setWorldSocialContext(info.worldSocialContext ?? "");
        setWorldPromptLoaded(true);
      })
      .catch((err) => {
        console.warn("[GodPanel] load world prompt failed", err);
      });
  }, []);

  // 「创建角色」标签页
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [newChar, setNewChar] = useState({ ...EMPTY_NEW_CHARACTER });
  const [newCharLocation, setNewCharLocation] = useState("main_area");
  const [newCharSpriteSource, setNewCharSpriteSource] = useState("");

  // 「删除角色」标签页
  const [deleteCharId, setDeleteCharId] = useState("");
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  // 「角色密码」标签页
  const [passwords, setPasswords] = useState<Record<string, string>>({});

  // 「环境物品」标签页
  const [envLocations, setEnvLocations] = useState<EnvironmentLocationInfo[]>([]);
  const [envLocationId, setEnvLocationId] = useState("");
  const [locDraft, setLocDraft] = useState({ name: "", description: "" });
  const [objDrafts, setObjDrafts] = useState<
    Record<string, { name: string; state: string; stateDescription: string }>
  >({});

  useEffect(() => {
    apiClient
      .getCharacters()
      .then((list) => {
        setCharacters(list);
        if (list.length > 0) setWhisperCharId(list[0].id);
      })
      .catch((err) => {
        console.warn("[GodPanel] load characters failed", err);
      });
    apiClient
      .getLocations()
      .then(setLocations)
      .catch((err) => {
        console.warn("[GodPanel] load locations failed", err);
      });
    void loadEnvironment();
  }, []);

  // 环境数据或所选地点变化时，重置编辑草稿（保存后刷新即回到最新值）
  useEffect(() => {
    const loc = envLocations.find((l) => l.id === envLocationId);
    if (!loc) return;
    setLocDraft({ name: loc.name, description: loc.description });
    const drafts: Record<string, { name: string; state: string; stateDescription: string }> = {};
    for (const obj of loc.objects) {
      drafts[obj.id] = { name: obj.name, state: obj.state, stateDescription: obj.stateDescription };
    }
    setObjDrafts(drafts);
  }, [envLocationId, envLocations]);

  const recentlyBroadcasted = useMemo(() => {
    if (!lastBroadcastAt) return false;
    return Date.now() - lastBroadcastAt < 30_000;
  }, [lastBroadcastAt]);

  const showFlash = (kind: "ok" | "err", text: string) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), 3500);
  };

  const doBroadcast = async (content: string, tone?: string, scope?: string) => {
    if (busy) return;
    const trimmed = content.trim();
    if (!trimmed) {
      showFlash("err", t("god.emptyContent"));
      return;
    }
    setBusy(true);
    try {
      const resp = await apiClient.godBroadcast({
        content: trimmed,
        scope: scope || broadcastScope,
        tone: tone || broadcastTone || undefined,
      });
      showFlash("ok", t("god.broadcastSuccess", { count: resp.memoryWrittenTo }));
      setLastBroadcastAt(Date.now());
      setBroadcastContent("");
    } catch (err) {
      showFlash("err", t("god.failedPrefix", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const doWhisper = async () => {
    if (busy) return;
    if (!whisperCharId) {
      showFlash("err", t("god.selectCharError"));
      return;
    }
    const trimmed = whisperContent.trim();
    if (!trimmed) {
      showFlash("err", t("god.emptyContent"));
      return;
    }
    setBusy(true);
    try {
      await apiClient.godWhisper({
        characterId: whisperCharId,
        content: trimmed,
        importance: whisperImportance,
        type: whisperType,
      });
      const charName = characters.find((c) => c.id === whisperCharId)?.name ?? whisperCharId;
      showFlash("ok", t("god.whisperSuccess", { name: charName }));
      setWhisperContent("");
    } catch (err) {
      showFlash("err", t("god.failedPrefix", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const doSaveWorldPrompt = async () => {
    if (busy) return;
    if (!worldName.trim()) {
      showFlash("err", t("god.worldNameRequired"));
      return;
    }
    setBusy(true);
    try {
      const resp = await apiClient.updateWorldPrompt({
        worldName: worldName.trim(),
        worldDescription: worldDescription.trim(),
        worldSocialContext: worldSocialContext.trim(),
      });
      // 名称可能被服务端规范化，用返回值校正输入框
      setWorldName(resp.worldName);
      showFlash(
        "ok",
        resp.persisted ? t("god.worldPromptSaved") : t("god.worldPromptSavedNoPersist"),
      );
    } catch (err) {
      showFlash("err", t("god.failedPrefix", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const doCreateCharacter = async () => {
    if (busy) return;
    if (!newChar.name.trim()) {
      showFlash("err", t("god.charNameRequired"));
      return;
    }
    // 姓名查重（服务端还会再查一次，这里先给出即时反馈）
    const duplicate = characters.find(
      (c) => c.name.trim().toLowerCase() === newChar.name.trim().toLowerCase(),
    );
    if (duplicate) {
      showFlash("err", t("god.charNameTaken"));
      return;
    }
    setBusy(true);
    try {
      const resp = await apiClient.createCharacter({
        name: newChar.name.trim(),
        nickname: newChar.nickname.trim() || undefined,
        appearanceHint: newChar.appearanceHint.trim() || undefined,
        gender: newChar.gender.trim() || undefined,
        age: newChar.age.trim() || undefined,
        department: newChar.department.trim() || undefined,
        position: newChar.position.trim() || undefined,
        jobTitle: newChar.jobTitle.trim() || undefined,
        backstory: newChar.backstory.trim() || undefined,
        startPosition: newCharLocation,
        spriteSourceId: newCharSpriteSource || undefined,
        coreQuest: newChar.coreQuest.trim() || undefined,
      });
      showFlash("ok", t("god.charCreated", { name: resp.character.name }));
      setNewChar({ ...EMPTY_NEW_CHARACTER });
      // 刷新各面板的角色列表 + 让地图加载新角色的立绘
      EventBus.instance.emit("characters_changed");
      EventBus.instance.emit("character_created", {
        id: resp.character.id,
        hasSprite: resp.character.hasSprite,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      showFlash(
        "err",
        (err instanceof ApiError && err.code === "NAME_TAKEN") || raw.includes("already exists")
          ? t("god.charNameTaken")
          : t("god.failedPrefix", { error: raw }),
      );
    } finally {
      setBusy(false);
    }
  };

  const doDeleteCharacter = async () => {
    if (busy || !deleteCharId) return;
    const target = characters.find((c) => c.id === deleteCharId);
    setBusy(true);
    try {
      await apiClient.deleteCharacter(deleteCharId);
      showFlash("ok", t("god.charDeleted", { name: target?.name ?? deleteCharId }));
      EventBus.instance.emit("character_deleted", { id: deleteCharId });
      EventBus.instance.emit("characters_changed");
      setDeleteCharId("");
      setDeleteConfirming(false);
      apiClient
        .getCharacters()
        .then(setCharacters)
        .catch((err) => console.warn("[GodPanel] refresh characters failed", err));
    } catch (err) {
      showFlash("err", t("god.failedPrefix", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const loadEnvironment = async () => {
    try {
      const resp = await apiClient.getEnvironment();
      setEnvLocations(resp.locations);
      setEnvLocationId((prev) =>
        prev && resp.locations.some((l) => l.id === prev) ? prev : (resp.locations[0]?.id ?? ""),
      );
    } catch (err) {
      console.warn("[GodPanel] load environment failed", err);
    }
  };

  const saveLocationMeta = async () => {
    if (busy || !envLocationId || !locDraft.name.trim()) return;
    setBusy(true);
    try {
      await apiClient.updateEnvironmentLocation(envLocationId, {
        name: locDraft.name.trim(),
        description: locDraft.description.trim(),
      });
      showFlash("ok", t("god.envLocationSaved"));
      await loadEnvironment();
    } catch (err) {
      showFlash("err", t("god.failedPrefix", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const saveObjectMeta = async (objectId: string) => {
    const draft = objDrafts[objectId];
    if (busy || !draft || !draft.name.trim() || !draft.state.trim()) return;
    setBusy(true);
    try {
      await apiClient.updateEnvironmentObject(objectId, {
        name: draft.name.trim(),
        state: draft.state.trim(),
        stateDescription: draft.stateDescription.trim(),
      });
      showFlash("ok", t("god.envObjectSaved"));
      await loadEnvironment();
    } catch (err) {
      showFlash("err", t("god.failedPrefix", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  // 「角色密码」标签页
  const loadPasswords = async () => {
    try {
      const entries = await Promise.all(
        characters.map(async (c) => {
          try {
            const r = await apiClient.getCharacterEditPassword(c.id);
            return [c.id, r.editPassword ?? ""] as const;
          } catch {
            return [c.id, ""] as const;
          }
        }),
      );
      setPasswords(Object.fromEntries(entries));
    } catch (err) {
      console.warn("[GodPanel] load passwords failed", err);
    }
  };

  useEffect(() => {
    if (tab === "passwords") void loadPasswords();
    // characters 数量变化（新建/删除角色）时重新拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, characters.length]);

  const copyPassword = async (charId: string) => {
    const password = passwords[charId];
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      showFlash("ok", t("god.passwordCopied"));
    } catch {
      showFlash("err", t("god.passwordCopyFailed"));
    }
  };

  const regeneratePassword = async (charId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiClient.regenerateCharacterEditPassword(charId);
      setPasswords((prev) => ({ ...prev, [charId]: r.editPassword }));
      showFlash("ok", t("god.passwordRegenerated"));
    } catch (err) {
      showFlash("err", t("god.failedPrefix", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>👁️</span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{t("god.title")}</span>
            <span style={{ opacity: 0.55, fontSize: 11 }}>
              {t("god.subtitle")}
            </span>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>×</button>
        </div>

        <div style={tabsStyle}>
          {(["broadcast", "whisper", "worldPrompt", "createCharacter", "deleteCharacter", "environment", "passwords"] as TabKey[]).map((key) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setDeleteConfirming(false);
              }}
              style={tabBtnStyle(tab === key)}
            >
              {key === "broadcast"
                ? t("god.tabBroadcast")
                : key === "whisper"
                  ? t("god.tabWhisper")
                  : key === "worldPrompt"
                    ? t("god.tabWorldPrompt")
                    : key === "createCharacter"
                      ? t("god.tabCreateCharacter")
                      : key === "deleteCharacter"
                        ? t("god.tabDeleteCharacter")
                        : key === "environment"
                          ? t("god.tabEnvironment")
                          : t("god.tabPasswords")}
            </button>
          ))}
        </div>

        <div style={bodyStyle}>
          {tab === "broadcast" && (
            <div style={sectionStyle}>
              <label style={labelStyle}>{t("god.broadcastContent")}</label>
              <textarea
                value={broadcastContent}
                onChange={(e) => setBroadcastContent(e.target.value)}
                placeholder={t("god.broadcastPlaceholder")}
                rows={4}
                style={textareaStyle}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{t("god.scopeLabel")}</span>
                  <select
                    value={broadcastScope}
                    onChange={(e) => setBroadcastScope(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="global">{t("god.scopeGlobal")}</option>
                    <option value="main_area">main_area</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{t("god.toneLabel")}</span>
                  <input
                    type="text"
                    value={broadcastTone}
                    onChange={(e) => setBroadcastTone(e.target.value)}
                    placeholder={t("god.tonePlaceholder")}
                    style={{ ...inputStyle, width: 180 }}
                  />
                </div>
              </div>
              <button
                onClick={() => doBroadcast(broadcastContent)}
                disabled={busy}
                style={primaryBtnStyle(busy)}
              >
                {busy ? t("god.sending") : t("god.broadcast")}
              </button>

              <div style={presetDividerStyle}>
                <span style={{ fontSize: 11, opacity: 0.5 }}>{t("god.disasterCards")}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {PRESET_CARD_KEYS.map((card) => (
                  <button
                    key={card.labelKey}
                    disabled={busy}
                    onClick={() => doBroadcast(t(card.contentKey), card.tone)}
                    style={presetCardStyle(busy)}
                  >
                    <div style={{ fontSize: 18 }}>{card.emoji}</div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{t(card.labelKey)}</div>
                    <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>{t(card.contentKey)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "whisper" && (
            <div style={sectionStyle}>
              <label style={labelStyle}>{t("god.whisperTarget")}</label>
              <select
                value={whisperCharId}
                onChange={(e) => setWhisperCharId(e.target.value)}
                style={selectStyle}
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{c.id}）
                  </option>
                ))}
              </select>
              <label style={labelStyle}>{t("god.whisperContentLabel")}</label>
              <textarea
                value={whisperContent}
                onChange={(e) => setWhisperContent(e.target.value)}
                placeholder={t("god.whisperPlaceholder")}
                rows={4}
                style={textareaStyle}
              />
              <div style={{ fontSize: 10, opacity: 0.45, marginTop: -4 }}>
                {t("god.whisperHint")}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{t("god.importanceLabel")}</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={whisperImportance}
                    onChange={(e) => setWhisperImportance(Number(e.target.value))}
                  />
                  <span style={{ fontSize: 11, minWidth: 16, textAlign: "right" }}>{whisperImportance}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{t("god.typeLabel")}</span>
                  <select
                    value={whisperType}
                    onChange={(e) => setWhisperType(e.target.value as typeof whisperType)}
                    style={selectStyle}
                  >
                    <option value="observation">{t("god.typeObservation")}</option>
                    <option value="dream">{t("god.typeDream")}</option>
                    <option value="reflection">{t("god.typeReflection")}</option>
                    <option value="experience">{t("god.typeExperience")}</option>
                  </select>
                </div>
              </div>
              <button onClick={doWhisper} disabled={busy} style={primaryBtnStyle(busy)}>
                {busy ? t("god.implanting") : t("god.implant")}
              </button>
            </div>
          )}

          {tab === "worldPrompt" && (
            <div style={sectionStyle}>
              <label style={labelStyle}>{t("god.worldNameLabel")}</label>
              <input
                type="text"
                value={worldName}
                onChange={(e) => setWorldName(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
              />

              <label style={labelStyle}>{t("god.worldDescriptionLabel")}</label>
              <textarea
                value={worldDescription}
                onChange={(e) => setWorldDescription(e.target.value)}
                rows={3}
                style={textareaStyle}
              />

              <label style={labelStyle}>{t("god.worldPromptLabel")}</label>
              <textarea
                value={worldSocialContext}
                onChange={(e) => setWorldSocialContext(e.target.value)}
                placeholder={t("god.worldPromptPlaceholder")}
                rows={7}
                style={textareaStyle}
              />
              <div style={{ fontSize: 10, opacity: 0.45, marginTop: -4 }}>
                {t("god.worldPromptHint")}
              </div>

              <button
                onClick={doSaveWorldPrompt}
                disabled={busy || !worldPromptLoaded}
                style={primaryBtnStyle(busy || !worldPromptLoaded)}
              >
                {busy ? t("god.saving") : t("god.saveWorldPrompt")}
              </button>
            </div>
          )}

          {tab === "createCharacter" && (
            <div style={sectionStyle}>
              <label style={labelStyle}>{t("god.charQuest")}</label>
              <textarea
                value={newChar.coreQuest}
                onChange={(e) => setNewChar({ ...newChar, coreQuest: e.target.value })}
                placeholder={t("god.charQuestPlaceholder")}
                rows={2}
                style={textareaStyle}
              />

              <label style={labelStyle}>{t("god.charName")}</label>
              <input
                type="text"
                value={newChar.name}
                onChange={(e) => setNewChar({ ...newChar, name: e.target.value })}
                placeholder={t("god.charNamePlaceholder")}
                style={{ ...inputStyle, width: "100%" }}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {CREATE_SHORT_FIELDS.map((f) => (
                  <label key={f.key} style={{ ...labelStyle, gap: 4 }}>
                    {t(f.labelKey)}
                    <input
                      type="text"
                      value={newChar[f.key]}
                      onChange={(e) => setNewChar({ ...newChar, [f.key]: e.target.value })}
                      placeholder={t(f.phKey)}
                      style={{ ...inputStyle, width: "100%" }}
                    />
                  </label>
                ))}
              </div>

              <label style={labelStyle}>{t("god.charAppearance")}</label>
              <textarea
                value={newChar.appearanceHint}
                onChange={(e) => setNewChar({ ...newChar, appearanceHint: e.target.value })}
                placeholder={t("charDetail.phAppearanceHint")}
                rows={2}
                style={textareaStyle}
              />

              <label style={labelStyle}>{t("god.charBackstory")}</label>
              <textarea
                value={newChar.backstory}
                onChange={(e) => setNewChar({ ...newChar, backstory: e.target.value })}
                placeholder={t("charDetail.phBackstory")}
                rows={3}
                style={textareaStyle}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ ...labelStyle, gap: 4 }}>
                  {t("god.charStartPosition")}
                  <select
                    value={newCharLocation}
                    onChange={(e) => setNewCharLocation(e.target.value)}
                    style={selectStyle}
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ ...labelStyle, gap: 4 }}>
                  {t("god.charSpriteSource")}
                  <select
                    value={newCharSpriteSource}
                    onChange={(e) => setNewCharSpriteSource(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">{t("god.charSpriteNone")}</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ fontSize: 10, opacity: 0.45, marginTop: -4 }}>
                {t("god.charSpriteHint")}
              </div>

              <button onClick={doCreateCharacter} disabled={busy} style={primaryBtnStyle(busy)}>
                {busy ? t("god.creating") : t("god.createCharacter")}
              </button>
            </div>
          )}

          {tab === "deleteCharacter" && (
            <div style={sectionStyle}>
              <label style={labelStyle}>{t("god.deleteCharLabel")}</label>
              <select
                value={deleteCharId}
                onChange={(e) => {
                  setDeleteCharId(e.target.value);
                  setDeleteConfirming(false);
                }}
                style={selectStyle}
              >
                <option value="">{t("god.deleteCharPlaceholder")}</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{c.id}）
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 10, opacity: 0.5 }}>{t("god.deleteCharHint")}</div>

              {deleteConfirming && (
                <div style={dangerBoxStyle}>
                  {t("god.deleteCharConfirm", {
                    name: characters.find((c) => c.id === deleteCharId)?.name ?? deleteCharId,
                  })}
                </div>
              )}

              {deleteConfirming ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={doDeleteCharacter} disabled={busy} style={dangerBtnStyle(busy)}>
                    {busy ? t("god.deleting") : t("god.confirmDelete")}
                  </button>
                  <button
                    onClick={() => setDeleteConfirming(false)}
                    disabled={busy}
                    style={cancelBtnStyle}
                  >
                    {t("god.cancel")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirming(true)}
                  disabled={busy || !deleteCharId}
                  style={dangerBtnStyle(busy || !deleteCharId)}
                >
                  {t("god.deleteCharacter")}
                </button>
              )}
            </div>
          )}

          {tab === "environment" && (
            <div style={sectionStyle}>
              <label style={labelStyle}>{t("god.envLocationLabel")}</label>
              <select
                value={envLocationId}
                onChange={(e) => setEnvLocationId(e.target.value)}
                style={selectStyle}
              >
                {envLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>

              <label style={labelStyle}>{t("god.envLocationName")}</label>
              <input
                type="text"
                value={locDraft.name}
                onChange={(e) => setLocDraft({ ...locDraft, name: e.target.value })}
                style={{ ...inputStyle, width: "100%" }}
              />

              <label style={labelStyle}>{t("god.envLocationDesc")}</label>
              <textarea
                value={locDraft.description}
                onChange={(e) => setLocDraft({ ...locDraft, description: e.target.value })}
                rows={3}
                style={textareaStyle}
              />
              <button onClick={saveLocationMeta} disabled={busy} style={primaryBtnStyle(busy)}>
                {busy ? t("god.saving") : t("god.envSaveLocation")}
              </button>

              <div style={presetDividerStyle}>
                <span style={{ fontSize: 11, opacity: 0.5 }}>{t("god.envObjectsTitle")}</span>
              </div>

              {(envLocations.find((l) => l.id === envLocationId)?.objects ?? []).length === 0 && (
                <div style={{ fontSize: 11, opacity: 0.5 }}>{t("god.envNoObjects")}</div>
              )}

              {(envLocations.find((l) => l.id === envLocationId)?.objects ?? []).map((obj) => {
                const draft = objDrafts[obj.id] ?? {
                  name: obj.name,
                  state: obj.state,
                  stateDescription: obj.stateDescription,
                };
                return (
                  <div key={obj.id} style={objectCardStyle}>
                    <div style={{ fontSize: 10, opacity: 0.5 }}>
                      {obj.id} · {t("god.envCapacity")}: {obj.capacity} · {t("god.envUsers")}:{" "}
                      {obj.currentUsers.length}
                    </div>
                    <label style={{ ...labelStyle, gap: 4 }}>
                      {t("god.envObjectName")}
                      <input
                        type="text"
                        value={draft.name}
                        onChange={(e) =>
                          setObjDrafts({ ...objDrafts, [obj.id]: { ...draft, name: e.target.value } })
                        }
                        style={{ ...inputStyle, width: "100%" }}
                      />
                    </label>
                    <label style={{ ...labelStyle, gap: 4 }}>
                      {t("god.envObjectState")}
                      <input
                        type="text"
                        value={draft.state}
                        onChange={(e) =>
                          setObjDrafts({ ...objDrafts, [obj.id]: { ...draft, state: e.target.value } })
                        }
                        style={{ ...inputStyle, width: "100%" }}
                      />
                    </label>
                    <label style={{ ...labelStyle, gap: 4 }}>
                      {t("god.envObjectStateDesc")}
                      <input
                        type="text"
                        value={draft.stateDescription}
                        onChange={(e) =>
                          setObjDrafts({
                            ...objDrafts,
                            [obj.id]: { ...draft, stateDescription: e.target.value },
                          })
                        }
                        style={{ ...inputStyle, width: "100%" }}
                      />
                    </label>
                    <button
                      onClick={() => saveObjectMeta(obj.id)}
                      disabled={busy}
                      style={primaryBtnStyle(busy)}
                    >
                      {busy ? t("god.saving") : t("god.envSaveObject")}
                    </button>
                  </div>
                );
              })}

              <div style={{ fontSize: 10, opacity: 0.45 }}>{t("god.envHint")}</div>
            </div>
          )}

          {tab === "passwords" && (
            <div style={sectionStyle}>
              <div style={{ fontSize: 10, opacity: 0.5 }}>{t("god.passwordHint")}</div>
              {characters.map((c) => (
                <div key={c.id} style={objectCardStyle}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                    <span style={{ fontSize: 10, opacity: 0.45 }}>{c.id}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <code
                      style={{
                        flex: 1,
                        fontFamily: "monospace",
                        fontSize: 13,
                        letterSpacing: 1,
                        background: "rgba(255,255,255,0.06)",
                        padding: "4px 8px",
                        borderRadius: 4,
                      }}
                    >
                      {passwords[c.id] || "…"}
                    </code>
                    <button
                      onClick={() => copyPassword(c.id)}
                      disabled={!passwords[c.id]}
                      style={smallBtnStyle}
                    >
                      {t("god.copy")}
                    </button>
                    <button
                      onClick={() => regeneratePassword(c.id)}
                      disabled={busy}
                      style={smallBtnStyle}
                    >
                      {t("god.regenerate")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {flash && (
          <div
            style={{
              ...flashStyle,
              background: flash.kind === "ok" ? "rgba(0,184,148,0.18)" : "rgba(231,76,60,0.22)",
              color: flash.kind === "ok" ? "#8df3cf" : "#ffb0b0",
              border: `1px solid ${flash.kind === "ok" ? "rgba(0,184,148,0.45)" : "rgba(231,76,60,0.45)"}`,
            }}
          >
            {flash.text}
          </div>
        )}
      </div>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  top: "var(--top-ui-offset, 0px)",
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(4,6,12,0.55)",
  zIndex: 500,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "0 16px 16px",
  overflowY: "auto",
};

const panelStyle: CSSProperties = {
  width: "min(560px, calc(100% - 32px))",
  maxHeight: "calc(100vh - var(--top-ui-offset, 0px) - 16px)",
  background: "linear-gradient(180deg, rgba(16,20,36,0.98), rgba(12,14,26,0.98))",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 14,
  boxShadow: "0 28px 70px rgba(0,0,0,0.55)",
  color: "#e0e0e0",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const headerStyle: CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const closeBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#e0e0e0",
  fontSize: 22,
  cursor: "pointer",
  lineHeight: 1,
  padding: 0,
  width: 28,
  height: 28,
  opacity: 0.7,
};

const tabsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  padding: "10px 14px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const bodyStyle: CSSProperties = {
  padding: 14,
  overflowY: "auto",
};

const dangerBoxStyle: CSSProperties = {
  padding: "8px 10px",
  background: "rgba(231,76,60,0.14)",
  border: "1px solid rgba(231,76,60,0.4)",
  borderRadius: 6,
  fontSize: 11,
  lineHeight: 1.5,
  color: "#ffb0b0",
};

function dangerBtnStyle(disabled: boolean): CSSProperties {
  return {
    background: disabled ? "rgba(231,76,60,0.08)" : "rgba(231,76,60,0.22)",
    border: "1px solid rgba(231,76,60,0.5)",
    color: disabled ? "rgba(255,176,176,0.5)" : "#ffd9d9",
    borderRadius: 6,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const cancelBtnStyle: CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#ccc",
  borderRadius: 6,
  padding: "6px 14px",
  fontSize: 12,
  cursor: "pointer",
};

const objectCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  background: "rgba(255,255,255,0.03)",
};

const smallBtnStyle: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "#ddd",
  borderRadius: 4,
  padding: "3px 10px",
  fontSize: 11,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  opacity: 0.75,
  letterSpacing: 0.2,
};

const textareaStyle: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "#e8e8ea",
  padding: "8px 10px",
  fontSize: 13,
  resize: "vertical",
  fontFamily: "inherit",
};

const inputStyle: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  color: "#e8e8ea",
  padding: "4px 8px",
  fontSize: 12,
};

const selectStyle: CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 6,
  color: "#e8e8ea",
  padding: "4px 8px",
  fontSize: 12,
};

const presetDividerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginTop: 6,
};

const flashStyle: CSSProperties = {
  margin: "0 14px 14px",
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: 12,
};

function tabBtnStyle(active: boolean): CSSProperties {
  return {
    background: active ? "rgba(116,185,255,0.18)" : "rgba(255,255,255,0.04)",
    border: `1px solid ${active ? "rgba(116,185,255,0.45)" : "rgba(255,255,255,0.1)"}`,
    color: active ? "#dff3ff" : "#e0e0e0",
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 12,
    cursor: "pointer",
  };
}

function primaryBtnStyle(busy: boolean): CSSProperties {
  return {
    background: busy ? "rgba(116,185,255,0.1)" : "rgba(116,185,255,0.22)",
    border: "1px solid rgba(116,185,255,0.5)",
    color: "#eaf5ff",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: busy ? "wait" : "pointer",
    alignSelf: "flex-start",
  };
}

function presetCardStyle(busy: boolean): CSSProperties {
  return {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#e0e0e0",
    textAlign: "left",
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
    transition: "all 0.15s",
  };
}
