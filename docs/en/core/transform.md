---
order: 7
title: Transform
type: Core
label: Core
---

## Basic Concepts

`Transform` is a fundamental component that comes with `Entity`. Developers can use it to manage the position, rotation, and scale of `Entity` in both **local space** and **world space**.

> Combining with Galacean's **[coordinate system](/en/docs/core/space)** will provide a deeper understanding.

<playground src="transform-basic.ts"></playground>

## Editor Usage

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*vU40Rb-2s5QAAAAAAAAAAAAADtKFAQ/original" alt="merge" style="zoom:50%;" />

Change the visual transform component of the selected entity by directly using the mouse to manipulate the auxiliary icon axis.

<h3 id = '1'> Move </h3>

| Icon                                                                                                                              | Operation               | Shortcut |
| :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :------- |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*s6H2RIawrzgAAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `Switch to Gizmo Move Mode` | W        |

Click the auxiliary axis to drag the selected entity in a single direction. Click the auxiliary plane to drag the selected entity in a single plane.

<h3 id = '2'> Rotate </h3>

| Icon                                                                                                                              | Operation               | Shortcut |
| :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :------- |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*lwdcRK3MAUIAAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `Switch to Gizmo Rotate Mode` | E        |

Click and drag to change the rotation of the selected entity.
Red represents rotation around the X axis, green represents rotation around the Y axis, and blue represents rotation around the Z axis.

<h3 id = '3'> Scale </h3>

| Icon                                                                                                                              | Operation               | Shortcut |
| :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :------- |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*r7RiRpAiJm0AAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `Switch to Gizmo Scale Mode` | R        |

点击中心立方体，在所有轴上均匀的缩放选中实体。点击辅助轴，在单个方向缩放选中实体。

通过 **[检查器面板](/en/docs/interface/inspector)** 可以为节点设置更精确的位置、旋转和缩放信息。

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
| [position](/en/apis/core/#Transform-position)                               | 局部位移                                                                                                                 |
| [rotation](/en/apis/core/#Transform-rotation)                               | 局部旋转 - 欧拉角                                                                                                        |
| [rotationQuaternion](/en/apis/core/#Transform-rotationquaternion)           | 局部旋转 - 四元数                                                                                                        |
| [scale](/en/apis/core/#Transform-scale)                                     | 局部缩放                                                                                                                 |
| [worldPosition](/en/apis/core/#Transform-worldPosition)                     | 世界位移                                                                                                                 |
| [worldRotation](/en/apis/core/#Transform-worldRotation)                     | 世界旋转 - 欧拉角                                                                                                        |
| [worldRotationQuaternion](/en/apis/core/#Transform-worldRotationQuaternion) | 世界旋转 - 四元数                                                                                                        |
| [lossyWorldScale](/en/apis/core/#Transform-lossyWorldScale)                 | 世界有损缩放 - 当父节点有缩放，子节点有旋转时，缩放会倾斜，无法使用 Vector3 正确表示,必须使用 Matrix3x3 矩阵才能正确表示 |
| [localMatrix](/en/apis/core/#Transform-localMatrix)                         | 局部矩阵                                                                                                                 |
| [worldMatrix](/en/apis/core/#Transform-worldMatrix)                         | 世界矩阵                                                                                                                 |
| [worldForward](/en/apis/core/#Transform-worldMatrix)                        | forward 向量（世界空间中的单位矩阵）                                                                                     |
| [worldRight](/en/apis/core/#Transform-worldMatrix)                          | right 向量（世界空间中的单位矩阵）                                                                                       |
| [worldUp](/en/apis/core/#Transform-worldMatrix)                             | up 向量（世界空间中的单位矩阵）                                                                                          |

## Component Methods

| Method Name                                                              | Method Description                     |
| ----------------------------------------------------------------------- | -------------------------------------- |
| [getWorldUp](/en/apis/core/#Transform-getWorldUp)                        | Get the world matrix up vector         |
| [getWorldRight](/en/apis/core/#Transform-getWorldRight)                  | Get the world matrix right vector      |
| [getWorldForward](/en/apis/core/#Transform-getWorldForward)              | Get the world matrix forward vector    |
| [lookAt](/en/apis/core/#Transform-lookAt)                                | Rotate and ensure the world forward vector points to the target world position |
| [registerWorldChangeFlag](/en/apis/core/#Transform-registerWorldChangeFlag) | Register world transformation change flag |
| [rotate](/en/apis/core/#Transform-rotate)                                | Rotate according to the specified Euler angles |
| [rotateByAxis](/en/apis/core/#Transform-rotateByAxis)                    | Rotate around the specified axis by the specified angle |
| [translate](/en/apis/core/#Transform-translate)                          | Translate according to the specified direction and distance |

### The Role of `registerWorldChangeFlag`

The `transform` component internally uses dirty flags for a lot of computational optimizations. Since the `worldMatrix` property of `transform` is also optimized using dirty flags, if external components need to monitor whether the current `transform`'s `worldMatrix` has changed, they need to get the status of its dirty flag. The `transform` component provides the `registerWorldChangeFlag` method: this method returns an update flag that triggers a change when the current `transform`'s `worldMatrix` is modified. For specific usage, refer to the camera component:

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
