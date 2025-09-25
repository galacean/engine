# Math Library - LLM Documentation

## System Overview

The Math Library provides comprehensive mathematical foundations for the Galacean 3D engine, including vector arithmetic, matrix transformations, quaternion operations, bounding volume calculations, collision detection utilities, and specialized mathematical functions optimized for real-time 3D graphics and game development.

## Core Architecture

### Vector Mathematics (Vector2, Vector3, Vector4)

```typescript
// Vector3 creation and basic operations
const position = new Vector3(10, 5, 0);
const velocity = new Vector3(2, -1, 0);
const direction = new Vector3();

// Static operations (recommended for performance)
Vector3.add(position, velocity, position);  // Add velocity to position
Vector3.normalize(direction, direction);    // Normalize direction vector
const distance = Vector3.distance(position, target);

// Instance operations (fluent API)
position.add(velocity).normalize().scale(speed);

// Component access
console.log(`Position: x=${position.x}, y=${position.y}, z=${position.z}`);
position.set(0, 10, 5);  // Direct component assignment
```

### Matrix Transformations (4x4 Matrices)

```typescript
// Matrix creation and transformation
const transform = new Matrix();
const scale = new Vector3(2, 2, 2);
const rotation = new Quaternion();
const translation = new Vector3(10, 0, 5);

// Compose transformation matrix
Matrix.affineTransformation(scale, rotation, translation, transform);

// Individual transformations
const scaleMatrix = new Matrix();
Matrix.scaling(scale, scaleMatrix);

const rotationMatrix = new Matrix();
Matrix.rotationQuaternion(rotation, rotationMatrix);

const translationMatrix = new Matrix();
Matrix.translation(translation, translationMatrix);

// Matrix multiplication (order matters: T * R * S)
Matrix.multiply(translationMatrix, rotationMatrix, transform);
Matrix.multiply(transform, scaleMatrix, transform);
```

### Quaternion Rotations

```typescript
// Quaternion creation and rotation
const rotation = new Quaternion();
const axis = new Vector3(0, 1, 0);  // Y-axis
const angle = Math.PI / 4;          // 45 degrees

// Create rotation from axis-angle
Quaternion.rotationAxisAngle(axis, angle, rotation);

// Create rotation from Euler angles
Quaternion.rotationEuler(0, Math.PI / 2, 0, rotation); // 90° Y rotation

// Apply rotation to vector
const point = new Vector3(1, 0, 0);
Vector3.transformByQuat(point, rotation, point);

// Quaternion interpolation for smooth rotation
const targetRotation = new Quaternion();
const interpolatedRotation = new Quaternion();
Quaternion.slerp(rotation, targetRotation, 0.5, interpolatedRotation);
```

## Vector Operations

### Vector3 Comprehensive Usage

```typescript
class Transform3D {
  private position = new Vector3();
  private velocity = new Vector3();
  private acceleration = new Vector3();
  
  updateMovement(deltaTime: number) {
    // Physics integration using vector operations
    const deltaVelocity = Vector3.scale(this.acceleration, deltaTime, new Vector3());
    Vector3.add(this.velocity, deltaVelocity, this.velocity);
    
    const deltaPosition = Vector3.scale(this.velocity, deltaTime, new Vector3());
    Vector3.add(this.position, deltaPosition, this.position);
    
    // Apply damping
    this.velocity.scale(0.99);
  }
  
  lookAt(target: Vector3) {
    const direction = new Vector3();
    Vector3.subtract(target, this.position, direction);
    direction.normalize();
    
    // Create rotation from direction vector
    const rotation = new Quaternion();
    this.createLookRotation(direction, Vector3.up, rotation);
    return rotation;
  }
  
  private createLookRotation(forward: Vector3, up: Vector3, out: Quaternion) {
    const right = new Vector3();
    Vector3.cross(up, forward, right);
    right.normalize();
    
    Vector3.cross(forward, right, up);
    
    // Convert rotation matrix to quaternion (simplified)
    Quaternion.rotationMatrix3x3(this.createRotationMatrix(right, up, forward), out);
  }
}
```

