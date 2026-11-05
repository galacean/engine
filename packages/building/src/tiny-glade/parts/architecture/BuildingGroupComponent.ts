import { isInGeneratedBuildingOutput } from "../BuildingGeneratedOutput";
import { buildingAuthorMarker } from "./BuildingAuthorMarker";
import { Component, Entity, Loader, PrefabResource } from "@galacean/engine";
import { retainBuildingResource } from "../../resources/BuildingAssetKit";
import type { BuildingGroup } from "./BuildingDraft";
import { BuildingManager } from "./BuildingManager";

/** Independent author owner for a building group. Removing a part never removes its settings. */
export class BuildingGroupComponent extends Component {
  readonly [buildingAuthorMarker] = true;
  private _definition: BuildingGroup | null = null;
  private _frame: Entity | null = null;
  private _assetLibrary: PrefabResource | null = null;
  get definition(): BuildingGroup | null {
    return structuredClone(this._definition);
  }
  set definition(value: BuildingGroup | null) {
    this._definition = structuredClone(value);
    this.changed();
  }
  /** Native instance/compilation scope shared by this group's parts. */
  get frame(): Entity | null {
    return this._frame;
  }
  set frame(value: Entity | null) {
    if (value && (value.destroyed || value.engine !== this.engine)) throw Error("Invalid building group frame");
    this._frame = value;
    this.changed();
  }
  get assetLibrary(): PrefabResource | null {
    return this._assetLibrary;
  }
  set assetLibrary(value: PrefabResource | null) {
    if (value && (value.destroyed || value.engine !== this.engine)) throw Error("Invalid building group library");
    if (value === this._assetLibrary) return;
    retainBuildingResource(value, 1);
    retainBuildingResource(this._assetLibrary, -1);
    this._assetLibrary = value;
    this.changed();
  }
  _onEnableInScene(): void {
    BuildingManager.existing(this.entity.scene!)?.register(this);
  }
  _onDisableInScene(): void {
    BuildingManager.existing(this.entity.scene!)?.unregister(this);
  }
  _onClone(target: BuildingGroupComponent): void {
    retainBuildingResource(target._assetLibrary, 1);
  }
  protected override _onDestroy(): void {
    retainBuildingResource(this._assetLibrary, -1);
    this._assetLibrary = null;
    if (this.entity.scene && !isInGeneratedBuildingOutput(this.entity))
      BuildingManager.existing(this.entity.scene!)?.invalidate();
    super._onDestroy();
  }
  private changed(): void {
    if (this.entity.scene && !isInGeneratedBuildingOutput(this.entity))
      BuildingManager.existing(this.entity.scene!)?.invalidate();
  }
}
Loader.registerClass("BuildingGroupComponent", BuildingGroupComponent);
