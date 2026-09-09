/**
 * @title Shader Playground - 实时诊断
 * @category Shader 教程
 */
import { ShaderAnalyzer, formatDiagnostic } from "@galacean/engine-shader-analyzer";
import * as dat from "dat.gui";
import { PLAYGROUND_SAMPLES, PLAYGROUND_SAMPLE_LABELS, DEFAULT_PLAYGROUND_SAMPLE } from "./shader-playground/samples";

const ERROR_COLOR = "#f14c4c";
const WARNING_COLOR = "#cca700";

const style = document.createElement("style");
style.textContent = `
  html, body { height: 100%; margin: 0; background: #1e1e1e; }
  #pg { display: flex; height: 100vh; color: #d4d4d4;
    font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

  #pane { display: flex; flex: 1; min-width: 0; }
  #gutter { flex: 0 0 52px; box-sizing: border-box; overflow: hidden;
    padding: 16px 8px 16px 0; text-align: right; color: #6a6a6a; user-select: none;
    background: #1e1e1e; border-right: 1px solid #2a2a2a; white-space: pre;
    font: inherit; line-height: 1.6; }
  #ed { box-sizing: border-box; flex: 1; min-width: 0; margin: 0; padding: 16px; border: 0;
    font: inherit; line-height: 1.6; tab-size: 2; white-space: pre; word-wrap: normal;
    color: #d4d4d4; background: transparent; caret-color: #d4d4d4;
    resize: none; outline: none; overflow: auto; }

  #out { width: 42%; min-width: 360px; overflow: auto; border-left: 1px solid #333; padding: 48px 16px 12px; }
  #pg h3 { margin: 0 0 12px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #888; }
  #pg .ok { color: #4ec9b0; }
  #pg .expectation { margin-bottom: 16px; color: #b0b0b0; }
  #pg .expectation p { margin: 4px 0; }
  #pg .mismatch { color: #f14c4c; }

  #pg .diag { margin: 0 0 14px; border-left: 3px solid #888; padding: 8px 12px; background: #252526;
    border-radius: 3px; }
  #pg .diag.error { border-color: ${ERROR_COLOR}; }
  #pg .diag.warning { border-color: ${WARNING_COLOR}; }
  #pg .diag pre { margin: 0; white-space: pre; overflow-x: auto;
    font: inherit; line-height: 1.5; }
  #pg .diag .gut { color: #6a6a6a; }
  #pg .diag .src { color: #d4d4d4; }
  #pg .diag.error .hl { color: ${ERROR_COLOR}; }
  #pg .diag.warning .hl { color: ${WARNING_COLOR}; }
`;
document.head.appendChild(style);
document.body.innerHTML =
  `<div id="pg">` +
  `<div id="pane"><div id="gutter"></div>` +
  `<textarea id="ed" aria-label="Shader 源码" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea></div>` +
  `<div id="out"></div>` +
  `</div>`;

const editor = document.getElementById("ed") as HTMLTextAreaElement;
const gutter = document.getElementById("gutter") as HTMLDivElement;
const output = document.getElementById("out") as HTMLDivElement;

type Diag = ReturnType<typeof ShaderAnalyzer.analyze>["diagnostics"][number];

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function renderConsoleBlock(d: Diag): string {
  const text = formatDiagnostic(d);
  const lines = text.split("\n");

  const rows = lines.map((line, i) => {
    if (i === 0) return `<span class="hl">${escapeHtml(line)}</span>`;

    const gutterMatch = line.match(/^(\s*\d* \| )(.*)$/);
    if (!gutterMatch) return escapeHtml(line);
    const gutter = `<span class="gut">${escapeHtml(gutterMatch[1])}</span>`;
    const content = gutterMatch[2];
    const contentClass = /^[\^ ]*$/.test(content) ? "hl" : "src";
    return `${gutter}<span class="${contentClass}">${escapeHtml(content)}</span>`;
  });

  const sourceFile = d.sourceFile ? `<div>${escapeHtml(d.sourceFile)}</div>` : "";
  return `<div class="diag ${d.severity}">${sourceFile}<pre>${rows.join("\n")}</pre></div>`;
}

const config = { diagnostic: DEFAULT_PLAYGROUND_SAMPLE };
let currentSampleKey = DEFAULT_PLAYGROUND_SAMPLE;

function renderGutter(lineCount: number): void {
  let lineNumbers = "";
  for (let i = 1; i <= lineCount; i++) lineNumbers += i + "\n";
  gutter.textContent = lineNumbers;
}

function renderConsole(diagnostics: readonly Diag[]): void {
  if (diagnostics.length === 0) {
    output.innerHTML = `<h3>Diagnostics (0)</h3><div class="ok">✓ No diagnostics</div>`;
    return;
  }
  const sorted = [...diagnostics].sort(
    (a, b) => a.range.start.line - b.range.start.line || a.range.start.column - b.range.start.column
  );
  output.innerHTML = `<h3>Diagnostics (${sorted.length})</h3>` + sorted.map(renderConsoleBlock).join("");
}

function render(): void {
  const src = editor.value;
  const sample = PLAYGROUND_SAMPLES[currentSampleKey];
  const { diagnostics } = ShaderAnalyzer.analyze(src, sample.options);
  renderGutter(src.split("\n").length);
  renderConsole(diagnostics);
  const expected = sample.expectedCodes;
  const actual = new Set(diagnostics.map((diagnostic) => diagnostic.code));
  const matches = actual.size === expected.length && expected.every((code) => actual.has(code));
  const edited = src !== sample.source;
  const status = edited ? "源码已编辑：不对照原样例预期" : matches ? "符合样例预期" : "与样例预期不符";
  output.insertAdjacentHTML(
    "afterbegin",
    `<div class="expectation"><p>${escapeHtml(sample.note)}</p>` +
      `<p>预期：${escapeHtml(expected.join(", ") || "无静态诊断")}</p>` +
      `<p class="${edited ? "" : matches ? "ok" : "mismatch"}" role="status">${status}</p></div>`
  );
}

function syncScroll(): void {
  gutter.scrollTop = editor.scrollTop;
}

editor.addEventListener("scroll", syncScroll);

let renderTimer = 0;
editor.addEventListener("input", () => {
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, 150);
});

const gui = new dat.GUI({ width: 480 });
gui
  .add(config, "diagnostic", Object.keys(PLAYGROUND_SAMPLE_LABELS))
  .name("Diagnostic")
  .onChange((label: string) => {
    currentSampleKey = PLAYGROUND_SAMPLE_LABELS[label];
    editor.value = PLAYGROUND_SAMPLES[currentSampleKey].source;
    editor.scrollTop = 0;
    editor.scrollLeft = 0;
    syncScroll();
    render();
  });

editor.value = PLAYGROUND_SAMPLES[DEFAULT_PLAYGROUND_SAMPLE].source;
render();
