/**
 * @title Shader Playground - 实时诊断
 * @category Shader 教程
 */
import {
  ShaderAnalyzer,
  formatDiagnostic,
  DiagnosticType,
  DiagnosticCategory,
  DIAGNOSTIC_CATEGORY
} from "@galacean/engine-shader-analyzer";
import * as dat from "dat.gui";

// Wrap a Pass body in the minimal Shader/SubShader/Pass envelope, mirroring the
// `pass(...)` / `wrap(...)` helpers in the analyzer's triggering test suites.
function pass(body: string): string {
  return `Shader "playground" {\n  SubShader "Default" {\n    Pass "p" {\n${body}\n    }\n  }\n}`;
}

// One triggering shader per DiagnosticType, lifted verbatim from the three tested
// suites (DiagnosticCoverage / ShaderAnalyzer / ShaderIOAnalyzer) so each is guaranteed
// to fire its intended code. Keys are the DiagnosticType codes; dropdown labels are
// derived at render time as `<category> / <code>` from DIAGNOSTIC_CATEGORY.
const MULTI_KEY = "Multiple errors";

const SAMPLES: Record<string, string> = {
  // A couple of errors at once (default) — preset, not a DiagnosticType.
  [MULTI_KEY]: pass(`      mat4 renderer_MVPMat;
      vec2 u_uv;
      float u_a;
      float u_a;                                          // Redefinition
      struct Attributes { vec3 POSITION; };
      vec3 getColor() { return 1.0; }                     // InvalidReturnType
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() {
        float a = u_uv.z;                                 // InvalidSwizzle
        a = missingFn(a);                                 // UndefinedFunction
        gl_FragColor = vec4(a, 0.0, 0.0, 1.0);
      }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.SyntaxError]: pass(`      void frag() { vec3 = ; }
      FragmentShader = frag;`),

  [DiagnosticType.NoMatchingOverload]: pass(`      float f(float a) { return a; }
      void frag() { gl_FragColor = vec4(f(vec3(0.0))); }
      FragmentShader = frag;`),

  [DiagnosticType.RecursiveFunction]: pass(`      struct Attributes { vec3 POSITION; };
      float fib(float x) { return fib(x); }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.Redefinition]: pass(`      float u_a;
      float u_a;                                          // Redefinition
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(u_a); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.UndefinedFunction]: pass(`      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = doesNotExist(1.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.UseBeforeDeclaration]: pass(`      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(undeclared_color, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.AssignTypeMismatch]: pass(`      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() {
        float a = 1.0;
        vec3 b = vec3(0.0, 0.0, 0.0);
        a = b;                                            // vec3 -> float
        gl_FragColor = vec4(a, a, a, 1.0);
      }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.ConstDivideByZero]: pass(`      void frag() { int x = 1 / 0; gl_FragColor = vec4(float(x)); }
      FragmentShader = frag;`),

  [DiagnosticType.ConstructorArgCount]: pass(
    `      void frag() { vec3 v = vec3(1.0, 2.0); gl_FragColor = vec4(v, 1.0); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.ConstructorArgType]: pass(`      mediump sampler2D u_tex;
      void frag() { vec2 v = vec2(u_tex, 1.0); gl_FragColor = vec4(v, 0.0, 1.0); }
      FragmentShader = frag;`),

  [DiagnosticType.ExpectedSampler]: pass(
    `      void frag() { vec2 uv = vec2(0.0); vec4 c = texture(uv, uv); gl_FragColor = c; }
      FragmentShader = frag;`
  ),

  [DiagnosticType.IndexOutOfBounds]: pass(
    `      void frag() { vec3 v = vec3(0.0); float y = v[5]; gl_FragColor = vec4(y); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.InvalidBinaryOperands]: pass(
    `      void frag() { bool b = true; float x = b + 1.0; gl_FragColor = vec4(x); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.InvalidSwizzle]: pass(`      vec2 u_uv;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(u_uv.z, 0.0, 0.0, 1.0); }   // vec2 has no .z
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.InvalidUnaryOperand]: pass(
    `      void frag() { float u_f = 1.0; bool ok = !u_f; gl_FragColor = vec4(0.0); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.NonIndexableType]: pass(
    `      void frag() { float f = 1.0; float y = f[0]; gl_FragColor = vec4(y); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.NonIntegerIndex]: pass(
    `      void frag() { vec3 v = vec3(0.0); float y = v[1.5]; gl_FragColor = vec4(y); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.ShiftOutOfRange]: pass(`      void frag() { int x = 1 << 40; gl_FragColor = vec4(float(x)); }
      FragmentShader = frag;`),

  [DiagnosticType.UndeclaredStructMember]: pass(`      struct Varyings { vec4 v; };
      Varyings vert() { Varyings o; o.v = vec4(0.0); return o; }
      void frag(Varyings i) { gl_FragColor = i.notAField; }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.NonConstArraySize]: pass(
    `      void frag() { int n = 3; float a[n]; gl_FragColor = vec4(a[0]); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.NonConstInitializer]: pass(`      float u_scale;
      void frag() { const float c = u_scale; gl_FragColor = vec4(c); }
      FragmentShader = frag;`),

  [DiagnosticType.NonConstructibleReturnType]: pass(`      mediump sampler2D u_tex;
      sampler2D getTex() { return u_tex; }
      void frag() { gl_FragColor = vec4(0.0); }
      FragmentShader = frag;`),

  [DiagnosticType.InvalidEntryReturnType]: pass(`      struct Attributes { vec3 POSITION; };
      float vert(Attributes attr) { gl_Position = vec4(0.0); return 1.0; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.InvalidReturnType]: pass(`      struct Attributes { vec3 POSITION; };
      vec3 getColor() { return 1.0; }                     // float vs vec3
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(getColor(), 1.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.MisplacedControlFlow]: pass(`      void frag() { gl_FragColor = vec4(0.0); break; }
      FragmentShader = frag;`),

  [DiagnosticType.MissingReturn]: pass(`      float getX() { float a = 1.0; }
      void frag() { gl_FragColor = vec4(getX()); }
      FragmentShader = frag;`),

  [DiagnosticType.NonBoolCondition]: pass(`      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float a = 1.0; if (a) { gl_FragColor = vec4(0.0); } }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.DuplicateEntryAssignment]: pass(`      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void vert2(Attributes attr) { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      VertexShader = vert2;                               // assigned twice
      FragmentShader = frag;`),

  [DiagnosticType.EntryNotFound]: pass(`      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vrt;                                 // 'vrt' is not a function
      FragmentShader = frag;`),

  [DiagnosticType.GlFragColorWithMrt]: pass(`      struct MRT { vec4 c0; };
      void vert() { gl_Position = vec4(0.0); }
      MRT frag() { MRT o; o.c0 = vec4(0.0); gl_FragColor = vec4(0.0); return o; }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.GlFragData]: pass(`      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragData[0] = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.InvalidIOStruct]: pass(`      struct Attributes { vec3 POSITION; };
      Varyings vert(Attributes attr) { Varyings o; gl_Position = vec4(0.0); return o; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.MissingEntry]: pass(`      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;`),

  [DiagnosticType.MissingVertexPosition]: pass(`      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.NestedIOStruct]: pass(`      struct Attributes { vec3 POSITION; };
      struct Inner { vec4 v; };
      struct Varyings { Inner nested; };
      Varyings vert(Attributes attr) { Varyings o; o.nested.v = vec4(attr.POSITION, 1.0); return o; }
      void frag(Varyings i) { gl_FragColor = i.nested.v; }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.NonFlatIntegerVarying]: pass(`      struct Attributes { vec3 POSITION; };
      struct Varyings { vec4 pos; int id; };
      Varyings vert(Attributes attr) { Varyings o; o.pos = vec4(attr.POSITION, 1.0); o.id = 0; gl_Position = o.pos; return o; }
      void frag(Varyings i) { gl_FragColor = vec4(float(i.id)); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.StructRoleConflict]: pass(`      struct IO { vec4 v; };
      IO vert(IO attr) { IO o; gl_Position = vec4(0.0); return o; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.BitwiseOrOnNonBitmask]: pass(
    `      BlendState bs { SourceColorBlendFactor = BlendFactor.One | BlendFactor.Zero; }`
  ),

  [DiagnosticType.InvalidEnumValue]: pass(`      BlendState bs { SourceColorBlendFactor = BlendFactor.NotReal; }`),

  [DiagnosticType.InvalidRenderQueueVariable]: pass(`      RenderQueueType = undefinedQueueVar;`),

  [DiagnosticType.InvalidRenderStateProperty]: pass(`      BlendState bs { NotARealProperty = true; }`),

  [DiagnosticType.InvalidRenderStateVariable]: pass(`      DepthState = undefinedDepthVar;`),

  [DiagnosticType.MixedEnumTypes]: pass(
    `      BlendState bs { ColorWriteMask = ColorWriteMask.Red | CullMode.Front; }`
  ),

  [DiagnosticType.DerivativeInVertexShader]: pass(`      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) {
        float d = dFdx(attr.POSITION.x);
        gl_Position = vec4(attr.POSITION, d);
      }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`),

  [DiagnosticType.NonFloatDerivativeArg]: pass(`      void frag() {
        int x = 3;
        float d = dFdx(x);
        gl_FragColor = vec4(d);
      }
      FragmentShader = frag;`),

  [DiagnosticType.EmptyStruct]: pass(`      struct Empty { };
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`)
};

// Localized display label for each category — UI concern, kept out of the enum values (which stay
// programmatic English for serialization / cross-tool consumption).
const CATEGORY_LABEL: Record<DiagnosticCategory, string> = {
  [DiagnosticCategory.Syntax]: "语法",
  [DiagnosticCategory.Symbol]: "符号",
  [DiagnosticCategory.Type]: "类型",
  [DiagnosticCategory.Constant]: "常量",
  [DiagnosticCategory.ControlFlow]: "控制流",
  [DiagnosticCategory.PipelineIO]: "管线 IO",
  [DiagnosticCategory.RenderState]: "RenderState"
};

// Dropdown labels: `<category-label> / <code>` for DiagnosticTypes, plain `Multiple errors` for the preset.
// Order: Multiple errors first, then grouped by DiagnosticCategory declaration order, alphabetical
// within each group. label→code map so onChange can look the SAMPLES entry up by raw code.
const CATEGORY_ORDER = Object.values(DiagnosticCategory);
const LABEL_TO_KEY: Record<string, string> = { [MULTI_KEY]: MULTI_KEY };
const codeKeys = Object.keys(SAMPLES).filter((k) => k !== MULTI_KEY) as DiagnosticType[];
codeKeys.sort((a, b) => {
  const ca = CATEGORY_ORDER.indexOf(DIAGNOSTIC_CATEGORY[a]);
  const cb = CATEGORY_ORDER.indexOf(DIAGNOSTIC_CATEGORY[b]);
  return ca !== cb ? ca - cb : a.localeCompare(b);
});
for (const code of codeKeys) LABEL_TO_KEY[`${CATEGORY_LABEL[DIAGNOSTIC_CATEGORY[code]]} / ${code}`] = code;

const DEFAULT_KEY = MULTI_KEY;

const ERROR_COLOR = "#f14c4c";
const WARNING_COLOR = "#cca700";

const style = document.createElement("style");
style.textContent = `
  html, body { height: 100%; margin: 0; background: #1e1e1e; }
  #pg { display: flex; height: 100vh; color: #d4d4d4;
    font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

  /* left editor pane: [ gutter | textarea ] */
  #pane { display: flex; flex: 1; min-width: 0; }
  #gutter { flex: 0 0 52px; box-sizing: border-box; overflow: hidden;
    padding: 16px 8px 16px 0; text-align: right; color: #6a6a6a; user-select: none;
    background: #1e1e1e; border-right: 1px solid #2a2a2a; white-space: pre;
    font: inherit; line-height: 1.6; }
  #ed { box-sizing: border-box; flex: 1; min-width: 0; margin: 0; padding: 16px; border: 0;
    font: inherit; line-height: 1.6; tab-size: 2; white-space: pre; word-wrap: normal;
    color: #d4d4d4; background: transparent; caret-color: #d4d4d4;
    resize: none; outline: none; overflow: auto; }

  /* right diagnostics panel = simulated console */
  #out { width: 42%; min-width: 360px; overflow: auto; border-left: 1px solid #333; padding: 12px 16px; }
  #pg h3 { margin: 0 0 12px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #888; }
  #pg .ok { color: #4ec9b0; }

  /* one diagnostic block: the built-in formatter's text in a <pre>, only colors are CSS */
  #pg .diag { margin: 0 0 14px; border-left: 3px solid #888; padding: 8px 12px; background: #252526;
    border-radius: 3px; }
  #pg .diag.error { border-color: ${ERROR_COLOR}; }
  #pg .diag.warning { border-color: ${WARNING_COLOR}; }
  #pg .diag pre { margin: 0; white-space: pre; overflow-x: auto;
    font: inherit; line-height: 1.5; }
  #pg .diag .gut { color: #6a6a6a; }   /* gutter line numbers + '|' */
  #pg .diag .src { color: #d4d4d4; }   /* source line text */
  #pg .diag.error .hl { color: ${ERROR_COLOR}; }   /* header + caret rows */
  #pg .diag.warning .hl { color: ${WARNING_COLOR}; }
`;
document.head.appendChild(style);
document.body.innerHTML =
  `<div id="pg">` +
  `<div id="pane"><div id="gutter"></div>` +
  `<textarea id="ed" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea></div>` +
  `<div id="out"></div>` +
  `</div>`;

const editor = document.getElementById("ed") as HTMLTextAreaElement;
const gutter = document.getElementById("gutter") as HTMLDivElement;
const output = document.getElementById("out") as HTMLDivElement;

const analyzer = new ShaderAnalyzer();

type Diag = ReturnType<ShaderAnalyzer["analyze"]>["diagnostics"][number];

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

// Render the built-in formatter's text as colored HTML — layout/line-numbers/carets all come
// from `formatDiagnostic`; only the colors are CSS. Line 0 is the header; a row whose content
// after the `|` is just `^`/spaces is a caret row; both get the severity color. The gutter
// (`n | ` or ` | `) is dim, the source text is default.
function renderConsoleBlock(d: Diag): string {
  const text = formatDiagnostic(d);
  const lines = text.split("\n");

  const rows = lines.map((line, i) => {
    if (i === 0) return `<span class="hl">${escapeHtml(line)}</span>`; // header

    const m = line.match(/^(\s*\d* \| )(.*)$/); // gutter prefix + remainder
    if (!m) return escapeHtml(line);
    const gutter = `<span class="gut">${escapeHtml(m[1])}</span>`;
    const rest = m[2];
    const cls = /^[\^ ]*$/.test(rest) ? "hl" : "src"; // caret row vs source row
    return `${gutter}<span class="${cls}">${escapeHtml(rest)}</span>`;
  });

  return `<div class="diag ${d.severity}"><pre>${rows.join("\n")}</pre></div>`;
}

const config = { diagnostic: DEFAULT_KEY };

function renderGutter(lineCount: number): void {
  let s = "";
  for (let i = 1; i <= lineCount; i++) s += i + "\n";
  gutter.textContent = s;
}

function renderConsole(diagnostics: Diag[]): void {
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
  const { diagnostics } = analyzer.analyze(src);
  renderGutter(src.split("\n").length);
  renderConsole(diagnostics);
}

function syncScroll(): void {
  gutter.scrollTop = editor.scrollTop;
}

editor.addEventListener("scroll", syncScroll);

let timer = 0;
editor.addEventListener("input", () => {
  clearTimeout(timer);
  timer = window.setTimeout(render, 150);
});

const gui = new dat.GUI();
gui
  .add(config, "diagnostic", Object.keys(LABEL_TO_KEY))
  .name("Diagnostic")
  .onChange((label: string) => {
    editor.value = SAMPLES[LABEL_TO_KEY[label]];
    editor.scrollTop = 0;
    editor.scrollLeft = 0;
    syncScroll();
    render();
  });

editor.value = SAMPLES[DEFAULT_KEY];
render();
