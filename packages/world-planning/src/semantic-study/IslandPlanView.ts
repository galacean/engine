import { onlyLandscapeDrawingChanged } from "./PlanningDerivedPatch";
import { poiMemberIds } from "./PoiContents";
import { planningFocusBox } from "./PlanningFocus";
import type { PresentationComponents } from "../spatial/PlanningPresentation";
import { planningVectorSurface } from "./PlanningVectorSurface";
import { drawPlanningVolumes } from "./WorldVolumeProjection";
import type { WorldPlanning3DView } from "./WorldPlanning3DView";
import { drawBaseMap, drawPlanLandscape } from "./BaseMapDrawing";
import "./IslandPlan.css";
import { drawVillagePlan } from "./WorldVillageDrawing";
import { DEFAULT_ISLAND_PLAN_PARAMETERS, generateIslandPlan } from "./IslandPlanGenerator";
import type { IslandPlan, PlanPoint, PlanRock } from "./IslandPlanModel";

const LAYER_DEFINITIONS = {
  ocean: ["海洋", "#173a50"],
  land: ["草地 / 陆地", "#839976"],
  slope: ["泥土缓坡区域", "#c6ad71"],
  water: ["河流 / 湖泊", "#39a3d1"],
  rock: ["岩体轮廓", "#84919a"],
  obb: ["岩石 OBB", "#45dce0"],
  group: ["山群范围", "#c780e5"],
  cluster: ["岩石堆范围", "#91b7c9"],
  island: ["离岸岛屿范围", "#63c9ba"],
  ridge: ["山脊骨架", "#ef9c44"],
  road: ["地面道路", "#f5edd7"],
  ridgeRoad: ["山脊道路", "#e6ac4f"],
  support: ["登高 / 山脊 OBB", "#bce6db"],
  bridge: ["桥梁", "#ab8658"],
  building: ["建筑 OBB", "#ffe06b"],
  village: ["村落范围", "#ee9c55"],
  teleport: ["传送点", "#b79734"],
  open: ["开敞区域", "#6d9643"],
  place: ["活动区 / 入口", "#f5e2a4"],
  sight: ["视线意图", "#ec82dd"],
  spawn: ["出生点", "#eff7ea"],
  furniture: ["方向 / 比例尺", "#abc7d9"]
} as const;
type PlanLayer = keyof typeof LAYER_DEFINITIONS;
const defaultLayers = (): PlanLayers =>
  Object.fromEntries(Object.keys(LAYER_DEFINITIONS).map((key) => [key, true])) as PlanLayers;
type PlanLayers = Record<PlanLayer, boolean>;
type PlanViewBox = { x: number; z: number; width: number; depth: number };
interface FeatureDescription {
  title: string;
  type: string;
  purpose: string;
  values: [string, string][];
}

/** Read-only state for inspecting the actual vector plan and the active editing controls. */
export interface IslandPlanPageHandle {
  getState(): { plan: IslandPlan; selectedId: string | null; layers: PlanLayers; revision: number };
  dispose(): void;
}
declare global {
  interface Window {
    islandPlanPage?: IslandPlanPageHandle;
  }
}

const NS = "http://www.w3.org/2000/svg";
const ROLE_LABELS: Record<PlanRock["role"], string> = {
  peak: "主峰与远景轮廓",
  wall: "边界与空间收束",
  shoulder: "山肩与地势承接",
  terrace: "台地与观景停留",
  skirt: "山脚过渡"
};
const ROUTE_LABELS = { main: "主要动线", ridge: "山脊动线", shore: "沿岸动线" };
const ROUTE_COLORS = { main: "#f5edd7", ridge: "#e6ac4f", shore: "#e5d4a2" };
const number = (value: number): string => String(Math.round(value * 100) / 100);
const xml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const ring = (points: PlanPoint[]): string =>
  points.map((p, index) => `${index ? "L" : "M"}${number(p.x)},${number(p.z)}`).join(" ") + " Z";
const line = (points: PlanPoint[]): string =>
  points.map((p, index) => `${index ? "L" : "M"}${number(p.x)},${number(p.z)}`).join(" ");
const point = (p: PlanPoint): string => `${number(p.x)},${number(p.z)}`;
const feature = (id: string, label: string, className: string, contents: string): string =>
  `<g class="ip-feature ${className}" data-feature-id="${xml(id)}" role="button" tabindex="0" aria-label="${xml(label)}"><title>${xml(label)}</title>${contents}</g>`;

/** Crisp, selectable SVG projection of the generator's exact polygons, rectangles and route points. */
export class IslandPlanView {
  readonly svg = document.createElementNS(NS, "svg");
  private readonly resizeObserver?: ResizeObserver;
  private readonly portTooltip = document.createElement("div");
  private plan: IslandPlan | null = null;
  private oblique = false;
  private presentation: PresentationComponents = [];
  setPresentation(value: PresentationComponents): void {
    this.presentation = value;
    this.worldView?.setPresentation(value);
  }
  private worldView: WorldPlanning3DView | null = null;
  sampleWater(x: number, z: number, id?: string) {
    if (!this.oblique || !this.worldView) throw new Error("MISSING_DEPENDENCY: 请先打开白盒或 3D 场景");
    return this.worldView.sampleWater(x, z, id);
  }
  sampleDrops(x: number, y: number, z: number, id?: string) {
    if (!this.oblique || !this.worldView) throw new Error("MISSING_DEPENDENCY: 请先打开白盒或 3D 场景");
    return this.worldView.sampleDrops(x, y, z, id);
  }
  private worldFramed = false;
  private loadingWorld: Promise<WorldPlanning3DView> | null = null;
  private disposed = false;
  private disposePromise?: Promise<void>;
  private selection: string | null = null;
  private contextElements = new Set<string>();
  private contextPaths = new Set<string>();
  private layers: Record<string, boolean> = defaultLayers();
  private box: PlanViewBox = { x: 0, z: 0, width: 1536, depth: 1024 };
  private drag: { x: number; y: number; box: PlanViewBox; moved: boolean } | null = null;
  private suppressClick = false;
  private readonly abort = new AbortController();

