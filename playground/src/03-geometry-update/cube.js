import { DataType, BufferUsage } from '@alipay/r3-base';
import { BufferGeometry } from '@alipay/r3-geometry';

function createCubeGeometry(size) {
  //-- crete object
  var geometry = new BufferGeometry('cubeGeometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false}
  ], 36, BufferUsage.DYNAMIC_DRAW);

  //--
  var pos = [
    [-size, -size, -size],
    [size, -size, -size],
    [-size, size, -size],
    [size, size, -size],
    [-size, -size, size],
    [size, -size, size],
    [-size, size, size],
    [size, size, size]
  ];

  var colors = [
    [0, 0, 0],
    [1.0, 0, 0],
    [0, 1.0, 0],
    [1.0, 1.0, 0],
    [0, 0, 1.0],
    [1.0, 0, 1.0],
    [0, 1.0, 1.0],
    [1.0, 1.0, 1.0]
  ];
  var indexValues = [
    0, 2, 1, 3, 1, 2, 0, 4, 2, 6, 2, 4, 5, 1, 7, 3, 7, 1, 6, 7, 2, 3, 2, 7, 0, 1, 4, 5, 4, 1, 4, 5, 6, 7, 6, 5
  ];

  indexValues.forEach((vertexIndex, i) => {
    geometry.setValue('POSITION', i, pos[vertexIndex]);
    geometry.setValue('COLOR', i, colors[vertexIndex]);
  });

  return geometry;
}

export default createCubeGeometry;
