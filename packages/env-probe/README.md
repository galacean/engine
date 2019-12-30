# o3-env-probe
环境探针类，提供诸如反射折射等功能

1. PerturbationProbe
2. ReflectionProbe

# perturbation example
```
import {PerturbationProbe} from '@alipay/o3-env-probe';


const probe = rootNode.createAbility(PerturbationProbe, {
    renderList: [pingshen, cap, logo]
  });

water.perturbationTexture = probe.texture;

```


# reflection example
```
import {ReflectionProbe} from '@alipay/o3-env-probe';

const probe = rootNode.createAbility(ReflectionProbe, {
     renderAll: true
  });

  probe.onTextureChange = cubeTexture => {
    envLight.specularMap = cubeTexture;
  };

```

