import type { DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import type { SeedWorldMountCommandInput } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";

/** Panel lifetime independent of the mount's scene lifetime. */
export interface SeedWorldMountPanel {
  /** Releases the readout timer and folder. */
  destroy(): void;
}

/**
 * Adds the three gameplay intents and native animation readout to the existing inspector.
 * @param host Inspector category assigned to gameplay.
 * @param command Shared semantic command dispatcher.
 * @param readAnimation Reads the native clip name without advancing gameplay.
 * @returns Panel cleanup handle.
 */
export function mountSeedWorldMountPanel(
  host: DebugInspectorPanelHost,
  command: (input: SeedWorldMountCommandInput) => Promise<unknown>,
  readAnimation: () => string
): SeedWorldMountPanel {
  const folder = host.folder("坐骑系统", true);
  const state = { intent: "" };
  const control = folder
    .add(state, "intent", { "—": "", 马出现: "appear", 下马: "dismount", 马消失: "dismiss" })
    .name("指令");
  control.onChange((intent: string) => {
    if (!intent) return;
    state.intent = "";
    control.updateDisplay();
    void command({ intent: intent as SeedWorldMountCommandInput["intent"] }).catch((error) =>
      console.error("[mount.command]", error)
    );
  });
  const info = host.subfolder(folder, "信息", true);
  const write = host.addReadout(info, "当前动画", "seed-world-mount-animation");
  let previous = "";
  const refresh = (): void => {
    const current = readAnimation();
    if (current !== previous) {
      previous = current;
      write(current);
    }
  };
  refresh();
  const timer = window.setInterval(refresh, 200);
  return {
    destroy: () => {
      window.clearInterval(timer);
      host.gui.removeFolder(folder);
    }
  };
}
