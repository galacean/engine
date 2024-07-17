---
order: 8
title: Mathematics Library
type: Core
label: Core
---

In a rendering scene, we often perform operations such as translation, rotation, scaling on objects (these operations are collectively referred to as [transform](/en/docs/core-transform)), in order to achieve the interactive effects we desire. The calculations for these transformations are typically implemented using vectors, quaternions, matrices, etc. Therefore, we provide a mathematics library to handle operations related to *vectors*, *quaternions*, *matrices*, and more. Additionally, the mathematics library offers a variety of classes to help us describe *points*, *lines*, *planes*, *geometric shapes* in space, as well as determine their intersections and spatial relationships in three-dimensional space.

| Type | Description |
| :--- | :--- |
| [BoundingBox](/apis/math/#BoundingBox) | Axis-Aligned Bounding Box (AABB) |
| [BoundingFrustum](/apis/math/#BoundingFrustum) | View Frustum |
| [BoundingSphere](/apis/math/#BoundingSphere) | Bounding Sphere |
| [CollisionUtil](/apis/math/#CollisionUtil) | Provides many static methods to determine intersections and spatial relationships between objects in space |
| [Color](/apis/math/#Color) | Color class, described using RGBA |
| [MathUtil](/apis/math/#MathUtil) | Utility class, provides common calculations such as comparisons, angle-radian conversions, etc. |
| [Matrix](/apis/math/#Matrix) | Default 4x4 matrix, offers basic matrix operations and transformation-related operations |
| [Matrix3x3](/apis/math/#Matrix3x3) | 3x3 matrix, provides basic matrix operations and transformation-related operations |
| [Plane](/apis/math/#Plane) | Plane class, used to describe planes in three-dimensional space |
| [Quaternion](/apis/math/#Quaternion) | Quaternion, contains x, y, z, w components, responsible for rotation-related operations |
| [Ray](/apis/math/#Ray) | Ray class, used to describe rays in three-dimensional space |
| [Vector2](/apis/math/#Vector2) | Two-dimensional vector, contains x, y components |
| [Vector3](/apis/math/#Vector3) | Three-dimensional vector, contains x, y, z components |
| [Vector4](/apis/math/#Vector4) | Four-dimensional vector, contains x, y, z, w components |

## Vectors

The most basic definition of a vector is a direction. More formally, a vector has a direction (Direction) and magnitude (Magnitude, also known as strength or length). You can think of a vector as instructions on a treasure map: "Take 10 steps to the left, 3 steps north, then 5 steps to the right"; "Left" is the direction, and "10 steps" is the length of the vector. So, this treasure map has a total of 3 vectors. Vectors can exist in any dimension, but we typically use 2 to 4 dimensions. If a vector has 2 dimensions, it represents a direction in a plane (imagine a 2D image), and when it has 3 dimensions, it can express a direction in a 3D world.

In the Galacean engine, vectors are used to represent object coordinates (position), rotation, scaling, and color.

```typescript
import { Vector3 } from '@galacean/engine-math';

// Create Vector3, the x,y,z is 0.
const v1 = new Vector3(); 

// Create a Vector3 and initialize the x, y, and z components with the given values.
const v2 = new Vector3(1, 2, 3); 

// Set the specified value.
v1.set(1, 2, 2); 

// Get x, y, and z components.
const x = v1.x;
const y = v1.y;
const z = v1.z;

// Vector addition, static method.
const out1 = new Vector3();
Vector3.add(v1, v2, out1);

// Vector addition, instance method.
const out2 = v1.add(v2);

// The length of Vector3.
const len: number = v1.length();

// Normalized Vector3.
v1.normalize();

// Clone Vector3.
const c1 = v1.clone();

// Clone the values of the Vector3 to another Vector3.
const c2 = new Vector3();
v1.cloneTo(c2);

```

## Quaternions

Quaternions are simple hypercomplex numbers, and in graphics engines, quaternions are mainly used for three-dimensional rotations ([Relationship between quaternions and three-dimensional rotations](https://krasjet.github.io/quaternion/quaternion.pdf)), which can represent rotations not only with quaternions but also with Euler angles, axis-angle, matrices, etc. The reason for choosing quaternions is mainly due to the following advantages:

- Solves the problem of gimbal lock
- Requires storing only 4 floating-point numbers, making it lighter compared to matrices
- More efficient for operations like inversion, concatenation, etc., compared to matrices

In the Galacean engine, quaternions are also used for rotation-related operations and provide APIs for converting Euler angles, matrices, etc., to quaternions.

```typescript
import { Vector3, Quaternion, MathUtil } from '@galacean/engine-math';

// Create Quaternion, the x,y,z is 0, and w is 1.
const q1 = new Quaternion(); 

// Create a Quaternion and initialize the x, y, z and w components with the given values.
const q2 = new Quaternion(1, 2, 3, 4); 

// Set the specified value.
q1.set(1, 2, 3, 4); 

// Check if the values of two quaternions are equal.
const isEqual: boolean = Quaternion.equals(q1, q2);

const xRad = Math.PI * 0.2;
const yRad = Math.PI * 0.5;
const zRad = Math.PI * 0.3;

// Generate a quaternion based on yaw (Y), pitch (X), and roll (Z).
const out1 = new Quaternion();
Quaternion.rotationYawPitchRoll(yRad, xRad, zRad, out1);

// Generate a quaternion from rotation Euler angles (in radians) around the x, y, and z axes.
const out2 = new Quaternion();
// Equivalent to Quaternion.rotationYawPitchRoll(yRad, xRad, zRad, out2)
Quaternion.rotationEuler(xRad, yRad, zRad, out2); 

// Generating quaternions for rotations around the X, Y, and Z axes. Let's take rotating around the X axis as an example.
const out3 = new Quaternion();
Quaternion.rotationX(xRad, out3);

// The current quaternion rotates successively around the X, Y, and Z axes.
const q3 = new Quaternion();
q3.rotateX(xRad).rotateY(yRad).rotateZ(zRad);

// Retrieve the Euler angles (in radians) from the current quaternion.
const eulerV = new Vector3();
q3.toEuler(eulerV);

// Convert radians to degrees.
eulerV.scale(MathUtil.radToDegreeFactor);
```

## Matrices

In 3D graphics engines, calculations can be performed in multiple different Cartesian coordinate spaces, and transforming from one coordinate space to another requires the use of transformation matrices, which is the purpose of the Matrix module in our mathematics library.

In Galacean, matrices use the same column-major format as the WebGL standard. For example, a 4x4 matrix with 16 elements is stored in an array as follows:

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

In the Galacean engine, there are local coordinates, global coordinates, view coordinates, clip coordinates, etc., and the transformation of objects between these coordinates is achieved through transformation matrices.

Matrix multiplication order is from right to left. For example, to calculate the MV matrix using the model matrix and the view matrix, the notation is as follows:
```typescript
Matrix.multiply(viewMatrix, modelMatrix, mvMatrix);
```
Below are some commonly used functionalities in matrices:

```typescript
import { Vector3, Matrix3x3, Matrix } from '@galacean/engine-math';

// Create a default 4x4 matrix, initialized as the identity matrix.
const m1 = new Matrix(); 

// Create a 4x4 matrix and initialize it with the given values.
const m2 = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

// Set m2 to the identity matrix.
m2.identity(); 

// Check if two matrices have equal values, returning true.
const isEqual1: boolean = Matrix.equals(m1, m2);

// Matrix multiplication, static method.
const m3 = new Matrix(1, 2, 3.3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
const m4 = new Matrix(16, 15, 14, 13, 12, 11, 10, 9, 8.88, 7, 6, 5, 4, 3, 2, 1);
const out1 = new Matrix();
Matrix.multiply(m3, m4, out1);

// Matrix multiplication, instance method.
const out2 = m3.multiply(m4);

// Check if two matrices have equal values, returning true.
const isEqual2: boolean = Matrix.equals(out1, out2);

// Calculate the determinant of a matrix.
const m5 = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);
const det: number = m5.determinant();

// Convert a 4x4 matrix to a 3x3 matrix.
const m6 = new Matrix3x3();
m6.setValueByMatrix(m5);

// Create a 4x4 matrix and initialize it with the given values.
const m7 = new Matrix(1, 2, 3, 4, 5, 6, 7, 8, 9, 10.9, 11, 12, 13, 14, 15, 16);

// Compute the transpose of a matrix, using a static method.
Matrix.transpose(m7, m7); 

// Compute the transpose of a matrix, using a instance method.
m7.transpose(); 

// Generate a 4x4 matrix for rotation around the Y-axis.
const axis = new Vector3(0, 1, 0); 
const out4 = new Matrix();
Matrix.rotationAxisAngle(axis, Math.PI * 0.25, out4);

// Extract rotation, scaling, and translation from a matrix.
const m8 = new Matrix(4.440892098500626e-16, 2, 0, 0, -2, 4.440892098500626e-16, 0, 0, 0, 0, 2, 0, 0, 10, 10, 1);
// Storage for translation.
const translate = new Vector3();
// Storage for scale.
const scale = new Vector3();
// Storage for rotation.
const qua = new Quaternion();
m8.decompose(translate, qua, scale);
const rotation = new Vector3();
// Retrieve the rotation angle in radians for each axis from the acquired quaternion.
qua.toEuler(rotation);

// Generate a rotation matrix from a quaternion.
const m9 = new Matrix();
Matrix.rotationQuaternion(qua, m9);
// Generate a rotation matrix from rotation angles.
const m10 = new Matrix();
Matrix.rotationAxisAngle(new Vector3(0, 0, 1), Math.PI * 0.5, m10);
// Generate a scaling matrix from scaling factors.
const m11 = new Matrix();
Matrix.scaling(scale, m11);
// Generate a translation matrix from translation values.
const m12 = new Matrix();
Matrix.translation(translate, m12);

// Generate a matrix from rotation, scaling, and translation.
const m13 = new Matrix();
Matrix.affineTransformation(scale, qua, translate, m13);d
```

## Color

```typescript
import { Color } from "@galacean/engine-math";

// Create Color.
const color1 = new Color(1, 0.5, 0.5, 1);
const color2 = new Color();
color2.r = 1;
color2.g = 0.5;
color2.b = 0.5;
color2.a = 1;

// Convert linear space to gamma space.
const gammaColor = new Color();
color1.toGamma(gammaColor);

// Convert gamma space to linear space.
const linearColor = new Color();
color2.toLinear(linearColor);
```

## Plane

```typescript
import { Plane, Vector3 } from "@galacean/engine-math";

// Create a plane using the three vertices of a triangle.
const point1 = new Vector3(0, 1, 0);
const point2 = new Vector3(0, 1, 1);
const point3 = new Vector3(1, 1, 0);
const plane1 = new Plane();
Plane.fromPoints(point1, point2, point3, plane1);
// Create a plane using the plane's normal and the distance from the origin.
const plane2 = new Plane(new Vector3(0, 1, 0), -1);
```

## Bounding Box
In Galacean, BoundingBox represents an AABB (Axis-Aligned Bounding Box), which is a simple and efficient type of bounding box commonly used in computer graphics and collision detection. It is defined by a minimum point and a maximum point, forming a rectangle or cuboid (in 3D space) aligned with the coordinate axes.

```typescript
import { BoundingBox, BoundingSphere, Matrix, Vector3 } from "@galacean/engine-math";

// Create the same bounding box using different methods.
const box1 = new BoundingBox();
const box2 = new BoundingBox();
const box3 = new BoundingBox();

// Create using the center point and box extent.
BoundingBox.fromCenterAndExtent(new Vector3(0, 0, 0), new Vector3(1, 1, 1), box1);

// Create using multiple points.
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

// Create using a bounding sphere.
const sphere = new BoundingSphere(new Vector3(0, 0, 0), 1);
BoundingBox.fromSphere(sphere, box3);

// Transform the bounding box using a matrix.
const box = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
const matrix = new Matrix(
  2, 0, 0, 0,
  0, 2, 0, 0,
  0, 0, 2, 0,
  1, 0.5, -1, 1
);
const newBox = new BoundingBox();
BoundingBox.transform(box, matrix, newBox);

// Merge two bounding boxes, box1 and box2, into a new bounding box box.
BoundingBox.merge(box1, box2, box);

// Get the center point and dimensions of the bounding box.
const center = new Vector3();
box.getCenter(center);
const extent = new Vector3();
box.getExtent(extent);

// Get the all vertices of the bounding box.
const corners = [
  new Vector3(), new Vector3(), new Vector3(), new Vector3(),
  new Vector3(), new Vector3(), new Vector3(), new Vector3()
];
box.getCorners(corners);
```

## Bounding Sphere

```typescript
import { BoundingBox, BoundingSphere, Vector3 } from "@galacean/engine-math";

// Create a bounding sphere using different methods.
const sphere1 = new BoundingSphere();
const sphere2 = new BoundingSphere();

// Create a bounding sphere using multiple points.
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

// Create a bounding sphere from a bounding box.
const box = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
BoundingSphere.fromBox(box, sphere2);
```

## Frustum

```typescript
import { BoundingBox, BoundingSphere, BoundingFrustum,Matrix, Vector3 } from "@galacean/engine-math";

// Create a frustum based on the View-Projection (VP) matrix. In practical projects, the view matrix and projection matrix are typically obtained from the camera.
const viewMatrix = new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -20, 1);
const projectionMatrix = new Matrix(0.03954802080988884, 0, 0, 0, 0, 0.10000000149011612, 0, 0, 0, 0, -0.0200200192630291, 0, -0, -0, -1.0020020008087158, 1);
const vpMatrix = new Matrix();
Matrix.multiply(projectionMatrix, viewMatrix, vpMatrix);
const frustum = new BoundingFrustum(vpMatrix);

// Check for intersection with an AABB (Axis-Aligned Bounding Box).
const box1 = new BoundingBox(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
const isIntersect1 = frustum.intersectsBox(box1);
const box2 = new BoundingBox(new Vector3(-32, -2, -2), new Vector3(-28, 2, 2));
const isIntersect2 = frustum.intersectsBox(box2);

// Check for intersection with a bounding sphere.
const sphere1 = new BoundingSphere();
BoundingSphere.fromBox(box1, sphere1);
const isIntersect3 = frustum.intersectsSphere(sphere1);
const sphere2 = new BoundingSphere();
BoundingSphere.fromBox(box2, sphere2);
const isIntersect4 = frustum.intersectsSphere(sphere2);
```

## Ray
A ray is represented as a line extending infinitely in a specified direction (direction) from a point (origin), as follows:
![alt text](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*w2XVQL-K4UEAAAAAAAAAAAAADjCHAQ/original)

The supported detection types for rays are as follows:
| type | note |
| :--- | :--- |
| [Plane](/apis/math/#Plane) | Detecting the distance from a ray to a plane; if -1, the ray does not intersect with the plane |
| [BoundingSphere](/apis/math/#BoundingSphere) | Detecting the distance from a ray to a sphere; if -1, the ray does not intersect with the sphere |
| [BoundingBox](/apis/math/#BoundingBox) | Detecting the distance from a ray to a box; if -1, the ray does not intersect with the box |

```typescript
import { BoundingBox, BoundingSphere, Plane, Ray, Vector3 } from "@galacean/engine-math";

// Create Ray.
const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
const plane = new Plane(new Vector3(0, 1, 0), -3);
// To determine if a ray intersects with a plane:
// if they intersect, distance represents the distance from the ray's origin to the plane, otherwise, distance is -1.
let distance = ray.intersectPlane(plane);

const sphere = new BoundingSphere(new Vector3(0, 5, 0), 1);
// To determine if a ray intersects with a sphere:
// if they intersect, distance represents the distance from the ray's origin to the sphere, otherwise, distance is -1.
distance = ray.intersectSphere(sphere);

const box = new BoundingBox();
BoundingBox.fromCenterAndExtent(new Vector3(0, 20, 0), new Vector3(5, 5, 5), box);
// To determine if a ray intersects with a box:
// if they intersect, distance represents the distance from the ray's origin to the box, otherwise, distance is -1.
distance = ray.intersectBox(box);

// Point at a specified distance from the ray's origin.
const out = new Vector3();
ray.getPoint(10, out);

```

## Rand

The math library has added a random number generator `Rand`, which is based on the `xorshift128+` algorithm (also used in V8, Safari, and Firefox), providing a fast, high-quality, and fully-periodic pseudo-random number generation algorithm.

```typescript
// Initialize a random number generator instance.
const rand = new Rand(0, 0xf3857f6f);

// Generate a random integer within the range [0, 0xffffffff].
const num1 = rand.randomInt32();
const num2 = rand.randomInt32();
const num3 = rand.randomInt32();

// Generate a random number in the range [0, 1).
const num4 = rand.random();
const num5 = rand.random();
const num6 = rand.random();

// Reset the seed.
rand.reset(0, 0x96aa4de3);
```

## CollisionUtil
CollisionUtil provides a wide range of functions for collision and intersection detection, including:
| function | note |
| :--- | :--- |
| intersectionPointThreePlanes | Calculate the point where three planes intersect |
| distancePlaneAndPoint | Calculate the distance from a point to a plane |
| intersectsPlaneAndPoint | Detect the spatial relationship between a point and a plane: in front of the plane (in the direction of the normal), behind the plane, or on the plane |
| intersectsPlaneAndBox | Detect the spatial relationship between an AABB bounding box and a plane: in front of the plane (in the direction of the normal), behind the plane, or intersecting the plane |
| intersectsPlaneAndSphere | Detect the spatial relationship between an bounding sphere and a plane: in front of the plane (in the direction of the normal), behind the plane, or intersecting the plane |
| intersectsRayAndPlane | Check the distance between the plane and the ray. If they do not intersect, return -1.|
| intersectsRayAndBox | Check the distance between the AABB bounding box and the ray. If they do not intersect, return -1 |
| intersectsRayAndSphere | Check the distance between the sphere and the ray. If they do not intersect, return -1. |
| intersectsBoxAndBox | Check if two AABB bounding boxes intersect |
| intersectsSphereAndSphere | Check if two spheres intersect |
| intersectsSphereAndBox | Check if the sphere and AABB bounding box intersect |
| intersectsFrustumAndBox | Check if the view frustum and AABB bounding box intersect |
| frustumContainsPoint | The spatial relationship between the detection point and the viewing cone: inside the viewing cone, intersecting the viewing cone, outside the viewing cone |
| frustumContainsBox | Detect the spatial position relationship between the AABB bounding box and the view frustum: inside the view frustum, intersecting with the view frustum, outside the view frustum |
| frustumContainsSphere | Detect the spatial position relationship between the sphere and the cone: inside the cone, intersecting the cone, outside the cone |

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

// Distance between points and faces.
const point = new Vector3(0, 10, 0);
let distance = CollisionUtil.distancePlaneAndPoint(plane, point);

// Determine the spatial relationship between points and surfaces.
const point1 = new Vector3(0, 10, 0);
const point2 = new Vector3(2, 5, -9);
const point3 = new Vector3(0, 3, 0);
const intersection1 = CollisionUtil.intersectsPlaneAndPoint(plane, point1);
const intersection2 = CollisionUtil.intersectsPlaneAndPoint(plane, point2);
const intersection3 = CollisionUtil.intersectsPlaneAndPoint(plane, point3);

// Determine the spatial relationship between the face and the bounding box.
const box1 = new BoundingBox(new Vector3(-1, 6, -2), new Vector3(1, 10, 3));
const box2 = new BoundingBox(new Vector3(-1, 5, -2), new Vector3(1, 10, 3));
const box3 = new BoundingBox(new Vector3(-1, 4, -2), new Vector3(1, 5, 3));
const box4 = new BoundingBox(new Vector3(-1, -5, -2), new Vector3(1, 4.9, 3));
const intersection11 = CollisionUtil.intersectsPlaneAndBox(plane, box1);
const intersection22 = CollisionUtil.intersectsPlaneAndBox(plane, box2);
const intersection33 = CollisionUtil.intersectsPlaneAndBox(plane, box3);
const intersection44 = CollisionUtil.intersectsPlaneAndBox(plane, box4);

// Determine the spatial relationship between rays and planes.
const ray1 = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
const ray2 = new Ray(new Vector3(0, 0, 0), new Vector3(0, -1, 0));
const distance1 = CollisionUtil.intersectsRayAndPlane(ray1, plane);
const distance2 = CollisionUtil.intersectsRayAndPlane(ray2, plane);

// Determine the spatial relationship between the view frustum and the bounding box.
const contain1 = CollisionUtil.frustumContainsBox(frustum, box1);
const contain2 = CollisionUtil.frustumContainsBox(frustum, box2);
const contain3 = CollisionUtil.frustumContainsBox(frustum, box3);
```
