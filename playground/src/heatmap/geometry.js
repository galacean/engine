import { DataType, DrawMode } from '@alipay/r3-base';
import { IndexBufferGeometry } from '@alipay/r3-geometry';

/**
 *
 */
export default function createPlaneGeometry(countX, countY) {
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
  // geometry.mode = DrawMode.POINTS;
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'COLOR', size: 4, type: DataType.FLOAT, normalized: false},
  ], countX * countY, indexValue);

  let index = 0;
  for(let i = 0; i < countX; i++) {
    for(let j = 0; j < countY; j++) {
      geometry.setValue('POSITION', index, [(i - countX/2), (j - countY/2), 0]);
      geometry.setValue('COLOR', index++, [i / countX, (countY - j) / countY, 0, i / countX]);
    }
  }

  return geometry;
}

function getIndex(i, j, countY) {
 return i * countY + j;
}
