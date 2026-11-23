# Coordinates and Space

Use this reference when handedness, direction, or coordinate conversion changes placement, orientation, or interaction.

## Runtime spaces

- Galacean local and world spaces are right-handed.
- Local `+X` is right, local `+Y` is up, and an unrotated Transform faces local `-Z`. A Camera views along its local `-Z` direction.
- Local space is relative to an Entity's parent. Convert positions and directions to world space before comparing or combining values from different parents.
- Positive rotation follows the Engine's right-handed convention; convert signs when porting from a left-handed `+Z`-forward engine.

## Transform composition conventions

- Matrices use column vectors: `v' = M * v`.
- Hierarchy composition is `world = parentWorld * local` for transform matrices and rotation quaternions.
- Transform applies local rotation increments by post-multiplication (`Qlocal * deltaLocal`) and world rotation increments by pre-multiplication (`deltaWorld * Qworld`).
- Euler rotation uses intrinsic Y-X-Z order (`Qy * Qx * Qz`).

## Screen and viewport spaces

- Screen space uses canvas pixels with `(0, 0)` at the top-left; X increases rightward and Y increases downward.
- Camera viewport space is normalized over the camera viewport: `(0, 0)` is top-left and `(1, 1)` is bottom-right.
- The Z returned by `worldToScreenPoint` or `worldToViewportPoint` is forward distance from the camera in world units, not normalized depth-buffer space.

## Transform-owned motion

For non-physics movement updated once per rendered frame, scale displacement by `deltaTime` and move toward local `-Z` for forward motion. For bodies owned by physics simulation, see [physics-setup.md](physics-setup.md).
