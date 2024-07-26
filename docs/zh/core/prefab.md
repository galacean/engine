---
order: 10
title: 预制体
type: 核心概念
label: Core
---

## 简介

预制体（Prefab）是一种资产, 可以被视为存储 **[实体](/docs/core-entity)**（包括其子实体和组件）数据的模版。预制体允许开发者创建、更新此模板，然后在需要时将其实例化到场景中。

如果要在场景中的多个位置或项目中的多个场景之间重用以特定方式配置的实体，比如非玩家角色 (NPC)、道具或景物，则应将此游戏对象转换为预制体。这种方式比简单复制和粘贴游戏对象更好，因为预制体可以保持所有副本同步。

#### 预制体的主要特点：

##### 可复用性：
可以在多个场景中使用相同的预制体，任何对预制体的修改都可以自动应用到所有实例上。

##### 方便管理：
预制体可以将复杂的实体（包括其子实体和组件）打包成一个单独的资产，便于管理和组织。

##### 一致性：
通过使用预制体，可以确保在不同场景或不同部分中使用的对象保持一致。

##### 提高效率：
大量使用预制体可以减少重复劳动，使得开发流程更加高效。

## 编辑器使用

### 创建预制体

有两种方式可以创建预制体

1. 右键实体即可创建以此实体作为模版的预制体
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*1D-6TpXqDWcAAAAAAAAAAAAADsJ_AQ/original)
2. 将实体从 **[层级面板](/docs/interface-hierarchy)** 拖到 **[资产面板](/docs/assets-interface)** 中即可创建以此实体作为模版的预制体
![create](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*IXI9Q4ljEu8AAAAAAAAAAAAADsJ_AQ/original)

### 更新预制体

有两种方式更新预制体

#### 全局替换
将实体从 **层级面板** 拖到 **资产面板** 中已有的预制体资产上，预制体资产将会更新为新内容，同时所有由此预制体产生的实例也会更新为最新内容。
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*o0WAR77vPbIAAAAAAAAAAAAADsJ_AQ/original)

实体也可以是此预制体的实例
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*A0TpTZs7i3EAAAAAAAAAAAAADsJ_AQ/original)

#### 应用实例的修改
预制体的实例是基于预制体模版生成的，所有的实例都会随着模版的更改而更改，但是每个实例可能会有自身的修改：子实体及其组件的添加，删除，更新。想要将实例自身的修改内容变为模版内容可以通过如下方式:

1. 添加子节点
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*mnm8SIA8MXIAAAAAAAAAAAAADsJ_AQ/original)

2. 删除子节点
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*AN5YQpYSoNsAAAAAAAAAAAAADsJ_AQ/original)

3. 修改子节点
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*CoZKT4O9mzMAAAAAAAAAAAAADsJ_AQ/original)

4. 添加组件
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*XFz3TrsJjBoAAAAAAAAAAAAADsJ_AQ/original)

5. 更新组件
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*mM2dS70ZR7cAAAAAAAAAAAAADsJ_AQ/original)

6. 删除组件
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*WC8ZTIv5MK4AAAAAAAAAAAAADsJ_AQ/original)

### 解开预制体实例
如果我们想让一个预制体实例与预制体断开联系，使其不随着预制体更改而更改，我们可以将预制体实例解开
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*vtpERpaqb_AAAAAAAAAAAAAADsJ_AQ/original)

### 删除预制体
预制体是一个资产，删除的方式同其他资产一样。值得注意的是，删除预制体后预制体实例的处理方式有两种

1. 预制体实例全部删除
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*EJEGSZMi7ZAAAAAAAAAAAAAADsJ_AQ/original)
2. 预制体实例全部解开
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*54i3QYBUsaQAAAAAAAAAAAAADsJ_AQ/original)


## 脚本使用

### 加载预制体
预制体资产的引擎对象为[PrefabResource](/apis/loader/#PrefabResource})。
加载（[资产的加载](/docs/assets-load)）预制体后，使用[instantiate](/apis/loader/#PrefabResource-instantiate})方法可以生成prefab实例。

```typescript
engine.resourceManager
  .load({ url: "Prefab's URL", type: AssetType.Prefab })
  .then((prefab: PrefabResource) => {
    const prefabInstance = prefab.instantiate();
    scene.addRootEntity(prefabInstance);
  });

```
