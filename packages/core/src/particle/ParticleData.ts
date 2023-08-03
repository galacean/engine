import { Color } from "@galacean/engine-math";


/**
 * Particle data.
 */
export class ParticleData {
  startLifeTime: number;
  startColor: Color = new Color();
  startSize: Float32Array = new Float32Array(3);
  startRotation: Float32Array = new Float32Array(3);
  startUVInfo: Float32Array = new Float32Array(4);
}
