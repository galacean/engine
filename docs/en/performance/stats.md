---
order: 2
title: 统计面板
type: 性能
label: Performance
---

[@galacean/engine-toolkit-stats](https://www.npmjs.com/package/@galacean/engine-toolkit-stats) package is mainly used to display the rendering status of the camera. Just add the `Stats` component to the camera node:

```typescript
import { Engine } from "@galacean/engine";
import { Stats } from "@galacean/engine-toolkit-stats";

cameraEntity.addComponent(Camera);
cameraEntity.addComponent(Stats);
```

## 示例

<playground src="text-barrage.ts"></playground>

