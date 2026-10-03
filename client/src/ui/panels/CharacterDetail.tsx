import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { apiClient, ApiError } from "../services/api-client";
import type {
  CharacterDetail as CharDetailType,
  MemoryEntry,
  SimulationEvent,
  CharacterInfo,
  LocationInfo,
  EnvironmentLocationInfo,
} from "../../types/api";
import {
  buildCharacterNameMap,
  buildLocationNameMap,
  formatActionName,
  formatEventSummary,
  formatEventType,
} from "../utils/event-format";
import { CharacterAvatar } from "../components/CharacterAvatar";
import { useDialogueStyle } from "../hooks/useDialogueStyle";
import { EventBus } from "../../EventBus";

type Tab = "history" | "memory" | "plan";
type DialogueTurnRecord = {
  kind: "dialogue_turn";
  key: string;
  gameDay: number;
  gameTick: number;
  timeString?: string;
  createdAt?: string;
  sortIndex: number;
  event: SimulationEvent;
  conversationId: string;
  turnIndex: number;
  speakerId: string;
  listenerId?: string;
  content: string;
  innerMonologue?: string;
};

type EventRecord = {
  kind: "event";
  key: string;
  gameDay: number;
  gameTick: number;
  timeString?: string;
  createdAt?: string;
  sortIndex: number;
  event: SimulationEvent;
};

type HistoryRecord = DialogueTurnRecord | EventRecord;

