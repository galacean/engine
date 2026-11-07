import { isInGeneratedBuildingOutput } from "../BuildingGeneratedOutput";
import { buildingAuthorMarker } from "./BuildingAuthorMarker";
import { copyBuildingValue, retainBuildingResources } from "../BuildingAlgorithms";
import { Component, Loader, Entity } from "@galacean/engine";
import type { BuildingBasePart, BuildingRelation } from "./BuildingDraft";
import { BuildingManager } from "./BuildingManager";

/** One flat architectural part. Node hierarchy owns grouping; units are not recursively expanded. */
export class BuildingPartComponent extends Component {
  readonly [buildingAuthorMarker] = true;
  private _inputRevision = 0;
  /** Runtime invalidation only; never part of the saved construction definition. */
  get inputRevision(): number {
    return this._inputRevision;
  }
  /** Rebuild after editing a referenced Mesh/Unit in place. */
  rebuild(): void {
    this.changed();
  }
  private _frame: Entity | null = null;
  /** Shared compilation coordinates. This must be the part Entity or an ancestor. */
  get frame(): Entity | null {
    return this._frame;
  }
  set frame(value: Entity | null) {
    if (value && (value.destroyed || value.engine !== this.engine))
      throw Error("Building frame belongs to another engine or is destroyed");
    this._frame = value;
    this.changed();
  }
  private _definition: BuildingBasePart | null = null;
  private _relations: BuildingRelation[] = [];
  get definition(): BuildingBasePart | null {
    return copyBuildingValue(this._definition);
  }
  set definition(value: BuildingBasePart | null) {
    const next = copyBuildingValue(value);
    retainBuildingResources(next, 1);
    retainBuildingResources(this._definition, -1);
    this._definition = next;
    this.changed();
  }
  get relations(): BuildingRelation[] {
    return structuredClone(this._relations);
  }
  set relations(value: BuildingRelation[]) {
    this._relations = structuredClone(value);
    this.changed();
  }
  _onEnableInScene(): void {
    // Loading author components must not insert host roots into SceneParser's
    // ordered root list. The scene owner creates/binds the manager explicitly;
    // forScene collects parts that were enabled before that binding.
    BuildingManager.existing(this.entity.scene!)?.register(this);
  }
  _onDisableInScene(): void {
    BuildingManager.existing(this.entity.scene!)?.unregister(this);
  }
  _onClone(target: BuildingPartComponent): void {
    retainBuildingResources(target._definition, 1);
  }
  protected override _onDestroy(): void {
    retainBuildingResources(this._definition, -1);
    this._definition = null;
    if (this.entity.scene && !isInGeneratedBuildingOutput(this.entity))
      BuildingManager.existing(this.entity.scene!)?.invalidate();
    super._onDestroy();
  }
  private changed(): void {
    this._inputRevision++;
    if (this.entity.scene && !isInGeneratedBuildingOutput(this.entity))
      BuildingManager.existing(this.entity.scene!)?.invalidate();
  }
}
Loader.registerClass("BuildingPartComponent", BuildingPartComponent);
