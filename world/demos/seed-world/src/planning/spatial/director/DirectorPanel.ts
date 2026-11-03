import { auditRoadJourneys } from "./RoadJourneyAudit.ts";
import type { WayfindingPolicy } from "@galacean/engine-world-planning/spatial/guidance/WayfindingPolicy";
import { endpointGroups } from "./DirectorGroups.ts";
import { directorSnapshotId } from "@galacean/engine-world-planning/spatial/director/DirectorSnapshot";
import { auditObjects, OBJECT_SAMPLING } from "./DirectorObjectAudit.ts";
import { sampleSchedule } from "@galacean/engine-world-planning/spatial/director/DirectorSampling";
import type { DirectorEndpoint } from "@galacean/engine-world-planning/spatial/director/TerrainNavigator";
import { planningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { WorldPlanning3DView } from "@galacean/engine-world-planning/semantic-study/WorldPlanning3DView";
import { poiContentLabel } from "@galacean/engine-world-planning/semantic-study/PoiContents";
import { trackObserver, type DirectorRoute, type WalkTrack } from "@galacean/engine-world-planning/spatial/director/DirectorRoute";
import type { ColorAssignments } from "@galacean/engine-world-planning/spatial/director/DirectorMask";
import { DIRECTOR_CATEGORIES } from "@galacean/engine-world-planning/spatial/director/DirectorSemantic";

interface PreparedRoute {
  route: DirectorRoute;
  track: WalkTrack;
}
/** One editor accessory. Geometry editing stays in the existing Hierarchy/Inspector.
 * Expensive path simulation and geometry compilation run in a disposable background worker.
 */
export function mountDirectorPanel(
  host: HTMLElement,
  button: HTMLButtonElement,
  acquireView: () => Promise<WorldPlanning3DView>
) {
  const panel = document.createElement("section");
  panel.className = "sp-director";
  panel.hidden = true;
  panel.setAttribute("aria-label", "导演控制");
  panel.innerHTML = `<header><strong>导演</strong><button data-d="close" aria-label="退出导演">×</button></header>
    <label>起点<select data-d="from" aria-label="导演起点"></select></label>
    <label>终点<select data-d="to" aria-label="导演终点"></select></label>
    <fieldset data-d="from-point" hidden><legend>起点坐标（米）</legend><input data-d="from-x" aria-label="起点 X" type="number" step="any"><input data-d="from-z" aria-label="起点 Z" type="number" step="any"></fieldset>
    <fieldset data-d="to-point" hidden><legend>终点坐标（米）</legend><input data-d="to-x" aria-label="终点 X" type="number" step="any"><input data-d="to-z" aria-label="终点 Z" type="number" step="any"></fieldset>
    <label>速度（米/秒）<input data-d="speed" aria-label="导演速度" type="number" min="1" max="20" step="1" value="4"></label>
    <div class="sp-director-actions"><button data-d="play">播放</button><button data-d="restart">重播</button></div>
    <input data-d="seek" aria-label="导演行程" type="range" min="0" max="1" step="0.001" value="0">
    <output data-d="position"></output><p data-d="status" role="status">选择起终点，点击播放。</p>
    <label><input data-d="mask" type="checkbox" checked>显示诊断颜色</label>
    <p data-d="measurement" style="white-space: pre-line">播放后自动显示颜色与覆盖率。</p>`;
  host.append(panel);
  const el = <T extends HTMLElement = HTMLElement>(name: string) => panel.querySelector<T>(`[data-d="${name}"]`)!;
  const from = el<HTMLSelectElement>("from"),
    to = el<HTMLSelectElement>("to"),
    speed = el<HTMLInputElement>("speed"),
    seek = el<HTMLInputElement>("seek");
  let colors: ColorAssignments = {},
    targets = new Set<string>();
  let plan: IslandPlan | undefined, view: WorldPlanning3DView | undefined, worker: Worker | undefined;
  let active = false,
    playing = false,
    disposed = false,
    position = 0,
    version = 0,
    serial = 0,
    frame = 0;
  let prepared: PreparedRoute | undefined, preparation: Promise<PreparedRoute> | undefined;
  let ready: Promise<unknown> | undefined;
  let auditController: AbortController | undefined;
  let samplingReport: object | undefined;
  function cancelAudit(invalidateReport = false) {
    const running = !!auditController,
      hadReport = !!samplingReport;
    auditController?.abort();
    auditController = undefined;
    if (invalidateReport) {
      samplingReport = undefined;
      delete panel.dataset.report;
    }
    if (running || (invalidateReport && hadReport)) panel.dataset.auditStatus = running ? "cancelled" : "invalidated";
  }
  let lastTime = performance.now(),
    displayedFrame = -1;
  const requests = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  const say = (s: string) => {
    el("status").textContent = s;
  };
  function stop() {
    playing = false;
    view?.setDirectorPlaying(false);
    el("play").textContent = "播放";
  }
  function request<T>(data: object): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      requests.set(id, { resolve, reject });
      worker!.postMessage({ ...data, id });
    });
  }
  function terminate() {
    worker?.terminate();
    worker = undefined;
    for (const r of requests.values()) r.reject(new Error("布局已更新，旧计算已取消"));
    requests.clear();
    ready = undefined;
  }
  function startWorker() {
    if (worker) return;
    worker = new Worker(new URL("./DirectorWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const r = requests.get(data.id);
      requests.delete(data.id);
      if (data.error) r?.reject(new Error(data.error));
      else r?.resolve(data.value);
    };
    worker.onerror = (event) => {
      for (const r of requests.values()) r.reject(new Error(event.message));
      requests.clear();
      worker?.terminate();
      worker = undefined;
      ready = undefined;
    };
    const { sample: _sample, ...heightmap } = planningHeightmap(plan!);
    ready = request({ kind: "world", plan, heightmap });
  }
  function invalidate() {
    cancelAudit(true);
    version++;
    delete panel.dataset.measurement;
    delete panel.dataset.route;
    view?.cancelGroundPick();
    stop();
    prepared = undefined;
    preparation = undefined;
    position = 0;
    view?.setDirectorDiagnostics(false);
    seek.value = "0";
    el("position").textContent = "";
    el("measurement").textContent = "播放后自动显示颜色与覆盖率。";
    refreshAutomaticGroups();
  }
  async function prepare() {
    if (!plan || !view?.isPlanReady(plan)) throw new Error("地形与水体尚未完成更新，请就绪后重试。");
    if (prepared) return prepared;
    if (preparation) return preparation;
    if (!plan || !from.value || !to.value) throw new Error("请选择起点和终点");
    if (!speed.checkValidity() || !Number.isFinite(speed.valueAsNumber)) throw new Error("速度须在1–20米/秒");
    const token = version;
    startWorker();
    say("正在地表寻路并复验行走：优先道路，也可绕行草地、缓坡…");
    const pending = (async () => {
      await ready;
      const result = await request<PreparedRoute>({
        kind: "route",
        from: endpoint("from"),
        to: endpoint("to"),
        speed: speed.valueAsNumber
      });
      if (token !== version || !active || !view?.isPlanReady(plan!)) throw new Error("路线已取消或渲染快照已改变");
      prepared = result;
      panel.dataset.route = JSON.stringify({
        route: result.route,
        walk: {
          reached: result.track.reached,
          reason: result.track.reason,
          lengthM: result.track.lengthM,
          elapsedSeconds: result.track.elapsedSeconds,
          speedMps: result.track.speedMps
        }
      });
      say(
        result.track.reached
          ? `通行检查通过 · ${result.track.lengthM.toFixed(0)} 米 · 已检查地表、碰撞与坡度`
          : `通行未通过：${result.track.reason}`
      );
      return result;
    })();
    preparation = pending;
    try {
      return await pending;
    } finally {
      if (preparation === pending) preparation = undefined;
    }
  }
  function observe() {
    if (!prepared?.track.frames.length || !view) return;
    const o = trackObserver(prepared.track, position);
    view.setDirectorControl(true);
    view.observe(o.position, o.forward, o.verticalFovDegrees);
    seek.value = String(position / (prepared.track.lengthM || 1));
    el("position").textContent = `${position.toFixed(1)} / ${prepared.track.lengthM.toFixed(1)} 米`;
  }
  function measure() {
    if (!active || !el<HTMLInputElement>("mask").checked || auditController) return;
    if (!plan || !view?.isPlanReady(plan)) {
      el("measurement").textContent = "等待地形更新…";
      return;
    }
    const diagnostic = view.getDirectorDiagnostics();
    if (diagnostic?.error) {
      el("measurement").textContent = diagnostic.error;
      return;
    }
    view.setDirectorDiagnostics(true, colors);
    const report = diagnostic?.report;
    if (!report) {
      el("measurement").textContent = "正在统计画面…";
      return;
    }
    if (report.frame === displayedFrame) return;
    displayedFrame = report.frame;
    const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
    el("measurement").innerHTML =
      DIRECTOR_CATEGORIES.filter((c) => c.id !== 6 || report.counts[6] > 0)
        .map(
          (c) =>
            `<span style="display:inline-block;width:9px;height:9px;background:${c.color};border:1px solid #777"></span> ${c.label} ${percent(report.categories[c.key])}`
        )
        .join("\n") +
      `\n实体占屏 ${percent(report.solidScreen)}\n${!targets.size ? "终点为地表位置" : report.targetOcclusion === null ? "终点不在画面内" : `终点被遮挡 ${percent(report.targetOcclusion)}`}\n蓝/黄绿描边：起点/终点；红纹：遮挡部分`;
    panel.dataset.measurement = JSON.stringify(report);
  }
  async function play() {
    cancelAudit();
    if (playing) {
      stop();
      if (el<HTMLInputElement>("mask").checked) void measure();
      return;
    }
    const token = version;
    try {
      const p = await prepare();
      if (token !== version || !active) return;
      if (!p.track.frames.length) throw new Error(p.track.reason);
      if (position >= p.track.lengthM) position = 0;
      view!.setDirectorControl(true);
      playing = true;
      view!.setDirectorPlaying(true);
      lastTime = performance.now();
      el("play").textContent = "暂停";
      observe();
    } catch (e) {
      if (token === version && active) say(String(e));
    }
  }
  function close() {
    invalidate();
    active = false;
    panel.hidden = true;
    view?.setDirectorDiagnostics(false);
    button.setAttribute("aria-pressed", "false");
    view?.setDirectorControl(false);
  }
  button.onclick = async () => {
    if (active) {
      close();
      return;
    }
    active = true;
    panel.hidden = false;
    button.setAttribute("aria-pressed", "true");
    try {
      view = await acquireView();
      if (active) view.setDirectorControl(true);
    } catch (e) {
      close();
      say(String(e));
    }
  };
  el("close").onclick = close;
  el("play").onclick = () => {
    void play();
  };
  el("restart").onclick = () => {
    stop();
    position = 0;
    void play();
  };
  function endpoint(which: "from" | "to"): DirectorEndpoint {
    const value = el<HTMLSelectElement>(which).value;
    if (value === "__player") {
      const position = view?.getActorPosition();
      if (!position) throw new Error("角色位置尚未就绪");
      return { kind: "point", position };
    }
    if (value === "__pick") throw new Error("请先在预览中选定位置");
    if (value === "__point") {
      const x = el<HTMLInputElement>(which + "-x").valueAsNumber,
        z = el<HTMLInputElement>(which + "-z").valueAsNumber;
      if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error("请填写有效坐标");
      return { kind: "point", position: { x, z } };
    }
    return { kind: "poi", id: value };
  }
  for (const which of ["from", "to"] as const) {
    const select = el<HTMLSelectElement>(which);
    select.onchange = () => {
      invalidate();
      el(which + "-point").hidden = select.value !== "__point";
      if (select.value !== "__pick") {
        say("路线设置已改变，点击播放。");
        return;
      }
      if (!view) {
        say("白盒尚未就绪");
        return;
      }
      say("在预览地面点击选择；拖动和滚轮可以调整观察。");
      view.beginGroundPick(async (position) => {
        if (!position) {
          say("未选中地表，请重新选择。");
          return;
        }
        const token = version;
        try {
          startWorker();
          await ready;
          await request({ kind: "endpoint", endpoint: { kind: "point", position } });
          if (token !== version || !active) return;
          select.value = "__point";
          el(which + "-point").hidden = false;
          el<HTMLInputElement>(which + "-x").value = position.x.toFixed(2);
          el<HTMLInputElement>(which + "-z").value = position.z.toFixed(2);
          say("地表位置可站立，点击播放检查整条路线。");
        } catch (error) {
          say(String(error));
        }
      });
    };
    for (const axis of ["x", "z"])
      el<HTMLInputElement>(which + "-" + axis).onchange = () => {
        invalidate();
        say("坐标已改变，点击播放检查路线。");
      };
  }
  speed.onchange = () => {
    invalidate();
    say("速度已改变，点击播放。");
  };
  seek.oninput = () => {
    cancelAudit();
    stop();
    if (prepared) {
      position = seek.valueAsNumber * prepared.track.lengthM;
      observe();
      if (el<HTMLInputElement>("mask").checked) void measure();
    }
  };
  function refreshAutomaticGroups() {
    if (!plan) return;
    const group = endpointGroups(plan, from.value, to.value);
    colors = group.colors;
    targets = group.targets;
    panel.dataset.groups = JSON.stringify({ mode: "automatic", colors, targetIds: [...targets] });
  }
  // Machine sampling stays available on the controller without adding user-facing test controls.
  async function auditRoute() {
    if (auditController) {
      cancelAudit();
      panel.dataset.auditStatus = "cancelled";
      return;
    }
    if (!active) return;
    cancelAudit(true);
    stop();
    view?.setDirectorDiagnostics(false);
    const controller = new AbortController(),
      token = version,
      restorePosition = position;
    auditController = controller;
    panel.dataset.auditStatus = "running";
    try {
      const p = await prepare();
      view!.setDirectorDiagnostics(true, colors);
      if (controller.signal.aborted) return;
      const aspect = view!.canvas.width / view!.canvas.height;
      const measuredColors = { ...colors },
        targetIds = [...targets];
      const result = await auditObjects({
        schedule: sampleSchedule(plan!, p.route, p.track, OBJECT_SAMPLING),
        signal: controller.signal,
        measure: async (distance) => {
          if (Math.abs(view!.canvas.width / view!.canvas.height - aspect) > 0.001)
            throw Error("预览尺寸已改变，请重新测量");
          position = distance;
          observe();
          const semantic = await view!.sampleDirectorDiagnostics(controller.signal);
          return {
            version: 2 as const,
            groups: { red: semantic.blockedScreen, blue: semantic.originVisible, green: semantic.targetVisible },
            visibleTarget: semantic.targetVisible,
            projectedTarget: semantic.targetProjected,
            occlusion: semantic.targetOcclusion,
            contributions: {},
            pixels: semantic.pixels,
            width: semantic.width,
            height: semantic.height,
            semantic
          };
        },
        progress: (n) => {
          panel.dataset.auditStatus = `sampling:${n}`;
        }
      });
      if (token !== version || controller.signal.aborted) return;
      samplingReport = {
        ...result,
        snapshotId: directorSnapshotId(plan!),
        seed: plan!.parameters.seed,
        route: p.route,
        walk: { reached: p.track.reached, reason: p.track.reason, speedMps: p.track.speedMps },
        camera: { ...trackObserver(p.track, 0), aspect },
        colors: measuredColors,
        grouping: "engine-semantic-id-depth",
        targetIds,
        policy: OBJECT_SAMPLING
      };
      panel.dataset.report = JSON.stringify(samplingReport);
      panel.dataset.auditStatus = result.status;
      return samplingReport;
    } catch (error) {
      if (!controller.signal.aborted) panel.dataset.auditStatus = String(error);
    } finally {
      if (auditController === controller) {
        auditController = undefined;
      }
      if (token === version && active && !controller.signal.aborted) {
        position = restorePosition;
        observe();
      }
    }
  }
  el<HTMLInputElement>("mask").onchange = () => {
    cancelAudit();
    view?.setDirectorDiagnostics(false);
    displayedFrame = -1;
    el("measurement").hidden = !el<HTMLInputElement>("mask").checked;
    if (el<HTMLInputElement>("mask").checked) void measure();
  };
  function tick(now: number) {
    if (disposed) return;
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    if (active && playing && prepared) {
      position = Math.min(prepared.track.lengthM, position + dt * speed.valueAsNumber);
      observe();

      if (position >= prepared.track.lengthM) {
        stop();
        say(prepared.track.reached ? "已抵达所选终点 · 通行检查通过" : `已到可走部分末端：${prepared.track.reason}`);
      }
    }
    if (active && el<HTMLInputElement>("mask").checked) measure();
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return {
    /** Sample the current route for automated evaluation; returns a report without adding editor controls. */
    auditRoute,
    /** Road-only acceptance never falls back to a straight line or off-road navigation. */
    async auditRoads(
      policy: WayfindingPolicy,
      progress: Parameters<typeof auditRoadJourneys>[0]["progress"],
      routePolicy?: (id: string) => WayfindingPolicy
    ) {
      cancelAudit(true);
      stop();
      view ??= await acquireView();
      if (!plan || !view.isPlanReady(plan)) throw Error("白盒尚未完成更新");
      active = true;
      panel.hidden = false;
      button.setAttribute("aria-pressed", "true");
      const controller = new AbortController(),
        token = version;
      auditController = controller;
      try {
        startWorker();
        await ready;
        const aspect = view.canvas.width / view.canvas.height;
        const report = await auditRoadJourneys({
          plan,
          policy,
          aspect,
          routePolicy,
          signal: controller.signal,
          progress,
          prepare: async (a, b, routeId) =>
            request<PreparedRoute>({
              kind: "route",
              from: { kind: "poi", id: a },
              to: { kind: "poi", id: b },
              speed: 4,
              roadOnly: true,
              routeId
            }),
          measure: async (track, distance, a, b) => {
            if (token !== version || !view!.isPlanReady(plan!)) throw Error("规划已改变，请重新验收");
            if (Math.abs(view!.canvas.width / view!.canvas.height - aspect) > 0.001) {
              controller.abort(new Error("预览尺寸已改变，请重新测量"));
              controller.signal.throwIfAborted();
            }
            if (from.value !== a || to.value !== b) {
              from.value = a;
              to.value = b;
              refreshAutomaticGroups();
            }
            const o = trackObserver(track, distance);
            view!.setDirectorControl(true);
            view!.observe(o.position, o.forward, o.verticalFovDegrees);
            view!.setDirectorDiagnostics(true, colors);
            el("position").textContent = `${distance.toFixed(1)} / ${track.lengthM.toFixed(1)} 米`;
            return view!.sampleDirectorDiagnostics(controller.signal);
          }
        });
        samplingReport = report;
        panel.dataset.report = JSON.stringify(report);
        return report;
      } finally {
        if (auditController === controller) auditController = undefined;
      }
    },
    /** Invalidate only when the published layout identity changes, not when selection or tabs change. */
    update(next: IslandPlan) {
      if (plan === next) return;
      invalidate();
      terminate();
      plan = next;

      const sites = (plan.poiDistribution?.sites ?? []).filter((p) => p.memberIds.length > 0);
      for (const select of [from, to]) {
        const old = select.value;
        select.replaceChildren(
          ...[
            ["__player", "当前角色位置"],
            ["__pick", "在预览中选点"],
            ["__point", "输入地表坐标"]
          ].map(([value, label]) => new Option(label, value)),
          ...sites.map((p, index) => {
            const o = document.createElement("option");
            o.value = p.id;
            o.textContent = `${{ large: "大", medium: "中", small: "小" }[p.tier]} · ${poiContentLabel(next, p)}${p.tier === "small" ? `（${index + 1}）` : ""}`;
            return o;
          })
        );
        if (sites.some((p) => p.id === old) || old.startsWith("__")) select.value = old;
        else if (select === to && sites.length) select.value = sites[0].id;
      }
      for (const which of ["from", "to"] as const) {
        el(which + "-point").hidden = el<HTMLSelectElement>(which).value !== "__point";
        for (const axis of ["x", "z"] as const)
          if (!el<HTMLInputElement>(which + "-" + axis).value)
            el<HTMLInputElement>(which + "-" + axis).value = String(plan.spawn[axis]);
      }
      refreshAutomaticGroups();
      say("选择起终点，点击播放；无道路时在可通行地表寻路。");
    },
    pause: () => {
      cancelAudit();
      stop();
      view?.setDirectorDiagnostics(false);
      view?.setDirectorControl(false);
    },
    close,
    dispose() {
      disposed = true;
      close();
      terminate();
      cancelAnimationFrame(frame);

      panel.remove();
    }
  };
}
