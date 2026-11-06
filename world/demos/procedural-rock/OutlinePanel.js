import { makeConstrainedRockOutline, normalizeRockNotches } from "./generator/outline.js";
const root = document.getElementById("rock-outline-constraints"),
  q = (n) => root.querySelector("[data-" + n + "]"),
  canvas = root.querySelector("canvas"),
  ctx = canvas.getContext("2d");
const defaults = {
  seed: 4248,
  aspect: 2.8,
  taper: 0.4,
  cut: 0.2,
  coverage: 1,
  wave: 0.096,
  scale: 0.35,
  chip: 0.04,
  fineScale: 0.014,
  notches: 1,
  notchWidth: 0.016,
  notchDepth: 0.005
};
function restored(saved) {
  const { preset, ...parameters } = saved?.constraintParameters || {};
  return normalizeRockNotches({
    ...defaults,
    ...parameters,
    ...(saved?.constraintVersion === 2 ? {} : { coverage: 1 })
  });
}
let saved;
try {
  saved = JSON.parse(localStorage.getItem("rock-outline-example") || "null");
} catch {}
let state = restored(saved);
let shape,
  elapsed = 0;
const defs = [
    ["aspect", "高宽比（高 / 基准宽）", 1, 3, 0.05, "ratio"],
    ["taper", "上窄下宽 ↔ 上宽下窄", -0.4, 0.4, 0.02, "taper"],
    ["cut", "主轮廓削角范围", 0, 0.45, 0.01, "width"],
    ["coverage", "起伏覆盖率", 0, 1, 0.02, "percent"],
    ["wave", "大尺度起伏幅度", 0, 0.12, 0.002, "width"],
    ["scale", "大尺度起伏尺度", 0.04, 0.35, 0.01, "perimeter"],
    ["chip", "短波细节幅度", 0, 0.04, 0.001, "width"],
    ["fineScale", "短波细节尺度", 0.014, 0.12, 0.001, "perimeter"],
    ["notches", "缺口数量", 1, 8, 1, "int"],
    ["notchWidth", "缺口宽度", 0.016, 0.16, 0.002, "perimeter"],
    ["notchDepth", "请求缺口深度", 0.005, 0.24, 0.005, "width"]
  ],
  controls = {};
for (const [k, label, min, max, step, unit] of defs) {
  const el = document.createElement("label");
  el.className = "form-label";
  el.innerHTML =
    '<span class="rc-label"><span>' +
    label +
    '</span><span class="tabular-nums"></span></span><input class="form-range" type="range" aria-label="' +
    label +
    '" min="' +
    min +
    '" max="' +
    max +
    '" step="' +
    step +
    '">';
  root.querySelector(".rc-controls").append(el);
  controls[k] = { input: el.querySelector("input"), out: el.querySelector(".tabular-nums"), unit };
  controls[k].input.oninput = (e) => {
    state[k] = +e.target.value;
    sync();
    update();
  };
  controls[k].input.onchange = save;
}
function sync() {
  state = normalizeRockNotches(state);
  q("seed").value = state.seed;
  for (const [k, c] of Object.entries(controls)) {
    c.input.value = state[k];
    c.out.textContent =
      c.unit === "int"
        ? state[k]
        : c.unit === "ratio"
          ? state[k].toFixed(2)
          : c.unit === "taper"
            ? "上 / 下 " + ((1 + state[k]) / (1 - state[k])).toFixed(2)
            : (state[k] * 100).toFixed(1) + (c.unit === "width" ? "% 基准宽" : c.unit === "perimeter" ? "% 周长" : "%");
  }
}
function update() {
  const p = { ...state, lean: 0, round: 0.06 },
    t = performance.now();
  shape = makeConstrainedRockOutline(p);
  elapsed = performance.now() - t;
  const s = shape.stats;
  q("readout").textContent =
    "实际缺口 " +
    (s.notchPeak * 100).toFixed(2) +
    "% · 短波 " +
    (s.finePeak * 100).toFixed(2) +
    "% 基准宽 · 特征转向 " +
    s.angles.maxFeatureTurn.toFixed(1) +
    "° / 90°" +
    (Math.abs(s.effectiveCut - s.requestedCut) > 1e-6 ? " · 削角实际 " + (s.effectiveCut * 100).toFixed(1) + "%" : "") +
    " · " +
    (s.angles.passed ? "角度检查通过" : "角度检查未通过") +
    " · 生成 " +
    elapsed.toFixed(2) +
    " ms";
  draw();
}
function save() {
  try {
    localStorage.setItem("rock-outline-example", JSON.stringify({ constraintVersion: 2, constraintParameters: state }));
  } catch {}
}
q("seed").onchange = (e) => {
  state.seed = Math.max(1, Math.min(999999, Math.floor(+e.target.value) || 1));
  sync();
  update();
  save();
};
q("next").onclick = () => {
  state.seed = (state.seed % 990000) + 137;
  sync();
  update();
  save();
};

function draw() {
  if (!shape) return;
  const r = canvas.getBoundingClientRect(),
    ratio = Math.min(devicePixelRatio || 1, 2);
  if (!r.width || !r.height) return;
  canvas.width = Math.round(r.width * ratio);
  canvas.height = Math.round(r.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  const points = shape.contour,
    xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const minx = Math.min(...xs),
    maxx = Math.max(...xs),
    miny = Math.min(...ys),
    maxy = Math.max(...ys);
  const cx = (minx + maxx) / 2,
    cy = (miny + maxy) / 2,
    scale = Math.min((r.width - 36) / (maxx - minx), (r.height - 36) / (maxy - miny));
  ctx.beginPath();
  points.forEach((p, k) => {
    const x = r.width / 2 + (p[0] - cx) * scale,
      y = r.height / 2 - (p[1] - cy) * scale;
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  const accent = getComputedStyle(root).getPropertyValue("--accent").trim();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.08;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}
new ResizeObserver(draw).observe(canvas);
sync();
update();
