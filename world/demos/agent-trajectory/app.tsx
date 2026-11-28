import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { parseTrajectoryJson, type TrajectoryDocument } from "@galacean/engine-ai-chat/ai-chat/trajectory/trajectory-model";
import { adaptTrace } from "./trace-adapter.ts";
import { TrajectoryTable, TrajectoryToolbar, TrajectoryTimeline, TrajectorySearchIndex, ImageGallery, trajectoryRecordId, trajectoryTimelineFocusIndexes } from "./dsh/renderer.js";
import type { TrajectoryTimeRange } from "./dsh/contracts.ts";
import { zh, type TrajectoryTranslate } from "./dsh/locales.ts";
import { zh as commonZh } from "./dsh/common-locales.ts";
import type { ImageProps } from "./platform-types.ts";
import "./dsh/renderer.css";

const dictionary = { ...commonZh, ...zh };
const t: TrajectoryTranslate = (key, params) => dictionary[key].replace(/\{(\w+)\}/g, (match, name: string) => String(params?.[name] ?? match));
const noticeUrl = new URL("../../../packages/ai-chat/src/ai-chat/trajectory/THIRD_PARTY_NOTICES.md", import.meta.url).href;
function readPreference(key: string): boolean {
  try { return localStorage.getItem(`trajectory.${key}`) === "true"; } catch { return false; }
}
function writePreference(key: string, value: boolean): void {
  try { localStorage.setItem(`trajectory.${key}`, String(value)); } catch { /* Storage is optional for offline inspection. */ }
}
const stringWrapping = { label: t("record.wrapLines"), getDefault: () => readPreference("wrap"), setDefault: (value: boolean) => writePreference("wrap", value) };
class ViewerBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    return this.state.error === null ? this.props.children
      : <p className="import-panel" role="alert">轨迹渲染失败：{this.state.error}。可以通过顶部按钮重新导入 Trace。</p>;
  }
}
function renderImages(_name: string, { loadImage, ...props }: ImageProps) {
  return <ImageGallery {...props} load={loadImage} labels={{ image: "图片", open: "查看原图", openNamed: name => `查看原图 ${name}`, loading: "加载中", loadFailed: "图片未记录或加载失败，点击重试", lightbox: { dialog: "图片预览", close: "关闭图片预览" } }} />;
}
function toggle<T>(current: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(current);
  if (!next.delete(value)) next.add(value);
  return next;
}

/** Offline replacement for DSH's session-bound host; the actual rendering stays upstream. */
function Viewer({ document }: { document: TrajectoryDocument }) {
  const { turns, requests, loadImage } = useMemo(() => adaptTrace(document), [document]);
  const [duration, setDuration] = useState(() => readPreference("duration"));
  const [query, setQuery] = useState("");
  const [collapsedTurns, setCollapsedTurns] = useState<ReadonlySet<number>>(new Set());
  const [collapsedAssistants, setCollapsedAssistants] = useState<ReadonlySet<string>>(new Set());
  const [range, setRange] = useState<TrajectoryTimeRange | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ index: number } | null>(null);
  const [focus, setFocus] = useState<{ index: number } | null>(null);
  const mode = duration ? "duration" : "sequence";
  const index = useMemo(() => { const index = new TrajectorySearchIndex(); index.update([turns]); return index; }, [turns]);
  const matches = useMemo(() => {
    const ids = index.search(query);
    return ids === null ? null : new Set(turns.flatMap(turn => turn.groups.flatMap(group => group.cells)).filter(cell => ids.has(trajectoryRecordId(cell))).map(cell => cell.index));
  }, [index, query, turns]);
  const timelineFocus = useMemo(() => range ? trajectoryTimelineFocusIndexes(turns, range, mode) : null, [turns, range, mode]);
  const turnIds = useMemo(() => turns.filter(turn => turn.groups.reduce((n, group) => n + group.cells.filter(cell => !cell.requestOnly && cell.kind !== "system").length, 0) > 1).map(turn => turn.turn).filter((turn): turn is number => turn !== null), [turns]);
  const assistantIds = useMemo(() => turns.flatMap(turn => {
    const cells = turn.groups.flatMap(group => group.cells);
    return cells.filter((cell, i) => cell.kind === "message" && ["tool", "subtool"].includes(cells[i + 1]?.kind)).map(trajectoryRecordId);
  }), [turns]);
  const allTurns = turnIds.length > 0 && turnIds.every(id => collapsedTurns.has(id));
  const allAssistants = assistantIds.length > 0 && assistantIds.every(id => collapsedAssistants.has(id));
  return <div className="trajectory-view">
    <TrajectoryToolbar t={t} actualDuration={duration} onActualDurationChange={value => { setDuration(value); writePreference("duration", value); setRange(null); }}
      actualTime={false} onActualTimeChange={() => {}} allTurnsCollapsed={allTurns} onToggleAllTurns={() => setCollapsedTurns(allTurns ? new Set() : new Set(turnIds))}
      allAssistantsCollapsed={allAssistants} onToggleAllAssistants={() => setCollapsedAssistants(allAssistants ? new Set() : new Set(assistantIds))}
      searchQuery={query} onSearchQueryChange={setQuery} />
    <TrajectoryTimeline t={t} turns={turns} mode={mode} range={range} selectedIndex={selectedIndex} searchMatchIndexes={matches}
      onRangeChange={setRange} onRecordSelect={index => { setRange(null); setSelection({ index }); setSelectedIndex(index); }} onRecordFocus={index => setFocus({ index })} />
    <div className="trajectory-ledger">
      <TrajectoryTable t={t} turns={turns} requestNumbers={requests} loadImage={loadImage} renderSlot={renderImages} stringWrapping={stringWrapping}
        searchMatchIndexes={matches} timelineFocusIndexes={timelineFocus} onSelectedIndexChange={setSelectedIndex}
        onRecordSelect={index => { if (timelineFocus && !timelineFocus.has(index)) setRange(null); }} recordSelection={selection} recordFocus={focus}
        collapsedTurns={collapsedTurns} onToggleTurn={turn => setCollapsedTurns(value => toggle(value, turn))}
        collapsedAssistants={collapsedAssistants} onToggleAssistant={id => setCollapsedAssistants(value => toggle(value, id))}
        onClearSelection={() => setRange(null)} />
    </div>
  </div>;
}

