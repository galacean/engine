import { DataType } from "@alipay/o3-base";
import { BufferGeometry } from "@alipay/o3-geometry";

/**
 *
 * @param {vec3[]} corners
 */
export function createCubeGeometry(corners) {
  //-- crete object
  const geometry = new BufferGeometry("cubeGeometry");
  geometry.initialize(
    [
      { semantic: "POSITION", size: 3, type: DataType.FLOAT, normalized: false },
      { semantic: "COLOR", size: 3, type: DataType.FLOAT, normalized: false }
    ],
    36
  );

  //--
  const pos = corners;

  const colors = [
    [0, 0, 0],
    [1.0, 0, 0],
    [0, 1.0, 0],
    [1.0, 1.0, 0],
    [0, 0, 1.0],
    [1.0, 0, 1.0],
    [0, 1.0, 1.0],
    [1.0, 1.0, 1.0]
  ];

  pos.forEach((p, i) => {
    geometry.setValue("POSITION", i, pos[i]);
    geometry.setValue("COLOR", i, colors[i]);
  });

  return geometry;
}