### Vector2 for 2D Operations

```typescript
// Vector2 for UI, textures, and 2D math
const screenPos = new Vector2(800, 600);
const texCoord = new Vector2(0.5, 0.5);
const uiScale = new Vector2(1.2, 1.2);

// 2D transformations
Vector2.multiply(texCoord, uiScale, texCoord);
const length = texCoord.length();
const normalizedCoord = Vector2.normalize(texCoord, new Vector2());

// 2D distance and interpolation
const distance2D = Vector2.distance(screenPos, targetPos);
Vector2.lerp(currentPos, targetPos, 0.1, currentPos); // Smooth movement
```

### Vector4 for Homogeneous Coordinates

```typescript
// Vector4 for 4D transformations and color
const homogeneousPoint = new Vector4(10, 5, 0, 1); // Position with w=1
const colorVector = new Vector4(1, 0.5, 0.2, 0.8); // RGBA color

// Transform point through matrix
const transformedPoint = new Vector4();
Vector4.transformByMatrix(homogeneousPoint, worldMatrix, transformedPoint);

// Perspective division (convert back to 3D)
if (transformedPoint.w !== 0) {
  const projectedPoint = new Vector3(
    transformedPoint.x / transformedPoint.w,
    transformedPoint.y / transformedPoint.w,
    transformedPoint.z / transformedPoint.w
  );
}
```

## Matrix Mathematics

### Matrix Construction and Composition

```typescript
class MatrixBuilder {
  static createTRS(translation: Vector3, rotation: Quaternion, scale: Vector3): Matrix {
    const result = new Matrix();
    Matrix.affineTransformation(scale, rotation, translation, result);
    return result;
  }
  
  static createLookAt(eye: Vector3, target: Vector3, up: Vector3): Matrix {
    const viewMatrix = new Matrix();
    Matrix.lookAt(eye, target, up, viewMatrix);
    return viewMatrix;
  }
  
  static createPerspective(fov: number, aspect: number, near: number, far: number): Matrix {
    const projMatrix = new Matrix();
    Matrix.perspective(fov, aspect, near, far, projMatrix);
    return projMatrix;
  }
  
  static createOrthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): Matrix {
    const orthoMatrix = new Matrix();
    Matrix.ortho(left, right, bottom, top, near, far, orthoMatrix);
    return orthoMatrix;
  }
}

// Usage in camera system
class Camera3D {
  private viewMatrix = new Matrix();
  private projectionMatrix = new Matrix();
  private viewProjectionMatrix = new Matrix();
  
  updateMatrices(eye: Vector3, target: Vector3, up: Vector3, fov: number, aspect: number, near: number, far: number) {
    // Update view matrix
    Matrix.lookAt(eye, target, up, this.viewMatrix);
    
    // Update projection matrix
    Matrix.perspective(fov, aspect, near, far, this.projectionMatrix);
    
    // Combine view and projection
    Matrix.multiply(this.projectionMatrix, this.viewMatrix, this.viewProjectionMatrix);
  }
  
  worldToScreen(worldPos: Vector3, screenSize: Vector2): Vector2 {
    // Transform world position to clip space
    const clipPos = new Vector4();
    Vector3.transformToVec4(worldPos, this.viewProjectionMatrix, clipPos);
    
    // Perspective division
    if (clipPos.w !== 0) {
      const ndcX = clipPos.x / clipPos.w;
      const ndcY = clipPos.y / clipPos.w;
      
      // Convert to screen coordinates
      return new Vector2(
        (ndcX + 1) * 0.5 * screenSize.x,
        (1 - ndcY) * 0.5 * screenSize.y
      );
    }
    
    return new Vector2();
  }
}
```

### Matrix Decomposition and Analysis

