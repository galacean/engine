import type { Camera } from "@galacean/engine";
import type { OrbitControl } from "@galacean/engine-toolkit-controls";
import type { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import { IslandPlanView } from "@galacean/engine-world-planning/semantic-study/IslandPlanView";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { resolveSeedWorldCameraAngles } from "@galacean/engine-world-planning/world/SeedWorldCameraBookmark";

interface PlanningSeedDebugSidebarOptions {
  host: HTMLElement;
  camera: Camera;
  navigation: TerrainNavigationRuntime;
  orbit: OrbitControl;
  sampleHeight: (x: number, z: number) => number | undefined;
  beforeCameraMove: () => void;
  returnToPlanning: () => void;
  setWorldPickingEnabled: (enabled: boolean) => void;
}

/** Original Seed camera controls, displaying the published spatial plan instead of the retired generator. */
export class PlanningSeedDebugSidebar {
  readonly element = document.createElement("aside");
  private readonly abort = new AbortController();
  private readonly map: IslandPlanView;
  private plan?: IslandPlan;
  private mode: "orbit" | "roam" = "roam";
  private inputEnabled = true;
  private worldPickingEnabled = false;
  private cameraMarker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  private readonly cameraView = document.createElementNS("http://www.w3.org/2000/svg", "path");
  private markerPosition = "";
  private viewTransform = "";
  private viewShape = "";
  private viewVisible = false;
  private disposed = false;

  constructor(private readonly options: PlanningSeedDebugSidebarOptions) {
    this.element.id = "world-sidebar";
    this.element.className = "world-sidebar";
    this.element.dataset.collapsed = "true";
    this.element.setAttribute("aria-label", "大世界控制与规划图");
    this.element.innerHTML = `<button id="world-sidebar-toggle" class="world-sidebar-toggle glass-panel" type="button" aria-expanded="false"><span>WORLD CONTROLS</span><i aria-hidden="true">▸</i></button>
      <div class="world-sidebar-content"><section class="world-sidebar-controls glass-panel">
        <div class="world-sidebar-actions"><button type="button" data-action="layout">布局</button><button id="camera-bookmark-copy" type="button">复制视角</button><button id="roam-input-mode" class="world-control-switch roam-input-mode-switch" type="button" role="switch" aria-checked="false"><span class="world-control-switch-track" aria-hidden="true"><i></i></span><span id="roam-input-mode-label" class="world-control-switch-label">WASD</span></button><span data-obb-control></span></div>
        <div class="world-sidebar-actions"><button id="world-picking-toggle" class="world-control-switch" style="grid-column: 1 / -1" type="button" role="switch" aria-checked="false" title="开启后点击地面、植被等场景对象，为 AI 局部修改选择目标；不影响农具拾取。"><span class="world-control-switch-track" aria-hidden="true"><i></i></span><span class="world-control-switch-label">点击选中场景</span></button></div>
        <label class="seed-readout"><span>ROOT SEED</span><output id="world-seed"></output></label>
        <div class="segmented" aria-label="相机控制"><button id="orbit-mode" type="button" data-active="false">ORBIT</button><button id="roam-mode" type="button" data-active="true">ROAM</button></div>
        <section class="world-navigation-tuning" aria-label="漫游参数">
          <label><span>ROAM SPEED <output id="roam-speed-value"></output></span><input id="roam-speed" aria-label="漫游速度" type="range" min="0.1" max="200" step="0.1"></label>
          <label class="world-navigation-fixed"><span>GROUND CLEARANCE <output id="ground-clearance-value"></output></span><input id="ground-clearance" aria-label="离地高度" title="角色高度固定为 1.8 米" type="number" min="1.8" max="1.8" step="0.01" disabled></label>
          <label><span>CAMERA FOV <output id="camera-fov-value"></output></span><input id="camera-fov" aria-label="相机视野" type="number" min="1" max="179" step="any"></label>
        </section>
      </section><section class="world-map-inset glass-panel" aria-label="当前 Seed 的二维规划图"><header><span>WORLD PLAN</span><small>点击地图定位</small></header><div data-world-plan-mini style="height:264px;position:relative"></div></section></div>`;
    options.host.append(this.element);
    this.map = new IslandPlanView(this.find("[data-world-plan-mini]"), () => {}, false);
    this.map.setLayers({ furniture: false, labels: false, obb: false, group: false, cluster: false, ridge: false,
      ports: false, sight: false, "poi-cell": false, "poi-range": false });
    this.cameraMarker.setAttribute("r", "9");
    this.cameraMarker.setAttribute("fill", "#ff654f");
    this.cameraMarker.setAttribute("stroke", "white");
    this.cameraMarker.setAttribute("stroke-width", "3");
    this.cameraMarker.setAttribute("pointer-events", "none");
    this.cameraMarker.setAttribute("data-camera-marker", "true");
    this.cameraView.setAttribute("data-camera-view", "true");
    this.cameraView.setAttribute("role", "img");
    this.cameraView.setAttribute("aria-label", "Camera facing and field of view / 相机朝向与视野");
    this.cameraView.setAttribute("fill", "#ffb76b");
    this.cameraView.setAttribute("fill-opacity", "0.28");
    this.cameraView.setAttribute("stroke", "#fff5df");
    this.cameraView.setAttribute("stroke-width", "1.25");
    this.cameraView.setAttribute("vector-effect", "non-scaling-stroke");
    this.cameraView.setAttribute("stroke-linejoin", "round");
    this.cameraView.setAttribute("pointer-events", "none");
    this.cameraView.setAttribute("display", "none");
    this.button("#world-sidebar-toggle").onclick = () => {
      const expanded = this.element.dataset.collapsed === "true";
      this.element.dataset.collapsed = String(!expanded);
      this.button("#world-sidebar-toggle").setAttribute("aria-expanded", String(expanded));
      this.find("#world-sidebar-toggle i").textContent = expanded ? "▾" : "▸";
      if (expanded) this.update();
    };
    this.button('[data-action="layout"]').onclick = options.returnToPlanning;
    this.button("#world-picking-toggle").onclick = () => {
      this.worldPickingEnabled = !this.worldPickingEnabled;
      options.setWorldPickingEnabled(this.worldPickingEnabled);
      this.button("#world-picking-toggle").setAttribute("aria-checked", String(this.worldPickingEnabled));
    };
    this.button("#camera-bookmark-copy").onclick = () => {
      const position = options.camera.entity.transform.worldPosition;
      const forward = options.camera.entity.transform.worldForward;
      // Copy camera data without introducing layout or camera parameters into the URL.
      void navigator.clipboard.writeText(JSON.stringify({ seed: this.plan?.parameters.seed, mode: this.mode,
        position: [position.x, position.y, position.z], ...resolveSeedWorldCameraAngles(forward) }, null, 2))
        .then(() => { this.button("#camera-bookmark-copy").textContent = "已复制"; },
          () => { this.button("#camera-bookmark-copy").textContent = "复制失败"; });
    };
    this.button("#roam-input-mode").onclick = () => {
      if (!this.inputEnabled || this.mode !== "roam") return;
      options.navigation.setInputMode(options.navigation.inputMode === "keyboard" ? "joystick" : "keyboard");
      this.update();
    };
    this.button("#orbit-mode").onclick = () => this.setCameraMode("orbit");
    this.button("#roam-mode").onclick = () => this.setCameraMode("roam");
    this.input("#roam-speed").oninput = () => { const value=this.input("#roam-speed").valueAsNumber;if(Number.isFinite(value)&&value>0)options.navigation.movementSpeed=value;this.update(); };
    this.input("#ground-clearance").disabled = true;
    this.input("#camera-fov").onchange = () => { const value=this.input("#camera-fov").valueAsNumber;if(Number.isFinite(value)&&value>0&&value<180)options.camera.fieldOfView=value;this.update(); };
    let down: { x: number; y: number } | undefined;
    this.map.svg.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY }; }, { signal: this.abort.signal });
    this.map.svg.addEventListener("click", e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const matrix = this.map.svg.getScreenCTM();
      if (!matrix || !this.plan) return;
      const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
      if (point.x < 0 || point.y < 0 || point.x > this.plan.parameters.width || point.y > this.plan.parameters.depth) return;
      const height = options.sampleHeight(point.x, point.y);
      if (height === undefined) return;
      options.beforeCameraMove();
      this.resumeNavigation();
      options.camera.entity.transform.setWorldPosition(point.x, height + options.navigation.groundClearance, point.y);
      options.navigation.synchronizeView();
      this.update();
    }, { signal: this.abort.signal });
    this.update();
  }

  /** Keep the existing OBB control in the original left control group, without a second switch. */
  mountObbControl(button: HTMLButtonElement): void {
    button.style.position = "static"; button.style.padding = "0 6px"; button.style.font = "inherit";
    button.style.width = "100%";
    this.find("[data-obb-control]").append(button);
  }

  /** Replace the read-only map when a new accepted planning snapshot is published. */
  synchronize(plan: IslandPlan): void {
    this.plan = plan;
    this.map.setPlan(plan, plan.planning?.revision ?? 0);
    this.map.svg.append(this.cameraView, this.cameraMarker);
    this.find("#world-seed").textContent = String(plan.parameters.seed);
    this.update();
  }

  /** HUD input ownership applies equally to orbit and grounded navigation. */
  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    this.options.orbit.enabled = enabled && this.mode === "orbit";
    this.options.navigation.enabled = enabled && this.mode === "roam";
    this.options.navigation.setInputEnabled(enabled && this.mode === "roam");
    this.updateInputModeControl();
  }

  /** Yield orbit to the native mount or OBB locomotion owner without releasing that owner. */
  resumeNavigation(): void {
    this.mode = "roam";
    this.options.orbit.enabled = false;
    this.setInputEnabled(this.inputEnabled);
    this.update();
  }

  get cameraMode(): "orbit" | "roam" { return this.mode; }

  /** A validated persisted pose is already applied by the scene owner; only restore its input ownership. */
  restoreCameraMode(mode: "orbit" | "roam"): void {
    this.mode = mode;
    this.setInputEnabled(this.inputEnabled);
    this.update();
  }

  /** Refresh readouts/marker from the same camera; no world generation or terrain queries are needed. */
  update(): void {
    if (this.disposed) return;
    const { navigation, camera } = this.options;
    for (const [id, value, label] of [
      ["roam-speed", navigation.movementSpeed, `${Number(navigation.movementSpeed.toFixed(1))} m/s`],
      ["ground-clearance", navigation.groundClearance, `${navigation.groundClearance.toFixed(2)} m`],
      ["camera-fov", camera.fieldOfView, `${camera.fieldOfView.toFixed(0)}°`]
    ] as const) {
      const input = this.input(`#${id}`), output = this.find(`#${id}-value`);
      if (id === "roam-speed") input.max = String(Math.max(200, Number(input.max), value));
      if (document.activeElement !== input && input.value !== String(value)) input.value = String(value);
      if (output.textContent !== label) output.textContent = label;
    }
    this.updateInputModeControl();
    this.button("#orbit-mode").dataset.active = String(this.mode === "orbit");
    this.button("#roam-mode").dataset.active = String(this.mode === "roam");
    if (this.element.dataset.collapsed === "true") return;
    const p = camera.entity.transform.worldPosition, position = `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
    if (position !== this.markerPosition) {
      this.markerPosition = position;
      this.cameraMarker.setAttribute("cx", String(p.x)); this.cameraMarker.setAttribute("cy", String(p.z));
    }
    this.updateCameraView();
  }

  /** Compass-style view angle, not a ground intersection or visibility-distance estimate. */
  private updateCameraView(): void {
    const { camera } = this.options;
    const { worldPosition: p, worldForward: forward } = camera.entity.transform;
    const aspect = camera.aspectRatio, fov = camera.fieldOfView;
    const visible = !!this.plan && !camera.isOrthographic && Math.hypot(forward.x, forward.z) > 0.00001
      && Number.isFinite(aspect) && aspect > 0 && fov > 0 && fov < 180;
    if (visible !== this.viewVisible) {
      this.viewVisible = visible;
      this.cameraView.setAttribute("display", visible ? "inline" : "none");
    }
    if (!visible) return;
    // Engine FOV is vertical; use the camera's actual viewport aspect for the horizontal angle.
    const halfAngle = Math.atan(Math.tan(fov * Math.PI / 360) * aspect);
    const radius = Math.min(this.plan!.parameters.width, this.plan!.parameters.depth) * 0.14;
    const x = (Math.sin(halfAngle) * radius).toFixed(2), z = (-Math.cos(halfAngle) * radius).toFixed(2);
    const shape = `M0 0 L-${x} ${z} A${radius} ${radius} 0 0 1 ${x} ${z} Z M0 0 L0 ${-radius}`;
    if (shape !== this.viewShape) {
      this.viewShape = shape;
      this.cameraView.setAttribute("d", shape);
    }
    // SVG X/Y follows world X/Z: -Z is map-up and +X is map-right.
    const heading = Math.atan2(forward.x, -forward.z) * 180 / Math.PI;
    const transform = `translate(${p.x.toFixed(1)} ${p.z.toFixed(1)}) rotate(${heading.toFixed(1)})`;
    if (transform !== this.viewTransform) {
      this.viewTransform = transform;
      this.cameraView.setAttribute("transform", transform);
    }
  }

  /** Release the map and DOM listeners before destroying the Seed engine. */
  destroy(): void {
    this.disposed = true; this.abort.abort(); void this.map.dispose(); this.element.remove();
  }

  private updateInputModeControl(): void {
    const keyboard = this.options.navigation.inputMode === "keyboard";
    const button = this.button("#roam-input-mode");
    // Keep the capability discoverable while joystick is active; the switch conveys its state.
    this.find("#roam-input-mode-label").textContent = "WASD";
    button.dataset.inputMode = this.options.navigation.inputMode;
    button.setAttribute("aria-checked", String(keyboard));
    button.setAttribute("aria-label", keyboard
      ? "WASD 键盘控制已开启；关闭后使用摇杆"
      : "WASD 键盘控制已关闭；当前使用摇杆");
    button.title = keyboard
      ? "WASD 平移 / Move · 方向键转向 / Arrow keys look · 拖动转向 / Drag to look"
      : "开启 WASD 键盘控制；当前使用摇杆";
    button.disabled = !this.inputEnabled || this.mode !== "roam";
  }

  private setCameraMode(mode: "orbit" | "roam"): void {
    if (mode === this.mode) return;
    this.options.beforeCameraMove();
    const { camera, navigation, orbit } = this.options, p = camera.entity.transform.worldPosition;
    if (mode === "orbit") {
      const ground = this.options.sampleHeight(p.x, p.z) ?? p.y;
      orbit.target.set(p.x, ground, p.z);
      camera.entity.transform.setWorldPosition(p.x, ground + 100, p.z + 100);
      camera.entity.transform.lookAt(orbit.target);
    } else {
      camera.entity.transform.setWorldPosition(orbit.target.x, orbit.target.y + navigation.groundClearance, orbit.target.z);
      navigation.setGroundCollision(true); navigation.synchronizeView();
    }
    this.mode = mode; this.setInputEnabled(this.inputEnabled); this.update();
  }
  private find(selector: string): HTMLElement { return this.element.querySelector<HTMLElement>(selector)!; }
  private button(selector: string): HTMLButtonElement { return this.element.querySelector<HTMLButtonElement>(selector)!; }
  private input(selector: string): HTMLInputElement { return this.element.querySelector<HTMLInputElement>(selector)!; }
}
