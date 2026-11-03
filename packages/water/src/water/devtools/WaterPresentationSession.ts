import type { WaterTuningSession } from "./WaterDevToolsTypes";

/** Only explicit render diagnostics survive; no draft export or replacement command is exposed. */
export function createPresentationWaterTuningSession(session: WaterTuningSession): WaterTuningSession {
  const diagnostics = new Set([
    "heightfield.debugMode",
    "heightfield.animate",
    "heightfield.surfaceTime",
    "river.surfaceDebugMode",
    "river.debugMode",
    "river.animate",
    "river.surfaceTime",
    "ocean.debugView",
    "ocean.animate",
    "ocean.surfaceTime",
    "ocean.lodDebug"
  ]);
  return Object.freeze({
    target: session.target,
    controls: Object.freeze(
      session.controls.map((control) => {
        const safe = diagnostics.has(control.id) || (control.group === "Body" && control.id.endsWith("visible"));
        if (control.kind === "readonly" || (safe && control.updateMode !== "replace" && control.effect !== "authoring"))
          return control;
        return Object.freeze({
          id: control.id,
          label: control.label,
          group: control.group,
          kind: "readonly" as const,
          updateMode: "readonly" as const,
          hidden: control.hidden,
          availability: "readonly" as const,
          read: () => control.read()
        });
      })
    )
  });
}
