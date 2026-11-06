import type { WaterControlDescriptor } from "@galacean/engine-water/water/devtools/index";
import {
  type GrasslandsBuiltInLightingPreset,
  type GrasslandsLightingController,
  type GrasslandsLightingPreset
} from "./GrasslandsLightingController.ts";
import type { GrasslandsVector3 } from "./GrasslandsPcgTypes.ts";

const LIGHTING_PRESET_OPTIONS = Object.freeze({
  Reference: "reference",
  "All Off": "all-off",
  "Direct Only": "direct-only",
  "Indirect Only": "indirect-only",
  Custom: "custom"
} satisfies Readonly<Record<string, GrasslandsLightingPreset>>);

function channelToHex(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function colorToHex(color: GrasslandsVector3): string {
  return `#${channelToHex(color[0])}${channelToHex(color[1])}${channelToHex(color[2])}`;
}

function colorFromHex(value: string): GrasslandsVector3 {
  const match = /^#([0-9a-f]{6})$/iu.exec(value.trim());
  if (!match) throw new TypeError(`Lighting color '${value}' must use #RRGGBB format.`);
  const encoded = match[1];
  return Object.freeze([
    Number.parseInt(encoded.slice(0, 2), 16) / 255,
    Number.parseInt(encoded.slice(2, 4), 16) / 255,
    Number.parseInt(encoded.slice(4, 6), 16) / 255
  ] as const);
}

/** Creates Showcase-owned controls that never enter Water tuning state or exports. */
export function createGrasslandsLightingSceneControls(
  controller: GrasslandsLightingController
): readonly WaterControlDescriptor[] {
  const controls: WaterControlDescriptor[] = [
    {
      kind: "enum",
      id: "scene.lighting.preset",
      label: "Lighting preset",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      options: LIGHTING_PRESET_OPTIONS,
      read: () => controller.state.preset,
      write: (value) => {
        if (value === "custom") throw new RangeError("Custom Lighting cannot be applied as a preset.");
        controller.applyPreset(value as GrasslandsBuiltInLightingPreset);
      }
    },
    {
      kind: "boolean",
      id: "scene.lighting.direct.enabled",
      label: "Direct enabled",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      read: () => controller.state.direct.enabled,
      write: (enabled) => controller.updateDirect({ enabled })
    },
    {
      kind: "color",
      id: "scene.lighting.direct.color",
      label: "Direct color",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      read: () => colorToHex(controller.state.direct.color),
      write: (value) => controller.updateDirect({ color: colorFromHex(value) })
    },
    {
      kind: "number",
      id: "scene.lighting.direct.intensity",
      label: "Direct intensity",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      minimum: 0,
      maximum: 4,
      step: 0.01,
      read: () => controller.state.direct.intensity,
      write: (intensity) => controller.updateDirect({ intensity })
    },
    {
      kind: "number",
      id: "scene.lighting.direct.pitch",
      label: "Direct pitch",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      minimum: -90,
      maximum: 90,
      step: 0.1,
      read: () => controller.state.direct.pitchDegrees,
      write: (pitchDegrees) => controller.updateDirect({ pitchDegrees })
    },
    {
      kind: "number",
      id: "scene.lighting.direct.yaw",
      label: "Direct yaw",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      minimum: -180,
      maximum: 180,
      step: 0.1,
      read: () => controller.state.direct.yawDegrees,
      write: (yawDegrees) => controller.updateDirect({ yawDegrees })
    },
    {
      kind: "boolean",
      id: "scene.lighting.indirect.enabled",
      label: "Indirect diffuse enabled",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      read: () => controller.state.indirect.diffuseEnabled,
      write: (diffuseEnabled) => controller.updateIndirect({ diffuseEnabled })
    },
    {
      kind: "color",
      id: "scene.lighting.indirect.skyColor",
      label: "Ambient sky color",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      read: () => colorToHex(controller.state.indirect.skyColor),
      write: (value) => controller.updateIndirect({ skyColor: colorFromHex(value) })
    },
    {
      kind: "color",
      id: "scene.lighting.indirect.equatorColor",
      label: "Ambient equator color",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      read: () => colorToHex(controller.state.indirect.equatorColor),
      write: (value) => controller.updateIndirect({ equatorColor: colorFromHex(value) })
    },
    {
      kind: "color",
      id: "scene.lighting.indirect.groundColor",
      label: "Ambient ground color",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      read: () => colorToHex(controller.state.indirect.groundColor),
      write: (value) => controller.updateIndirect({ groundColor: colorFromHex(value) })
    },
    {
      kind: "number",
      id: "scene.lighting.indirect.intensity",
      label: "Ambient intensity",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      minimum: 0,
      maximum: 4,
      step: 0.01,
      read: () => controller.state.indirect.diffuseIntensity,
      write: (diffuseIntensity) => controller.updateIndirect({ diffuseIntensity })
    },
    {
      kind: "boolean",
      id: "scene.lighting.environment.enabled",
      label: "Environment reflection enabled",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      read: () => controller.state.environment.specularEnabled,
      write: (specularEnabled) => controller.updateEnvironment({ specularEnabled })
    },
    {
      kind: "number",
      id: "scene.lighting.environment.intensity",
      label: "Environment reflection intensity",
      group: "Lighting",
      updateMode: "live",
      sessionScope: "transient",
      minimum: 0,
      maximum: 4,
      step: 0.01,
      read: () => controller.state.environment.specularIntensity,
      write: (specularIntensity) => controller.updateEnvironment({ specularIntensity })
    }
  ];
  const visibleControls =
    controller.diffuseSource === "runtime-sky"
      ? controls.filter((control) => !control.id.startsWith("scene.lighting.indirect.") || control.kind !== "color")
      : controls;
  return Object.freeze(visibleControls.map((control) => Object.freeze(control)));
}
