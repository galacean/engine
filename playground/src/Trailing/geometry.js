import { DataType, DrawMode } from '@alipay/o3-base';
import { IndexBufferGeometry } from '@alipay/o3-geometry';
const height = 2;

export default function createTrailGeometry(points) {
  const countX = points.length;
  const countY = 2;

  let positions = [];
  points.forEach((point, index)=> {
    positions[index] = [[point[0], 0, point[1]], [point[0], height, point[1]]];
  });

  let indexValue = [];
  for(let i = 0; i < countX; i++) {
    for(let j = 0; j < countY; j++) {
      if(i < countX - 1){
        if(j < countY - 1) {
          indexValue.push(getIndex(i, j, countY));
          indexValue.push(getIndex(i+1, j+1, countY));
          indexValue.push(getIndex(i, j+1, countY));
          indexValue.push(getIndex(i, j, countY));
          indexValue.push(getIndex(i+1, j, countY));
          indexValue.push(getIndex(i+1, j+1, countY));
        }
      }
    }
  }
  //-- crete object
  const geometry = new IndexBufferGeometry('cubeGeometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'TEXCOORD_0', size: 2, type: DataType.FLOAT, normalized: false},
  ], countX * countY, indexValue);

  let index = 0;
  for(let i = 0; i < countX; i++) {
    for(let j = 0; j < countY; j++) {
      geometry.setValue('POSITION', index, positions[i][j]);
      geometry.setValue('TEXCOORD_0', index++, [i / (countX - 1), (countY - j - 1) / (countY -1)]);
    }
  }

  return geometry;
}

function getIndex(i, j, countY) {
 return i * countY + j;
}