```typescript
class MatrixAnalyzer {
  static decomposeTransform(matrix: Matrix): { translation: Vector3, rotation: Quaternion, scale: Vector3 } {
    const translation = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    
    // Decompose transformation matrix
    const success = matrix.decompose(translation, rotation, scale);
    
    if (!success) {
      console.warn("Matrix decomposition failed - matrix may be singular");
      rotation.identity();
    }
    
    return { translation, rotation, scale };
  }
  
  static getTransformComponents(matrix: Matrix) {
    const translation = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    
    // Extract individual components
    matrix.getTranslation(translation);
    matrix.getRotation(rotation);
    matrix.getScaling(scale);
    
    return {
      translation,
      rotation,
      scale,
      determinant: matrix.determinant(),
      isInvertible: Math.abs(matrix.determinant()) > MathUtil.zeroTolerance
    };
  }
  
  static createInverseTransform(matrix: Matrix): Matrix | null {
    const inverse = new Matrix();
    Matrix.invert(matrix, inverse);
    
    // Check if inversion was successful
    if (Math.abs(matrix.determinant()) < MathUtil.zeroTolerance) {
      console.error("Cannot invert singular matrix");
      return null;
    }
    
    return inverse;
  }
}
```

## Bounding Volume Mathematics

### BoundingBox (AABB) Operations

```typescript
class BoundingVolumeSystem {
  static createAABB(points: Vector3[]): BoundingBox {
    const aabb = new BoundingBox();
    BoundingBox.fromPoints(points, aabb);
    return aabb;
  }
  
  static createAABBFromSphere(sphere: BoundingSphere): BoundingBox {
    const aabb = new BoundingBox();
    BoundingBox.fromSphere(sphere, aabb);
    return aabb;
  }
  
  static transformAABB(aabb: BoundingBox, transform: Matrix): BoundingBox {
    const transformed = new BoundingBox();
    BoundingBox.transform(aabb, transform, transformed);
    return transformed;
  }
  
  static mergeAABBs(aabb1: BoundingBox, aabb2: BoundingBox): BoundingBox {
    const merged = new BoundingBox();
    BoundingBox.merge(aabb1, aabb2, merged);
    return merged;
  }
  
  // AABB analysis and queries
  static analyzeAABB(aabb: BoundingBox) {
    const center = new Vector3();
    const extent = new Vector3();
    const corners = aabb.getCorners();
    
    aabb.getCenter(center);
    aabb.getExtent(extent);
    
    return {
      center,
      extent,
      corners,
      volume: extent.x * extent.y * extent.z * 8, // 8 = 2^3 for full box
      surfaceArea: 2 * (extent.x * extent.y + extent.y * extent.z + extent.z * extent.x) * 4
    };
  }
}

// Usage in collision detection
class CollisionSystem {
  static aabbOverlap(aabb1: BoundingBox, aabb2: BoundingBox): boolean {
    return (
      aabb1.min.x <= aabb2.max.x && aabb1.max.x >= aabb2.min.x &&
      aabb1.min.y <= aabb2.max.y && aabb1.max.y >= aabb2.min.y &&
      aabb1.min.z <= aabb2.max.z && aabb1.max.z >= aabb2.min.z
    );
  }
  
  static aabbContainsPoint(aabb: BoundingBox, point: Vector3): boolean {
    return (
      point.x >= aabb.min.x && point.x <= aabb.max.x &&
      point.y >= aabb.min.y && point.y <= aabb.max.y &&
      point.z >= aabb.min.z && point.z <= aabb.max.z
    );
  }
  
  static closestPointOnAABB(aabb: BoundingBox, point: Vector3): Vector3 {
    const closest = new Vector3();
    
    closest.x = Math.max(aabb.min.x, Math.min(point.x, aabb.max.x));
    closest.y = Math.max(aabb.min.y, Math.min(point.y, aabb.max.y));
    closest.z = Math.max(aabb.min.z, Math.min(point.z, aabb.max.z));
    
    return closest;
  }
}
```

