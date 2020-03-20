/*
 * @Author: your name
 * @Date: 2020-03-20 10:12:52
 * @LastEditTime: 2020-03-20 11:15:45
 * @LastEditors: your name
 * @Description: In User Settings Edit
 * @FilePath: /oasis3d/playground/src/instancing/geometry.js
 */
import { DataType } from '@alipay/o3-base';
import { BufferGeometry } from '@alipay/o3-geometry';

/**
 *
 * @param {number} size 正方体边长
 */
export default function createCubeGeometry(size) {
  //-- crete object
  const geometry = new BufferGeometry('cubeGeometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false}
  ], 3);

  //--
  const pos = [
    [-size/2, -size/2, -size/2],
    [size/2, -size/2, -size/2],
    [-size/2, size/2, -size/2],
    [size/2, size/2, -size/2],
    [-size/2, -size/2, size/2],
    [size/2, -size/2, size/2],
    [-size/2, size/2, size/2],
    [size/2, size/2, size/2]
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

  

  return geometry;
}
