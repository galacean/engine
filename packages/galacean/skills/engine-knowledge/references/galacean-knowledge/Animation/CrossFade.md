# 直接 CrossFade 示例

## Summary
- 展示直接 CrossFade的用法。

## Code
```ts
import { Animator } from "@galacean/engine";

declare const animator: Animator;

animator.crossFade("Attack", 0.15, 0, 0); // 状态名，过渡时间，层，正向时间偏移
```
