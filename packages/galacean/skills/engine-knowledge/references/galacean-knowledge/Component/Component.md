# Galacean Component

## 它是什么
- 赋予实体功能的基类，挂载在 `Entity` 上驱动渲染、相机、光照、脚本等能力。
- 控制自身启停（`enabled`），跟随实体激活状态进入生命周期回调。

## 简述
- 组件拥有 `entity`/`scene`/`engine` 引用，可通过 `entity.addComponent` 动态创建。
- 生命周期：仅当组件启用且实体处于层级激活时才触发 `onAwake`（仅一次）与 `onEnable/onDisable`；进入/离开场景激活时引擎会调用内部的 `_onEnableInScene/_onDisableInScene`（通常由内置组件使用，脚本无需重写）；销毁前触发 `onDestroy`（Script 等子类提供这些回调）。
- `enabled` 与 `entity.isActiveInHierarchy` 共同决定是否运行；销毁用 `component.destroy()`。
- 常见子类：`Camera`、`MeshRenderer`/`SkinnedMeshRenderer`、`Animator`、`Light` 系列、`Script`、`StaticCollider`/`DynamicCollider`、`ParticleRenderer` 等。

## 关联
- 所属：`component.entity`、`component.scene`、`component.engine`
- 状态：`enabled`、`destroyed`
- 生命周期回调（在 `Script` 等子类中）：`onAwake/onEnable/onDisable/onStart/onUpdate/onLateUpdate/onDestroy` 等
- 创建/查找：`entity.addComponent`、`entity.getComponent(s)`、`getComponentsIncludeChildren`

## 怎么用
1) 在实体上通过 `addComponent` 挂载所需功能（相机/渲染器/脚本等）。
2) 通过 `enabled` 控制开关，或调用 `destroy()` 移除组件。
3) 自定义行为时继承 `Script`（或自定义组件子类），覆写生命周期回调。

## Best Practices
- 通过 `enabled` 控制开关而非频繁销毁/重建，避免内存抖动。
- 避免在组件构造函数里访问层级/资源，使用 `onAwake/onStart` 做初始化。
- 自定义行为优先继承 `Script`，利用完善的生命周期与事件钩子。
- 有重名组件时使用 `getComponentsIncludeChildren` 并传入复用数组，减少分配。
- `getComponentsIncludeChildren` 不是 `getComponentInChildren`，也没有递归布尔参数；签名是
  `entity.getComponentsIncludeChildren(ComponentClass, outArray)`，结果写入第二个参数数组。
- 组件依赖资源（材质、贴图等）时在 `onDestroy` 释放/减引用，保持资源管理一致。
- 生命周期顺序：首次层级激活触发 `onAwake`（一次）→ `onEnable`；失活时调用 `onDisable`；进入/离开场景时引擎内部会执行场景级钩子（脚本通常无需关心）；销毁在帧末回收。

## Few-shot（常见需求提示）
- “在节点上加相机/灯光” → `entity.addComponent(Camera/DirectLight);`
- “按层级找脚本” → `root.getComponentsIncludeChildren(Script, list);`
- “暂停某个效果” → 设置对应组件 `enabled = false`。
- “自定义更新逻辑” → 继承 `Script`，覆写 `onUpdate`。
- “删除组件” → `component.destroy()`（会触发 `onDisable`/`onDestroy`）。

## Notes / Warning
- 组件是否运行取决于 `enabled` 与实体 `isActiveInHierarchy`；父节点失活会停用子组件。
- 生命周期回调在子类（如 `Script`）中暴露，继承基础 `Component` 时需调用 super 构造。
- `destroy()` 在帧末回收，销毁后不要继续持有引用调用方法。
- `addComponent/getComponent` 等 API 需传入组件的构造函数（如 `Camera` 类本身），不支持通过字符串名称查找/创建组件。
- 组件启停遵循实体激活 + 组件 `enabled` 双判定；父节点失活也会让子组件停用。
