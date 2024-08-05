---
order: 8
title: Math Library
type: Core
label: Core
---

In a rendering scene, we often perform operations such as translation, rotation, scaling, etc. on objects (we collectively refer to these operations as [transform](/en/docs/core/transform)) to achieve the interactive effects we want. These transformations are generally achieved through vectors, quaternions, matrices, etc. For this purpose, we provide a math library to perform operations related to *vectors*, *quaternions*, *matrices*, etc. In addition, the math library also offers more classes to help us describe *points*, *lines*, *planes*, and *geometric bodies* in space, as well as determine their intersections and positional relationships in three-dimensional space. It can even describe color values.

| Type | Description |
| :--- | :--- |
| [BoundingBox](/en/apis/math/#BoundingBox) | AABB Bounding Box |
| [BoundingFrustum](/en/apis/math/#BoundingFrustum) | View Frustum |
| [BoundingSphere](/en/apis/math/#BoundingSphere) | Bounding Sphere |
| [CollisionUtil](/en/apis/math/#CollisionUtil) | Provides many static methods to determine intersections and positional relationships between objects in space |
| [Color](/en/apis/math/#Color) | Color class, described using RGBA |
| [MathUtil](/en/apis/math/#MathUtil) | Utility class, provides common calculations such as comparisons, angle-radian conversions, etc. |
| [Matrix](/en/apis/math/#Matrix) | Default 4x4 matrix, provides basic matrix operations and transformation-related operations |
| [Matrix3x3](/en/apis/math/#Matrix3x3) | 3x3 matrix, provides basic matrix operations and transformation-related operations |
| [Plane](/en/apis/math/#Plane) | Plane class, used to describe planes in three-dimensional space |
| [Quaternion](/en/apis/math/#Quaternion) | Quaternion, contains x, y, z, w components, responsible for rotation-related operations |
| [Ray](/en/apis/math/#Ray) | Ray class, used to describe rays in three-dimensional space |
| [Vector2](/en/apis/math/#Vector2) | Two-dimensional vector, contains x, y components |
| [Vector3](/en/apis/math/#Vector3) | Three-dimensional vector, contains x, y, z components |
| [Vector4](/en/apis/math/#Vector4) | Four-dimensional vector, contains x, y, z, w components |

## Vectors

The most basic definition of a vector is a direction. More formally, a vector has a direction and a magnitude (also called strength or length). You can think of a vector as an instruction on a treasure map: "Walk 10 steps to the left, 3 steps north, then 5 steps to the right"; "left" is the direction, "10 steps" is the length of the vector. So, the instructions on this treasure map consist of 3 vectors. Vectors can exist in any dimension, but we usually use 2 to 4 dimensions. If a vector has 2 dimensions, it represents a direction on a plane (imagine a 2D image). When it has 3 dimensions, it can express a direction in a 3D world.

In the Galacean engine, vectors are used to represent object coordinates (position), rotation, scaling, and color.

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
## Quaternions

Quaternions are simple hypercomplex numbers, and in graphics engines, quaternions are mainly used for three-dimensional rotations ([relationship between quaternions and three-dimensional rotations](https://krasjet.github.io/quaternion/quaternion.pdf)). Besides quaternions, Euler angles, axis angles, matrices, etc., can also represent rotations. The main advantages of choosing quaternions are:

- Solves the gimbal lock problem
- Only requires storing 4 floating-point numbers, making it lighter compared to matrices
- Operations such as inversion and concatenation are more efficient compared to matrices

In the Galacean engine, quaternions are also used for rotation-related operations, and APIs are provided for converting Euler angles and matrices to quaternions.

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

// 根据 yaw（Y）、pitch（X）、roll（Z） 生成四元数
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

## Matrices

In a 3D graphics engine, calculations can be performed in multiple different Cartesian coordinate spaces. Transforming from one coordinate space to another requires the use of transformation matrices, and the Matrix module in our math library exists to provide this capability.

In Galacean, matrices are column-major, just like the WebGL standard. For a 4x4 matrix, the 16 elements are stored in an array as follows:

```typescript
const elements: Float32Array = new Float32Array(16);
```
The final matrix is as follows:
$$
\begin{bmatrix}
elements[0] & elements[4] & elements[8] & elements[12] \\
elements[1] & elements[5] & elements[9] & elements[13] \\
elements[2] & elements[6] & elements[10] & elements[14] \\
elements[3] & elements[7] & elements[11] & elements[15]
\end{bmatrix}
$$

In the Galacean engine, there are local coordinates, global coordinates, view coordinates, clip coordinates, etc. The transformation of objects between these coordinates is accomplished through transformation matrices.

The order of matrix multiplication is from right to left. For example, if we want to calculate the MV matrix using the model matrix and view matrix, the code is as follows:
```typescript
Matrix.multiply(viewMatrix, modelMatrix, mvMatrix);
```
Below are some commonly used functions in matrices:

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

// 从一个矩阵内获取旋转、缩放和位移
const m8 = new Matrix(4.440892098500626e-16, 2, 0, 0, -2, 4.440892098500626e-16, 0, 0, 0, 0, 2, 0, 0, 10, 10, 1);
// 用于存放位移
const translate = new Vector3();
// 用于存放缩放
const scale = new Vector3();
// 用于存放旋转
const qua = new Quaternion();
m8.decompose(translate, qua, scale);
const rotation = new Vector3();
// 根据拿到的旋转四元数获取每个轴的旋转弧度
qua.toEuler(rotation);

// 根据四元数生成旋转矩阵
const m9 = new Matrix();
Matrix.rotationQuaternion(qua, m9);
// 根据旋转角度生成旋转矩阵
const m10 = new Matrix();
Matrix.rotationAxisAngle(new Vector3(0, 0, 1), Math.PI * 0.5, m10);
// 根据缩放生成缩放矩阵
const m11 = new Matrix();
Matrix.scaling(scale, m11);
// 根据位移生成位移矩阵
const m12 = new Matrix();
Matrix.translation(translate, m12);

// 根据旋转、缩放、位移生成矩阵
const m13 = new Matrix();
Matrix.affineTransformation(scale, qua, translate, m13);

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

## Plane
We can define a plane using a vector (normal) and a distance. The normal represents the direction of the plane based on the coordinate origin, and the plane is perpendicular to the normal. The distance represents the distance of the plane from the coordinate origin along the normal direction. For example, a plane perpendicular to the Y-axis with a distance of 5 is illustrated as follows:

![plane](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*1HMeRbPQv1kAAAAAAAAAAAAADjCHAQ/original)

The code to create it is as follows:
```typescript
const normal = new Vector3(0, 1, 0);
const distance = 5;
const plane = new Plane(normal, distance);
```
Other usages:

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

## Bounding Box
In Galacean, BoundingBox represents an AABB (Axis-Aligned Bounding Box), which is a simple and efficient type of bounding box commonly used in computer graphics and collision detection. It is defined by a minimum point and a maximum point, forming a rectangle or cuboid aligned with the coordinate axes (in 3D space).

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

## Bounding Sphere
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

## Frustum
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
## Ray
A ray represents a line that starts from a point (origin) and extends infinitely in a specified direction (direct), as shown below:
![alt text](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*w2XVQL-K4UEAAAAAAAAAAAAADjCHAQ/original)

The types of detection supported by rays are as follows:
| Type | Description |
| :--- | :--- |
| [Plane](/en/apis/math/#Plane) | Detects the distance from the ray to the plane. If -1, the ray and the plane do not intersect. |
| [BoundingSphere](/en/apis/math/#BoundingSphere) | Detects the distance from the ray to the sphere. If -1, the ray and the sphere do not intersect. |
| [BoundingBox](/en/apis/math/#BoundingBox) | Detects the distance from the ray to the box. If -1, the ray and the box do not intersect. |

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

The math library has added a random number generator `Rand`, which is based on the `xorshift128+` algorithm (also used in V8, Safari, and Firefox). It is a fast, high-quality, and full-period pseudo-random number generation algorithm.

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
CollisionUtil provides a large number of functions for collision and intersection detection, as follows:
| Function | Description |
| :--- | :--- |
| intersectionPointThreePlanes | Calculates the intersection point of 3 planes |
| distancePlaneAndPoint | Calculates the distance from a point to a plane |
| intersectsPlaneAndPoint | Detects the spatial relationship between a point and a plane: in front of the plane (normal direction is front), behind the plane, on the plane |
| intersectsPlaneAndBox | Detects the spatial relationship between an AABB bounding box and a plane: in front of the plane (normal direction is front), behind the plane, intersects the plane |
| intersectsPlaneAndSphere | Detects the spatial relationship between a sphere and a plane: in front of the plane (normal direction is front), behind the plane, intersects the plane |
| intersectsRayAndPlane | Detects the distance between a plane and a ray. If they do not intersect, returns -1 |
| intersectsRayAndBox | Detects the distance between an AABB bounding box and a ray. If they do not intersect, returns -1 |
| intersectsRayAndSphere | Detects the distance between a sphere and a ray. If they do not intersect, returns -1 |
| intersectsBoxAndBox | Detects whether two AABB bounding boxes intersect |
| intersectsSphereAndSphere | Detects whether two spheres intersect |
| intersectsSphereAndBox | Detects whether a sphere and an AABB bounding box intersect |
| intersectsFrustumAndBox | Detects whether a frustum and an AABB bounding box intersect |
| frustumContainsPoint | Detects the spatial relationship between a point and a frustum: inside the frustum, intersects the frustum, outside the frustum |
| frustumContainsBox | Detects the spatial relationship between an AABB bounding box and a frustum: inside the frustum, intersects the frustum, outside the frustum |
| frustumContainsSphere | Detects the spatial relationship between a sphere and a frustum: inside the frustum, intersects the frustum, outside the frustum |

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