### BoundingSphere Operations

```typescript
class SphereCollision {
  static createBoundingSphere(center: Vector3, radius: number): BoundingSphere {
    const sphere = new BoundingSphere();
    sphere.center.copyFrom(center);
    sphere.radius = radius;
    return sphere;
  }
  
  static sphereFromPoints(points: Vector3[]): BoundingSphere {
    if (points.length === 0) return new BoundingSphere();
    
    // Simple approach: find center and max distance
    const center = new Vector3();
    
    // Calculate centroid
    points.forEach(point => center.add(point));
    center.scale(1 / points.length);
    
    // Find maximum distance from center
    let maxRadiusSquared = 0;
    points.forEach(point => {
      const distSquared = Vector3.distanceSquared(center, point);
      maxRadiusSquared = Math.max(maxRadiusSquared, distSquared);
    });
    
    const sphere = new BoundingSphere();
    sphere.center.copyFrom(center);
    sphere.radius = Math.sqrt(maxRadiusSquared);
    return sphere;
  }
  
  static sphereOverlap(sphere1: BoundingSphere, sphere2: BoundingSphere): boolean {
    const distance = Vector3.distance(sphere1.center, sphere2.center);
    return distance <= (sphere1.radius + sphere2.radius);
  }
  
  static sphereContainsPoint(sphere: BoundingSphere, point: Vector3): boolean {
    const distance = Vector3.distance(sphere.center, point);
    return distance <= sphere.radius;
  }
}
```

## Advanced Mathematical Operations

### Interpolation and Animation Math

```typescript
class InterpolationMath {
  // Linear interpolation with different easing functions
  static lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
  }
  
  static smoothstep(start: number, end: number, t: number): number {
    t = Math.max(0, Math.min(1, (t - start) / (end - start)));
    return t * t * (3 - 2 * t);
  }
  
  static sineInOut(start: number, end: number, t: number): number {
    return start + (end - start) * (1 - Math.cos(t * Math.PI)) * 0.5;
  }
  
  // Vector interpolation with custom easing
  static lerpVector3(start: Vector3, end: Vector3, t: number, easingFunc?: (t: number) => number): Vector3 {
    const eased = easingFunc ? easingFunc(t) : t;
    const result = new Vector3();
    Vector3.lerp(start, end, eased, result);
    return result;
  }
  
  // Quaternion spherical linear interpolation
  static slerpQuaternion(start: Quaternion, end: Quaternion, t: number): Quaternion {
    const result = new Quaternion();
    Quaternion.slerp(start, end, t, result);
    return result;
  }
  
  // Matrix interpolation (decompose -> interpolate -> compose)
  static lerpMatrix(start: Matrix, end: Matrix, t: number): Matrix {
    // Decompose both matrices
    const startTrans = new Vector3(), startRot = new Quaternion(), startScale = new Vector3();
    const endTrans = new Vector3(), endRot = new Quaternion(), endScale = new Vector3();
    
    start.decompose(startTrans, startRot, startScale);
    end.decompose(endTrans, endRot, endScale);
    
    // Interpolate components
    const resultTrans = new Vector3();
    const resultRot = new Quaternion();
    const resultScale = new Vector3();
    
    Vector3.lerp(startTrans, endTrans, t, resultTrans);
    Quaternion.slerp(startRot, endRot, t, resultRot);
    Vector3.lerp(startScale, endScale, t, resultScale);
    
    // Compose result matrix
    const result = new Matrix();
    Matrix.affineTransformation(resultScale, resultRot, resultTrans, result);
    return result;
  }
}
```

### Ray Mathematics and Intersection

