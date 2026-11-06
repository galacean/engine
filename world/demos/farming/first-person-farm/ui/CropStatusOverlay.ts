import { Camera, OverflowMode, Script, Sprite, TextHorizontalAlignment, Vector3 } from "@galacean/engine";
import type { PlotStatusView } from "@galacean/engine-farming/farming/domain/index";

import { FIELD_COLORS, FarmUi, FarmUiNode } from "./FarmUi.ts";

interface CropLabelEntry {
  readonly plotId: string;
  readonly node: FarmUiNode;
  readonly label: FarmUiNode;
  readonly progress: FarmUiNode;
  occluded: boolean;
  status: PlotStatusView;
  x: number;
  y: number;
  distance: number;
  selected: boolean;
}

const LABEL_WIDTH = 178;
const LABEL_HEIGHT = 38;
const PROGRESS_INSET = 42;
const PROGRESS_WIDTH = LABEL_WIDTH - PROGRESS_INSET - 8;
const MAXIMUM_DISTANCE = 11;
/** Project using the exact camera pose that will render, after every update/late-update controller. */
class CropLabelRenderDriver extends Script {
  project: ((camera: Camera) => void) | null = null;

  override onBeginRender(camera: Camera): void {
    this.project?.(camera);
  }
}

export class CropStatusOverlay {
  private readonly entries = new Map<string, CropLabelEntry>();
  private readonly projected: CropLabelEntry[] = [];
  private readonly occupied: CropLabelEntry[] = [];
  private readonly worldPoint = new Vector3();
  private readonly viewportPoint = new Vector3();
  private selectedPlotId: string | null = null;
  private readonly driver: CropLabelRenderDriver;
  private readonly root: FarmUiNode;
  private suppressed = false;
  private disposed = false;
  private visibleCount = 0;

  constructor(
    private readonly camera: Camera,
    private readonly ui: FarmUi,
    private readonly cropIcons: Readonly<Record<string, Sprite>>,
    private readonly isWorldPointVisible: (plotId: string, worldPoint: Vector3) => boolean,
    private readonly plotPosition: (plotId: string) => readonly [number, number, number] | null
  ) {
    this.root = ui.layer("crop-labels", 5);
    this.driver = camera.entity.addComponent(CropLabelRenderDriver);
    this.driver.project = (renderCamera) => {
      if (renderCamera === this.camera) this.updatePositions();
    };
  }

  setStatuses(statuses: readonly PlotStatusView[]): void {
    const activeInstances = new Set(statuses.flatMap((status) => (status.crop ? [status.crop.instanceId] : [])));
    for (const [instanceId, entry] of this.entries) {
      if (activeInstances.has(instanceId)) continue;
      this.ui.remove(entry.node);
      this.entries.delete(instanceId);
    }
    for (const status of statuses) {
      if (!status.crop) continue;
      let entry = this.entries.get(status.crop.instanceId);
      if (!entry) {
        const layout = this.plotPosition(status.plotId);
        if (!layout) continue;
        const node = this.ui.panel(this.root, `crop-status-${status.plotId}`, "#182018ee");
        this.ui
          .icon(node, `crop-icon-${status.plotId}`, this.cropIcons[status.crop.cropId])
          .rect(6, 5, 28, 28)
          .tint("#ffffff");
        const label = this.ui.text(node, `crop-label-${status.plotId}`, "", 12);
        label.label!.horizontalAlignment = TextHorizontalAlignment.Center;
        label.label!.overflowMode = OverflowMode.Overflow;
        label.rect(38, 1, LABEL_WIDTH - 38, 24);
        const track = this.ui.panel(node, `crop-progress-track-${status.plotId}`, "#43503d");
        track.rect(PROGRESS_INSET, 27, PROGRESS_WIDTH, 6);
        const progress = this.ui.panel(track, `crop-progress-${status.plotId}`, FIELD_COLORS.growing);
        entry = {
          plotId: status.plotId,
          node,
          label,
          progress,
          occluded: false,
          status,
          x: 0,
          y: 0,
          distance: 0,
          selected: false
        };
        this.entries.set(status.crop.instanceId, entry);
      }
      entry.status = status;
      this.renderEntry(entry);
    }
  }

  setSelectedPlot(plotId: string | null): void {
    this.selectedPlotId = plotId;
    for (const entry of this.entries.values()) this.renderEntry(entry);
  }

  getVisibleCount(): number {
    return this.suppressed ? 0 : this.visibleCount;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.driver.project = null;
    this.driver.destroy();
    this.entries.clear();
    this.ui.remove(this.root);
  }

