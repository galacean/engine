import type { EditReceipt, PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import type { SpatialCommand } from "@galacean/engine-world-planning/spatial/SpatialDocument";

export type PoiSizePreview = ReturnType<PlanningSession["previewPoi"]>;
export interface PoiSizePreviewHost {
  show(preview: PoiSizePreview | undefined): void;
  unavailableReason(): string | undefined;
}

/** A temporary map gesture; only its final value crosses the existing author transaction.
 * @param host Inspector section receiving the controls.
 * @param session Accepted planning state used for read-only partition previews.
 * @param id Selected POI identity.
 * @param commit Existing author transaction, including publication and persistence.
 * @param previewHost Map overlay and editing availability supplied by the editor shell.
 * @returns Controls for refreshing, cancelling a draft, and releasing the mounted editor.
 */
export function mountPoiSizeEditor(
  host: HTMLElement,
  session: PlanningSession,
  id: string,
  commit: (commands: SpatialCommand[]) => Promise<EditReceipt>,
  previewHost: PoiSizePreviewHost
) {
  const section = document.createElement("section");
  section.className = "sp-poi-size";
  section.setAttribute("aria-label", "POI 管理区大小");
  section.innerHTML = `<strong>管理区</strong><label>权重<input data-poi-size="number" type="number" min="0.001" step="any" aria-label="POI 大小权重"></label><input data-poi-size="range" type="range" min="0.25" max="4" step="0.05" aria-label="预览 POI 大小权重"><output data-poi-size="area"></output><p data-poi-size="status" role="status" aria-live="polite"></p>`;
  host.append(section);
  const get = <T extends HTMLElement>(name: string) => section.querySelector<T>(`[data-poi-size="${name}"]`)!;
  const number = get<HTMLInputElement>("number"), range = get<HTMLInputElement>("range"),
    area = get<HTMLOutputElement>("area"), status = get<HTMLParagraphElement>("status");
  let disposed = false, pending = false, dirty = false, frame = 0, revision = -1, saved = 1, blocked = "";
  const clearFrame = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
  const setBusy = (busy: boolean) => {
    pending = busy;
    section.setAttribute("aria-busy", String(busy));
    number.disabled = range.disabled = busy || !!previewHost.unavailableReason();
  };
  const setValue = (value: number) => { number.value = String(value); range.value = String(value); };
  function update() {
    if (disposed || pending) return;
    const reason = previewHost.unavailableReason() ?? "";
    if (dirty && (revision !== session.document.revision || reason)) {
      clearFrame(); dirty = false; previewHost.show(undefined);
      status.textContent = reason || "布局已变化，旧预览已取消";
    }
    number.disabled = range.disabled = !!reason;
    if (reason || blocked) status.textContent = reason;
    blocked = reason;
    if (dirty) return;
    revision = session.document.revision;
    saved = Number(session.inspect(id).components.find(c => c.type === "poi")?.values.sizeWeight ?? 1);
    setValue(saved);
    const current = session.previewPoi({ id });
    area.textContent = `面积 ${Math.round(current.cells.filter(c => c.poiId === id).reduce((n, c) => n + c.areaM2, 0)).toLocaleString()} ㎡`;
  }
  function discard(message = "已取消预览") {
    if (pending) return;
    clearFrame(); dirty = false;
    previewHost.show(undefined);
    number.removeAttribute("aria-invalid");
    update();
    status.textContent = message;
  }
  function preview(): PoiSizePreview | undefined {
    clearFrame();
    if (disposed || pending) return;
    if (revision !== session.document.revision) { discard("布局已变化，请重新调整"); return; }
    const reason = previewHost.unavailableReason();
    if (reason) { discard(reason); return; }
    const value = Number(number.value);
    if (!number.value.trim() || !Number.isFinite(value) || value < 0.001) {
      status.textContent = "请输入不小于 0.001 的有限数值";
      number.setAttribute("aria-invalid", "true");
      previewHost.show(undefined);
      return;
    }
    try {
      const result = session.previewPoi({ id, sizeWeight: value });
      previewHost.show(result);
      const selected = result.cells.filter(c => c.poiId === id).reduce((sum, c) => sum + c.areaM2, 0);
      area.textContent = `预览面积 ${Math.round(selected).toLocaleString()} ㎡`;
      number.removeAttribute("aria-invalid");
      status.textContent = "预览中";
      return result;
    } catch (error) {
      status.textContent = `无法预览：${String(error)}`;
      number.setAttribute("aria-invalid", "true");
      previewHost.show(undefined);
    }
  }
  function schedule() {
    if (disposed || pending) return;
    dirty = true;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; preview(); });
  }
  async function submit() {
    if (disposed || pending || !dirty) return;
    if (!preview()) return;
    const value = Number(number.value);
    if (value === saved) { discard("权重未改变"); return; }
    setBusy(true);
    status.textContent = "正在更新布局并保存…";
    try {
      const receipt = await commit([{ op: "set", entity: id, component: "poi", values: { sizeWeight: value } }]);
      if (disposed) return;
      status.textContent = receipt.status === "accepted" ? "管理区已更新" : `修改未生效：${receipt.message ?? receipt.status}`;
    } catch (error) {
      if (!disposed) status.textContent = `修改未生效：${String(error)}`;
    } finally {
      if (!disposed) {
        dirty = false; setBusy(false); previewHost.show(undefined); update();
      }
    }
  }
  range.oninput = () => { number.value = range.value; schedule(); };
  number.oninput = () => { range.value = number.value; schedule(); };
  range.onchange = number.onchange = () => { void submit(); };
  range.onpointercancel = () => discard();
  section.onkeydown = event => {
    if (event.key === "Enter" && event.target === number) { event.preventDefault(); void submit(); }
  };
  update();
  return {
    update,
    cancelPreview() { if (dirty && !pending) discard(); },
    dispose() { disposed = true; clearFrame(); previewHost.show(undefined); section.remove(); }
  };
}

/** Overlay only: does not publish a plan, change selection, or create a 3D renderer.
 * @param svg Existing top-down planning map.
 * @param preview Read-only partition projection; omit to remove the temporary overlay.
 * @returns Nothing; replaces only the preview layer and its visibility class.
 */
export function showPoiSizePreview(svg: SVGSVGElement, preview?: PoiSizePreview): void {
  svg.querySelector("[data-poi-size-preview]")?.remove();
  svg.classList.toggle("sp-poi-preview", !!preview);
  if (!preview) return;
  const ns = "http://www.w3.org/2000/svg", group = document.createElementNS(ns, "g"),
    anchors = document.createElementNS(ns, "g");
  group.dataset.poiSizePreview = preview.poiId;
  group.setAttribute("pointer-events", "none");
  for (const cell of preview.cells) {
    if (cell.active && cell.outline.length >= 3) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", "M" + cell.outline.map(p => `${p.x},${p.z}`).join(" L") + " Z");
      path.dataset.poiPreviewCell = cell.poiId;
      path.classList.toggle("is-selected", cell.poiId === preview.poiId);
      group.append(path);
    }
    const marker = document.createElementNS(ns, "circle");
    marker.setAttribute("cx", String(cell.center.x));
    marker.setAttribute("cy", String(cell.center.z));
    marker.setAttribute("r", cell.poiId === preview.poiId ? "6" : "4");
    marker.dataset.poiPreviewAnchor = cell.poiId;
    marker.classList.toggle("is-selected", cell.poiId === preview.poiId);
    marker.classList.toggle("is-inactive", !cell.active);
    anchors.append(marker);
  }
  group.append(anchors);
  svg.append(group);
}
