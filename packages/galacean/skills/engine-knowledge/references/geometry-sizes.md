# Geometry Default Sizes

Default dimensions when entity scale = (1, 1, 1).

## Size Table

| Mesh | Default Height | Half Height (halfH) | Notes |
|------|---------------|---------------------|-------|
| **Cube** | 1 | scale.y / 2 | Unit cube, centered at origin |
| **Sphere** | 1 | scale.y / 2 | Unit sphere, diameter = 1 |
| **Plane** | 0 | 0 | Flat, no height |
| **Cylinder** | **2** | scale.y | NOT 1! Centered at origin, extends 1 unit up and down |
| **Cone** | **2** | scale.y | Same as Cylinder |
| **Capsule** | **3** | 1.5 * scale.y | Sphere(r=0.5) + cylinder(h=2) + sphere(r=0.5) |

Cylinder and Cone default height is 2.0, not 1.0. This is the most common source of alignment errors.

## Default Orientation

| Mesh | Default Orientation | Notes |
|------|-------------------|-------|
| **Plane** | Horizontal (XZ plane), face up (+Y) | Already a ground surface, NO rotation needed |
| **Cube** | Axis-aligned | Centered at origin |
| **Sphere** | Axis-aligned | Centered at origin |
| **Cylinder** | Vertical (Y-axis) | Centered at origin |
| **Cone** | Vertical (Y-axis), tip up | Centered at origin |
| **Capsule** | Vertical (Y-axis) | Centered at origin |

⚠️ Plane is NOT like Three.js PlaneGeometry (which faces +Z). Galacean Plane is already horizontal — do NOT rotate it -90° to make it a ground.

## Alignment Formulas

### Place entity on ground (ground at y=0)

```
position.y = halfH
```

Examples (scale = 1):
- Cube: position.y = 0.5
- Sphere: position.y = 0.5
- Plane: position.y = 0
- Cylinder: position.y = 1.0
- Capsule: position.y = 1.5

### Stack entity B on top of entity A

```
B.position.y = A_topY + B_halfH
```

Where `A_topY = A.position.y + A_halfH`.

Example: Stack a Sphere (scale=1) on a Cube (scale=1):
- Cube top: 0.5 + 0.5 = 1.0
- Sphere position.y = 1.0 + 0.5 = 1.5

### Horizontal dimensions

- **Cube**: width = scale.x, depth = scale.z
- **Sphere**: diameter = scale.x (uniform scale expected)
- **Cylinder**: diameter = scale.x, height = 2 * scale.y
- **Capsule**: diameter = scale.x, height = 3 * scale.y

### Scaled examples

Capsule with scale (0.5, 0.5, 0.5):
- Actual height = 3 * 0.5 = 1.5
- halfH = 1.5 * 0.5 = 0.75
- Ground position.y = 0.75

Cylinder with scale (1, 2, 1):
- Actual height = 2 * 2 = 4
- halfH = 2
- Ground position.y = 2.0
