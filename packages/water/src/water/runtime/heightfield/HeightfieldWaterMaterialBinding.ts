import { Material } from "@galacean/engine-core";
import { Color, Vector4 } from "@galacean/engine-math";
import type { HeightfieldWaterVisualUniformConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import {
  WATER_WAVE_PACKED_FLOATS_PER_WAVE,
  WATER_WAVE_SHADER_SLOT_COUNTS
} from "../../authoring/wave/constants/WaterWaveLimits";
import type { HeightfieldWaterLocalMapAtlas } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import type { CompiledWaterPlanarTransformV1 } from "../body/WaterPlanarTransform";
import { HEIGHTFIELD_WATER_SHADER_PROPERTY, HEIGHTFIELD_WATER_WAVE_TIME_SCALE } from "./constants";
import { heightfieldWaterWaveCycle } from "./HeightfieldWaterWaveEvaluator";
import type { HeightfieldWaterMaterialState } from "./types";

const WAVE_B_PROPERTIES = Array.from(
  { length: Math.max(...WATER_WAVE_SHADER_SLOT_COUNTS) },
  (_, index) => `${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveBPrefix}${index}`
);

/** Reuses material-owned vectors; never mutates the compiler's packed wave buffer. */
export function updateHeightfieldWaterWavePhases(
  material: Material,
  waveSet: CompiledWaterWaveSet,
  elapsedTime: number
): void {
  for (let index = 0; index < waveSet.activeWaveCount; index++) {
    const vector = material.shaderData.getVector4(WAVE_B_PROPERTIES[index]);
    vector.y = heightfieldWaterWaveCycle(waveSet.waves[index].angularFrequency, elapsedTime);
  }
}

const ZERO_WAVE = new Vector4(0, 0, 0, 0);

/** Binds the inverse planar transform used to evaluate asset-local wave and flow fields. */
export function bindHeightfieldWaterPlanarTransform(
  material: Material,
  transform: Readonly<CompiledWaterPlanarTransformV1>
): void {
  material.shaderData.setVector4(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.waterWorldToLocalPlanar,
    new Vector4(transform.cosine, transform.sine, transform.source.position[0], transform.source.position[2])
  );
}

export function bindHeightfieldWaterWaves(material: Material, waveSet: CompiledWaterWaveSet, slotCount: number): void {
  const packed = waveSet.packedShaderData.borrowTypedArray();
  for (let index = 0; index < slotCount; index++) {
    const offset = index * WATER_WAVE_PACKED_FLOATS_PER_WAVE;
    if (index >= waveSet.activeWaveCount) {
      material.shaderData.setVector4(`${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveAPrefix}${index}`, ZERO_WAVE);
      material.shaderData.setVector4(`${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveBPrefix}${index}`, ZERO_WAVE);
      continue;
    }
    material.shaderData.setVector4(
      `${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveAPrefix}${index}`,
      new Vector4(packed[offset], packed[offset + 1], packed[offset + 2], packed[offset + 3])
    );
    material.shaderData.setVector4(
      `${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveBPrefix}${index}`,
      new Vector4(packed[offset + 4], 0, packed[offset + 6], packed[offset + 7])
    );
  }
}

export function bindHeightfieldWaterBaseMaterial(
  state: HeightfieldWaterMaterialState,
  config: HeightfieldWaterVisualUniformConfig,
  atlas: HeightfieldWaterLocalMapAtlas
): void {
  const shaderData = state.material.shaderData;
  shaderData.setColor(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.shallowColor,
    new Color(config.shallowColor[0], config.shallowColor[1], config.shallowColor[2], config.shallowColor[3])
  );
  shaderData.setColor(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.deepColor,
    new Color(config.deepColor[0], config.deepColor[1], config.deepColor[2], config.deepColor[3])
  );
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.alpha, config.opacity);
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.clarity, 0.7);
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.timeScale, HEIGHTFIELD_WATER_WAVE_TIME_SCALE);
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.waveStrength, config.waveStrength);
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.shoreDampingWidth, config.shoreDampingWidth);
  shaderData.setVector4(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.localMapDecode,
    new Vector4(atlas.flowDecodeScale, atlas.maxDepth, atlas.signedDistanceRange, 0)
  );
  shaderData.setVector4(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.localMapWorldToUv,
    new Vector4(atlas.worldToUv[0], atlas.worldToUv[1], atlas.worldToUv[2], atlas.worldToUv[3])
  );
}