export function CharacterDetail({
  charId,
  followedCharId,
  onToggleFollow,
  characters,
  liveEvents,
}: {
  charId: string;
  followedCharId: string | null;
  onToggleFollow: (id: string) => void;
  characters: CharacterInfo[];
  liveEvents: SimulationEvent[];
}) {
  const [detail, setDetail] = useState<CharDetailType | null>(null);
  const [tab, setTab] = useState<Tab>("history");
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [storedEvents, setStoredEvents] = useState<SimulationEvent[]>([]);

  useEffect(() => {
    apiClient.getCharacterDetail(charId).then(setDetail).catch(console.warn);
  }, [charId]);

  useEffect(() => {
    apiClient.getLocations().then(setLocations).catch(console.warn);
  }, []);

  // 锚定选项：地点 + 可交互物件（来自 /world/environment）
  const [envLocations, setEnvLocations] = useState<EnvironmentLocationInfo[]>([]);
  useEffect(() => {
    apiClient
      .getEnvironment()
      .then((resp) => setEnvLocations(resp.locations))
      .catch((err) => console.warn("[CharacterDetail] load environment failed", err));
  }, []);

  useEffect(() => {
    if (tab === "history") apiClient.getEvents({}).then(setStoredEvents).catch(console.warn);
    if (tab === "memory") apiClient.getMemories(charId).then(setMemories).catch(console.warn);
  }, [charId, tab]);
  const characterNames = useMemo(() => buildCharacterNameMap(characters), [characters]);
  const locationNames = useMemo(() => buildLocationNameMap(locations), [locations]);
  const mergedHistory = useMemo(() => {
    const merged = new Map<string, SimulationEvent>();
    const liveEventsOldToNew = [...liveEvents].reverse();
    [...storedEvents, ...liveEventsOldToNew].forEach((event, index) => {
      if (!eventTouchesCharacter(event, charId)) return;
      merged.set(event.id || `${event.type}-${event.gameDay}-${event.gameTick}-${index}`, event);
    });
    return buildHistoryRecords(Array.from(merged.values()));
  }, [charId, liveEvents, storedEvents]);

  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [editBusy, setEditBusy] = useState(false);
  const [editFlash, setEditFlash] = useState<string | null>(null);
  // 「改人设」的密码闸门：未通过校验时不显示任何人设参数
  const [gateOpen, setGateOpen] = useState(false);
  const [gatePassword, setGatePassword] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const { t } = useTranslation();

  // 切换角色时关闭编辑器与闸门，避免用上一个角色的草稿编辑新角色
  useEffect(() => {
    setEditing(false);
    setGateOpen(false);
    setGateError(null);
    setGatePassword("");
  }, [charId]);

  const imStyle = useDialogueStyle() === "im";

  const anchorOptions = useMemo<ProfileFieldOption[]>(() => {
    const options: ProfileFieldOption[] = [
      { value: "", label: t("charDetail.anchorNone") },
    ];
    for (const loc of envLocations) {
      options.push({
        value: `region:${loc.id}`,
        label: loc.name,
        group: t("charDetail.anchorGroupRegion"),
      });
    }
    for (const loc of envLocations) {
      for (const obj of loc.objects) {
        options.push({
          value: `element:${obj.id}`,
          label: `${obj.name}（${loc.name}）`,
          group: t("charDetail.anchorGroupElement"),
        });
      }
    }
    return options;
  }, [envLocations, t]);

  if (!detail) return null;

  const { profile, state, emotionLabel } = detail;
  const isFollowing = followedCharId === charId;

  const beginEditing = (verifiedPassword: string) => {
    setEditDraft({
      // 已通过校验的密码：保存时随 PATCH 一起发送（服务端校验后丢弃）
      editPassword: verifiedPassword,
      name: profile.name ?? "",
      nickname: profile.nickname ?? "",
      appearanceHint: profile.appearanceHint ?? "",
      anchor: profile.anchor ? `${profile.anchor.type}:${profile.anchor.targetId}` : "",
      coreQuest: profile.coreQuest ?? "",
      gender: profile.gender ?? "",
      age: profile.age != null ? String(profile.age) : "",
      department: profile.department ?? "",
      position: profile.position ?? "",
      jobTitle: profile.jobTitle ?? "",
      coreValues: ((profile.coreValues as string[]) ?? []).join("、"),
      skills: ((profile.skills as string[]) ?? []).join("、"),
      preferredActivities: ((profile.preferredActivities as string[]) ?? []).join("、"),
      fears: ((profile.fears as string[]) ?? []).join("、"),
      dislikes: ((profile.dislikes as string[]) ?? []).join("、"),
      backstory: (profile.backstory as string) ?? "",
      speechQuirks: (profile.iconicCues?.speechQuirks ?? []).join("、"),
      catchphrases: (profile.iconicCues?.catchphrases ?? []).join("、"),
    });
    setEditing(true);
    setEditFlash(null);
    setGateError(null);
  };

  const openEditor = () => {
    if (editing) return; // 已在编辑中：避免重复点击重置草稿
    // 没有密码 → 直接打开；有密码 → 每次都必须手动输入，不预填
    if (!profile.hasEditPassword) {
      beginEditing("");
      return;
    }
    // 清理早期版本可能存过的密码
    localStorage.removeItem(`worldx:edit-password:${charId}`);
    setGatePassword("");
    setGateError(null);
    setGateOpen(true);
  };

  const confirmGate = async () => {
    const provided = gatePassword.trim();
    if (!provided) {
      setGateError(t("charDetail.editPasswordRequired"));
      return;
    }
    setGateBusy(true);
    try {
      await apiClient.verifyCharacterEditPassword(charId, provided);
      // 校验通过后立刻打开编辑器；任何意外都显式提示，避免"点了没反应"
      try {
        setGateOpen(false);
        beginEditing(provided);
        setEditFlash(t("charDetail.gatePassed"));
      } catch (err) {
        console.error("[CharacterDetail] open editor after verify failed:", err);
        setGateError(t("charDetail.saveFailed", { error: err instanceof Error ? err.message : String(err) }));
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      console.warn("[CharacterDetail] edit-password verify failed:", raw);
      const wrongPassword =
        (err instanceof ApiError && err.code === "EDIT_PASSWORD_REQUIRED") ||
        raw.includes("403");
      setGateError(wrongPassword ? t("charDetail.editPasswordWrong") : raw);
    } finally {
      setGateBusy(false);
    }
  };

  const saveProfile = async () => {
    setEditBusy(true);
    try {
      const split = (s: string) => s.split(/[,、，\s]+/).map((t) => t.trim()).filter(Boolean);
      // 锚定："region:<id>" / "element:<id>" / ""（不锚定）
      const anchorValue = (() => {
        const raw = editDraft.anchor ?? "";
        if (!raw) return null;
        const [type, ...rest] = raw.split(":");
        const targetId = rest.join(":");
        return (type === "region" || type === "element") && targetId
          ? { type, targetId }
          : null;
      })();
      // 字符串字段发送 trim 后的原文（允许清空）；数组字段以空数组表示清空。
      // 注意：已从表单移除的字段（身份/核心动机/说话风格/原型来源等）不在这里发送，
      // patchProfile 只覆盖传入的键，因此配置文件里的原值保持不变。
      await apiClient.patchCharacterProfile(charId, {
        // 编辑密码：服务端校验后丢弃，不会写进角色档案
        editPassword: editDraft.editPassword?.trim() || undefined,
        name: editDraft.name?.trim() || undefined, // 姓名不允许清空
        nickname: editDraft.nickname?.trim() ?? "",
        appearanceHint: editDraft.appearanceHint?.trim() ?? "",
        anchor: anchorValue,
        coreQuest: editDraft.coreQuest?.trim() ?? "",
        gender: editDraft.gender?.trim() ?? "",
        age: editDraft.age?.trim() ?? "",
        department: editDraft.department?.trim() ?? "",
        position: editDraft.position?.trim() ?? "",
        jobTitle: editDraft.jobTitle?.trim() ?? "",
        coreValues: split(editDraft.coreValues ?? ""),
        skills: split(editDraft.skills ?? ""),
        preferredActivities: split(editDraft.preferredActivities ?? ""),
        fears: split(editDraft.fears ?? ""),
        dislikes: split(editDraft.dislikes ?? ""),
        backstory: editDraft.backstory?.trim() ?? "",
        iconicCues: {
          speechQuirks: split(editDraft.speechQuirks ?? ""),
          catchphrases: split(editDraft.catchphrases ?? ""),
          // 表单不再管理"小动作"，沿用角色原有配置，避免保存时被清空
          behavioralTics: profile.iconicCues?.behavioralTics ?? [],
        },
      });
      setEditFlash(t("charDetail.saved"));
      setTimeout(() => setEditFlash(null), 2000);
      setEditing(false);
      apiClient.getCharacterDetail(charId).then(setDetail).catch(console.warn);
      // 改名后：同步地图上的姓名标签 + 刷新各面板的角色列表
      EventBus.instance.emit("character_renamed", {
        id: charId,
        name: editDraft.name?.trim() || profile.name,
      });
      EventBus.instance.emit("character_anchor_changed", { id: charId, anchor: anchorValue });
      EventBus.instance.emit("characters_changed");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const isPasswordError =
        (err instanceof ApiError && err.code === "EDIT_PASSWORD_REQUIRED") ||
        raw.includes("edit password");
      const isNameTaken =
        (err instanceof ApiError && err.code === "NAME_TAKEN") ||
        raw.includes("already exists") ||
        raw.includes("API 409");
      setEditFlash(
        isPasswordError
          ? t("charDetail.editPasswordWrong")
          : isNameTaken
            ? t("charDetail.nameTaken")
            : t("charDetail.saveFailed", { error: raw }),
      );
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
          {profile.name}
        </span>
        <button
          onClick={() => onToggleFollow(charId)}
          style={{
            background: isFollowing ? "rgba(116,185,255,0.18)" : "rgba(255,255,255,0.1)",
            border: isFollowing
              ? "1px solid rgba(116,185,255,0.45)"
              : "1px solid rgba(255,255,255,0.2)",
            color: isFollowing ? "#dff3ff" : "#e0e0e0",
            borderRadius: 4,
            padding: "2px 8px",
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          {isFollowing ? t("charDetail.unfollow") : t("charDetail.follow")}
        </button>
        <button onClick={openEditor} style={editBtnStyle}>{t("charDetail.editProfile")}</button>
      </div>

      {(profile.role || profile.coreMotivation) && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 4, lineHeight: 1.55, flexShrink: 0 }}>
          {profile.role && <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{profile.role}</span>}
          {profile.role && profile.coreMotivation && <span style={{ margin: "0 5px", opacity: 0.4 }}>·</span>}
          {profile.coreMotivation && <span>{profile.coreMotivation}</span>}
        </div>
      )}

      <div style={{ fontSize: 11, color: "#aaa", marginBottom: 8, lineHeight: 1.6, flexShrink: 0 }}>
        <div>
          {t("charDetail.location")}: {locationNames[state.location] || state.location} · {t("charDetail.emotion")}: {emotionLabel}
          {state.currentAction ? ` · ${t("charDetail.action")}: ${state.currentActionLabel || formatActionName(state.currentAction)}` : ""}
        </div>
      </div>

      {editFlash && !editing && (
        <div style={{ fontSize: 11, color: "#8df3cf", marginBottom: 6, flexShrink: 0 }}>{editFlash}</div>
      )}

      {gateOpen && !editing && (
        <div style={editorWrapStyle}>
          <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.6 }}>
            {t("charDetail.gateHint")}
          </div>
          <input
            type="password"
            value={gatePassword}
            onChange={(e) => setGatePassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void confirmGate();
            }}
            placeholder={t("charDetail.gatePlaceholder")}
            autoFocus
            style={{ ...fieldInputStyle, width: "100%" }}
          />
          {gateError && (
            <div style={{
              fontSize: 12,
              color: "#ffb0b0",
              background: "rgba(255, 80, 80, 0.12)",
              border: "1px solid rgba(255, 120, 120, 0.35)",
              borderRadius: 6,
              padding: "6px 10px",
              lineHeight: 1.5,
            }}>
              ⚠ {gateError}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={confirmGate} disabled={gateBusy} style={saveBtnStyle(gateBusy)}>
              {gateBusy ? t("charDetail.saving") : t("charDetail.gateConfirm")}
            </button>
            <button
              onClick={() => {
                setGateOpen(false);
                setGateError(null);
              }}
              disabled={gateBusy}
              style={cancelBtnStyle}
            >
              {t("charDetail.cancel")}
            </button>
          </div>
        </div>
      )}

      {editing && (
        <ProfileEditor
          draft={editDraft}
          onChange={setEditDraft}
          onSave={saveProfile}
          onCancel={() => setEditing(false)}
          busy={editBusy}
          flash={editFlash}
          optionsByKey={{ anchor: anchorOptions }}
        />
      )}

      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexShrink: 0 }}>
        {(["history", "memory", "plan"] as Tab[]).map((tabT) => (
          <button
            key={tabT}
            onClick={() => {
              setTab(tabT);
              if (tabT === "plan") {
                // 计划会被 AI 随时修订：打开这个页签时拉一次最新版本
                apiClient.getCharacterDetail(charId).then(setDetail).catch(console.warn);
              }
            }}
            style={{
              flex: 1,
              background: tab === tabT ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
              border: "none",
              color: tab === tabT ? "#fff" : "#888",
              borderRadius: 4,
              padding: "4px 0",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {{ history: t("charDetail.tabHistory"), memory: t("charDetail.tabMemory"), plan: t("charDetail.tabPlan") }[tabT]}
          </button>
        ))}
      </div>

      <div className="custom-scrollbar" style={{ flex: 1, minHeight: 320, overflowY: "auto", fontSize: 11, color: "#ccc", paddingRight: 4 }}>
        {tab === "plan" && (
          <div style={{ padding: "4px 0" }}>
            {detail?.questPlan && detail.questPlan.steps.length > 0 ? (
              <>
                <div style={{ color: "#8fd3ff", fontWeight: 600, marginBottom: 6 }}>
                  {t("charDetail.planQuestLabel", { quest: detail.questPlan.quest })}
                </div>
                {detail.questPlan.steps.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 8,
                      padding: "5px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      color: "#ddd",
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: "#74b9ff", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
                <div style={{ marginTop: 10, color: "#777", lineHeight: 1.6 }}>
                  {t("charDetail.planUpdatedAt", {
                    day: detail.questPlan.updatedDay,
                    tick: detail.questPlan.updatedTick,
                  })}
                  <br />
                  {t("charDetail.planHint")}
                </div>
              </>
            ) : (
              <div style={{ color: "#777", lineHeight: 1.7 }}>{t("charDetail.planEmpty")}</div>
            )}
          </div>
        )}
        {tab === "history" &&
          mergedHistory.map((record, i) => (
            <div
              key={record.key || i}
              style={{
                padding: "6px 0",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <span style={{ color: "#666" }}>
                  {t("time.day", { day: record.gameDay })} · {record.timeString || `T${record.gameTick}`}
                </span>
                <span style={{ color: typeColor(record.kind === "dialogue_turn" ? "dialogue" : record.event.type), fontWeight: 600 }}>
                  {formatEventType(record.kind === "dialogue_turn" ? "dialogue" : record.event.type)}
                </span>
              </div>
              {record.kind === "dialogue_turn" ? (
                imStyle ? (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 2 }}>
                    <CharacterAvatar
                      characterId={record.speakerId}
                      name={characterNames[record.speakerId] || record.speakerId}
                      colorIndex={characters.findIndex((c) => c.id === record.speakerId)}
                      size={28}
                    />
                    <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ color: "#74b9ff", fontSize: 11, fontWeight: 600 }}>
                        {characterNames[record.speakerId] || record.speakerId}
                      </div>
                      <div
                        style={{
                          alignSelf: "flex-start",
                          background: "rgba(255,255,255,0.07)",
                          border: "1px solid rgba(120,180,255,0.15)",
                          color: "#e0e6f2",
                          padding: "6px 10px",
                          borderRadius: "4px 12px 12px 12px",
                          maxWidth: "92%",
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {record.content}
                      </div>
                      {record.innerMonologue && (
                        <div title={t("charDetail.innerMonologueTitle")} style={{ marginTop: 2, paddingLeft: 10, borderLeft: "2px dashed rgba(179, 157, 219, 0.45)", fontStyle: "italic", color: "#b39ddb", opacity: 0.88 }}>
                          💭 {record.innerMonologue}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                <>
                  <div style={{ color: "#ddd", lineHeight: 1.5 }}>
                    <span style={{ color: "#74b9ff", fontWeight: 600 }}>
                      {characterNames[record.speakerId] || record.speakerId}
                    </span>
                    <span style={{ color: "#bbb" }}>
                      {" "}
                      {t("charDetail.saidTo")}{" "}
                      {record.listenerId
                        ? characterNames[record.listenerId] || record.listenerId
                        : t("charDetail.theOther")}{" "}
                      {t("charDetail.said")}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      padding: "8px 10px",
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: 6,
                      color: "#ddd",
                      lineHeight: 1.5,
                    }}
                  >
                    {record.content}
                  </div>
                  {record.innerMonologue && (
                    <div title={t("charDetail.innerMonologueTitle")} style={{ marginTop: 4, padding: "4px 8px", background: "rgba(255,255,255,0.05)", borderRadius: 6, fontStyle: "italic", color: "#b2bec3" }}>
                      💭 {record.innerMonologue}
                    </div>
                  )}
                </>
                )
              ) : (
                <>
                  <div style={{ color: "#ddd", lineHeight: 1.5 }}>
                    {formatEventSummary(record.event, { characterNames, locationNames })}
                  </div>
                  {record.event.innerMonologue && (
                    <div title={t("charDetail.innerMonologueTitle")} style={{ marginTop: 4, padding: "4px 8px", background: "rgba(255,255,255,0.05)", borderRadius: 6, fontStyle: "italic", color: "#b2bec3" }}>
                      💭 {record.event.innerMonologue}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        {tab === "memory" &&
          memories.map((m, i) => (
            <div key={i} style={{ padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "#888" }}>[{t(`memoryType.${m.type}`, { defaultValue: m.type })}]</span> {m.content}
            </div>
          ))}
        {((tab === "history" && mergedHistory.length === 0) ||
          (tab === "memory" && memories.length === 0)) && (
          <div style={{ color: "#666", padding: 8, textAlign: "center" }}>{t("charDetail.noData")}</div>
        )}
      </div>
    </div>
  );
}

function eventTouchesCharacter(event: SimulationEvent, charId: string): boolean {
  if (event.actorId === charId || event.targetId === charId) return true;
  if (Array.isArray(event.data?.turns)) {
    return event.data.turns.some((turn: { speaker: string }) => turn.speaker === charId);
  }
  return false;
}

function buildHistoryRecords(events: SimulationEvent[]): HistoryRecord[] {
  const records: HistoryRecord[] = [];
  const dialogueTurns = new Map<string, DialogueTurnRecord>();
  const completeDialogueEvents: Array<{ event: SimulationEvent; sortIndex: number }> = [];

  for (const [sortIndex, event] of events.entries()) {
    if (event.type !== "dialogue" || !Array.isArray(event.data?.turns)) {
      records.push({
        kind: "event",
        key: event.id || `${event.type}-${event.gameDay}-${event.gameTick}-${records.length}`,
        gameDay: event.gameDay,
        gameTick: event.gameTick,
        timeString: event.timeString,
        createdAt: event.createdAt,
        sortIndex,
        event,
      });
      continue;
    }

    const phase = event.data?.phase;
    if (phase === "turn") {
      addDialogueTurnRecords(dialogueTurns, event, sortIndex);
    } else if (phase === "complete") {
      completeDialogueEvents.push({ event, sortIndex });
    }
  }

  for (const { event, sortIndex } of completeDialogueEvents) {
    addDialogueTurnRecords(dialogueTurns, event, sortIndex, true);
  }

  return [...records, ...Array.from(dialogueTurns.values())].sort(compareHistoryRecordsDesc);
}

function addDialogueTurnRecords(
  target: Map<string, DialogueTurnRecord>,
  event: SimulationEvent,
  sortIndex: number,
  onlyFillMissing = false,
): void {
  if (!Array.isArray(event.data?.turns) || event.data.turns.length === 0) return;

  const participants = getDialogueParticipants(event);
  const conversationId = event.data?.conversationId || [...participants].sort().join("__") || event.id;
  const turnIndexStart =
    typeof event.data?.turnIndexStart === "number" ? event.data.turnIndexStart : 0;

  event.data.turns.forEach(
    (turn: { speaker: string; content: string; innerMonologue?: string }, idx: number) => {
      const turnIndex = turnIndexStart + idx;
      const key = `${conversationId}:${turnIndex}`;
      if (onlyFillMissing && target.has(key)) return;
      const listenerId = participants.find((id) => id !== turn.speaker);
      target.set(key, {
        kind: "dialogue_turn",
        key,
        gameDay: event.gameDay,
        gameTick: event.gameTick,
        timeString: event.timeString,
        createdAt: event.createdAt,
        sortIndex,
        event,
        conversationId,
        turnIndex,
        speakerId: turn.speaker,
        listenerId,
        content: turn.content,
        innerMonologue: turn.innerMonologue,
      });
    },
  );
}

function getDialogueParticipants(event: SimulationEvent): string[] {
  const fromData = Array.isArray(event.data?.participants)
    ? event.data.participants.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
    : [];
  const fallback = [event.actorId, event.targetId].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  return Array.from(new Set([...fromData, ...fallback]));
}

function compareHistoryRecordsDesc(a: HistoryRecord, b: HistoryRecord): number {
  if (a.gameDay !== b.gameDay) return b.gameDay - a.gameDay;
  if (a.gameTick !== b.gameTick) return b.gameTick - a.gameTick;

  if (
    a.kind === "dialogue_turn" &&
    b.kind === "dialogue_turn" &&
    a.conversationId === b.conversationId
  ) {
    return b.turnIndex - a.turnIndex;
  }

  const createdAtCompare = (b.createdAt || "").localeCompare(a.createdAt || "");
  if (createdAtCompare !== 0) return createdAtCompare;

  if (a.sortIndex !== b.sortIndex) return b.sortIndex - a.sortIndex;

  if (a.kind === "dialogue_turn" && b.kind === "dialogue_turn") {
    return b.turnIndex - a.turnIndex;
  }

  if (a.kind === "dialogue_turn") return -1;
  if (b.kind === "dialogue_turn") return 1;
  return 0;
}

function typeColor(type: string): string {
  switch (type) {
    case "dialogue":
      return "#fdcb6e";
    case "movement":
      return "#74b9ff";
    case "action_start":
      return "#00b894";
    case "action_end":
      return "#95a5a6";
    default:
      return "#888";
  }
}

/* ── Profile Editor ── */

const PROFILE_FIELD_KEYS: {
  key: string;
  labelKey: string;
  /** 输入框里的示例提示（可空：下拉框不需要） */
  placeholderKey?: string;
  multiline?: boolean;
  rows?: number;
  section?: string;
  /** 选项来自外部（如锚定选项依赖世界数据） */
  optionsFrom?: string;
}[] = [
  // 核心任务放在最前面：它决定角色"为什么行动"，优先级高于其它人设细节。
  // 没有独立开关：填写文字即启动，清空即停止。
  { key: "coreQuest", labelKey: "charDetail.fieldCoreQuest", placeholderKey: "charDetail.phCoreQuest", multiline: true, rows: 3, section: "charDetail.sectionQuest" },
  { key: "name", labelKey: "charDetail.fieldName", placeholderKey: "charDetail.phName", section: "charDetail.sectionBasic" },
  { key: "nickname", labelKey: "charDetail.fieldNickname", placeholderKey: "charDetail.phNickname" },
  { key: "appearanceHint", labelKey: "charDetail.fieldAppearanceHint", placeholderKey: "charDetail.phAppearanceHint", multiline: true },
  { key: "anchor", labelKey: "charDetail.fieldAnchor", optionsFrom: "anchor" },
  { key: "gender", labelKey: "charDetail.fieldGender", placeholderKey: "charDetail.phGender", section: "charDetail.sectionProfile" },
  { key: "age", labelKey: "charDetail.fieldAge", placeholderKey: "charDetail.phAge" },
  { key: "department", labelKey: "charDetail.fieldDepartment", placeholderKey: "charDetail.phDepartment" },
  { key: "position", labelKey: "charDetail.fieldPosition", placeholderKey: "charDetail.phPosition" },
  { key: "jobTitle", labelKey: "charDetail.fieldJobTitle", placeholderKey: "charDetail.phJobTitle" },
  { key: "coreValues", labelKey: "charDetail.fieldCoreValues", placeholderKey: "charDetail.phCoreValues", section: "charDetail.sectionInner" },
  { key: "skills", labelKey: "charDetail.fieldSkills", placeholderKey: "charDetail.phSkills" },
  { key: "preferredActivities", labelKey: "charDetail.fieldPreferredActivities", placeholderKey: "charDetail.phPreferredActivities" },
  { key: "fears", labelKey: "charDetail.fieldFears", placeholderKey: "charDetail.phFears" },
  { key: "dislikes", labelKey: "charDetail.fieldDislikes", placeholderKey: "charDetail.phDislikes" },
  { key: "backstory", labelKey: "charDetail.fieldBackstory", placeholderKey: "charDetail.phBackstory", multiline: true, section: "charDetail.sectionExperience" },
  { key: "speechQuirks", labelKey: "charDetail.fieldSpeechQuirks", placeholderKey: "charDetail.phSpeechQuirks", section: "charDetail.sectionIconic" },
  { key: "catchphrases", labelKey: "charDetail.fieldCatchphrases", placeholderKey: "charDetail.phCatchphrases" },
];

type ProfileFieldOption = { value: string; label: string; group?: string };

/** 把带 group 的选项渲染成 <optgroup> 分组 */
function renderFieldOptions(options: ProfileFieldOption[]) {
  const groups: { name?: string; items: ProfileFieldOption[] }[] = [];
  for (const opt of options) {
    const last = groups[groups.length - 1];
    if (last && last.name === opt.group) last.items.push(opt);
    else groups.push({ name: opt.group, items: [opt] });
  }
  return groups.map((g, i) =>
    g.name ? (
      <optgroup key={`${g.name}-${i}`} label={g.name}>
        {g.items.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </optgroup>
    ) : (
      g.items.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))
    ),
  );
}

function ProfileEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  busy,
  flash,
  optionsByKey,
}: {
  draft: Record<string, string>;
  onChange: (d: Record<string, string>) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  flash: string | null;
  optionsByKey?: Record<string, ProfileFieldOption[]>;
}) {
  const { t } = useTranslation();
  const set = (key: string, val: string) => onChange({ ...draft, [key]: val });

  let lastSection: string | undefined;
  const fields = PROFILE_FIELD_KEYS.map((f) => {
    const showSection = f.section !== undefined && f.section !== lastSection;
    lastSection = f.section ?? lastSection;
    const options = f.optionsFrom ? optionsByKey?.[f.optionsFrom] : undefined;
    return (
      <Fragment key={f.key}>
        {showSection && <div style={sectionHeaderStyle}>{t(f.section!)}</div>}
        <label style={fieldLabelStyle}>
          {t(f.labelKey)}
          {options ? (
            <select
              value={draft[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              style={fieldInputStyle}
            >
              {renderFieldOptions(options)}
            </select>
          ) : f.multiline ? (
            <textarea
              value={draft[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholderKey ? t(f.placeholderKey) : undefined}
              rows={f.rows ?? 3}
              style={fieldTextareaStyle}
            />
          ) : (
            <input
              value={draft[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholderKey ? t(f.placeholderKey) : undefined}
              style={fieldInputStyle}
            />
          )}
        </label>
      </Fragment>
    );
  });

  return (
    <div style={editorWrapStyle}>
      <div className="custom-scrollbar" style={editorFieldsStyle}>
        {fields}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <button onClick={onSave} disabled={busy} style={saveBtnStyle(busy)}>
          {busy ? t("charDetail.saving") : t("charDetail.save")}
        </button>
        <button onClick={onCancel} disabled={busy} style={cancelBtnStyle}>{t("charDetail.cancel")}</button>
        {flash && (
          <span style={{
            fontSize: 11,
            color: flash === t("charDetail.saved") || flash === t("charDetail.gatePassed") ? "#8df3cf" : "#ffb0b0",
          }}>
            {flash}
          </span>
        )}
      </div>
    </div>
  );
}

const editBtnStyle: CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#ccc",
  borderRadius: 4,
  padding: "2px 8px",
  cursor: "pointer",
  fontSize: 11,
  marginLeft: "auto",
};

const editorWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "10px 0",
  marginBottom: 8,
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  flexShrink: 0,
};

/** 字段列表内部滚动，保存按钮固定在底部，避免长表单时按钮被推到屏幕外。 */
const editorFieldsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxHeight: "min(52vh, 460px)",
  overflowY: "auto",
  paddingRight: 6,
};

const sectionHeaderStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1,
  color: "#74b9ff",
  opacity: 0.9,
  marginTop: 4,
  paddingBottom: 2,
  borderBottom: "1px solid rgba(116,185,255,0.2)",
};

const fieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 11,
  color: "#aaa",
};

const fieldInputStyle: CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 4,
  color: "#e8e8ea",
  padding: "4px 6px",
  fontSize: 12,
  fontFamily: "inherit",
};

const fieldTextareaStyle: CSSProperties = {
  ...fieldInputStyle,
  resize: "vertical",
};

function saveBtnStyle(busy: boolean): CSSProperties {
  return {
    background: busy ? "rgba(116,185,255,0.08)" : "rgba(116,185,255,0.2)",
    border: "1px solid rgba(116,185,255,0.45)",
    color: "#eaf5ff",
    borderRadius: 6,
    padding: "4px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: busy ? "wait" : "pointer",
  };
}

const cancelBtnStyle: CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#ccc",
  borderRadius: 6,
  padding: "4px 14px",
  fontSize: 12,
  cursor: "pointer",
};
