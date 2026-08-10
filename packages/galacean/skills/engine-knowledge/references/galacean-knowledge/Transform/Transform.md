# Galacean Transform

## 它是什么
- 实体自带的变换组件，管理局部/世界的平移、旋转、缩放与矩阵。
- 提供空间转换辅助（`worldPosition/rotation/scale`、方向向量、`translate/rotate/lookAt` 等）。

## 简述
- 数据：局部 `position/rotation(rotationQuaternion)/scale`，世界 `worldPosition/worldRotation(worldRotationQuaternion)/lossyWorldScale`，矩阵 `localMatrix/worldMatrix`。
- 方向：`worldForward/-Z`、`worldRight/+X`、`worldUp/+Y`，按右手系。
- 操作：`translate`、`rotate`/`rotateByAxis`、`lookAt`；更新采用脏标记，`registerWorldChangeFlag` 可监听世界矩阵变化。
- 层级：子节点继承父节点的变换；`lossyWorldScale` 在有旋转+缩放时只能近似表示。

## 关联
- 挂载：`entity.transform`
- 空间：`position` ↔ `worldPosition`，`rotation/rotationQuaternion` ↔ `worldRotation/worldRotationQuaternion`
- 矩阵：`localMatrix`、`worldMatrix`
- 方向：`worldForward`、`worldRight`、`worldUp`
- 监听：`registerWorldChangeFlag()`（返回 `BoolUpdateFlag`）

## 怎么用
1) 通过 `entity.transform` 读取/设置局部位姿；需要绝对位置/朝向时使用世界字段。
2) 使用 `translate/rotate/lookAt` 做相对运动或朝向控制。
3) 需要同步其它系统（如相机视图、跟随）时用 `registerWorldChangeFlag` 检测变换更新。

## Best Practices
- 直接修改 `position/rotation/scale` 向量时使用 `set/copyFrom`，或替换整个向量引用，但保持对象一致性以触发脏标记。
- 旋转使用四元数避免万向节锁；仅在展示时转换到欧拉角。
- 多级父子缩放+旋转时优先使用 `lossyWorldScale` 读取近似缩放，不要手写矩阵拆分。
- 批量移动时重用临时向量，减少分配。

## Few-shot（常见需求提示）
- “物体朝向目标点” → `transform.lookAt(targetPos);`
- “沿自身前向移动” → `transform.translate(transform.worldForward, true);`
- “复制一个节点并偏移” → `const inst = prefab.clone(); inst.transform.translate(new Vector3(0,0,2));`
- “监听相机变换更新” → 在组件里 `registerWorldChangeFlag()`，更新 viewMatrix 时检查。

## Notes / Warning
- `rotation`/`worldRotation` 使用角度制；`rotationQuaternion` 为单位四元数。
- 修改 `world*` 字段会反解到局部，可能受父节点影响；确保层级关系正确。
- `worldForward` 等方向向量是只读缓存，读取会触发计算，避免每帧多次获取不同引用。
