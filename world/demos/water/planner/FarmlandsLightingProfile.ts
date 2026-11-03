/** Scene_Demo RenderSettings + Sun + M_Farmlands_Skybox, owned by this comparison demo. */
export const FARMLANDS_LIGHTING = {
  sunColor: [1, 0.9264706, 0.75],
  sunIntensity: 1.2,
  // Unity +Z light direction from the authored quaternion, mirrored into Galacean Z.
  sunDirection: [0.030963765398524544, -0.6732708122147435, -0.7387473504945984],
  skyTint: [0.34901962, 0.403264, 0.45490196],
  skyExposure: 1.2,
  skyRotation: -311,
  ambientSky: [0.4943396, 0.38240916, 0.33484513],
  ambientEquator: [0.5940548, 0.6961405, 0.7735849],
  ambientGround: [0.18174653, 0.17935914, 0.3056603],
  reflectionIntensity: 0.5,
  fogColor: [0.56078434, 0.83464426, 0.9529412],
  fogDensity: 0.0011
} as const;

/** WebGL cubemap face direction -> Unity's lat-long panorama, including handedness. */
export function farmlandsSkyUV(face: number, u: number, v: number): readonly [number, number] {
  let x: number, y: number, z: number;
  switch (face) {
    case 0:
      x = 1;
      y = -v;
      z = -u;
      break;
    case 1:
      x = -1;
      y = -v;
      z = u;
      break;
    case 2:
      x = u;
      y = 1;
      z = v;
      break;
    case 3:
      x = u;
      y = -1;
      z = -v;
      break;
    case 4:
      x = u;
      y = -v;
      z = 1;
      break;
    case 5:
      x = -u;
      y = -v;
      z = -1;
      break;
    default:
      throw new RangeError("Invalid cubemap face");
  }
  return [0.5 - Math.atan2(-z, x) / (2 * Math.PI), 0.5 - Math.asin(y / Math.hypot(x, y, z)) / Math.PI];
}