```typescript
class RayMath {
  static createRay(origin: Vector3, direction: Vector3): Ray {
    const ray = new Ray();
    ray.origin.copyFrom(origin);
    ray.direction.copyFrom(direction);
    ray.direction.normalize();
    return ray;
  }
  
  static rayPlaneIntersection(ray: Ray, plane: Plane): { hit: boolean, distance: number, point: Vector3 } {
    const denom = Vector3.dot(plane.normal, ray.direction);
    
    if (Math.abs(denom) < MathUtil.zeroTolerance) {
      return { hit: false, distance: 0, point: new Vector3() };
    }
    
    const distance = -(Vector3.dot(plane.normal, ray.origin) + plane.distance) / denom;
    
    if (distance < 0) {
      return { hit: false, distance: 0, point: new Vector3() };
    }
    
    const point = new Vector3();
    const direction = Vector3.scale(ray.direction, distance, new Vector3());
    Vector3.add(ray.origin, direction, point);
    
    return { hit: true, distance, point };
  }
  
  static raySphereIntersection(ray: Ray, sphere: BoundingSphere): { hit: boolean, distance: number, point: Vector3 } {
    const oc = new Vector3();
    Vector3.subtract(ray.origin, sphere.center, oc);
    
    const a = Vector3.dot(ray.direction, ray.direction);
    const b = 2.0 * Vector3.dot(oc, ray.direction);
    const c = Vector3.dot(oc, oc) - sphere.radius * sphere.radius;
    
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) {
      return { hit: false, distance: 0, point: new Vector3() };
    }
    
    const distance = (-b - Math.sqrt(discriminant)) / (2.0 * a);
    
    if (distance < 0) {
      return { hit: false, distance: 0, point: new Vector3() };
    }
    
    const point = new Vector3();
    const direction = Vector3.scale(ray.direction, distance, new Vector3());
    Vector3.add(ray.origin, direction, point);
    
    return { hit: true, distance, point };
  }
}
```

### Color Mathematics

```typescript
class ColorMath {
  static rgbToHsv(color: Color): { h: number, s: number, v: number } {
    const r = color.r;
    const g = color.g;
    const b = color.b;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    
    let h = 0;
    const s = max === 0 ? 0 : diff / max;
    const v = max;
    
    if (diff !== 0) {
      switch (max) {
        case r: h = ((g - b) / diff + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / diff + 2) / 6; break;
        case b: h = ((r - g) / diff + 4) / 6; break;
      }
    }
    
    return { h, s, v };
  }
  
  static hsvToRgb(h: number, s: number, v: number): Color {
    const c = v * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = v - c;
    
    let r = 0, g = 0, b = 0;
    
    if (h < 1/6) { r = c; g = x; b = 0; }
    else if (h < 2/6) { r = x; g = c; b = 0; }
    else if (h < 3/6) { r = 0; g = c; b = x; }
    else if (h < 4/6) { r = 0; g = x; b = c; }
    else if (h < 5/6) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    
    return new Color(r + m, g + m, b + m, 1);
  }
  
  static colorLerp(start: Color, end: Color, t: number): Color {
    return new Color(
      this.lerp(start.r, end.r, t),
      this.lerp(start.g, end.g, t),
      this.lerp(start.b, end.b, t),
      this.lerp(start.a, end.a, t)
    );
  }
  
  static gamma(color: Color, gamma: number): Color {
    return new Color(
      Math.pow(color.r, gamma),
      Math.pow(color.g, gamma),
      Math.pow(color.b, gamma),
      color.a
    );
  }
}
```

## Mathematical Utilities and Helpers

### MathUtil Functions

