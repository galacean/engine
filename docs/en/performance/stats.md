---
order: 2
title: Statistics Panel
type: Performance
label: Performance
---

[@galacean/engine-toolkit-stats](https://www.npmjs.com/package/@galacean/engine-toolkit-stats) package is mainly used to display the rendering status of the camera. You only need to add the `Stats` component to the camera node:

```typescript
import { Engine } from "@galacean/engine";
import { Stats } from "@galacean/engine-toolkit-stats";

cameraEntity.addComponent(Camera);
cameraEntity.addComponent(Stats);
```

## Example

<playground src="text-barrage.ts"></playground>
