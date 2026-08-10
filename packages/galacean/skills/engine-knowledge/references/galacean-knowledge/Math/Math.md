# Galacean Math

## 它是什么
- 引擎的数学工具集（`@galacean/engine` 内置 math 子包），提供向量、四元数、矩阵、颜色、射线、包围体与碰撞工具等基础类型。
- 支撑变换、空间转换、物理/裁剪与着色计算的核心库。

## 简述
- 基础类型：`Vector2/3/4`、`Quaternion`、`Matrix`（4x4 列主序）、`Matrix3x3`、`Color`、`Ray`。
- 包围体与测试：`BoundingBox`、`BoundingSphere`、`BoundingFrustum`、`CollisionUtil`。
- 工具：`MathUtil`（角度/弧度转换、近似比较等）。
- 与 `Transform`/`Camera` 等配合做位姿、投影与拾取；多数实例方法会修改当前对象，静态方法写入传入的 `out` 参数以减少分配。

## 关联
- 变换：`Transform.position/rotation/scale` 使用 `Vector3`/`Quaternion`；`worldMatrix` 为 `Matrix`。
- 空间转换：`Camera` 方法产出 `Ray`、`Vector3`；剔除使用 `BoundingFrustum` 与包围体交叉测试。
- 工具：`MathUtil.degToRad`/`radToDeg`、`approxEquals`。

## 怎么用
1) 使用向量/四元数表达位置与旋转；用矩阵组合平移/旋转/缩放或转换坐标。
2) 用包围盒/球描述体积，结合 `CollisionUtil` 做相交测试。
3) 处理角度时统一使用弧度，必要时用 `MathUtil` 转换。

## Best Practices
- 复用向量/矩阵实例，使用静态方法并传入 `out` 缓冲减少 GC。
- 矩阵为列主序，组合变换遵循右乘顺序（`MVP = P * V * M`）；脚本中保持与引擎一致避免方向错误。
- 角度 API 均使用弧度；需要角度显示时用 `MathUtil.radToDegreeFactor`。
- 包围体尺寸/方向更新后重新计算，确保剔除与碰撞结果正确。

## Few-shot（常见需求提示）
- “让对象朝向目标” → `Quaternion.rotationLookAt(targetDir, up, outQuat); transform.rotationQuaternion = outQuat;`
- “屏幕射线” → `camera.screenPointToRay(pointer, ray);` 与碰撞体/平面求交。
- “检测 AABB 与球是否碰撞” → `CollisionUtil.intersectsSphereAndBox(sphere, box)`.
- “将向量转单位长度” → `vec.normalize();`

## Notes / Warning
- 多数实例方法会修改自身；需要原值时先 `clone()` 或使用静态方法输出到新对象。
- 错误的矩阵乘法顺序会导致位置/朝向异常，遵循列向量右乘规则。
- 数值比较使用 `MathUtil.equals`/`approxEquals`，避免直接比较浮点。