  private renderEntry(entry: CropLabelEntry): void {
    const crop = entry.status.crop!;
    entry.node.tint(entry.plotId === this.selectedPlotId ? "#35442bf5" : "#182018ee");
    const progress = crop.mature ? 1 : Math.max(0, Math.min(1, crop.growthPermille / 1000));
    const percent = Math.floor(progress * 100);
    const color = crop.mature ? FIELD_COLORS.mature : crop.pausedReason ? FIELD_COLORS.dry : FIELD_COLORS.growing;
    // Progress follows authoritative growth, so drought pauses the fill instead of advancing with elapsed time.
    entry.progress
      .rect(0, 0, PROGRESS_WIDTH * progress, 6)
      .tint(color)
      .show(progress > 0);
    entry.label.text(
      crop.mature
        ? "100% · 可收获"
        : crop.pausedReason
          ? `${percent}% · ${crop.pausedReason === "ground-unavailable" ? "地形不可用" : crop.pausedReason === "soil-too-dry" ? "缺水" : crop.pausedReason === "soil-too-wet" ? "过湿" : "环境不适宜"}`
          : `${percent}% · ${formatCountdown(crop.estimatedRemainingMs ?? crop.idealRemainingMs)}`
    );
    entry.label.textColor(crop.mature || crop.pausedReason ? color : FIELD_COLORS.paper);
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    this.root.show(!suppressed);
  }

  inspect() {
    return [...this.entries.values()].map((entry) => ({
      plotId: entry.plotId,
      text: entry.label.label!.text,
      visible: entry.node.entity.isActiveInHierarchy,
      occluded: entry.occluded,
      instanceId: entry.node.entity.instanceId
    }));
  }

  private updatePositions(): void {
    if (this.disposed || this.suppressed) return;
    // UI uses canvas-local CSS pixels. Projection has no wall-clock throttle or smoothing:
    // every rendered frame must agree with the camera, even when crop data has not changed.
    const width = this.ui.width;
    const height = this.ui.height;
    const viewport = this.camera.viewport;
    const cameraPosition = this.camera.entity.transform.worldPosition;
    this.projected.length = 0;
    for (const entry of this.entries.values()) {
      const cropHeight = 1.02;
      const position = this.plotPosition(entry.plotId);
      if (!position) {
        entry.node.show(false);
        continue;
      }
      this.worldPoint.set(position[0], position[1] + cropHeight, position[2]);
      const distance = Vector3.distance(cameraPosition, this.worldPoint);
      const screen = this.camera.worldToViewportPoint(this.worldPoint, this.viewportPoint);
      if (screen.z <= 0 || distance > MAXIMUM_DISTANCE) {
        entry.node.show(false);
        entry.occluded = false;
        continue;
      }
      const x = (viewport.x + screen.x * viewport.z) * width;
      const y = (viewport.y + screen.y * viewport.w) * height;
      if (x < 0 || x > width || y < 0 || y > height) {
        entry.node.show(false);
        entry.occluded = false;
        continue;
      }
      const occluded = !this.isWorldPointVisible(entry.plotId, this.worldPoint);
      entry.occluded = occluded;
      if (occluded) {
        entry.node.show(false);
        continue;
      }
      entry.x = x;
      entry.y = y;
      entry.distance = distance;
      entry.selected = entry.plotId === this.selectedPlotId;
      this.projected.push(entry);
    }
    this.projected.sort(
      (left, right) => Number(right.selected) - Number(left.selected) || left.distance - right.distance
    );
    this.occupied.length = 0;
    let visible = 0;
    for (const entry of this.projected) {
      const overlaps = !entry.selected && this.occupied.some((other) => intersects(entry, other));
      entry.node.show(!overlaps);
      if (overlaps) continue;
      entry.node.rect(entry.x - LABEL_WIDTH / 2, entry.y - LABEL_HEIGHT, LABEL_WIDTH, LABEL_HEIGHT);
      this.occupied.push(entry);
      visible++;
    }
    this.visibleCount = visible;
  }
}

export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function intersects(left: CropLabelEntry, right: CropLabelEntry): boolean {
  return (
    left.x - LABEL_WIDTH / 2 < right.x + LABEL_WIDTH / 2 &&
    left.x + LABEL_WIDTH / 2 > right.x - LABEL_WIDTH / 2 &&
    left.y - LABEL_HEIGHT < right.y &&
    left.y > right.y - LABEL_HEIGHT
  );
}
