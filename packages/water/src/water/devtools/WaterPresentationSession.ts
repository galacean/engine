import type { WaterTuningSession } from "./WaterDevToolsTypes";

/** Presentation sessions expose playback and visibility without replacing authoring. */
export function createPresentationWaterTuningSession(session: WaterTuningSession): WaterTuningSession {
  const playback = new Set([
    "heightfield.animate",
    "heightfield.surfaceTime",
    "river.animate",
    "river.surfaceTime",
    "ocean.animate",
    "ocean.surfaceTime"
  ]);
  return Object.freeze({
    target: session.target,
    controls: Object.freeze(
      session.controls.map((control) => {
        const safe = playback.has(control.id) || (control.group === "Body" && control.id.endsWith("visible"));
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
