// Card-based debug panel: each debug view + each layer source is a full-width card with room for
// future editor / download / brush buttons. Cards stack in a scrollable body, header shows the
// live render state, and an ⊗ button both indicates "currently in debug" and returns to normal.
//
// Everything renders raw data (bytes going into the shader) or triggers a shader debug view via
// the callbacks. Downloads / brushes are placeholders — the card layout has explicit space so
// they slot in without redesign.

import { TerrainDebugMode } from "../TerrainMaterial";

export interface OverlayRegionData {
  regionId: string;
  resolution: number;
  /** unorm [0, 1] heightmap sample copy (same values the R16F texture holds). */
  heightsNorm: Float32Array;
  control: Uint32Array;
  minMetres: number;
  maxMetres: number;
}

export interface LayerThumb {
  layerId: number;
  name: string;
  kind: string;
  albedoUrl?: string;
  normalUrl?: string;
}

export interface OverlayCallbacks {
  /** Fires whenever the user picks a debug view or restores normal rendering. */
  onDebugSelected(mode: TerrainDebugMode, layerId: number, label: string): void;
}

export interface OverlayHandles {
  root: HTMLDivElement;
  destroy(): void;
}

function drawCategoricalById(
  canvas: HTMLCanvasElement,
  size: number,
  values: (i: number) => number,
  palette: string[]
): void {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const cache = new Map<number, [number, number, number]>();
  const parse = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
  for (let i = 0; i < size * size; i++) {
    const id = values(i);
    let rgb = cache.get(id);
    if (!rgb) {
      rgb = parse(palette[id % palette.length] ?? "#ffffff");
      cache.set(id, rgb);
    }
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function drawGray(canvas: HTMLCanvasElement, size: number, values: (i: number) => number): void {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, Math.round(values(i) * 255)));
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

interface CardSpec {
  label: string;
  bitDoc: string;
  description: string;
  mode: TerrainDebugMode | null; // null = source-only card (no shader debug view)
  debugLayerId: number;
  paintThumb?: (canvas: HTMLCanvasElement, size: number) => void;
  imageUrls?: { tag: string; url: string }[];
}

interface CardSection {
  title: string;
  cards: CardSpec[];
}

export function mountAssetOverlay(
  host: HTMLElement,
  region: OverlayRegionData,
  layers: LayerThumb[],
  callbacks: OverlayCallbacks
): OverlayHandles {
  const THUMB_SIZE = 128;
  const PANEL_WIDTH = 320;

  const root = document.createElement("div");
  root.className = "terrain-overlay";
  // Panel is `top:60px` (skips the "1×1 tile" status line at the very top-left) + normal column
  // direction (header on top, body underneath). Collapsing hides the body → panel shrinks bottom-
  // up while the header stays anchored to top. Matches the user's "点击标题从下往上折叠" intent.
  root.style.cssText = [
    "position:fixed",
    "left:8px",
    "top:60px",
    `width:${PANEL_WIDTH}px`,
    "max-height:calc(100vh - 76px)",
    "display:flex",
    "flex-direction:column",
    "background:rgba(20,20,28,0.92)",
    "color:#d8d8dc",
    "font:11px/1.4 -apple-system, monospace",
    "border-radius:6px",
    "box-shadow:0 4px 18px rgba(0,0,0,0.4)",
    "z-index:9999",
    "overflow:hidden"
  ].join(";");

  // Header: title (click to fold) + dynamic status pill + ⊗ toggle button.
  const header = document.createElement("div");
  header.style.cssText =
    "padding:8px 10px;background:#151520;display:flex;flex-wrap:nowrap;justify-content:space-between;align-items:center;gap:6px;cursor:pointer;user-select:none";
  const titleGroup = document.createElement("div");
  titleGroup.style.cssText = "display:flex;flex-direction:column;gap:2px;flex:1;overflow:hidden";
  const title = document.createElement("span");
  title.textContent = "Terrain Debug";
  title.title = "点击折叠 / 展开";
  title.style.cssText = "font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
  const status = document.createElement("span");
  status.style.cssText = "font-size:10px;opacity:0.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
  status.textContent = `region ${region.regionId} · ${region.resolution}×${region.resolution} · 正常渲染`;
  titleGroup.appendChild(title);
  titleGroup.appendChild(status);
  const toggleBtn = document.createElement("button");
  toggleBtn.textContent = "⊗ 退出调试";
  toggleBtn.disabled = true;
  toggleBtn.style.cssText =
    "font-size:10px;background:#2c2c3a;border:1px solid #3a3a4a;color:#d8d8dc;padding:3px 8px;border-radius:3px;cursor:pointer;white-space:nowrap;flex-shrink:0;opacity:0.5";
  header.appendChild(titleGroup);
  header.appendChild(toggleBtn);
  root.appendChild(header);

  const body = document.createElement("div");
  body.style.cssText = "overflow-y:auto;overflow-x:hidden;padding:8px;flex:1;min-height:0;display:flex;flex-direction:column;gap:8px";
  root.appendChild(body);

  let collapsed = false;
  header.addEventListener("click", (e) => {
    if (e.target === toggleBtn) return;
    collapsed = !collapsed;
    body.style.display = collapsed ? "none" : "flex";
  });

  // ---------- data prep ----------
  const N = region.resolution;
  const step = Math.max(1, Math.floor(N / THUMB_SIZE));
  const smallN = Math.floor(N / step);
  const sample = <T>(arr: ArrayLike<T>, i: number): T => {
    const y = Math.floor(i / smallN) * step;
    const x = (i % smallN) * step;
    return arr[y * N + x];
  };
  const controlAt = (i: number): number => sample(region.control, i);
  const bit = (i: number, shift: number) => (controlAt(i) >>> shift) & 1;
  const field = (i: number, shift: number, mask: number) => (controlAt(i) >>> shift) & mask;
  const heightsNormalised = (i: number): number => sample(region.heightsNorm, i);

  // ---------- section: source data (heightmap) ----------
  const sections: CardSection[] = [];
  sections.push({
    title: "数据 Data",
    cards: [
      {
        label: "HeightMap",
        bitDoc: "renderer_HeightMap · R16F",
        description: `灰度 = 海拔归一化 · [${region.minMetres.toFixed(0)}m, ${region.maxMetres.toFixed(0)}m]`,
        mode: TerrainDebugMode.HeightmapView,
        debugLayerId: 0,
        paintThumb: (c, s) => drawGray(c, s, heightsNormalised)
      }
    ]
  });

  // ---------- section: controlmap bit fields, ordered by bit ascending ----------
  const bitCards: CardSpec[] = [
    {
      label: "autoshader",
      bitDoc: "bit 0",
      description: "T3D auto_shader.glsl · 1 = shader 按 slope 覆盖 blend(左半黑=painted, 右半白=auto)",
      mode: TerrainDebugMode.AutoshaderMask,
      debugLayerId: 0,
      paintThumb: (c, s) => drawGray(c, s, (i) => bit(i, 0))
    },
    {
      label: "nav",
      bitDoc: "bit 1",
      description: "navigation 可通行 · 未来 foliage/agent 路径判定",
      mode: TerrainDebugMode.NavMask,
      debugLayerId: 0,
      paintThumb: (c, s) => drawGray(c, s, (i) => bit(i, 1))
    },
    {
      label: "hole",
      bitDoc: "bit 2",
      description: "terrain 挖洞不渲染 · 目前 baker 不主动开",
      mode: TerrainDebugMode.HoleMask,
      debugLayerId: 0,
      paintThumb: (c, s) => drawGray(c, s, (i) => bit(i, 2))
    },
    {
      label: "uvScale",
      bitDoc: "bit 10-8 (0-7)",
      description: "每 texel UV 缩放档位 · 灰度 = 值/7",
      mode: TerrainDebugMode.UvScale,
      debugLayerId: 0,
      paintThumb: (c, s) => drawGray(c, s, (i) => field(i, 8, 0x7) / 7)
    },
    {
      label: "uvRot",
      bitDoc: "bit 13-11 (0-15)",
      description: "每 texel UV 旋转档位 · 灰度 = 值/15",
      mode: TerrainDebugMode.UvRotation,
      debugLayerId: 0,
      paintThumb: (c, s) => drawGray(c, s, (i) => field(i, 11, 0xf) / 15)
    },
    {
      label: "blend",
      bitDoc: "bit 21-14 (0-255)",
      description: "baked base→overlay 混合权重 · 灰度 = 值/255",
      mode: TerrainDebugMode.BlendWeight,
      debugLayerId: 0,
      paintThumb: (c, s) => drawGray(c, s, (i) => field(i, 14, 0xff) / 255)
    }
  ];
  // base_id / overlay_id distribution — categorical colours pulled from the layer palette so the
  // thumbnail is self-explanatory (green tile → grass base, grey tile → rock, blue → water).
  const layerPalette: string[] = [];
  for (const l of layers) layerPalette[l.layerId] = l.kind === "Water" ? "#4a90c4" : l.kind === "Terrain" ? (l.name.includes("rock") ? "#8f8783" : "#71a758") : "#c48f4c";
  // Fill any gaps so `id % palette.length` never picks up an undefined slot.
  for (let i = 0; i < 32; i++) if (!layerPalette[i]) layerPalette[i] = "#3d3d46";
  bitCards.push({
    label: "base_id 分布",
    bitDoc: "bit 31-27 (0-31)",
    description: "每 texel 的 base 层选择(baked, 未经 autoshader 覆盖)。颜色对应 manifest 层",
    mode: TerrainDebugMode.BaseIdView,
    debugLayerId: 0,
    paintThumb: (c, s) => drawCategoricalById(c, s, (i) => field(i, 27, 0x1f), layerPalette)
  });
  bitCards.push({
    label: "overlay_id 分布",
    bitDoc: "bit 26-22 (0-31)",
    description: "每 texel 的 overlay 层选择(baked)。混合权重看下方 blend 卡",
    mode: TerrainDebugMode.OverlayIdView,
    debugLayerId: 0,
    paintThumb: (c, s) => drawCategoricalById(c, s, (i) => field(i, 22, 0x1f), layerPalette)
  });
  // "Highlight one specific layer" card per layer — matches the LayerMask debug mode's DebugLayerId
  // filter. Water/other kinds shown too since findRegionsByLayerKind works for them.
  for (const l of layers) {
    if (l.layerId > 30) continue;
    bitCards.push({
      label: `layer ${l.layerId} · ${l.name}`,
      bitDoc: `${l.kind} · mask base==${l.layerId} 或 overlay==${l.layerId}`,
      description: `Kind = ${l.kind} · 高亮该 layer 参与的 texel(base 或 overlay 命中)`,
      mode: TerrainDebugMode.LayerMask,
      debugLayerId: l.layerId,
      paintThumb: (c, s) => drawGray(c, s, (i) => (field(i, 27, 0x1f) === l.layerId || field(i, 22, 0x1f) === l.layerId ? 1 : 0))
    });
  }
  sections.push({ title: "ControlMap 位段 (bit 升序)", cards: bitCards });

  // ---------- section: layer source textures ----------
  const layerCards: CardSpec[] = [];
  for (const l of layers) {
    if (!l.albedoUrl) continue;
    const imgs: { tag: string; url: string }[] = [{ tag: "albedo", url: l.albedoUrl }];
    if (l.normalUrl) imgs.push({ tag: "normal", url: l.normalUrl });
    layerCards.push({
      label: `Layer ${l.layerId} · ${l.name}`,
      bitDoc: `${l.kind} · Texture2DArray slot`,
      description: "PBR 贴图源(CC0)",
      mode: null,
      debugLayerId: l.layerId,
      imageUrls: imgs
    });
  }
  if (layerCards.length) sections.push({ title: "Layer 贴图源", cards: layerCards });

  // ---------- render + state ----------
  let activeCard: HTMLDivElement | null = null;
  const applyActive = (el: HTMLDivElement, active: boolean) => {
    el.style.outline = active ? "2px solid #ffb84d" : "";
    el.style.background = active ? "rgba(255, 184, 77, 0.10)" : "rgba(255,255,255,0.03)";
  };
  const clearActive = (silent = false) => {
    if (activeCard) applyActive(activeCard, false);
    activeCard = null;
    toggleBtn.disabled = true;
    toggleBtn.style.opacity = "0.5";
    status.textContent = `region ${region.regionId} · ${region.resolution}×${region.resolution} · 正常渲染`;
    if (!silent) callbacks.onDebugSelected(TerrainDebugMode.Off, 0, "关闭");
  };
  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    clearActive();
  });

  for (const section of sections) {
    const sh = document.createElement("div");
    sh.style.cssText = "font-weight:600;font-size:11px;letter-spacing:0.02em;padding:2px 0;color:#ffb84d";
    sh.textContent = section.title;
    body.appendChild(sh);
    for (const spec of section.cards) {
      const card = document.createElement("div");
      card.style.cssText =
        "display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:5px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.04)" +
        (spec.mode !== null ? ";cursor:pointer" : "");
      // Top row: label + bit / resolution info.
      const top = document.createElement("div");
      top.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;gap:6px";
      const l = document.createElement("span");
      l.textContent = spec.label;
      l.style.cssText = "font-weight:600;font-size:11px";
      const res = document.createElement("span");
      res.textContent = `${region.resolution}×${region.resolution}`;
      res.style.cssText = "font-size:9px;opacity:0.55";
      top.appendChild(l);
      top.appendChild(res);
      card.appendChild(top);
      const bitRow = document.createElement("span");
      bitRow.textContent = spec.bitDoc;
      bitRow.style.cssText = "font-size:10px;opacity:0.6";
      card.appendChild(bitRow);
      const descRow = document.createElement("span");
      descRow.textContent = spec.description;
      descRow.style.cssText = "font-size:10px;opacity:0.75";
      card.appendChild(descRow);
      // Preview area.
      if (spec.paintThumb) {
        const canvas = document.createElement("canvas");
        canvas.style.cssText = `width:${THUMB_SIZE}px;height:${THUMB_SIZE}px;image-rendering:pixelated;background:#000;border-radius:3px;align-self:center`;
        spec.paintThumb(canvas, smallN);
        card.appendChild(canvas);
      }
      if (spec.imageUrls) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:6px;justify-content:center";
        for (const it of spec.imageUrls) {
          const w = document.createElement("div");
          w.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px";
          const tag = document.createElement("span");
          tag.textContent = it.tag;
          tag.style.cssText = "font-size:9px;opacity:0.6";
          const img = document.createElement("img");
          img.src = it.url;
          img.style.cssText = `width:${THUMB_SIZE}px;height:${THUMB_SIZE}px;image-rendering:pixelated;background:#000;border-radius:3px`;
          w.appendChild(tag);
          w.appendChild(img);
          row.appendChild(w);
        }
        card.appendChild(row);
      }
      // Action row placeholder — future editor / download / brush buttons slot here without
      // restructuring the card.
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:4px;justify-content:flex-end;min-height:12px";
      card.appendChild(actions);

      applyActive(card, false);
      if (spec.mode !== null) {
        card.addEventListener("click", () => {
          if (activeCard === card) {
            clearActive();
            return;
          }
          if (activeCard) applyActive(activeCard, false);
          applyActive(card, true);
          activeCard = card;
          toggleBtn.disabled = false;
          toggleBtn.style.opacity = "1";
          status.textContent = `region ${region.regionId} · ${region.resolution}×${region.resolution} · 调试: ${spec.label}`;
          callbacks.onDebugSelected(spec.mode!, spec.debugLayerId, spec.label);
        });
      }
      body.appendChild(card);
    }
  }

  host.appendChild(root);
  return {
    root,
    destroy() {
      root.remove();
    }
  };
}
