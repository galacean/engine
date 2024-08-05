---
order: 7
title: Transform
type: Core
label: Core
---

## Basic Concepts

`Transform` is a basic component that comes with `Entity`, allowing developers to manage the position, rotation, and scale of the `Entity` in both **local space** and **world space**.

> Combining with Galacean's **[coordinate system](/en/docs/core/space)** will provide a deeper understanding.

<playground src="transform-basic.ts"></playground>

## Editor Usage

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*vU40Rb-2s5QAAAAAAAAAAAAADtKFAQ/original" alt="merge" style="zoom:50%;" />

Modify the visual transformation component of the selected entity by directly manipulating the auxiliary axis icons with the mouse.

<h3 id='1'> Translation </h3>

| Icon                                                                                                                              | Operation               | Shortcut |
| :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :------- |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*s6H2RIawrzgAAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `Switch to Gizmo Move Mode` | W      |

Click on the auxiliary axis to drag the selected entity in a single direction. Click on the auxiliary plane to drag the selected entity on a single plane.

<h3 id='2'> Rotation </h3>

| Icon                                                                                                                              | Operation               | Shortcut |
| :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :------- |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*lwdcRK3MAUIAAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `Switch to Gizmo Select Mode` | E      |

Click and drag to change the rotation of the selected entity.
Red represents rotation around the X-axis, green represents rotation around the Y-axis, and blue represents rotation around the Z-axis.

<h3 id='3'> Scale </h3>

| Icon                                                                                                                              | Operation               | Shortcut |
| :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :------- |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*r7RiRpAiJm0AAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `Switch to Gizmo Scale Mode` | R      |

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


## Component Methods

| Method Name                                                          | Method Description                            |
| -------------------------------------------------------------------- | --------------------------------------------- |
| [getWorldUp](/apis/core/#Transform-getWorldUp)                       | Get the world matrix up vector                |
| [getWorldRight](/apis/core/#Transform-getWorldRight)                 | Get the world matrix right vector             |
| [getWorldForward](/apis/core/#Transform-getWorldForward)             | Get the world matrix forward vector           |
| [lookAt](/apis/core/#Transform-lookAt)                               | Rotate and ensure the world forward vector points to the target world position |
| [registerWorldChangeFlag](/apis/core/#Transform-registerWorldChangeFlag) | Register a flag for world transformation changes |
| [rotate](/apis/core/#Transform-rotate)                               | Rotate based on specified Euler angles       |
| [rotateByAxis](/apis/core/#Transform-rotateByAxis)                   | Rotate around a specified axis by a specified angle |
| [translate](/apis/core/#Transform-translate)                         | Translate based on specified direction and distance |

### Purpose of `registerWorldChangeFlag`

The `transform` component internally optimizes calculations using dirty flags. Since the `worldMatrix` property of `transform` also optimizes using dirty flags, if external components need to track whether the current `transform`'s `worldMatrix` has changed, they need to access the state of its dirty flag. The `transform` component provides the `registerWorldChangeFlag` method: this method will return an update flag, which will be triggered when the `worldMatrix` of the current `transform` is modified. For specific usage, refer to the camera component:

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
