# o3-env-probe
环境探针类，提供诸如 反射/折射/镜子/纹理扰动 等功能

1. PlaneProbe
2. CubeProbe

# refraction example
```
import {PlaneProbe} from '@alipay/o3-env-probe';


const probe = rootNode.addComponent(PlaneProbe, {
    renderList: [pingshen, cap, logo]
  });

 water.refractionTexture = probe.texture;
 water.refractionDepth = 0.025; // 瓶身的厚度
```


# reflection example
```
import {CubeProbe} from '@alipay/o3-env-probe';

const probe = rootNode.addComponent(CubeProbe, {
     renderAll: true
  });

  probe.onTextureChange = cubeTexture => {
    envLight.specularMap = cubeTexture;
  };

```

