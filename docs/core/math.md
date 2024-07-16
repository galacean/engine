---
order: 8
title: 数学库
type: 核心
label: Core
---

在一个渲染场景中，我们经常会对物体进行平移、旋转、缩放等操作（这些操作我们统一称为 [变换](/docs/core-transform) ），从而达到我们想要的互动效果。而这些变换的计算，我们一般都是通过向量、四元数、矩阵等来实现的，为此我们提供一个数学库来完成 *向量* 、*四元数* 、*矩阵* 等相关运算。除此之外，数学库还提供了更为丰富的类来帮助我们描述空间中的 *点* *线* *面* *几何体*，以及判断它们在三维空间中的相交、位置关系等。


| 类型 | 解释 |
| :--- | :--- |
| [BoundingBox](/apis/math/#BoundingBox) | AABB 包围盒 |
| [BoundingFrustum](/apis/math/#BoundingFrustum) | 视锥体 |
| [BoundingSphere](/apis/math/#BoundingSphere) | 包围球 |
| [CollisionUtil](/apis/math/#CollisionUtil) | 提供很多静态方式，用来判断空间中各个物体之间的相交、位置关系等 |
| [Color](/apis/math/#Color) | 颜色类，使用 RGBA 描述 |
| [MathUtil](/apis/math/#MathUtil) | 工具类，提供比较、角度弧度转换等常用计算 |
| [Matrix](/apis/math/#Matrix) | 默认的4x4矩阵，提供矩阵基本运算，变换相关运算 |
| [Matrix3x3](/apis/math/#Matrix3x3) | 3x3矩阵，提供矩阵基本运算，变换相关运算 |
| [Plane](/apis/math/#Plane) | 平面类，用来描述三维空间中的平面 |
| [Quaternion](/apis/math/#Quaternion) | 四元数，包含x、y、z、w分量，负责旋转相关的运算 |
| [Ray](/apis/math/#Ray) | 射线类，用来描述三维空间中的射线 |
| [Vector2](/apis/math/#Vector2) | 二维向量，包含x、y分量 |
| [Vector3](/apis/math/#Vector3) | 三维向量，包含x、y、z分量 |
| [Vector4](/apis/math/#Vector4) | 四维向量，包含x、y、z、w分量 |

## 向量

向量最基本的定义就是一个方向。或者更正式的说，向量有一个方向（Direction）和大小（Magnitude，也叫做强度或长度）。你可以把向量想像成一个藏宝图上的指示：“向左走10步，向北走3步，然后向右走5步”；“左”就是方向，“10步”就是向量的长度。那么这个藏宝图的指示一共有3个向量。向量可以在任意维度（Dimension）上，但是我们通常只使用2至4维。如果一个向量有2个维度，它表示一个平面的方向（想象一下2D的图像），当它有3个维度的时候它可以表达一个3D世界的方向。

在 Galacean 引擎中，向量用来表示物体坐标（position）、旋转（rotation）、缩放（scale）、颜色（color）。

```typescript
import { Vector3 } from '@galacean/engine-math';

// 创建默认三维向量，即 x,y,z 分量均为0
const v1 = new Vector3(); 

// 创建三维向量，并用给定值初始化 x,y,z 分量
const v2 = new Vector3(1, 2, 3); 

// 设置指定值
v1.set(1, 2, 2); 

// 获取各个分量
const x = v1.x;
const y = v1.y;
const z = v1.z;

// 向量相加，静态方式
const out1 = new Vector3();
Vector3.add(v1, v2, out1);

// 向量相加，实例方式
const out2 = v1.add(v2);

// 向量的标量长度
const len: number = v1.length();

// 向量归一化
v1.normalize();

// 克隆一个向量
const c1 = v1.clone();

// 将向量的值克隆到另外一个向量
const c2 = new Vector3();
v1.cloneTo(c2);

```
## 四元数

四元数是简单的超复数，而在图形引擎中，四元数主要用于三维旋转([四元数于三维旋转的关系](https://krasjet.github.io/quaternion/quaternion.pdf))，能够表示旋转的不止四元数，还有欧拉角、轴角、矩阵等形式，之所以选择四元数，主要有以下几个优势：

- 解决了万向节死锁的问题
- 只需要存储4个浮点数，相比矩阵来说更轻量
- 无论是求逆、串联等操作，相比矩阵更为高效

在 Galacean 引擎中，也是使用四元数来进行旋转相关运算，并提供欧拉角、矩阵等到四元数的转换API。

```typescript
import { Vector3, Quaternion, MathUtil } from '@galacean/engine-math';

// 创建默认四元数，即 x,y,z 分量均为0，w 分量为1
const q1 = new Quaternion(); 

// 创建四元数，并用给定值初始化 x,y,z,w 分量
const q2 = new Quaternion(1, 2, 3, 4); 

// 设置指定值
q1.set(1, 2, 3, 4); 

// 判断两个四元数的值是否相等
const isEqual: boolean = Quaternion.equals(q1, q2);

const xRad = Math.PI * 0.2;
const yRad = Math.PI * 0.5;
const zRad = Math.PI * 0.3;

// 根据 yaw、pitch、roll 生成四元数
const out1 = new Quaternion();
Quaternion.rotationYawPitchRoll(yRad, xRad, zRad, out1);

// 根据 x,y,z 轴的旋转欧拉角(弧度)生成四元数
const out2 = new Quaternion();
// 等价于 Quaternion.rotationYawPitchRoll(yRad, xRad, zRad, out2)
Quaternion.rotationEuler(xRad, yRad, zRad, out2); 

// 绕 X、Y、Z 轴旋转生成四元数，我们以绕 X 轴为例
const out3 = new Quaternion();
Quaternion.rotationX(xRad, out3);

// 当前四元数依次绕 X、Y、Z 轴旋转
const q3 = new Quaternion();
q3.rotateX(xRad).rotateY(yRad).rotateZ(zRad);

// 获取当前四元数的欧拉角(弧度)
const eulerV = new Vector3();
q3.toEuler(eulerV);

// 弧度转角度
eulerV.scale(MathUtil.radToDegreeFactor); 
```

## 矩阵

在 3D 图形引擎中，计算可以在多个不同的笛卡尔坐标空间中执行，从一个坐标空间到另一个坐标空间需要使用变换矩阵，而我们数学库中的Matrix模块正是为提供这种能力而存在的。

在 Galacean 引擎中，有局部坐标、全局坐标、观察坐标、裁剪坐标等，而物体在这些坐标之间的转换，正是通过转换矩阵来完成的。

```typescript
import { Vector3, Matrix3x3, Matrix } from '@galacean/engine-math';

// 创建默认4x4矩阵，默认为单位矩阵
const m1 = new Matrix(); 

// 创建4x4矩阵，并按给定值初始化
const m2 = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

// 将 m2 设置为单位矩阵
m2.identity(); 

// 判断两个矩阵的值是否相等 true
const isEqual1: boolean = Matrix.equals(m1, m2);

// 矩阵相乘 静态方式
const m3 = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
const m4 = new Matrix(16, 15, 14, 13, 12, 11, 10, 9, 8.88, 7, 6, 5, 4, 3, 2, 1);
const out1 = new Matrix();
Matrix.multiply(m3, m4, out1);

// 矩阵相乘，实例方式
const out2 = m3.multiply(m4);

// 判断两个矩阵的值是否相等 true
const isEqual2: boolean = Matrix.equals(out1, out2);

// 求矩阵行列式
const m5 = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
const det: number = m5.determinant();

// 4x4矩阵转3x3矩阵
const m6 = new Matrix3x3();
m6.setValueByMatrix(m5);

// 创建4x4矩阵，并按给定值初始化
const m7 = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);

// 求矩阵的转置矩阵，静态方式
Matrix.transpose(m7, m7); 

// 求矩阵的转置矩阵。实例方式
m7.transpose(); 

// 绕 Y 轴旋转生成4x4矩阵
const axis = new Vector3(0, 1, 0); 
const out4 = new Matrix();
Matrix.rotationAxisAngle(axis, Math.PI * 0.25, out4);
```

## Color

```typescript
import { Color } from "@galacean/engine-math";

// 创建 Color 对象
const color1 = new Color(1, 0.5, 0.5, 1);
const color2 = new Color();
color2.r = 1;
color2.g = 0.5;
color2.b = 0.5;
color2.a = 1;

// linear 空间转 gamma 空间
const gammaColor = new Color();
color1.toGamma(gammaColor);

// gamma 空间转 linear 空间
const linearColor = new Color();
color2.toLinear(linearColor);
```

## 平面
```typescript
import { Plane, Vector3 } from "@galacean/engine-math";

// 通过三角形的三个顶点创建平面
const point1 = new Vector3(0, 1, 0);
const point2 = new Vector3(0, 1, 1);
const point3 = new Vector3(1, 1, 0);
const plane1 = new Plane();
Plane.fromPoints(point1, point2, point3, plane1);
// 通过平面的法线以及法线距离原点距离创建平面
const plane2 = new Plane(new Vector3(0, 1, 0), -1);
```

## 包围盒

```typescript
import { BoundingBox, BoundingSphere, Matrix, Vector3 } from "@galacean/engine-math";

// 通过不同的方式创建同样的包围盒
const box1 = new BoundingBox();
const box2 = new BoundingBox();
const box3 = new BoundingBox();

// 通过中心点和盒子范围来创建
BoundingBox.fromCenterAndExtent(new Vector3(0, 0, 0), new Vector3(1, 1, 1), box1);

// 通过很多点来创建
const points = [
  new Vector3(0, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, 1, 1),
  new Vector3(1, 0, 1),
  new Vector3(0, 0.5, 0.5),
  new Vector3(0, -0.5, 0.5),
  new Vector3(0, -1, 0.5),
  new Vector3(0, 0, -1),
];
BoundingBox.fromPoints(points, box2);

// 通过包围球来创建
const sphere = new BoundingSphere(new Vector3(0, 0, 0), 1);
BoundingBox.fromSphere(sphere, box3);

// 通过矩阵来对包围盒进行变换
const box = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
const matrix = new Matrix(
  2, 0, 0, 0,
  0, 2, 0, 0,
  0, 0, 2, 0,
  1, 0.5, -1, 1
);
const newBox = new BoundingBox();
BoundingBox.transform(box, matrix, newBox);

// 合并两个包围盒 box1, box2 成为一个新的包围盒 box
BoundingBox.merge(box1, box2, box);

// 获取包围盒的中心点和范围
const center = new Vector3();
box.getCenter(center);
const extent = new Vector3();
box.getExtent(extent);

// 获取包围盒的8个顶点
const corners = [
  new Vector3(), new Vector3(), new Vector3(), new Vector3(),
  new Vector3(), new Vector3(), new Vector3(), new Vector3()
];
box.getCorners(corners);
```

## 包围球
```typescript
import { BoundingBox, BoundingSphere, Vector3 } from "@galacean/engine-math";

// 通过不同方式来创建包围球
const sphere1 = new BoundingSphere();
const sphere2 = new BoundingSphere();

// 通过很多点来创建
const points = [
  new Vector3(0, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(1, 1, 1),
  new Vector3(0, 0, 1),
  new Vector3(-1, -0.5, -0.5),
  new Vector3(0, -0.5, -0.5),
  new Vector3(1, 0, -1),
  new Vector3(0, -1, 0),
];
BoundingSphere.fromPoints(points, sphere1);

// 通过包围盒来创建
const box = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
BoundingSphere.fromBox(box, sphere2);
```

## 视锥体
```typescript
import { BoundingBox, BoundingSphere, BoundingFrustum,Matrix, Vector3 } from "@galacean/engine-math";

// 根据 VP 矩阵创建视锥体，实际项目中，一般从相机中获取 view matrix 和 projection matrix
const viewMatrix = new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -20, 1);
const projectionMatrix = new Matrix(0.03954802080988884, 0, 0, 0, 0, 0.10000000149011612, 0, 0, 0, 0, -0.0200200192630291, 0, -0, -0, -1.0020020008087158, 1);
const vpMatrix = new Matrix();
Matrix.multiply(projectionMatrix, viewMatrix, vpMatrix);
const frustum = new BoundingFrustum(vpMatrix);

// 判断是否和 AABB 包围盒相交
const box1 = new BoundingBox(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
const isIntersect1 = frustum.intersectsBox(box1);
const box2 = new BoundingBox(new Vector3(-32, -2, -2), new Vector3(-28, 2, 2));
const isIntersect2 = frustum.intersectsBox(box2);

// 判断是否和包围球相交
const sphere1 = new BoundingSphere();
BoundingSphere.fromBox(box1, sphere1);
const isIntersect3 = frustum.intersectsSphere(sphere1);
const sphere2 = new BoundingSphere();
BoundingSphere.fromBox(box2, sphere2);
const isIntersect4 = frustum.intersectsSphere(sphere2);
```
## 射线

```typescript
import { BoundingBox, BoundingSphere, Plane, Ray, Vector3 } from "@galacean/engine-math";

// 创建 ray
const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
const plane = new Plane(new Vector3(0, 1, 0), -3);
// 判断射线是否和平面相交，相交的话 distance 为射线到平面距离，不相交的话 distance 为 -1
let distance = ray.intersectPlane(plane);

const sphere = new BoundingSphere(new Vector3(0, 5, 0), 1);
// 判断射线是否和包围球相交，相交的话 distance 为射线到平面距离，不相交的话 distance 为 -1
distance = ray.intersectSphere(sphere);

const box = new BoundingBox();
BoundingBox.fromCenterAndExtent(new Vector3(0, 20, 0), new Vector3(5, 5, 5), box);
// 判断射线是否和包围盒 (AABB) 相交，相交的话 distance 为射线到平面距离，不相交的话 distance 为 -1
distance = ray.intersectBox(box);

// 到射线起点指定距离的点
const out = new Vector3();
ray.getPoint(10, out);

```

## Rand

数学库新增了随机数生成器 `Rand` ，他基于 `xorshift128+` 算法实现（被同样应用在 V8，Safari 与 Firefox 中），是一种快速、高质量且周期完整的伪随机数生成算法。

```typescript
// 初始化随机数生成器实例
const rand = new Rand(0, 0xf3857f6f);

// 生成区间在[0, 0xffffffff)的随机整数
const num1 = rand.randomInt32();
const num2 = rand.randomInt32();
const num3 = rand.randomInt32();

// 生成区间在[0, 1)的随机数
const num4 = rand.random();
const num5 = rand.random();
const num6 = rand.random();

// 重置种子
rand.reset(0, 0x96aa4de3);
```

## CollisionUtil

```typescript
import { 
  BoundingBox,
  BoundingSphere,
  BoundingFrustum,
  Matrix,
  Plane,
  Ray,
  Vector3,
  CollisionUtil
} from "@galacean/engine-math";

const plane = new Plane(new Vector3(0, 1, 0), -5);
const viewMatrix = new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -20, 1);
const projectionMatrix = new Matrix(0.03954802080988884, 0, 0, 0, 0, 0.10000000149011612, 0, 0, 0, 0, -0.0200200192630291, 0, -0, -0, -1.0020020008087158, 1);
const vpMatrix = new Matrix();
Matrix.multiply(projectionMatrix, viewMatrix, vpMatrix);
const frustum = new BoundingFrustum(vpMatrix);

// 点和面之间的距离
const point = new Vector3(0, 10, 0);
let distance = CollisionUtil.distancePlaneAndPoint(plane, point);

// 判断点和面的空间关系
const point1 = new Vector3(0, 10, 0);
const point2 = new Vector3(2, 5, -9);
const point3 = new Vector3(0, 3, 0);
const intersection1 = CollisionUtil.intersectsPlaneAndPoint(plane, point1);
const intersection2 = CollisionUtil.intersectsPlaneAndPoint(plane, point2);
const intersection3 = CollisionUtil.intersectsPlaneAndPoint(plane, point3);

// 判断面和包围盒的空间关系
const box1 = new BoundingBox(new Vector3(-1, 6, -2), new Vector3(1, 10, 3));
const box2 = new BoundingBox(new Vector3(-1, 5, -2), new Vector3(1, 10, 3));
const box3 = new BoundingBox(new Vector3(-1, 4, -2), new Vector3(1, 5, 3));
const box4 = new BoundingBox(new Vector3(-1, -5, -2), new Vector3(1, 4.9, 3));
const intersection11 = CollisionUtil.intersectsPlaneAndBox(plane, box1);
const intersection22 = CollisionUtil.intersectsPlaneAndBox(plane, box2);
const intersection33 = CollisionUtil.intersectsPlaneAndBox(plane, box3);
const intersection44 = CollisionUtil.intersectsPlaneAndBox(plane, box4);

// 判断射线和平面的空间关系
const ray1 = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
const ray2 = new Ray(new Vector3(0, 0, 0), new Vector3(0, -1, 0));
const distance1 = CollisionUtil.intersectsRayAndPlane(ray1, plane);
const distance2 = CollisionUtil.intersectsRayAndPlane(ray2, plane);

// 判断视锥体和包围盒的空间关系
const contain1 = CollisionUtil.frustumContainsBox(frustum, box1);
const contain2 = CollisionUtil.frustumContainsBox(frustum, box2);
const contain3 = CollisionUtil.frustumContainsBox(frustum, box3);
```