```typescript
class ExtendedMathUtil {
  // Angle conversions
  static degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
  
  static radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }
  
  // Range mapping
  static remap(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
    return toMin + (value - fromMin) * (toMax - toMin) / (fromMax - fromMin);
  }
  
  // Clamping and wrapping
  static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
  
  static wrap(value: number, min: number, max: number): number {
    const range = max - min;
    if (range <= 0) return min;
    
    let result = value;
    while (result < min) result += range;
    while (result >= max) result -= range;
    return result;
  }
  
  // Floating point comparisons
  static approximately(a: number, b: number, epsilon: number = MathUtil.zeroTolerance): boolean {
    return Math.abs(a - b) < epsilon;
  }
  
  // Smooth interpolation functions
  static smoothStep(edge0: number, edge1: number, x: number): number {
    const t = this.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  
  static smootherStep(edge0: number, edge1: number, x: number): number {
    const t = this.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  
  // Random number generation
  static randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
  
  static randomVector3(min: Vector3, max: Vector3): Vector3 {
    return new Vector3(
      this.randomRange(min.x, max.x),
      this.randomRange(min.y, max.y),
      this.randomRange(min.z, max.z)
    );
  }
}
```

### Performance-Optimized Math Operations

```typescript
class FastMath {
  // Fast inverse square root (for normalization)
  static fastInverseSqrt(number: number): number {
    const threehalfs = 1.5;
    let x2 = number * 0.5;
    let y = number;
    
    // Convert to integer for bit manipulation
    const buffer = new ArrayBuffer(4);
    const floatView = new Float32Array(buffer);
    const intView = new Int32Array(buffer);
    
    floatView[0] = y;
    intView[0] = 0x5f3759df - (intView[0] >> 1);
    y = floatView[0];
    
    y = y * (threehalfs - (x2 * y * y));
    y = y * (threehalfs - (x2 * y * y)); // Second iteration for higher precision
    
    return y;
  }
  
  // Batch vector operations for performance
  static normalizeVectorArray(vectors: Vector3[]): void {
    for (let i = 0; i < vectors.length; i++) {
      vectors[i].normalize();
    }
  }
  
  static transformPointArray(points: Vector3[], matrix: Matrix, output: Vector3[]): void {
    for (let i = 0; i < points.length; i++) {
      Vector3.transformToVec3(points[i], matrix, output[i] || (output[i] = new Vector3()));
    }
  }
  
  // SIMD-friendly operations (when available)
  static addVectorArrays(a: Vector3[], b: Vector3[], output: Vector3[]): void {
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i++) {
      Vector3.add(a[i], b[i], output[i] || (output[i] = new Vector3()));
    }
  }
}
```

## Spatial Mathematics and Algorithms

### Spatial Partitioning Support

```typescript
class SpatialMath {
  // Octree subdivision helpers
  static subdivideAABB(aabb: BoundingBox): BoundingBox[] {
    const center = new Vector3();
    aabb.getCenter(center);
    
    const children: BoundingBox[] = [];
    
    // Create 8 child AABBs
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          const childMin = new Vector3(
            x === 0 ? aabb.min.x : center.x,
            y === 0 ? aabb.min.y : center.y,
            z === 0 ? aabb.min.z : center.z
          );
          
          const childMax = new Vector3(
            x === 0 ? center.x : aabb.max.x,
            y === 0 ? center.y : aabb.max.y,
            z === 0 ? center.z : aabb.max.z
          );
          
          children.push(new BoundingBox(childMin, childMax));
        }
      }
    }
    
    return children;
  }
  
  // Morton code calculation for spatial indexing
  static mortonCode3D(x: number, y: number, z: number): number {
    x = Math.floor(x) & 0x3ff;
    y = Math.floor(y) & 0x3ff;
    z = Math.floor(z) & 0x3ff;
    
    x = (x | (x << 16)) & 0x030000ff;
    x = (x | (x << 8)) & 0x0300f00f;
    x = (x | (x << 4)) & 0x030c30c3;
    x = (x | (x << 2)) & 0x09249249;
    
    y = (y | (y << 16)) & 0x030000ff;
    y = (y | (y << 8)) & 0x0300f00f;
    y = (y | (y << 4)) & 0x030c30c3;
    y = (y | (y << 2)) & 0x09249249;
    
    z = (z | (z << 16)) & 0x030000ff;
    z = (z | (z << 8)) & 0x0300f00f;
    z = (z | (z << 4)) & 0x030c30c3;
    z = (z | (z << 2)) & 0x09249249;
    
    return x | (y << 1) | (z << 2);
  }
  
  // Frustum-AABB intersection test
  static frustumAABBIntersection(frustum: BoundingFrustum, aabb: BoundingBox): boolean {
    // Get AABB corners
    const corners = aabb.getCorners();
    
    // Test against each frustum plane
    const planes = frustum.getPlanes();
    for (const plane of planes) {
      let insideCount = 0;
      
      for (const corner of corners) {
        const distance = Vector3.dot(plane.normal, corner) + plane.distance;
        if (distance >= 0) {
          insideCount++;
        }
      }
      
      // If all corners are outside this plane, no intersection
      if (insideCount === 0) {
        return false;
      }
    }
    
    return true;
  }
}
```

