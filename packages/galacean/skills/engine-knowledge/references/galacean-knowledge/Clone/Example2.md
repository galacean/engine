# 脚本字段定制克隆 示例

## Summary
- 展示脚本字段定制克隆的用法。
- 关键 API：Script, Vector3, ignoreClone, shallowClone, deepClone

## Code
```ts
import { Entity, Script, Vector3, deepClone, ignoreClone, shallowClone } from "@galacean/engine";

declare const template: Entity;

class EnemyState extends Script {
  // 运行期句柄不复制
  @ignoreClone
  private _runtimeHandle: number | null = null;
  // 共享元素但复制数组壳
  @shallowClone
  waypoints: Vector3[] = [];
  // 深拷贝保存数据
  @deepClone
  saveData: Record<string, number> = {};
}

// 模板实体先挂好脚本
template.addComponent(EnemyState);

// 克隆实体后，脚本字段按装饰器规则复制
const inst = template.clone();
const clonedState = inst.getComponent(EnemyState);
```
