import { UniformSemantic, DataType } from '@alipay/o3-base';
import { Material } from '@alipay/o3-material';
import { Resource } from '@alipay/o3-loader';
import { vec3 } from '@alipay/o3-math';

function transCoord(coord, center, scale) {
  return [(coord[0]-center[0])*scale[0], (coord[1]-center[1])*scale[1]];
}

export function dataProcessing(cityMap,center,scale) {

  let buildingNumber = cityMap.features.length;
  for(let i = 0;i < buildingNumber; ++i){
    let feature = cityMap.features[i];
    const geotype = feature.geometry.type;
    let coords = geotype == "Polygon"?
                  feature.geometry.coordinates[0] :
                  geotype == "MultiPolygon" ?
                    feature.geometry.coordinates[0][0]:
                    null;
    let coordNumber = coords.length;
    for(let j = 0;j < coordNumber; ++j){
      let c = transCoord(coords[j], center, scale);
      coords[j][0] = c[0];
      coords[j][1] = c[1];
    }
  }
  return cityMap;
}

export function processRoadData(roadMap, center, scale) {
  let meshVertices = [];
  let roadPoints = [];
  for (let feature of roadMap.features) {
    const coords = feature.geometry.coordinates[0];
    const width = feature.properties.Width;
    const nCoords = coords.length;

    for (let i=1; i<nCoords; ++i) {
      const a = transCoord(coords[i-1], center, scale);
      const b = transCoord(coords[i], center, scale);
      const a3 = vec3.fromValues(a[0], 0.0, a[1]);
      const b3 = vec3.fromValues(b[0], 0.0, b[1]);
      const up = vec3.fromValues(0., 1., 0.);
      const heading = vec3.normalize(vec3.create(), vec3.subtract(vec3.create(), b3, a3));
      const sidedir = vec3.cross(vec3.create(), up, heading);

      const w = width / 45.0;
      const ext = vec3.mul(vec3.create(), sidedir, vec3.fromValues(w,w,w));

      const poses = [
        vec3.add(vec3.create(), a3, ext),
        vec3.sub(vec3.create(), a3, ext),
        vec3.add(vec3.create(), b3, ext),
        vec3.sub(vec3.create(), b3, ext)
      ];

      for (let d of [
          {'POSITION': poses[0]},
          {'POSITION': poses[1]},
          {'POSITION': poses[3]},

          {'POSITION': poses[3]},
          {'POSITION': poses[2]},
          {'POSITION': poses[0]},
        ])
      {
        meshVertices.push(d);
      }
    }
  }
  return meshVertices;
}
