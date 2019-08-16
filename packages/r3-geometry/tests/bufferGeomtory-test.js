
import { BufferGeometry } from '../src/index';
import { BufferUsage, DataType } from '@alipay/r3-base';

describe('BufferGeometry', function () {
  var geometry;
  it('BufferGeometry create', function () {
    geometry = new BufferGeometry('cubeGeometry');

    expect(geometry != null).to.be.true;
    expect(geometry.name === 'cubeGeometry').to.be.true;
    expect(geometry.primitive != null).to.be.true;
  });

  it('BufferGeometry init', function () {
    var vertexCount = 36;
    geometry.initialize([
      { name: 'a_position', size: 3, type: DataType.FLOAT, normalized: false},
      { name: 'a_color', size: 3, type: DataType.FLOAT, normalized: false}
    ], vertexCount);


    expect(geometry.primitive.vertexBuffers[0] != null).to.be.true;
    expect(geometry.primitive.vertexBuffers[0].byteLength == 864).to.be.true;
    expect(geometry.primitive.vertexCount == vertexCount).to.be.true;
  });

  it('BufferGeometry setValue/getValue', function () {
    var position = [1, 1, 1];
    var color = [0, 0, 0];

    geometry.setValue('a_position', 0, position);
    geometry.setValue('a_color', 0, color);

    var a_position = geometry.getValue('a_position', 0);
    var a_color = geometry.getValue('a_color', 0);

    var flagP = true;
    position.forEach((p, index)=>{
      if(p !== a_position[index]) {
        flagP = false;
      }
    });

    var flagC = true;
    color.forEach((c, index)=>{
      if(c !== a_color[index]) {
        flagC = false;
      }
    });
    expect(flagP === true).to.be.true;
    expect(flagC === true).to.be.true;
  });

  it('BufferGeometry setVertexValues/getVertexValues', function () {
    var values = {
      'a_position': [1, 1, 1],
      'a_color': [0, 0, 0]
    };
    var verterxIndex = 1;

    geometry.setVertexValues(verterxIndex, values);
    var a_values = geometry.getVertexValues(verterxIndex);

    var flagP = true;
    values.a_position.forEach((p, index)=>{
      if(p !== a_values.a_position[index]) {
        flagP = false;
      }
    });

    var flagC = true;
    values.a_color.forEach((c, index)=>{
      if(c !== a_values.a_color[index]) {
        flagC = false;
      }
    });

    expect(flagP === true).to.be.true;
    expect(flagC === true).to.be.true;
  });

  it('BufferGeometry update', function () {
    var verterxIndex = 1
    var values = {
      'a_position': [1, 1, 1],
      'a_color': [0, 0, 0]
    };
    geometry.primitive.updateType = 2;
    geometry.setVertexValues(verterxIndex, values);
    expect(geometry.primitive.updateRange.byteOffset).to.equal(24);
    expect(geometry.primitive.updateRange.byteLength).to.equal(24);
  });
});
