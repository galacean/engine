# Coordinates and Space

Use this reference when handedness, direction, or coordinate conversion changes placement, orientation, or interaction.

## Runtime spaces

- Galacean local and world spaces are right-handed.
- Local `+X` is right, local `+Y` is up, and an unrotated Transform faces local `-Z`. A Camera also views along its local `-Z` direction.
- Local space is relative to an Entity's parent. World space is the shared comparison space; convert values before comparing or combining positions and directions from different parents.
- Positive rotation follows the Engine's right-handed convention. Do not copy signs from a left-handed `+Z`-forward engine without converting them.

## Transform rotation composition

- Transform Euler properties and `setRotation(x, y, z)` use degrees. `Quaternion.rotationEuler(x, y, z)` uses radians.
- Euler conversion composes the local quaternion as `Qy * Qx * Qz`, where the terms rotate around local Y, X, and Z respectively. With the Engine's quaternion-vector convention, the rightmost rotation acts first.
- A child's world rotation is `QparentWorld * Qlocal`. Nested single-axis Transform nodes therefore provide an explicit alternative when a multi-axis orientation is easier to reason about as ordered steps.

Use these contracts to derive orientation-sensitive placement. Do not create disposable runtime entities merely to probe Euler order or parent-child rotation that the Engine already defines.

## Screen and viewport spaces

- Screen space uses canvas pixels with `(0, 0)` at the top-left. X increases rightward and Y increases downward.
- Camera viewport space is normalized over the camera viewport: `(0, 0)` is its top-left and `(1, 1)` is its bottom-right.
- The Z returned by world-to-screen or world-to-viewport conversion is a forward distance from the camera in world units, not normalized depth-buffer space.

## Decision rule

Keep positions and directions in an explicitly chosen space. Convert at the boundary, and preserve the Engine's `-Z` forward convention when orienting cameras, models, rays, or movement.

## Transform-owned motion pattern

For non-physics motion updated once per rendered frame, scale displacement by the callback's `deltaTime` and move toward local `-Z` when the intent is “forward.” This makes the distance time-based instead of frame-count-based. Do not apply this Transform pattern to a simulation-owned dynamic body; choose its physics motion owner instead.
