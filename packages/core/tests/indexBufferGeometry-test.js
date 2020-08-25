
import { BufferGeometry } from '../src/index';
import { BufferUsage, DataType } from '@alipay/o3-base';

describe('BufferGeometry', function () {
  var geometry;
  var indexValues = [
    0,2,1,3,1,2,0,4,2,6,2,4,5,1,7,3,7,1,6,7,2,3,2,7,0,1,4,5,4,1,4,5,6,7,6,5
  ];
  it('BufferGeometry create', function () {
    geometry = new BufferGeometry('cubeGeometry');

    expect(geometry != null).to.be.true;
    expect(geometry.name === 'cubeGeometry').to.be.true;
    expect(geometry.primitive !== null).to.be.true;
  });

  it('BufferGeometry init', function () {
    var vertexCount = 8;
    var indexCount = 36;
    
    geometry.initialize([
      { name: 'a_position', size: 3, type: DataType.FLOAT, normalized: false},
      { name: 'a_color', size: 3, type: DataType.FLOAT, normalized: false}
    ], vertexCount, indexValues, indexCount);

    expect(geometry.primitive.vertexBuffers[0] != null).to.be.true;
    expect(geometry.primitive.vertexBuffers[0].byteLength == 192).to.be.true;
    expect(geometry.primitive.vertexCount == vertexCount).to.be.true;

    expect(geometry.primitive.indexBuffer != null).to.be.true;
    expect(geometry.primitive.indexBuffer.byteLength == 72).to.be.true;
    expect(geometry.primitive.indexCount == indexCount).to.be.true;
  });

  it('BufferGeometry getIndex', function () {
    var a_value = geometry.getIndex(0);
    expect(a_value[0] === 0).to.be.true;
  });

  it('BufferGeometry getAllIndex', function () {
    var a_index = geometry.getAllIndex();

    var flag = true;
    indexValues.forEach((value, index)=> {
      if(value !== a_index[index]) {
        flag = false;
      }
    });
    expect(flag).to.be.true;
  });
});
