import type { Camera } from "@galacean/engine-core";
import { BoundingBox, Ray, Vector2, Vector3 } from "@galacean/engine-math";
import { ItemTapGesture } from "@galacean/engine-project/interaction/WorldItem";
import type { FarmingService } from "./FarmingService";
import type { FarmingActionCoordinator } from "./FarmingActionCoordinator";
import type { FarmingWorldPresentation } from "../presentation/FarmingWorldPresentation";
import type { FarmingGroundProvider } from "../domain/FarmingGround";
import { targetAtPoint } from "../domain/FarmingGround";
import { carriedItem } from "../domain/FarmItems";
import { resolveCarriedAction } from "../domain/ResolveCarriedAction";
import { isNearbyFarmTool } from "./FarmingWorkTarget";
import { findPlayerItemDropPosition } from "./FarmingItemDrop";
import type { FarmingDefinitionSet } from "../domain/FarmDefinitions";
import { containerBounds } from "../storage/StoragePlacement";
import { storageDefinitions } from "../storage/StorageRules";
import type { CommandResult } from "../domain/FarmCommands";

export const FARM_PLAYER_INTERACTION_DISTANCE = 8;
/** Remote sowing, harvesting and unloading stay bounded independently of the landscape far plane. */
export const FARM_REMOTE_INTERACTION_DISTANCE = 200;
/** Native taps and CPU boxes only. Drag ownership remains with the host's existing controls. */
export class FarmingItemInteraction {
  private readonly events = new AbortController();
  private readonly gesture = new ItemTapGesture();
  private readonly ray = new Ray();
  private readonly screen = new Vector2();
  private consumed?: { x: number; y: number; at: number };
  private candidate = false;
  constructor(
    private readonly options: {
      canvas: HTMLCanvasElement;
      camera: Camera;
      service: FarmingService;
      coordinator: FarmingActionCoordinator;
      presentation: Pick<FarmingWorldPresentation, "items" | "setTarget"> &
        Partial<
          Pick<
            FarmingWorldPresentation,
            "setPlayerOcclusionQuery" | "getPlayerWorkTarget" | "beginPlayerWork" | "endPlayerWork"
          >
        >;
      ground: FarmingGroundProvider;
      definitions: FarmingDefinitionSet;
      isEnabled(): boolean;
      isStorageContainerVisible(id: string): boolean;
      occluded?(ray: Ray, distance: number): boolean;
      result?(receipt: CommandResult): void;
    }
  ) {
    options.presentation.setPlayerOcclusionQuery?.(options.occluded);
    const document = options.canvas.ownerDocument,
      signal = this.events.signal;
    document.addEventListener(
      "pointerdown",
      (event) => {
        this.gesture.begin(event.pointerId, event.clientX, event.clientY);
        this.candidate = event.target === options.canvas && event.button === 0 && event.isPrimary;
      },
      { capture: true, signal }
    );
    document.addEventListener(
      "pointermove",
      (event) => this.gesture.move(event.pointerId, event.clientX, event.clientY),
      { capture: true, signal }
    );
    document.addEventListener(
      "pointerup",
      (event) => {
        const tap = this.gesture.end(event.pointerId, event.clientX, event.clientY);
        if (!tap || !this.candidate || !options.isEnabled()) return;
        const rect = options.canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) * options.canvas.width) / rect.width,
          y = ((event.clientY - rect.top) * options.canvas.height) / rect.height;
        if (this.click(x, y)) this.consumed = { x, y, at: performance.now() };
      },
      { capture: true, signal }
    );
    document.addEventListener("pointercancel", () => this.gesture.cancel(), {
      capture: true,
      signal
    });
    document.defaultView?.addEventListener("blur", () => this.gesture.cancel(), { signal });
  }
  /** Called by a host world-pick callback before it starts GPU picking. */
  consumesWorldClick(x: number, y: number): boolean {
    const p = this.consumed;
    return !!p && performance.now() - p.at < 500 && Math.hypot(p.x - x, p.y - y) < 2;
  }
  private submit(task: Promise<{ receipt: CommandResult }>): void {
    const itemId = this.options.service.getSnapshot().items.carried?.itemId;
    void task
      .then(({ receipt }) => {
        if (
          !this.events.signal.aborted &&
          itemId &&
          !receipt.ok &&
          receipt.error?.code === "BASKET_CAPACITY_INSUFFICIENT"
        )
          this.options.presentation.items.flashCapacityWarning(itemId);
      })
      .catch((error) => {
        this.options.result?.({
          ok: false,
          commandId: "input-failure",
          revision: this.options.service.getSnapshot().revision,
          replayed: false,
          changes: [],
          error: { code: "INVALID_COMMAND", message: String(error) }
        });
      });
  }
  private click(x: number, y: number): boolean {
    const { camera, service, presentation, ground, coordinator, definitions } = this.options;
    const snapshot = service.getSnapshot(),
      state = snapshot.items;
    const eye = camera.entity.transform.worldPosition;
    const forward = camera.entity.transform.worldForward;
    const right = camera.entity.transform.worldRight;
    const viewYaw = right
      ? (Math.atan2(right.x, right.z) * 180) / Math.PI
      : (Math.atan2(-forward.z, forward.x) * 180) / Math.PI;
    const dropOrigin = [eye.x + forward.x * 1.4, eye.y, eye.z + forward.z * 1.4] as const;
    const held = carriedItem(state),
      carry = state.carried;
    // The grounded hoe's head points opposite its shaft's local +X direction.
    const yaw = viewYaw + (held?.type === "hoe" ? 180 : 0);
    const dropView = ground.capture();
    const resolveDrop = () =>
      held
        ? findPlayerItemDropPosition(
            snapshot,
            definitions,
            dropView,
            held,
            [eye.x, eye.y, eye.z],
            [forward.x, forward.y, forward.z],
            Math.random,
            yaw
          )
        : dropOrigin;
    if (carry && presentation.items.hitHeld(x, y)) {
      const id = carry.itemId;
      const groundId = held?.groundId ?? snapshot.storage.layout.groundId;
      const position = resolveDrop();
      if (!position)
        this.options.result?.({
          ok: false,
          commandId: "place-failure",
          revision: snapshot.revision,
          replayed: false,
          changes: [],
          error: {
            code: "NO_ITEM_POSITION",
            message: "身前没有有效落点，保持携带"
          }
        });
      else
        this.submit(
          coordinator.executeItem(
            { type: "place-item", expectedItemId: id, groundId, position, yaw },
            { expectedRevision: snapshot.revision, expectedGroundRevision: dropView.revision }
          )
        );
      return true;
    }
    camera.screenPointToRay(this.screen.set(x, y), this.ray);
    const ray = this.ray;
    const hit = ground.capture().raycast(
      {
        origin: [ray.origin.x, ray.origin.y, ray.origin.z],
        direction: [ray.direction.x, ray.direction.y, ray.direction.z]
      },
      held?.type === "harvest-basket" || held?.type === "seed-bag"
        ? Math.min(camera.farClipPlane, FARM_REMOTE_INTERACTION_DISTANCE)
        : FARM_PLAYER_INTERACTION_DISTANCE
    );
    const candidates: { id: string; facility: boolean; distance: number }[] = [];
    const distanceTo = (minimum: readonly number[], maximum: readonly number[]) =>
      ray.intersectBox(
        new BoundingBox(
          new Vector3(minimum[0], minimum[1], minimum[2]),
          new Vector3(maximum[0], maximum[1], maximum[2])
        )
      );
    for (const item of state.instances) {
      if (item.id === held?.id) continue;
      const bounds = presentation.items.worldBounds(item.id);
      if (!bounds) continue;
      const distance = ray.intersectBox(bounds);
      if (distance >= 0) candidates.push({ id: item.id, facility: false, distance });
    }
    for (const container of snapshot.storage.containers) {
      if (!this.options.isStorageContainerVisible(container.id)) continue;
      const type = storageDefinitions(definitions).containers.find((t) => t.id === container.typeId)!;
      const bounds = containerBounds(container, type),
        height = type.appearance === "cart" ? 1.1 : 0.55;
      const distance = distanceTo(
        [bounds.minimumX, container.position[1], bounds.minimumZ],
        [bounds.maximumX, container.position[1] + height, bounds.maximumZ]
      );
      if (distance >= 0) candidates.push({ id: container.id, facility: true, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const item = candidates.find(
      (candidate) =>
        candidate.distance <=
          (candidate.facility && held?.type === "harvest-basket"
            ? Math.min(camera.farClipPlane, FARM_REMOTE_INTERACTION_DISTANCE)
            : FARM_PLAYER_INTERACTION_DISTANCE) &&
        candidate.distance <= (hit?.distance ?? Infinity) + 0.02 &&
        !this.options.occluded?.(ray, candidate.distance)
    );
    if (item) {
      if (!item.facility) {
        const position = resolveDrop();
        if (!position) {
          this.options.result?.({
            ok: false,
            commandId: "place-failure",
            revision: snapshot.revision,
            replayed: false,
            changes: [],
            error: { code: "NO_ITEM_POSITION", message: "身前没有有效落点，保持原携带物" }
          });
          return true;
        }
        this.submit(
          coordinator.executeItem(
            { type: "pickup-item", itemId: item.id, dropPosition: position, dropYaw: yaw },
            { expectedRevision: snapshot.revision, expectedGroundRevision: dropView.revision }
          )
        );
      } else if (held?.type === "harvest-basket" && held.contents.length)
        this.submit(
          coordinator.executeItem(
            { type: "unload-basket", basketId: held.id, containerId: item.id },
            { expectedRevision: snapshot.revision }
          )
        );
      return true;
    }
    if (isNearbyFarmTool(held?.type) && presentation.getPlayerWorkTarget && presentation.beginPlayerWork) {
      // Pointer location cannot select a remote plot while using a physical tool.
      const selected = presentation.getPlayerWorkTarget();
      if (!selected || !presentation.beginPlayerWork(selected)) {
        this.options.result?.({
          ok: false,
          commandId: "work-target-failure",
          revision: snapshot.revision,
          replayed: false,
          changes: [],
          error: { code: "ACTION_UNAVAILABLE", message: "请靠近并面向身前的地块" }
        });
        return true;
      }
      const intent = resolveCarriedAction(snapshot, selected.ground);
      if (intent)
        this.submit(
          coordinator
            .execute(intent.input, intent.options, undefined, undefined, undefined, true)
            .finally(() => presentation.endPlayerWork?.())
        );
      else {
        presentation.endPlayerWork?.();
        this.options.result?.({
          ok: false,
          commandId: "work-target-failure",
          revision: snapshot.revision,
          replayed: false,
          changes: [],
          error: { code: "ACTION_UNAVAILABLE", message: "当前工具不能用于选中地块" }
        });
      }
      return true;
    }
    if (!hit || this.options.occluded?.(ray, hit.distance)) return false;
    const target = targetAtPoint(snapshot.grid, hit.groundId, hit.position[0], hit.position[2]);
    const plot = snapshot.plots.find(
      (p) => p.groundId === target.groundId && p.cellX === target.cellX && p.cellZ === target.cellZ
    );
    if (!plot && held?.type !== "hoe") return false;
    presentation.setTarget({ plotId: plot?.plotId ?? null, ground: target });
    const intent = resolveCarriedAction(snapshot, target);
    if (intent) this.submit(coordinator.execute(intent.input, intent.options, undefined, undefined, undefined, true));
    else if (carry)
      this.options.result?.({
        ok: false,
        commandId: "target-failure",
        revision: snapshot.revision,
        replayed: false,
        changes: [],
        error: {
          code: "ACTION_UNAVAILABLE",
          message: "当前携带物不能用于这个目标"
        }
      });
    return true;
  }
  dispose(): void {
    this.events.abort();
    this.gesture.cancel();
  }
}