  /** Mount the vector canvas. Selecting a feature never changes the camera framing. */
  constructor(
    private readonly host: HTMLElement,
    private readonly onSelect: (id: string | null) => void,
    private readonly selectable = true
  ) {
    this.svg.classList.add("ip-svg");
    this.svg.setAttribute("role", "graphics-document");
    this.svg.setAttribute("aria-label", "岛屿空间规划图，可选择岩体、山群、动线、水系与视线意图");
    this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    host.append(this.svg);
    this.resizeObserver = new ResizeObserver(() => this.applyViewBox());
    this.resizeObserver.observe(this.svg);
    this.portTooltip.className = "ip-port-tooltip";
    this.portTooltip.setAttribute("role", "tooltip");
    this.portTooltip.hidden = true;
    document.body.append(this.portTooltip);
    const events = { signal: this.abort.signal };
    this.svg.addEventListener(
      "pointermove",
      (event) => {
        const feature = (event.target as Element).closest<SVGElement>("[data-feature-id]");
        if (event.buttons || !feature?.querySelector("[data-internal-port]")) {
          this.portTooltip.hidden = true;
          return;
        }
        this.portTooltip.textContent = feature.getAttribute("aria-label");
        this.portTooltip.hidden = false;
        const bounds = this.portTooltip.getBoundingClientRect();
        this.portTooltip.style.left = `${Math.max(8, Math.min(event.clientX + 14, window.innerWidth - bounds.width - 8))}px`;
        this.portTooltip.style.top = `${Math.max(8, Math.min(event.clientY + 14, window.innerHeight - bounds.height - 8))}px`;
      },
      events
    );
    for (const event of ["pointerleave", "pointerdown", "wheel"] as const)
      this.svg.addEventListener(
        event,
        () => {
          this.portTooltip.hidden = true;
        },
        events
      );
    this.svg.addEventListener(
      "click",
      (event) => {
        if (!this.selectable) return;
        if (this.suppressClick) {
          this.suppressClick = false;
          return;
        }
        const node = (event.target as Element).closest<SVGElement>("[data-feature-id]");
        this.onSelect(node?.dataset.featureId ?? null);
      },
      events
    );
    this.svg.addEventListener(
      "keydown",
      (event) => {
        if (!this.selectable) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        const node = (event.target as Element).closest<SVGElement>("[data-feature-id]");
        if (!node) return;
        event.preventDefault();
        this.onSelect(node.dataset.featureId ?? null);
      },
      events
    );
    this.svg.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.zoom(Math.exp(-event.deltaY * 0.001), event.clientX, event.clientY);
      },
      { ...events, passive: false }
    );
    this.svg.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0) return;
        this.drag = { x: event.clientX, y: event.clientY, box: { ...this.box }, moved: false };
        // Capture only after the drag threshold, preserving click target selection.
      },
      events
    );
    this.svg.addEventListener(
      "pointermove",
      (event) => {
        if (!this.drag) return;
        const rect = this.svg.getBoundingClientRect(),
          scale = Math.min(rect.width / this.box.width, rect.height / this.box.depth);
        const dx = event.clientX - this.drag.x,
          dy = event.clientY - this.drag.y;
        if (Math.hypot(dx, dy) > 3) this.drag.moved = true;
        if (!this.drag.moved || !scale) return;
        this.svg.setPointerCapture(event.pointerId);
        const inverse = this.svg.getScreenCTM()?.inverse();
        // Screen-to-map deltas include the optional 45-degree affine planning projection.
        const mapX = inverse ? inverse.a * dx + inverse.c * dy : dx / scale;
        const mapZ = inverse ? inverse.b * dx + inverse.d * dy : dy / scale;
        this.box.x = this.drag.box.x - mapX;
        this.box.z = this.drag.box.z - mapZ;
        this.applyViewBox();
      },
      events
    );
    this.svg.addEventListener(
      "pointerup",
      () => {
        this.suppressClick = !!this.drag?.moved;
        this.drag = null;
      },
      events
    );
    this.svg.addEventListener(
      "pointercancel",
      () => {
        this.drag = null;
      },
      events
    );
  }

  /** Replace only map geometry; sidebar controls remain mounted during parameter input. */
  /** Host preparation is part of the editor transaction while the native preview is active. */
  async publishPlan(plan: IslandPlan, signal: AbortSignal, accept: () => void): Promise<void> {
    signal.throwIfAborted();
    if (this.oblique && this.worldView) await this.worldView.setPlan(plan, undefined, { signal, accept });
    else accept();
  }
  setPlan(plan: IslandPlan, revision: number, landscapeOnly = false): void {
    const resized =
      !this.plan ||
      this.plan.parameters.width !== plan.parameters.width ||
      this.plan.parameters.depth !== plan.parameters.depth;
    landscapeOnly = landscapeOnly && onlyLandscapeDrawingChanged(this.plan, plan);
    this.plan = plan;
    if (this.oblique)
      void this.worldView
        ?.setPlan(plan)
        .catch((error) =>
          this.host.dispatchEvent(new CustomEvent("planning-render-error", { bubbles: true, detail: String(error) }))
        );
    this.svg.setAttribute(
      "aria-label",
      plan.mode === "base-map"
        ? "空间布局规划：陆域、POI、体量、道路和景观"
        : "岛屿空间规划图，可选择岩体、山群、动线、水系与视线意图"
    );
    const { width, depth } = plan.parameters;
    this.svg.dataset.planRevision = String(revision);
    this.svg.dataset.seed = String(plan.parameters.seed);
    this.svg.dataset.width = String(width);
    this.svg.dataset.depth = String(depth);
    if (!this.oblique) {
      const landscape = landscapeOnly && this.svg.querySelector('[data-plan-layer="landscape"]');
      if (landscape) landscape.outerHTML = drawPlanLandscape(plan);
      else this.svg.innerHTML = this.draw(plan);
    }
    if (!this.selectable)
      for (const node of this.svg.querySelectorAll<SVGElement>("[data-feature-id]")) {
        node.removeAttribute("role");
        node.removeAttribute("tabindex");
        node.style.cursor = "inherit";
      }
    this.setLayers(this.layers);
    this.setSelection(this.selection);
    if (resized) this.fit();
    else this.applyViewBox();
  }

  /** Switch to the GPU camera without modifying the 2D framing or world dimensions. */
  async setProjection(oblique: boolean, production = false): Promise<void> {
    this.oblique = oblique;
    if (!oblique) {
      this.worldView?.setActive(false);
      if (this.plan) {
        this.svg.innerHTML = this.draw(this.plan);
        this.setLayers(this.layers);
        this.setSelection(this.selection);
      }
      this.svg.style.display = "";
      this.svg.dataset.projection = "plan";
      this.applyViewBox();
      return;
    }
    if (!this.loadingWorld)
      this.loadingWorld = import("./WorldPlanning3DView").then((m) =>
        m.WorldPlanning3DView.create(this.host, this.onSelect)
      );
    try {
      const view = await this.loadingWorld;
      if (this.disposed) {
        await view.dispose();
        return;
      }
      this.worldView = view;
      view.setPresentation(this.presentation);
      if (!this.oblique) {
        view.setActive(false);
        return;
      }
      if (this.plan) await view.setPlan(this.plan, production);
      if (this.disposed) {
        await view.dispose();
        return;
      }
      view.setLayers(this.layers);
      view.setSelection(this.selection);
      if (!this.worldFramed) {
        view.frame(this.box);
        this.worldFramed = true;
      }
      view.setActive(this.oblique);
      view.setContextHighlights([...this.contextElements], [...this.contextPaths]);
      this.svg.style.display = this.oblique ? "none" : "";
      this.svg.dataset.projection = this.oblique ? "oblique" : "plan";
    } catch (error) {
      if (!this.worldView) this.loadingWorld = null;
      this.worldView?.setActive(false);
      this.oblique = false;
      this.svg.style.display = "";
      throw error;
    }
  }

  /** Reuse the existing whitebox camera for an editor accessory; no second renderer or world session. */
  async directorView(): Promise<WorldPlanning3DView> {
    if (!this.oblique || !this.worldView) await this.setProjection(true);
    return this.worldView!;
  }

  async startWalk(): Promise<void> {
    await this.setProjection(true);
    this.worldView?.startWalk();
  }

  /** Display a diagnostic contour independently of the accepted world geometry. */
  setDiagnosticOutline(outline?: PlanPoint[]): void {
    this.svg.querySelector("[data-diagnostic-outline]")?.remove();
    if (!outline?.length) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("data-diagnostic-outline", "true");
    path.setAttribute("d", "M" + outline.map((p) => `${p.x},${p.z}`).join(" L") + " Z");
    path.setAttribute("fill", "rgba(184,66,42,.12)");
    path.setAttribute("stroke", "#b8422a");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-dasharray", "6 4");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    path.setAttribute("pointer-events", "none");
    this.svg.append(path);
  }

  /** Highlight a feature in place, without jumping or centering the map. */
  setSelection(id: string | null): void {
    this.worldView?.setSelection(id);

    this.selection = id;
    this.svg.dataset.selectedId = id ?? "";
    this.svg.querySelector("[data-poi-range]")?.remove();
    const site = this.plan?.poiDistribution?.sites.find((p) => p.id === id);
    const members = new Set(site && this.plan ? poiMemberIds(this.plan, site) : []);
    for (const node of this.svg.querySelectorAll<SVGElement>("[data-feature-id]")) {
      const selected =
        (node.dataset.routeOwners?.split(" ").some((owner) => owner === id || members.has(owner)) ?? false) ||
        node.dataset.featureId === id ||
        members.has(node.dataset.featureId ?? "") ||
        (!!id && node.dataset.ownerId === id);
      node.classList.toggle("is-selected", selected);
      node.setAttribute("aria-pressed", String(selected));
    }
    this.applyContextHighlights();
  }

  /** Panel context is presentation-only and independent of selection, visibility and camera framing. */
  setContextHighlights(elements: readonly string[], paths: readonly string[] = []): void {
    this.contextElements = new Set(elements);
    this.contextPaths = new Set(paths);
    this.worldView?.setContextHighlights(elements, paths);
    this.applyContextHighlights();
  }

  private applyContextHighlights(): void {
    for (const node of this.svg.querySelectorAll<SVGElement>("[data-feature-id]")) {
      const id = node.dataset.featureId!;
      node.classList.toggle("ip-context-element", this.contextElements.has(id));
      node.classList.toggle(
        "ip-context-path",
        this.contextPaths.has(id) ||
          (node.dataset.routeOwners?.split(" ").some((owner) => this.contextPaths.has(owner)) ?? false)
      );
    }
  }

  /** Toggle all semantic layers independently of generated geometry. */
  setLayers(layers: Record<string, boolean>): void {
    this.portTooltip.hidden = true;
    this.layers = { ...layers };

    this.worldView?.setLayers(layers);
    // One DOM pass, rather than one selector traversal per object visibility flag.
    for (const node of this.svg.querySelectorAll<SVGElement>("[data-feature-id], [data-plan-layer]")) {
      const hidden = node.dataset.routeOwners
        ? node.dataset.routeOwners.split(" ").every((owner) => layers[`object:${owner}`] === false)
        : layers[`object:${node.dataset.featureId}`] === false;
      node.style.display = hidden || layers[node.dataset.planLayer!] === false ? "none" : "";
    }
    for (const [layer, visible] of Object.entries(layers)) {
      if (!layer.startsWith("object:")) this.svg.setAttribute(`data-${layer}`, String(visible));
    }
  }

  /** Mark changed and related module ownership independently from the active selection. */
  setHighlights(changedIds: readonly string[], relatedIds: readonly string[] = []): void {
    const changed = new Set(changedIds),
      related = new Set(relatedIds);
    for (const node of this.svg.querySelectorAll<SVGElement>("[data-feature-id]")) {
      const id = node.dataset.ownerId ?? node.dataset.featureId ?? "";
      node.classList.toggle("is-changed", changed.has(id));
      node.classList.toggle("is-related", related.has(id));
    }
  }

  /** Explicit report navigation centres a real check position and marks it on the same map. */
  locatePoint(position: PlanPoint): void {
    if (!this.plan || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
    const width = Math.min(this.box.width, this.plan.parameters.width * 0.55),
      depth = (width * this.box.depth) / this.box.width;
    this.box = { x: position.x - width / 2, z: position.z - depth / 2, width, depth };
    this.applyViewBox();
    this.svg.querySelector("[data-check-location]")?.remove();
    const marker = document.createElementNS(NS, "g");
    marker.dataset.checkLocation = "true";
    marker.setAttribute("pointer-events", "none");
    marker.innerHTML = `<circle cx="${position.x}" cy="${position.z}" r="16" fill="none" stroke="#c6483e" stroke-width="3"/><path d="M${position.x - 25},${position.z}h50M${position.x},${position.z - 25}v50" stroke="#c6483e" stroke-width="2"/>`;
    this.svg.append(marker);
  }

  /** Show the complete rectangular planning domain, including its ocean margin. */
  fit(): void {
    if (!this.plan) return;
    if (!this.plan.poiDistribution && this.plan.settlementLayout?.activeBounds.length) {
      const points = this.plan.settlementLayout.activeBounds,
        x = Math.min(...points.map((p) => p.x)),
        z = Math.min(...points.map((p) => p.z));
      this.box = {
        x,
        z,
        width: Math.max(...points.map((p) => p.x)) - x,
        depth: Math.max(...points.map((p) => p.z)) - z
      };
      if (this.oblique) this.worldView?.frame(this.box);
      this.applyViewBox();
      return;
    }
    const margin = this.plan.villageStudy ? 5 : this.plan.mode === "base-map" ? 64 : 0;
    this.box = {
      x: -margin,
      z: -margin,
      width: this.plan.parameters.width + margin * 2,
      depth: this.plan.parameters.depth + margin * 2
    };
    if (this.oblique) this.worldView?.frame(this.box);
    this.applyViewBox();
  }

  /** Frame a semantic region without changing the world or its selection.
   * @param points Published planar boundary in world metres.
   */
  focusRegion(points: PlanPoint[]): void {
    if (!points.length) return;
    if (this.oblique) {
      this.worldView?.focus(points);
      return;
    }
    this.box = planningFocusBox(points, (this.plan?.parameters.width ?? 1024) / 32)!;
    this.applyViewBox();
  }

  /** Zoom about a pointer or viewport centre; geometry and selection remain unchanged. */
  zoom(factor: number, clientX?: number, clientY?: number): void {
    if (this.oblique && this.worldView) {
      this.worldView.zoom(factor);
      return;
    }
    if (!this.plan) return;
    const rect = this.svg.getBoundingClientRect(),
      matrix = this.svg.getScreenCTM();
    const anchor = matrix
      ? new DOMPoint(clientX ?? rect.left + rect.width / 2, clientY ?? rect.top + rect.height / 2).matrixTransform(
          matrix.inverse()
        )
      : new DOMPoint(this.box.x + this.box.width / 2, this.box.z + this.box.depth / 2);
    const nextWidth = Math.max(
      this.plan.parameters.width / 32,
      Math.min(this.plan.parameters.width * 1.2, this.box.width / factor)
    );
    const ratio = nextWidth / this.box.width;
    this.box = {
      x: anchor.x - (anchor.x - this.box.x) * ratio,
      z: anchor.y - (anchor.y - this.box.z) * ratio,
      width: nextWidth,
      depth: this.box.depth * ratio
    };
    this.applyViewBox();
  }

  /** Release input listeners and the SVG document. */
  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.abort.abort();
    this.portTooltip.remove();
    this.svg.remove();
    this.disposePromise = (async () => {
      // Initialization may still own a renderer even before worldView has been published.
      const view = this.worldView ?? (await this.loadingWorld?.catch(() => null));
      await view?.dispose();
    })();
    return this.disposePromise;
  }

  private applyViewBox(): void {
    const rect = this.svg.getBoundingClientRect();
    const unitsPerPixel = Math.max(this.box.width / Math.max(1, rect.width), this.box.depth / Math.max(1, rect.height));
    for (const marker of this.svg.querySelectorAll<SVGCircleElement>("[data-marker-radius]"))
      marker.setAttribute("r", String(Number(marker.dataset.markerRadius) * unitsPerPixel * 0.65));

    this.svg.setAttribute(
      "viewBox",
      `${number(this.box.x)} ${number(this.box.z)} ${number(this.box.width)} ${number(this.box.depth)}`
    );
  }

  private draw(plan: IslandPlan): string {
    if (plan.mode === "base-map") {
      if (plan.villageStudy) return drawVillagePlan(plan);
      if (!plan.landformStudy && !plan.settlementLayout) return drawBaseMap(plan);
      return drawBaseMap(plan, true, planningVectorSurface(plan), drawPlanningVolumes(plan, false));
    }
    const { width, depth } = plan.parameters,
      landPath = ring(plan.land);
    const defs = `<defs>
      <linearGradient id="ip-ocean" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#102a41"/><stop offset="1" stop-color="#173a50"/></linearGradient>
      <linearGradient id="ip-land" x1="0" y1="0" x2="0.7" y2="1"><stop stop-color="#839976"/><stop offset="1" stop-color="#71885f"/></linearGradient>
      <linearGradient id="ip-water" x1="0" y1="0" x2="0.8" y2="1"><stop stop-color="#39a3d1"/><stop offset="1" stop-color="#2381be"/></linearGradient>
      <linearGradient id="ip-rock" x1="0" y1="0" x2="0.8" y2="1"><stop stop-color="#84919a"/><stop offset="0.58" stop-color="#6c7a86"/><stop offset="1" stop-color="#536572"/></linearGradient>
      <clipPath id="ip-mainland"><path d="${landPath}"/></clipPath>
      <mask id="ip-open-mouth" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${depth}"><rect width="${width}" height="${depth}" fill="white"/>${plan.waters
        .filter((w) => w.kind === "river" && w.to === "ocean")
        .map((w) => `<path d="${ring(w.outline)}" fill="black"/>`)
        .join("")}</mask>
      <marker id="ip-sight-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 1L9 5L0 9z" fill="#ef79dc"/></marker>
      <marker id="ip-water-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M1 1L8 5L1 9" fill="none" stroke="#b1e4f4" stroke-width="1.4"/></marker>
    </defs>`;
    const coast = [plan.land, ...plan.islands]
      .map((outline) => `<path d="${ring(outline)}" fill="url(#ip-land)" mask="url(#ip-open-mouth)"/>`)
      .join("");
    const slopes = plan.slopes
      .map((slope) =>
        feature(
          slope.id,
          slope.label,
          "ip-slope",
          `<path d="${ring(slope.outer)} ${ring(slope.inner)}" fill="#c6ad71" fill-rule="evenodd" ${slope.id.startsWith("bank-") ? 'clip-path="url(#ip-mainland)"' : ""} mask="url(#ip-open-mouth)"/>`
        )
      )
      .join("");
    const water = plan.waters
      .map((w) => {
        const clip = w.kind === "river" ? ' clip-path="url(#ip-mainland)"' : "";
        return `<g${clip}>${feature(w.id, w.label, "ip-water", `<path class="ip-feature-outline" d="${ring(w.outline)}" fill="url(#ip-water)" stroke="none"/>${w.centerline && w.centerline.length > 5 ? `<path d="${line(w.centerline.slice(Math.floor(w.centerline.length * 0.43), Math.floor(w.centerline.length * 0.58)))}" fill="none" stroke="#ade0f0" stroke-opacity=".55" stroke-width="1.8" marker-end="url(#ip-water-arrow)" pointer-events="none"/>` : ""}`)}</g>`;
      })
      .join("");
    const rocks = plan.rocks
      .map((rock) => {
        const levels = rock.height > 210 ? 5 : rock.height > 110 ? 4 : 3;
        const direction = {
          peak: { x: 0.035, z: -0.18 },
          wall: { x: 0.12, z: -0.03 },
          shoulder: { x: 0.19, z: 0.065 },
          terrace: { x: -0.07, z: 0.065 },
          skirt: { x: 0.13, z: 0.09 }
        }[rock.role];
        const localX = direction.x * rock.width,
          localZ = direction.z * rock.depth;
        const shiftX = localX * Math.cos(rock.yaw) - localZ * Math.sin(rock.yaw);
        const shiftZ = localX * Math.sin(rock.yaw) + localZ * Math.cos(rock.yaw);
        const contours = Array.from({ length: levels }, (_, i) => {
          const scale = 0.86 - i * (0.62 / Math.max(1, levels - 1));
          const drift = (1 - scale) * (0.6 + (0.4 * i) / Math.max(1, levels - 1));
          const outline = rock.outline.map((p) => ({
            x: rock.center.x + (p.x - rock.center.x) * scale + shiftX * drift,
            z: rock.center.z + (p.z - rock.center.z) * scale + shiftZ * drift
          }));
          return `<path d="${ring(outline)}" fill="${i % 2 ? "#8b969e" : "#b0bac0"}" fill-opacity=".055" stroke="#bdc6cb" stroke-opacity="${i === 0 ? 0.34 : 0.25}" stroke-width=".9" stroke-linejoin="round"/>`;
        }).join("");
        const label =
          rock.width >= 39 && rock.depth >= 35
            ? `<text class="ip-height" x="${number(rock.center.x)}" y="${number(rock.center.z + 4)}">${Math.round(rock.height)}</text>`
            : "";
        return feature(
          rock.id,
          `${ROLE_LABELS[rock.role]} · ${Math.round(rock.height)} 米`,
          "ip-rock",
          `<g data-plan-layer="rock"><path class="ip-feature-outline" d="${ring(rock.outline)}" fill="url(#ip-rock)" stroke="#304a59" stroke-width="2.2" stroke-linejoin="round"/>${contours}${label}</g><path data-plan-layer="obb" d="${ring(rock.obb)}" fill="none" stroke="#45dce0" stroke-width="1.6" stroke-opacity=".91" class="ip-obb"/>`
        );
      })
      .join("");
    const routes = plan.routes
      .map(
        (route) =>
          `<g data-plan-layer="${route.kind === "ridge" ? "ridgeRoad" : "road"}">` +
          feature(
            route.id,
            route.label,
            "ip-route",
            `<path d="${line(route.points)}" fill="none" stroke="#3f543c" stroke-opacity=".5" stroke-width="${number(route.width + 3)}" stroke-linecap="round" stroke-linejoin="round"/><path class="ip-feature-outline" d="${line(route.points)}" fill="none" stroke="${ROUTE_COLORS[route.kind]}" stroke-width="${number(route.width)}" stroke-linecap="round" stroke-linejoin="round"/>`
          ) +
          `</g>`
      )
      .join("");
    const bridges = plan.bridges
      .map((bridge) => {
        const dx = bridge.b.x - bridge.a.x,
          dz = bridge.b.z - bridge.a.z,
          length = Math.hypot(dx, dz),
          nx = -dz / Math.max(length, 0.001),
          nz = dx / Math.max(length, 0.001);
        const side = (p: PlanPoint, s: number) => ({
          x: p.x + (nx * bridge.width * s) / 2,
          z: p.z + (nz * bridge.width * s) / 2
        });
        const corners = [side(bridge.a, -1), side(bridge.b, -1), side(bridge.b, 1), side(bridge.a, 1)];
        const slatCount = Math.max(2, Math.ceil(length / 4));
        const slats = Array.from({ length: slatCount }, (_, i) => {
          const t = i / (slatCount - 1),
            p = { x: bridge.a.x + dx * t, z: bridge.a.z + dz * t };
          return `<path d="M${point(side(p, -0.87))}L${point(side(p, 0.87))}" stroke="#513f2e" stroke-width=".85"/>`;
        }).join("");
        return feature(
          bridge.id,
          bridge.label,
          "ip-bridge",
          `<path class="ip-feature-outline" d="${ring(corners)}" fill="#ab8658" stroke="#524532" stroke-width="2"/>${slats}<path d="M${point(side(bridge.a, -0.85))}L${point(side(bridge.b, -0.85))}M${point(side(bridge.a, 0.85))}L${point(side(bridge.b, 0.85))}" stroke="#d2b788" stroke-width="1.3"/>`
        );
      })
      .join("");
    const sights = plan.sights
      .map((sight) => {
        const dx = sight.to.x - sight.from.x,
          dz = sight.to.z - sight.from.z,
          radius = Math.hypot(dx, dz),
          direction = Math.atan2(dz, dx),
          half = (sight.spread * Math.PI) / 360;
        const a = {
          x: sight.from.x + Math.cos(direction - half) * radius,
          z: sight.from.z + Math.sin(direction - half) * radius
        };
        const b = {
          x: sight.from.x + Math.cos(direction + half) * radius,
          z: sight.from.z + Math.sin(direction + half) * radius
        };
        return feature(
          sight.id,
          `视线意图 · ${sight.label}`,
          "ip-sight",
          `<path d="M${point(sight.from)}L${point(a)}A${number(radius)},${number(radius)} 0 0 1 ${point(b)}Z" fill="#e879dc" fill-opacity=".065" stroke="#df80d4" stroke-opacity=".4" stroke-width="1.2" stroke-dasharray="7 6"/><path class="ip-feature-outline" d="M${point(sight.from)}L${point(sight.to)}" fill="none" stroke="#ec82dd" stroke-width="2.3" stroke-dasharray="9 7" marker-end="url(#ip-sight-arrow)"/><text class="ip-intent-label" x="${number(sight.from.x + dx * 0.3 + 12)}" y="${number(sight.from.z + dz * 0.3 - 9)}">视线意图</text>`
        );
      })
      .join("");
    const groups = plan.mountains
      .filter((g) => g.id !== "southwest" && g.id !== "southeast")
      .map((mountain) => {
        const extent = bounds(mountain.outline),
          x = (extent.minX + extent.maxX) / 2,
          z = Math.max(25, extent.minZ - 12);
        return feature(
          mountain.id,
          mountain.label,
          "ip-mountain",
          `<path class="ip-feature-outline" d="${(mountain.densityOutlines ?? mountain.outlines ?? [mountain.outline]).map(ring).join(" ")}" fill="none" stroke="#c780e5" stroke-width="2.3" stroke-dasharray="10 7" stroke-linejoin="round"/><text class="ip-group-label" x="${number(x)}" y="${number(z)}">${xml(mountain.label)}</text>`
        );
      })
      .join("");
    const places = plan.places
      .map((place) =>
        feature(
          place.id,
          place.label,
          "ip-place",
          `<path class="ip-feature-outline" d="${ring(place.outline)}" pointer-events="stroke" fill="#fff0ad" fill-opacity=".11" stroke="#f5e2a4" stroke-width="1.5" stroke-dasharray="4 4"/><circle cx="${number(place.center.x)}" cy="${number(place.center.z)}" r="5.8" fill="#ffe376" stroke="#4f6247" stroke-width="2.5"/><text class="ip-place-label" x="${number(place.center.x)}" y="${number(place.center.z - 13)}">${xml(place.label)}</text>`
        )
      )
      .join("");
    const spawn = feature(
      "spawn",
      "出生点",
      "ip-spawn",
      `<circle cx="${number(plan.spawn.x)}" cy="${number(plan.spawn.z)}" r="8.2" fill="#eff7ea" stroke="#253a52" stroke-width="3"/><text class="ip-place-label" x="${number(plan.spawn.x)}" y="${number(plan.spawn.z + 25)}">出生点 · SPAWN</text>`
    );
    const regions = plan.regions
      .map((region) => {
        const layer = region.kind === "rock-cluster" ? "cluster" : region.kind;
        const b = bounds(region.outline);
        return (
          `<g data-plan-layer="${layer}">` +
          feature(
            region.id,
            region.label,
            "ip-region",
            `<path d="${ring(region.outline)}" fill="none" stroke="${LAYER_DEFINITIONS[layer][1]}" stroke-width="2.5" stroke-dasharray="12 8"/><text class="ip-group-label" style="fill:${LAYER_DEFINITIONS[layer][1]}" x="${(b.minX + b.maxX) / 2}" y="${b.minZ - 12}">${xml(region.label)}</text>`
          ) +
          `</g>`
        );
      })
      .join("");
    const buildings = plan.buildings
      .map((building) =>
        feature(
          building.id,
          `建筑 ${building.id.split("-").at(-1)} · ${building.height} 米`,
          "ip-building",
          `<path d="${ring(building.outline)}" fill="#d5b75b" fill-opacity=".45" stroke="#ffe06b" stroke-width="2.5"/><text class="ip-height" x="${building.center.x}" y="${building.center.z + 4}">${building.height}m</text>`
        )
      )
      .join("");
    const ridges = plan.ridges
      .map((ridge) =>
        feature(
          ridge.id,
          "山脊骨架",
          "ip-ridge",
          `<path d="${line(ridge.points)}" fill="none" stroke="#ef9c44" stroke-width="3" stroke-dasharray="13 5 3 5"/>`
        )
      )
      .join("");
    const supports = plan.supports
      .map((support, i) =>
        feature(
          support.id,
          `通路占位 ${Math.round(support.startHeight)} → ${Math.round(support.endHeight)} 米`,
          "ip-support",
          `<path d="${ring(support.outline)}" fill="#bce6db" fill-opacity=".17" stroke="#bce6db" stroke-width="1.5"/><path d="M${point(support.a)}L${point(support.b)}" stroke="#bce6db" stroke-width="1"/>${i % 3 === 0 ? `<text class="ip-height" x="${support.a.x - 13}" y="${support.a.z - 10}">${Math.round(support.startHeight)}→${Math.round(support.endHeight)}m</text>` : ""}`
        )
      )
      .join("");
    return `${defs}<g data-plan-layer="ocean"><rect x="-4000" y="-4000" width="12000" height="12000" fill="url(#ip-ocean)"/></g><g data-plan-layer="land">${coast}</g><g data-plan-layer="slope">${slopes}</g><g data-plan-layer="water">${water}</g>${rocks}<g data-plan-layer="ridge">${ridges}</g><g data-plan-layer="support">${supports}</g>${routes}<g data-plan-layer="bridge">${bridges}</g><g data-plan-layer="building">${buildings}</g>${regions}<g data-plan-layer="sight">${sights}</g><g data-plan-layer="group">${groups}</g><g data-plan-layer="place">${places}</g><g data-plan-layer="spawn">${spawn}</g><g data-plan-layer="furniture" class="ip-map-furniture" pointer-events="none"><text x="46" y="${depth - 122}" class="ip-north-label">N</text><path d="M46 ${depth - 109}L34 ${depth - 79}L46 ${depth - 86}L58 ${depth - 79}Z" fill="#abc7d9"/><path d="M42 ${depth - 43}v9h200v-9M142 ${depth - 43}v9" fill="none" stroke="#abc7d9" stroke-width="1.5"/><text x="42" y="${depth - 47}">0</text><text x="131" y="${depth - 47}">100</text><text x="221" y="${depth - 47}">200 m</text><text x="${width - 43}" y="${depth - 33}" text-anchor="end" class="ip-ocean-label">OCEAN · 海洋</text></g>`;
  }
}