### Animation and Curve Mathematics

```typescript
class AnimationMath {
  // Bezier curve evaluation
  static evaluateCubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const u = 1 - t;
    const u2 = u * u;
    const u3 = u2 * u;
    const t2 = t * t;
    const t3 = t2 * t;
    
    return u3 * p0 + 3 * u2 * t * p1 + 3 * u * t2 * p2 + t3 * p3;
  }
  
  static evaluateCubicBezierVector3(t: number, p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3): Vector3 {
    return new Vector3(
      this.evaluateCubicBezier(t, p0.x, p1.x, p2.x, p3.x),
      this.evaluateCubicBezier(t, p0.y, p1.y, p2.y, p3.y),
      this.evaluateCubicBezier(t, p0.z, p1.z, p2.z, p3.z)
    );
  }
  
  // Catmull-Rom spline for smooth curves through points
  static evaluateCatmullRom(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    
    return 0.5 * (
      2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }
  
  // Easing functions for animation
  static easeInQuart(t: number): number {
    return t * t * t * t;
  }
  
  static easeOutQuart(t: number): number {
    return 1 - Math.pow(1 - t, 4);
  }
  
  static easeInOutQuart(t: number): number {
    return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
  }
  
  static elasticOut(t: number): number {
    const c4 = (2 * Math.PI) / 3;
    
    return t === 0 ? 0 : t === 1 ? 1 : 
      Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }
}
```

## Integration with Engine Systems

### Transform System Integration

```typescript
class MathTransform {
  private worldMatrix = new Matrix();
  private localMatrix = new Matrix();
  private position = new Vector3();
  private rotation = new Quaternion();
  private scale = new Vector3(1, 1, 1);
  private dirty = true;
  
  updateWorldMatrix(parentMatrix?: Matrix): Matrix {
    if (this.dirty) {
      // Compose local transformation matrix
      Matrix.affineTransformation(this.scale, this.rotation, this.position, this.localMatrix);
      this.dirty = false;
    }
    
    if (parentMatrix) {
      // Combine with parent transformation
      Matrix.multiply(parentMatrix, this.localMatrix, this.worldMatrix);
    } else {
      this.worldMatrix.copyFrom(this.localMatrix);
    }
    
    return this.worldMatrix;
  }
  
  setPosition(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.dirty = true;
  }
  
  setRotationEuler(x: number, y: number, z: number): void {
    Quaternion.rotationEuler(x, y, z, this.rotation);
    this.dirty = true;
  }
  
  setScale(x: number, y: number, z: number): void {
    this.scale.set(x, y, z);
    this.dirty = true;
  }
  
  lookAt(target: Vector3, up: Vector3 = Vector3.up): void {
    const forward = new Vector3();
    Vector3.subtract(target, this.position, forward);
    forward.normalize();
    
    const right = new Vector3();
    Vector3.cross(up, forward, right);
    right.normalize();
    
    const newUp = new Vector3();
    Vector3.cross(forward, right, newUp);
    
    // Create rotation matrix and convert to quaternion
    const rotMatrix = new Matrix3x3();
    rotMatrix.elements[0] = right.x; rotMatrix.elements[1] = right.y; rotMatrix.elements[2] = right.z;
    rotMatrix.elements[3] = newUp.x; rotMatrix.elements[4] = newUp.y; rotMatrix.elements[5] = newUp.z;
    rotMatrix.elements[6] = forward.x; rotMatrix.elements[7] = forward.y; rotMatrix.elements[8] = forward.z;
    
    Quaternion.rotationMatrix3x3(rotMatrix, this.rotation);
    this.dirty = true;
  }
}
```

