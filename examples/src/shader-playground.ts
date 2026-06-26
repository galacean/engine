/**
 * @title Shader Playground - 实时诊断
 * @category Shader 教程
 */
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";

// A sample with several intentional issues so the diagnostics panel shows real output.
const SAMPLE = `Shader "Playground/Demo" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      vec2 u_uv;
      float u_a;
      float u_a;                          // C0-10: redefinition in the same scope

      struct Attributes { vec3 POSITION; };

      vec3 getColor() {
        return 1.0;                        // C1-03: returns float, declared vec3
      }

      void vert(Attributes attr) {
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
      }

      void frag() {
        float a = u_uv.z;                  // C1-01: vec2 has no .z component
        a = getColor();                    // C1-02: cannot assign vec3 to float
        a = missingFn(a);                  // C0-09: undefined function
        gl_FragColor = vec4(a, 0.0, 0.0, 1.0);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;

const style = document.createElement("style");
style.textContent = `
  html, body { height: 100%; margin: 0; background: #1e1e1e; }
  #pg { display: flex; height: 100vh; color: #d4d4d4;
    font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  #pg textarea { flex: 1; min-width: 0; background: #1e1e1e; color: #d4d4d4; border: none;
    outline: none; padding: 16px; resize: none; tab-size: 2; font: inherit; }
  #pg #out { width: 44%; overflow: auto; border-left: 1px solid #333; padding: 12px 16px; }
  #pg h3 { margin: 0 0 12px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #888; }
  #pg .d { padding: 8px 10px; margin-bottom: 6px; background: #252526; border-left: 3px solid #888; border-radius: 3px; }
  #pg .d.error { border-color: #f14c4c; }
  #pg .d.warning { border-color: #cca700; }
  #pg .d.info, #pg .d.hint { border-color: #3794ff; }
  #pg .d .loc { float: right; color: #6a6a6a; }
  #pg .d .code { font-weight: 600; color: #9cdcfe; }
  #pg .d .msg { margin-top: 3px; color: #cfcfcf; }
  #pg .ok { color: #4ec9b0; }
`;
document.head.appendChild(style);
document.body.innerHTML = `<div id="pg"><textarea id="ed" spellcheck="false"></textarea><div id="out"></div></div>`;

const editor = document.getElementById("ed") as HTMLTextAreaElement;
const output = document.getElementById("out") as HTMLDivElement;

const analyzer = new ShaderAnalyzer();

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

function render(): void {
  const { diagnostics } = analyzer.analyze(editor.value);
  if (diagnostics.length === 0) {
    output.innerHTML = `<h3>Diagnostics</h3><div class="ok">✓ No diagnostics</div>`;
    return;
  }
  diagnostics.sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.column - b.range.start.column);
  output.innerHTML =
    `<h3>Diagnostics (${diagnostics.length})</h3>` +
    diagnostics
      .map(
        (d) =>
          `<div class="d ${d.severity}"><span class="loc">${d.range.start.line}:${d.range.start.column}</span>` +
          `<span class="code">${escapeHtml(d.code)}</span><div class="msg">${escapeHtml(d.message)}</div></div>`
      )
      .join("");
}

let timer = 0;
editor.addEventListener("input", () => {
  clearTimeout(timer);
  timer = window.setTimeout(render, 150);
});
editor.value = SAMPLE;
render();
