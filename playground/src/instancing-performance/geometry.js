import { DataType } from "@alipay/o3-base";
import { IndexBufferGeometry } from "@alipay/o3-geometry";

/**
 *
 * @param {number} size 正方体边长
 */
export default function createInstancedGeometry(size) {
  //-- crete object
  var indexValues = [
    0,2,1,3,1,2,0,4,2,6,2,4,5,1,7,3,7,1,6,7,2,3,2,7,0,1,4,5,4,1,4,5,6,7,6,5
  ];

  var geometry = new IndexBufferGeometry('cubeIndexGeometry');
  geometry.setInstancedCount(100000);
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: "offset", size: 3, type: DataType.FLOAT, normalized: false, instanced: 1 }
  ], 8, indexValues);

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

  for(let i = 0; i < 8; i++) {
    const values = {
      'POSITION': pos[i],
      'COLOR': colors[i]
    }
    geometry.setVertexValues(i, values);
  }

  const num = geometry.instancedCount;
  const instancedValues = [];
  for (let i = 0; i < num; i++) {
    const offset = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1];

    instancedValues.push({ offset });
  }
  geometry.setAllInstancedValues(instancedValues);

  return geometry;
}
