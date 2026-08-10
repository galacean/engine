# 参数驱动切换 示例

## Summary
- 展示参数驱动切换的用法。

## Code
```ts
import { Animator } from "@galacean/engine";

declare const animator: Animator;
declare let moveSpeed: number;
// 在脚本中，根据输入切换到跑步
if (moveSpeed > 0.1) {
  animator.setParameterValue("Run", true);
  animator.setParameterValue("Speed", moveSpeed);
} else {
  animator.setParameterValue("Run", false);
}
```