function App() {
  const [document, setDocument] = useState<TrajectoryDocument | null>(null);
  const [importOpen, setImportOpen] = useState(true);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const importRevision = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  function importText(text: string, name: string, ticket: number) {
    if (ticket !== importRevision.current) return;
    try {
      const document = parseTrajectoryJson(text, { sourceName: name });
      setDocument(document); setRevision(value => value + 1); setImportOpen(false); setError(""); setSource("");
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); setImportOpen(true); }
  }
  async function importFile(file: File) {
    const ticket = ++importRevision.current;
    try { importText(await file.text(), file.name, ticket); }
    catch (error) { if (ticket === importRevision.current) { setError(String(error)); setImportOpen(true); } }
  }
  return <main className="offline-app" onDragOver={event => event.preventDefault()} onDrop={event => {
    event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void importFile(file);
  }}>
    <header className="offline-header"><strong title={document?.title}>Agent Trajectory</strong>
      <span className="source-name">{document?.sourceName ?? "离线 Trace 检查器"}</span>
      <button id="import-another" onClick={() => { setError(""); setImportOpen(true); }}>导入 Trace</button>
      <a href={noticeUrl} target="_blank" rel="noreferrer">DSH · MIT</a>
    </header>
    <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void importFile(file);
    }} />
    {importOpen ? <section className="import-panel" aria-label="导入 Trace">
      <h1>检查 LLM 的完整轨迹</h1><p>从 Agent Trace 面板复制或下载 JSON，然后导入。内容只在本地浏览器处理。</p>
      <div className="import-actions"><button onClick={() => fileInput.current?.click()}>选择 Trace 文件</button>
        <button onClick={() => setPasteOpen(true)}>粘贴 JSON</button>
        {document && <button onClick={() => { ++importRevision.current; setImportOpen(false); }}>返回轨迹</button>}</div>
      <p className="import-hint">也可以直接拖入文件。缺失的计时、Token、Schema 或附件不会被补造。</p>
      {pasteOpen && <><textarea id="paste-input" aria-label="Trace JSON" value={source} onChange={event => setSource(event.target.value)} placeholder="粘贴 Trace JSON" spellCheck={false} />
        <button id="import-paste" onClick={() => importText(source, "粘贴的 Trace", ++importRevision.current)}>导入 JSON</button></>}
      {error && <p role="alert">{error}</p>}
    </section> : document && <><ViewerBoundary key={revision}><Viewer document={document} /></ViewerBoundary>
      {document.warnings.length > 0 && <details className="trace-warnings"><summary>Trace 数据提示（{document.warnings.length}）</summary>{document.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</details>}</>}
  </main>;
}
createRoot(window.document.getElementById("app")!).render(<App />);
