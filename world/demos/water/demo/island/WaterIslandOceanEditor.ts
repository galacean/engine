import type { OceanEditSession } from "@galacean/engine-water/water/runtime/ocean/index";
import { editIslandCoast } from "./WaterIslandOceanEditing.ts";

/** Explicit apply keeps compilation out of slider input and the animation loop. */
export function mountIslandOceanEditor(session: OceanEditSession, showCoast: () => void) {
  const panel = document.createElement("section");
  panel.className = "ocean-editor";
  panel.setAttribute("aria-label", "海岸编辑");
  panel.innerHTML = `<strong>海平面与海岸</strong>
    <label>海平面（米）<input aria-label="海平面（米）" type="number" min="0" max="1.5" step="0.25" value="0"></label>
    <div><button data-action="apply">应用海平面</button><button data-action="coast">观察西岸</button></div>
    <div><button data-action="lower">降低沙滩 1 米</button><button data-action="raise">抬高沙滩 1 米</button></div>
    <div><button data-action="undo">撤销</button><button data-action="cancel">取消更新</button></div>
    <output aria-live="polite"></output>`;
  const input = panel.querySelector("input")!;
  const output = panel.querySelector("output")!;
  const buttons = [...panel.querySelectorAll("button")];
  const refresh = () => {
    const status = session.status;
    buttons.forEach((b) => {
      b.disabled =
        b.dataset.action === "cancel"
          ? !status.pending
          : status.pending || (b.dataset.action === "undo" && !status.canUndo);
    });
    output.textContent =
      status.error ??
      (status.pending
        ? "正在更新海岸，完成前保留当前场景…"
        : `已应用 ${status.waterLevel.toFixed(2)} 米 · 第 ${status.revision} 版`);
    if (!status.pending) input.value = String(status.waterLevel);
  };
  const listener = async (event: Event) => {
    const action = (event.target as HTMLElement).closest("button")?.dataset.action;
    if (!action) return;
    try {
      let operation: Promise<void> | undefined;
      if (action === "coast") showCoast();
      if (action === "cancel") session.cancel();
      if (action === "undo") operation = session.undo();
      if (action === "apply") {
        if (!input.reportValidity()) return;
        operation = session.update({ ...session.current.document, waterLevel: input.valueAsNumber });
      }
      if (action === "lower" || action === "raise") {
        showCoast();
        operation = session.update({
          ...session.current.document,
          terrain: editIslandCoast(session.current.document.terrain, action === "lower" ? -1 : 1)
        });
      }
      refresh();
      await operation;
    } catch (error) {
      output.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      refresh();
    }
  };
  panel.addEventListener("click", listener);
  document.body.append(panel);
  refresh();
  return {
    destroy: () => {
      panel.removeEventListener("click", listener);
      panel.remove();
    }
  };
}
