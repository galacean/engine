# 切换皮肤与插槽 示例

## Summary
- 展示切换皮肤与插槽的用法。

## Code
```ts
import { SpineAnimationRenderer } from "@galacean/engine-spine";

declare const spine: SpineAnimationRenderer;

const skeleton = spine.skeleton;
skeleton.setSkinByName("Skin_B");
skeleton.setSlotsToSetupPose(); // 皮肤更新后重置插槽
```
