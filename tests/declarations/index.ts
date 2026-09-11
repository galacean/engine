// Resolve each package.json types entry, without source aliases or ambient test types.
import "../../packages/core";
import "../../packages/design";
import "../../packages/galacean";
import "../../packages/loader";
import "../../packages/math";
import "../../packages/physics-physx";
import "../../packages/rhi-webgl";
import "../../packages/shader";
import "../../packages/shader-compiler";
import "../../packages/ui";
import "../../packages/xr";
import "../../packages/xr-webxr";

import { Script } from "../../packages/core";
import { Rect } from "../../packages/math";
import { PhysXPhysics } from "../../packages/physics-physx";
import { UIGroup } from "../../packages/ui";

class UserScript extends Script {
  // @ts-expect-error Internal activation names must remain visible to consumers.
  private _setActive(entity: { isActive: boolean }, active: boolean): void {
    entity.isActive = active;
  }
}

// @ts-expect-error UI-owned internal state must also reject private shadowing.
class UserPanel extends UIGroup {
  private _indexInGroup = 0;
}

class UserRect extends Rect {
  // @ts-expect-error Math-owned runtime state must remain visible to consumers.
  private _x = "bad";
}

// @ts-expect-error Physics-owned runtime state must remain visible to consumers.
class UserPhysics extends PhysXPhysics {
  private _physX = "bad";
}
