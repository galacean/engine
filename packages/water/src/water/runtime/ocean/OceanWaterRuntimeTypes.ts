import type { WaterConnectionPort } from "../../authoring/connections/WaterConnection";
import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import type { OceanRuntimeTuning } from "./OceanRuntimeTuning";
import type { OceanTextures } from "./OceanTextures";

/** Engine-object-free Body source. Rendering parameters belong to the one canonical Look. */
export interface OceanWaterSourceConfig {
  readonly connections?: readonly WaterConnectionPort[];
  readonly waterLevel: number;
  readonly nearshoreDescriptor: OceanNearshoreDescriptorV1;
}

/** Engine-facing configuration for the finite, render-and-query Ocean runtime. */
export interface OceanWaterRuntimeConfig extends OceanWaterSourceConfig {
  readonly surfaceShader?: import("@galacean/engine-core").Shader;
  readonly renderContract?: CompiledWaterRenderContractV1;
  /** Resolved from the published Water Look, never from diagnostic state. */
  readonly color?: OceanRuntimeTuning["color"];
  readonly waterBodyId: string;
  readonly surfaceCenterXZ: readonly [number, number];
  readonly size: number;
  readonly surfaceTopology: "finite";
  readonly capabilityMode: "render-and-query";
  readonly textures: Readonly<OceanTextures>;
  readonly sceneFogEnabled: boolean;
  readonly surfaceTimeOverride?: number;
}
