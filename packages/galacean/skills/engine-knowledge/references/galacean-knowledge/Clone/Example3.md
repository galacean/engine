# 自定义克隆逻辑 示例

## Summary
- 展示自定义克隆逻辑的用法。

## Code
```ts
import { Script, ignoreClone } from "@galacean/engine";

class CustomData {
  score = 0;
  copyFrom(src: CustomData) {
    this.score = src.score;
  }
}

class Holder extends Script {
  @ignoreClone
  data = new CustomData();
  _cloneTo(target: Holder): void {
    target.data.copyFrom(this.data);
  }
}
```