### Physics Integration Helpers

```typescript
class PhysicsMath {
  // Convert between physics and rendering coordinate systems
  static worldToPhysics(worldPos: Vector3): Vector3 {
    // Galacean typically uses right-handed Y-up, physics might be different
    return new Vector3(worldPos.x, worldPos.y, worldPos.z);
  }
  
  static physicsToWorld(physicsPos: Vector3): Vector3 {
    return new Vector3(physicsPos.x, physicsPos.y, physicsPos.z);
  }
  
  // Inertia tensor calculations
  static calculateBoxInertia(mass: number, extents: Vector3): Matrix3x3 {
    const inertia = new Matrix3x3();
    const e = inertia.elements;
    
    const x2 = extents.x * extents.x;
    const y2 = extents.y * extents.y;
    const z2 = extents.z * extents.z;
    
    e[0] = mass * (y2 + z2) / 12;
    e[4] = mass * (x2 + z2) / 12;
    e[8] = mass * (x2 + y2) / 12;
    
    return inertia;
  }
  
  static calculateSphereInertia(mass: number, radius: number): Matrix3x3 {
    const inertia = new Matrix3x3();
    const e = inertia.elements;
    const value = 0.4 * mass * radius * radius;
    
    e[0] = value;
    e[4] = value;
    e[8] = value;
    
    return inertia;
  }
}
```

## Best Practices

1. **Performance Optimization**: Use static methods for mathematical operations to avoid object allocation
2. **Output Parameters**: Prefer output parameter pattern to minimize garbage collection
3. **Precision Handling**: Use MathUtil.zeroTolerance for floating-point comparisons
4. **Memory Management**: Reuse Vector3/Matrix objects in hot code paths
5. **Coordinate Systems**: Understand and consistently use right-handed Y-up coordinate system
6. **Matrix Order**: Remember transformation order matters: T * R * S (Translation * Rotation * Scale)
7. **Quaternion Normalization**: Keep quaternions normalized for stable rotations
8. **Bounding Volume Efficiency**: Choose appropriate bounding volume types for different use cases

## Common Patterns and Solutions

### Efficient Vector Pooling

```typescript
class VectorPool {
  private static vector3Pool: Vector3[] = [];
  private static vector3InUse = new Set<Vector3>();
  
  static getVector3(): Vector3 {
    let vector = this.vector3Pool.pop();
    if (!vector) {
      vector = new Vector3();
    }
    this.vector3InUse.add(vector);
    return vector;
  }
  
  static releaseVector3(vector: Vector3): void {
    if (this.vector3InUse.has(vector)) {
      vector.set(0, 0, 0);
      this.vector3InUse.delete(vector);
      this.vector3Pool.push(vector);
    }
  }
  
  static withVector3<T>(callback: (v: Vector3) => T): T {
    const vector = this.getVector3();
    try {
      return callback(vector);
    } finally {
      this.releaseVector3(vector);
    }
  }
}

// Usage
const distance = VectorPool.withVector3(temp => {
  Vector3.subtract(pointA, pointB, temp);
  return temp.length();
});
```

This comprehensive Math Library provides robust mathematical foundations for complex 3D applications with optimized vector operations, matrix transformations, quaternion mathematics, bounding volume calculations, collision detection utilities, and advanced mathematical algorithms essential for real-time 3D graphics and game development.
