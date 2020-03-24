import { DataType } from "@alipay/o3-base";
import { BufferGeometry } from "@alipay/o3-geometry";

/**
 *
 * @param {number} size 正方体边长
 */
export default function createInstancedGeometry(size) {
  //-- crete object
  const geometry = new BufferGeometry("cubeGeometry");
  geometry.instancedCount = 50;
  geometry.initialize(
    [
      { semantic: "POSITION", size: 3, type: DataType.FLOAT, normalized: false },
      { semantic: "COLOR", size: 3, type: DataType.FLOAT, normalized: false },
      { semantic: "offset", size: 3, type: DataType.FLOAT, normalized: false, instanced: 20 },
      { semantic: "random", size: 3, type: DataType.FLOAT, normalized: false, instanced: 20 }
    ],
    36
  );

  //--
  const pos = [
    [-size / 2, -size / 2, -size / 2],
    [size / 2, -size / 2, -size / 2],
    [-size / 2, size / 2, -size / 2],
    [size / 2, size / 2, -size / 2],
    [-size / 2, -size / 2, size / 2],
    [size / 2, -size / 2, size / 2],
    [-size / 2, size / 2, size / 2],
    [size / 2, size / 2, size / 2]
  ];

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

  const indexValues = [
    0,
    2,
    1,
    3,
    1,
    2,
    0,
    4,
    2,
    6,
    2,
    4,
    5,
    1,
    7,
    3,
    7,
    1,
    6,
    7,
    2,
    3,
    2,
    7,
    0,
    1,
    4,
    5,
    4,
    1,
    4,
    5,
    6,
    7,
    6,
    5
  ];
  indexValues.forEach((vertexIndex, i) => {
    geometry.setValue("POSITION", i, pos[vertexIndex]);
    geometry.setValue("COLOR", i, colors[vertexIndex]);
  });

  const num = geometry.instancedCount;
  const instancedValues = [];
  for (let i = 0; i < num; i++) {
    const offset = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1];
    const random = [Math.random() * 1, Math.random() * 1, Math.random() * 1];
    instancedValues.push({ offset, random });
  }
  geometry.setAllInstancedValues(instancedValues);
  return geometry;
}
