import { isInGeneratedBuildingOutput } from "../BuildingGeneratedOutput";
import { buildingAuthorMarker } from "./BuildingAuthorMarker";
import { Component, Loader, Entity } from "@galacean/engine";
import type { BuildingPartDef, ConnectionDef } from "../../core";
import { BuildingManager } from "./BuildingManager";

/** One flat building part: a core part definition and the author connections it starts.
 * Node hierarchy owns grouping; units are not recursively expanded. */
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
  private _definition: BuildingPartDef | null = null;
  private _connections: ConnectionDef[] = [];
  get definition(): BuildingPartDef | null {
    return structuredClone(this._definition);
  }
  /** @internal Read classification without copying or exposing the author definition. */
  get _groupId(): string | undefined {
    return this._definition?.group;
  }
  /** @internal */
  get _partType(): string | undefined {
    return this._definition?.type;
  }
  set definition(value: BuildingPartDef | null) {
    this._definition = structuredClone(value);
    this.changed();
  }
  /** Author connections this part starts: those where it is the guest of an attach, or the
   * first part of a join. */
  get connections(): ConnectionDef[] {
    return structuredClone(this._connections);
  }
  set connections(value: ConnectionDef[]) {
    this._connections = structuredClone(value ?? []);
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
  protected override _onDestroy(): void {
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
