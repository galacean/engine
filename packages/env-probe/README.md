# o3-env-probe
环境探针类，提供诸如反射折射等功能

1. PerturbationProbe
2. ReflectionProbe

# perturbation example
```
import {PerturbationProbe} from '@alipay/o3-env-probe';


let probe = new PerturbationProbe('perturbationProbe',scene,{});
probe.renderList.push(...)
material.perturbationTexture=probe.texture;

```