/** Mount the focused 2D island editor, with a stable, deliberately small parameter panel. */
export function mountIslandPlan(host: HTMLElement): IslandPlanPageHandle {
  document.body.classList.add("island-plan-page");
  document.title = "岛屿空间规划";
  const root = document.createElement("div");
  root.className = "island-plan-editor";
  root.innerHTML = `<aside class="ip-sidebar"><header class="ip-brand"><span>ISLAND / SPATIAL PLAN</span><h1>岛屿空间规划</h1><p>地形 · 水系 · 探索动线</p></header><section class="ip-domain">2048 × 2048 米<br><small>栅格目标：高度 1025² / 地表 1024²</small></section><section class="ip-selection"><div class="ip-section-title">当前对象 <button data-action="clear" hidden>取消选择</button></div><div data-ui="inspector"></div></section><details class="ip-adjustments"><summary>布局调节 <span>3 项</span></summary><div data-ui="parameters"></div></details><div class="ip-variant-actions"><button data-action="variant">换一种布局 <span>↗</span></button><button data-action="restore">恢复基准</button></div><footer class="ip-sidebar-footer"><span data-ui="seed"></span><span>VECTOR PLAN</span></footer></aside><main class="ip-workspace"><header class="ip-topbar"><div><strong>2D 空间规划</strong><span data-ui="dimensions"></span></div><nav aria-label="规划图缩放"><button data-action="zoom-out" aria-label="缩小">−</button><button data-action="fit">全图</button><button data-action="zoom-in" aria-label="放大">＋</button></nav></header><div class="ip-viewport" data-ui="viewport"><aside class="ip-legend" aria-label="图例与图层"><div class="ip-legend-title">图例 <span>LEGEND</span></div><button data-layer="obb" aria-pressed="true"><i class="ip-key-obb"></i><span>ROCK OBB<small>岩体包围盒</small></span><b>✓</b></button><button data-layer="group" aria-pressed="true"><i class="ip-key-group"></i><span>MOUNTAIN GROUP<small>山群范围</small></span><b>✓</b></button><div><i class="ip-key-route"></i><span>ROUTE<small>物理动线</small></span></div><button data-layer="sight" aria-pressed="true"><i class="ip-key-sight"></i><span>SIGHTLINE<small>视线意图</small></span><b>✓</b></button><div><i class="ip-key-water"></i><span>WATER<small>河流与湖泊</small></span></div><div><i class="ip-key-ocean"></i><span>OCEAN<small>海洋</small></span></div></aside></div><footer class="ip-map-footer"><span>点选查看对象 · 滚轮缩放 · 拖动空白平移</span><span data-ui="status">正在准备规划…</span></footer></main>`;
  host.replaceChildren(root);
  root.querySelector(".ip-adjustments")!.before(root.querySelector(".ip-legend")!);
  root.querySelector(".ip-legend")!.innerHTML =
    `<div class="ip-legend-title">图例与图层</div>` +
    Object.entries(LAYER_DEFINITIONS)
      .map(
        ([key, [label, color]]) =>
          `<button data-layer="${key}" aria-pressed="true"><i style="border:2px ${["group", "cluster", "island", "village"].includes(key) ? "dashed" : "solid"} ${color};background:${["land", "water", "ocean", "slope", "rock"].includes(key) ? color : "transparent"}"></i><span>${label}</span><b>✓</b></button>`
      )
      .join("");
  (root.querySelector(".ip-adjustments") as HTMLElement).hidden = true;
  (root.querySelector(".ip-variant-actions") as HTMLElement).hidden = true;
  const ui = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`[data-ui="${id}"]`)!;
  const action = (id: string) => root.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;
  let parameters = { ...DEFAULT_ISLAND_PLAN_PARAMETERS },
    plan = generateIslandPlan(parameters),
    selectedId: string | null = null,
    revision = 0;
  const prompt = document.createElement("details");
  prompt.className = "ip-prompt";
  const promptSummary = document.createElement("summary");
  promptSummary.textContent = "布局描述";
  const promptText = document.createElement("p");
  promptText.textContent = plan.prompt;
  prompt.append(promptSummary, promptText);
  root.querySelector(".ip-variant-actions")!.before(prompt);
  const layers: PlanLayers = defaultLayers();
  let timer: ReturnType<typeof setTimeout> | undefined,
    disposed = false;
  const view = new IslandPlanView(ui("viewport"), (id) => {
    selectedId = id;
    view.setSelection(id);
    renderInspector();
  });
  const controls: {
    key: "valleyWidth" | "riverWidth" | "mountainHeight";
    label: string;
    min: number;
    max: number;
    step: number;
    unit: string;
  }[] = [
    { key: "valleyWidth", label: "谷地开阔度", min: 1, max: 1.35, step: 0.01, unit: "倍" },
    { key: "riverWidth", label: "河流宽度", min: 16, max: 36, step: 1, unit: "米" },
    { key: "mountainHeight", label: "山体高度", min: 0.7, max: 1.4, step: 0.01, unit: "倍" }
  ];
  for (const control of controls) {
    const row = document.createElement("label");
    row.className = "ip-parameter";
    row.innerHTML = `<span>${control.label}<output data-value="${control.key}"></output></span><input type="range" data-parameter="${control.key}" min="${control.min}" max="${control.max}" step="${control.step}" aria-label="${control.label}">`;
    const input = row.querySelector<HTMLInputElement>("input")!;
    input.addEventListener("input", () => {
      const value = input.valueAsNumber;
      if (!Number.isFinite(value)) return;
      parameters = { ...parameters, [control.key]: value };
      syncControls();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => rebuild("布局已更新"), 70);
    });
    ui("parameters").append(row);
  }
  function syncControls(): void {
    for (const control of controls) {
      const value = parameters[control.key];
      root.querySelector<HTMLInputElement>(`[data-parameter="${control.key}"]`)!.value = String(value);
      root.querySelector<HTMLOutputElement>(`[data-value="${control.key}"]`)!.textContent =
        `${number(value)} ${control.unit}`;
    }
  }
  function renderInspector(): void {
    const description = describeFeature(plan, selectedId);
    action("clear").hidden = !selectedId;
    ui("inspector").innerHTML =
      `<span class="ip-object-type">${xml(description.type)}</span><h2>${xml(description.title)}</h2><p>${xml(description.purpose)}</p><dl>${description.values.map(([key, value]) => `<div><dt>${xml(key)}</dt><dd>${xml(value)}</dd></div>`).join("")}</dl>`;
    root.dataset.selectedId = selectedId ?? "";
  }
  function rebuild(message: string): void {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = undefined;
    const start = performance.now();
    try {
      const next = generateIslandPlan(parameters);
      plan = next;
      parameters = { ...next.parameters };
      revision++;
      promptText.textContent = plan.prompt;
      view.setPlan(plan, revision);
      renderInspector();
      syncControls();
      root.dataset.planRevision = String(revision);
      root.dataset.seed = String(parameters.seed);
      root.dataset.width = String(parameters.width);
      root.dataset.depth = String(parameters.depth);
      for (const control of controls) root.dataset[control.key] = String(parameters[control.key]);
      ui("dimensions").textContent = `${parameters.width} × ${parameters.depth} m`;
      ui("seed").textContent = `SEED ${parameters.seed}`;
      ui("status").textContent = `${message} · ${Math.round(performance.now() - start)} ms`;
    } catch (error) {
      ui("status").textContent = `保留原规划 · ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  action("variant").onclick = () => {
    parameters = { ...parameters, seed: parameters.seed + 1 };
    rebuild("新布局");
  };
  action("restore").onclick = () => {
    parameters = { ...DEFAULT_ISLAND_PLAN_PARAMETERS };
    selectedId = null;
    view.setSelection(null);
    rebuild("已恢复基准");
    view.fit();
  };
  action("clear").onclick = () => {
    selectedId = null;
    view.setSelection(null);
    renderInspector();
  };
  action("fit").onclick = () => view.fit();
  action("zoom-in").onclick = () => view.zoom(1.25);
  action("zoom-out").onclick = () => view.zoom(0.8);
  root.querySelectorAll<HTMLButtonElement>("[data-layer]").forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.layer as PlanLayer;
      layers[key] = !layers[key];
      button.setAttribute("aria-pressed", String(layers[key]));
      view.setLayers(layers);
    };
  });
  rebuild("默认规划");
  const handle: IslandPlanPageHandle = {
    getState: () => ({ plan, selectedId, layers: { ...layers }, revision }),
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      view.dispose();
      root.remove();
      document.body.classList.remove("island-plan-page");
    }
  };
  window.islandPlanPage = handle;
  return handle;
}

function bounds(points: PlanPoint[]): { minX: number; minZ: number; maxX: number; maxZ: number } {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxZ: Math.max(...points.map((p) => p.z))
  };
}
function dimensions(points: PlanPoint[]): string {
  const b = bounds(points);
  return `${Math.round(b.maxX - b.minX)} × ${Math.round(b.maxZ - b.minZ)} 米`;
}
function distance(a: PlanPoint, b: PlanPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Describe semantic use and measured dimensions without introducing visibility or traversal guarantees. */
function describeFeature(plan: IslandPlan, id: string | null): FeatureDescription {
  const building = plan.buildings.find((b) => b.id === id);
  if (building)
    return {
      title: "村落建筑",
      type: "BUILDING / 黄色 OBB",
      purpose: "真实素材的外包围占位",
      values: [
        ["占地", `${building.width} × ${building.depth} 米`],
        ["高度", `${building.height} 米`]
      ]
    };
  const slope = plan.slopes.find((s) => s.id === id);
  if (slope)
    return {
      title: slope.label,
      type: "SLOPE / 地形与地表区域",
      purpose: "泥土 alphamap 与高程过渡共用的区域数据，尚未烘焙到三维。",
      values: [
        ["宽度", `${slope.width} 米`],
        ["高差", `${slope.rise} 米`],
        ["剖面", slope.profile]
      ]
    };
  const support = plan.supports.find((s) => s.id === id);
  if (support)
    return {
      title: "倾斜通路 OBB",
      type: "SUPPORT / 通路占位",
      purpose: "用于后续坡道岩石素材适配；不代表三维碰撞已验证。",
      values: [
        ["两端高度", `${Math.round(support.startHeight)} → ${Math.round(support.endHeight)} 米`],
        ["宽度", `${support.width} 米`],
        ["厚度", `${support.thickness} 米`]
      ]
    };
  const region = plan.regions.find((r) => r.id === id);
  if (region)
    return {
      title: region.label,
      type: "REGION / 语义范围",
      purpose: "内部元素在此范围内组合，虚线不是实体边界。",
      values: [["范围", dimensions(region.outline)]]
    };
  const ridge = plan.ridges.find((r) => r.id === id);
  if (ridge)
    return {
      title: "山脊骨架",
      type: "RIDGE / 山体走向",
      purpose: "山体结构轴线，与山脊道路独立。",
      values: [["所属山群", ridge.groupId]]
    };
  const rock = plan.rocks.find((value) => value.id === id);
  if (rock)
    return {
      title: `${plan.mountains.find((g) => g.id === rock.groupId)?.label ?? "山群"} · 岩体`,
      type: "ROCK / 单块岩体",
      purpose: ROLE_LABELS[rock.role],
      values: [
        ["占地尺寸", `${Math.round(rock.width)} × ${Math.round(rock.depth)} 米`],
        ["高度", `${Math.round(rock.height)} 米`],
        ["旋转", `${Math.round((rock.yaw * 180) / Math.PI)}°`]
      ]
    };
  const group = plan.mountains.find((value) => value.id === id);
  if (group)
    return {
      title: group.label,
      type: "MOUNTAIN GROUP / 山群",
      purpose: group.offshore ? "海岛山群，作为独立的海上轮廓。" : "岩体共同形成山体轮廓、谷地边界与开口。",
      values: [
        ["整体范围", dimensions(group.outline)],
        ["独立岩体", `${group.rockIds.length} 块`]
      ]
    };
  const water = plan.waters.find((value) => value.id === id);
  if (water)
    return {
      title: water.label,
      type: "WATER / 水系",
      purpose:
        water.kind === "source"
          ? "高地源头蓄水区。"
          : water.kind === "river"
            ? "从源头经过谷地，连接下游与海洋。"
            : "以开阔水面形成湖湾与视觉留白。",
      values: [
        ["水域范围", dimensions(water.outline)],
        ["类型", water.kind === "river" ? "河流" : water.kind === "source" ? "源头湖" : "湖湾"]
      ]
    };
  const route = plan.routes.find((value) => value.id === id);
  if (route)
    return {
      title: route.label,
      type: "ROUTE / 物理动线",
      purpose: ROUTE_LABELS[route.kind],
      values: [
        [
          "路径长度",
          `${Math.round(route.points.slice(1).reduce((sum, p, i) => sum + distance(p, route.points[i]), 0))} 米`
        ],
        ["路宽", `${number(route.width)} 米`],
        ["起点", placeName(plan, route.from)],
        ["终点", placeName(plan, route.to)]
      ]
    };
  const place = plan.places.find((value) => value.id === id);
  if (place)
    return {
      title: place.label,
      type: "PLACE / 场所",
      purpose: place.purpose,
      values: [
        ["活动范围", dimensions(place.outline)],
        ["位置", `${Math.round(place.center.x)}, ${Math.round(place.center.z)} 米`]
      ]
    };
  const bridge = plan.bridges.find((value) => value.id === id);
  if (bridge)
    return {
      title: bridge.label,
      type: "BRIDGE / 跨越",
      purpose: `连接${plan.waters.find((w) => w.id === bridge.riverId)?.label ?? "河流"}的两岸。`,
      values: [
        ["跨度", `${Math.round(distance(bridge.a, bridge.b))} 米`],
        ["桥面宽度", `${number(bridge.width)} 米`]
      ]
    };
  const sight = plan.sights.find((value) => value.id === id);
  if (sight)
    return {
      title: sight.label,
      type: "SIGHTLINE / 视线意图",
      purpose: "独立于物理动线的观察方向与视域规划。",
      values: [
        ["指向距离", `${Math.round(distance(sight.from, sight.to))} 米`],
        ["扇区角度", `${number(sight.spread)}°`],
        ["表达", "视线意图"]
      ]
    };
  if (id === "spawn")
    return {
      title: "出生点",
      type: "SPAWN / 起点",
      purpose: "从这里进入岛屿，沿物理动线发现山群与水系。",
      values: [["位置", `${Math.round(plan.spawn.x)}, ${Math.round(plan.spawn.z)} 米`]]
    };
  return {
    title: "完整岛屿",
    type: "OVERVIEW / 全图",
    purpose: "点选图中的岩体、山群、道路或水系，查看其用途与尺寸。",
    values: [
      ["规划范围", `${plan.parameters.width} × ${plan.parameters.depth} 米`],
      ["山群", `${plan.mountains.filter((g) => g.id !== "southwest" && g.id !== "southeast").length} 组`],
      ["独立岩体", `${plan.rocks.length} 块`],
      ["跨河桥梁", `${plan.bridges.length} 座`]
    ]
  };
}
function placeName(plan: IslandPlan, id: string): string {
  return id === "spawn" ? "出生点" : (plan.places.find((p) => p.id === id)?.label ?? id);
}
