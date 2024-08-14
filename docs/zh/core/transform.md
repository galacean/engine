---
order: 7
title: 变换
type: 核心
label: Core
---

## 基础概念

`Transform` 是 `Entity` 自带的基础组件，开发者可以通过它管理 `Entity` 在**局部空间**与**世界空间**中的位置、旋转和缩放。

> 结合 Galacean 的 **[坐标系统](/docs/core/space)** 会有更深入地了解。

<playground src="transform-basic.ts"></playground>

## 编辑器使用

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*vU40Rb-2s5QAAAAAAAAAAAAADtKFAQ/original" alt="merge" style="zoom:50%;" />

更改选中实体的可视化变换组件，直接使用鼠标操纵辅助图标轴。

<h3 id = '1'> 移动 </h3>

| 图标                                                                                                                              | 操作                    | 快捷键 |
| :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :----- |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*s6H2RIawrzgAAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `切换到 Gizmo 移动模式` | W      |

点击辅助轴，可在单个方向内拖动选中实体。点击辅助平面，可在单个平面内拖动选中实体。

<h3 id = '2'> 旋转 </h3>

| 图标                                                                                                                              | 操作                    | 快捷键 |
| :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :----- |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*lwdcRK3MAUIAAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `切换到 Gizmo 选择模式` | E      |

点击并拖动以更改选中实体的旋转。
红色代表绕 X 轴进行旋转，绿色代表绕 y 轴进行旋转，蓝色代表绕 z 轴进行旋转。

<h3 id = '3'> 缩放 </h3>

| 图标                                                                                                                              | 操作                    | 快捷键 |
| :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :----- |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*r7RiRpAiJm0AAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `切换到 Gizmo 缩放模式` | R      |

点击中心立方体，在所有轴上均匀的缩放选中实体。点击辅助轴，在单个方向缩放选中实体。

通过 **[检查器面板](/docs/interface/inspector)** 可以为节点设置更精确的位置、旋转和缩放信息。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Y0qPTptpIBoAAAAAAAAAAAAADhuCAQ/original" alt="image.png"  />

## 脚本使用

```typescript
// 创建节点
const scene = engine.sceneManager.activeScene;
const root = scene.createRootEntity("root");
const cubeEntity = root.createChild("cube");

// entity 在创建后会默认自带变换组件
// 通过变换组件能够对实体进行几何变换

// 修改节点位移，旋转，缩放
transform.position = new Vector3();
// 也可以 transform.setPosition(0, 0, 0);

transform.rotation = new Vector3(90, 0, 0);
// 也可以 transform.setRotation(90, 0, 0);

// 也可以通过实体的属性获取到 transform 组件
cubeEntity.transform.scale = new Vector3(2, 1, 1);
// 也可以 cubeEntity.transform.setScale(2, 1, 1);

// 局部位移 cube 实体
cubeEntity.transform.translate(new Vector3(10, 0, 0), true);

// 局部旋转 cube 实体
cubeEntity.transform.rotate(new Vector3(45, 0, 0), true);
```

## 组件属性

| 属性名称                                                                | 属性释义                                                                                                                 |
| :---------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| [position](/apis/core/#Transform-position)                               | 局部位移                                                                                                                 |
| [rotation](/apis/core/#Transform-rotation)                               | 局部旋转 - 欧拉角                                                                                                        |
| [rotationQuaternion](/apis/core/#Transform-rotationquaternion)           | 局部旋转 - 四元数                                                                                                        |
| [scale](/apis/core/#Transform-scale)                                     | 局部缩放                                                                                                                 |
| [worldPosition](/apis/core/#Transform-worldPosition)                     | 世界位移                                                                                                                 |
| [worldRotation](/apis/core/#Transform-worldRotation)                     | 世界旋转 - 欧拉角                                                                                                        |
| [worldRotationQuaternion](/apis/core/#Transform-worldRotationQuaternion) | 世界旋转 - 四元数                                                                                                        |
| [lossyWorldScale](/apis/core/#Transform-lossyWorldScale)                 | 世界有损缩放 - 当父节点有缩放，子节点有旋转时，缩放会倾斜，无法使用 Vector3 正确表示,必须使用 Matrix3x3 矩阵才能正确表示 |
| [localMatrix](/apis/core/#Transform-localMatrix)                         | 局部矩阵                                                                                                                 |
| [worldMatrix](/apis/core/#Transform-worldMatrix)                         | 世界矩阵                                                                                                                 |
| [worldForward](/apis/core/#Transform-worldMatrix)                        | forward 向量（世界空间中的单位矩阵）                                                                                     |
| [worldRight](/apis/core/#Transform-worldMatrix)                          | right 向量（世界空间中的单位矩阵）                                                                                       |
| [worldUp](/apis/core/#Transform-worldMatrix)                             | up 向量（世界空间中的单位矩阵）                                                                                          |

## 组件方法

| 方法名称                                                                | 方法释义                               |
| ----------------------------------------------------------------------- | -------------------------------------- |
| [getWorldUp](/apis/core/#Transform-getWorldUp)                           | 获取世界矩阵上向量                     |
| [getWorldRight](/apis/core/#Transform-getWorldRight)                     | 获取世界矩阵右向量                     |
| [getWorldForward](/apis/core/#Transform-getWorldForward)                 | 获取世界矩阵前向量                     |
| [lookAt](/apis/core/#Transform-lookAt)                                   | 旋转并且保证世界前向量指向目标世界位置 |
| [registerWorldChangeFlag](/apis/core/#Transform-registerWorldChangeFlag) | 注册世界变换改变标记                   |
| [rotate](/apis/core/#Transform-rotate)                                   | 根据指定欧拉角旋转                     |
| [rotateByAxis](/apis/core/#Transform-rotateByAxis)                       | 根据指定角度绕着指定轴旋转             |
| [translate](/apis/core/#Transform-translate)                             | 根据指定的方向和距离进行位移           |

### `registerWorldChangeFlag` 的作用

`transform` 组件内部用脏标记作了大量计算优化。由于 `transform` 的 `worldMatrix` 属性也用脏标记进行了优化，若组件外部需要关注当前 `transform` 的 `worldMatrix` 是否发生了变化，需要获取到其脏标记的状态。 `transform` 组件提供了 `registerWorldChangeFlag` 方法：这个方法会返回一个更新标记，当前 `transform` 的 `worldMatrix` 被修改时会触发标记的更改。具体用法可以参考相机组件：

```typescript
class Camera {
  onAwake() {
    this._transform = this.entity.transform;
    // 注册更新标记
    this._isViewMatrixDirty = this._transform.registerWorldChangeFlag();
  }
  get viewMatrix() {
    // 当标记更新时，根据 worldMatrix 得到viewMatrix～
    if (this._isViewMatrixDirty.flag) {
      this._isViewMatrixDirty.flag = false;
      Matrix.invert(this._transform.worldMatrix, this._viewMatrix);
    }
    return this._viewMatrix;
  }
}
```
