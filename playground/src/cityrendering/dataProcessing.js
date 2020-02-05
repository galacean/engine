import { UniformSemantic, DataType } from '@alipay/o3-base';
import { Material } from '@alipay/o3-material';
import { Resource } from '@alipay/o3-loader';

export default function dataProcessing(cityMap,center,scale) {

  let buildingNumber = cityMap.features.length;
  for(let i = 0;i < buildingNumber; ++i){
    let coords = cityMap.features[i].geometry.coordinates[0];
    let coordNumber = coords.length;
    for(let j = 0;j < coordNumber; ++j){
      coords[j][0] = scale[0]*(coords[j][0] - center[0]);
      coords[j][1] = scale[1]*(coords[j][1] - center[1]);
    }
  }
  return cityMap;
}
　
