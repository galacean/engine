import { type Entity, MathUtil, Vector3 } from "@galacean/engine";
import { FreeControl } from "@galacean/engine-animals/controls/FreeControl";
import { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";

const FIXED_DELTA_TIME = 1 / 60;
const MOVEMENT_SPEED = 30;
const START_DISTANCE = 10;
const END_DISTANCE = 110;
const VALLEY_HALF_PERIOD = 60;
const VALLEY_AMPLITUDE = 8;
const MAX_TERRAIN_PITCH = Math.PI / 6;
const RAD_TO_DEG = 180 / Math.PI;

interface Sample {
  readonly distance: number;
  readonly terrainPitch: number;
  readonly cameraPitch: number;
  readonly error: number;
}

interface Lane {
  readonly name: string;
  readonly color: string;
  readonly inputCanvas: HTMLCanvasElement;
  readonly control: FreeControl;
  readonly position: Vector3;
  readonly forward: Vector3;
  readonly samples: Sample[];
}

const profileChart = requiredElement<HTMLCanvasElement>("profile-chart");
const pitchChart = requiredElement<HTMLCanvasElement>("pitch-chart");
const currentMetrics = requiredElement<HTMLElement>("current-metrics");
const resultMetrics = requiredElement<HTMLElement>("result-metrics");
const restartButton = requiredElement<HTMLButtonElement>("restart");
const pauseButton = requiredElement<HTMLButtonElement>("pause");

let lanes: Lane[] = [];
let running = true;
let completed = false;

restartButton.addEventListener("click", resetSimulation);
pauseButton.addEventListener("click", () => {
  running = !running;
  pauseButton.textContent = running ? "暂停" : "继续";
});

resetSimulation();
requestAnimationFrame(update);

function resetSimulation(): void {
  for (const lane of lanes) {
    lane.control.onDestroy();
    lane.inputCanvas.remove();
  }
  lanes = [createLane("正式成熟方案", "#62ddb0", "current"), createLane("旧 0.3 秒方案", "#ffad66", "legacy")];
  running = true;
  completed = false;
  pauseButton.textContent = "暂停";
  document.body.dataset.reproReady = "true";
  document.body.dataset.reproComplete = "false";
  delete document.body.dataset.currentMaxUphillErrorDegrees;
  draw();
}

function createLane(name: string, color: string, mode: "current" | "legacy"): Lane {
  const inputCanvas = document.createElement("canvas");
  inputCanvas.className = "input-surface";
  inputCanvas.width = 200;
  inputCanvas.height = 100;
  document.body.appendChild(inputCanvas);

  const position = new Vector3(0, 0, -START_DISTANCE);
  const forward = new Vector3(0, 0, -1);
  const entity = {
    engine: {
      inputManager: { pointers: [] },
      canvas: { width: 200, height: 100, _webCanvas: inputCanvas }
    },
    transform: {
      worldPosition: position,
      worldForward: forward,
      setWorldPosition: (x: number, y: number, z: number) => position.set(x, y, z),
      lookAt: (target: Vector3) => forward.copyFrom(target).subtract(position).normalize()
    }
  } as unknown as Entity;

  const control = mode === "current" ? new TerrainNavigationRuntime(entity) : new FreeControl(entity);
  control.rotationSmoothTime = 0;
  control.movementSpeed = MOVEMENT_SPEED;
  if (control instanceof TerrainNavigationRuntime) {
    control.onAwake();
    control.setGroundProvider({ sampleHeightInterpolated: (_worldX, worldZ) => sampleTerrainHeight(-worldZ) });
    control.setGroundCollision(true);
  } else {
    control.floorMock = false;
    control.enableTerrainPitch = true;
    control.terrainPitchMaxOffset = MAX_TERRAIN_PITCH;
    control.terrainPitchSmoothTime = 0.3;
    control.terrainNormalProvider = (outNormal) => {
      const slope = sampleTerrainSlope(-position.z);
      outNormal.set(0, 1, slope).normalize();
      return true;
    };
    control.onAwake();
  }

  // Reproduce the user's action through the real pointer-look path: while on
  // the downhill, drag only pitch until the camera exactly matches the slope.
  const downhillPitch =
    control instanceof TerrainNavigationRuntime
      ? control.getTerrainReferencePitch(position.x, position.z, 0)!
      : sampleTerrainPitch(START_DISTANCE);
  const dragDeltaY = (-downhillPitch / Math.PI) * inputCanvas.height;
  control.handlePointerBeginDrag(1, inputCanvas.width * 0.5, inputCanvas.height * 0.2);
  control.handlePointerDrag(1, inputCanvas.width * 0.5, inputCanvas.height * 0.2 + dragDeltaY);
  control.onLateUpdate(FIXED_DELTA_TIME);
  control.handlePointerEndDrag(1);

  const lane: Lane = { name, color, inputCanvas, control, position, forward, samples: [] };
  recordSample(lane);
  return lane;
}

function update(): void {
  if (running && !completed) {
    for (const lane of lanes) {
      lane.control.applyPlanarMovementInput(0, 1, FIXED_DELTA_TIME);
      lane.control.onLateUpdate(FIXED_DELTA_TIME);
      recordSample(lane);
    }
    if (-lanes[0].position.z >= END_DISTANCE) completeSimulation();
    draw();
  }
  requestAnimationFrame(update);
}

function completeSimulation(): void {
  completed = true;
  running = false;
  pauseButton.textContent = "已完成";
  document.body.dataset.reproComplete = "true";
  const currentLane = lanes[0];
  const maxError = maximumUphillUnderPitch(currentLane);
  document.body.dataset.currentMaxUphillErrorDegrees = maxError.toFixed(3);
}

function recordSample(lane: Lane): void {
  const distance = -lane.position.z;
  const terrainPitch =
    lane.control instanceof TerrainNavigationRuntime
      ? lane.control.getTerrainReferencePitch(lane.position.x, lane.position.z, 0)!
      : sampleTerrainPitch(distance);
  const cameraPitch = Math.asin(MathUtil.clamp(lane.forward.y, -1, 1));
  lane.samples.push({ distance, terrainPitch, cameraPitch, error: cameraPitch - terrainPitch });
}

function draw(): void {
  drawProfile();
  drawPitchChart();
  renderMetrics();
}

function drawProfile(): void {
  const context = requiredContext(profileChart);
  const width = profileChart.width;
  const height = profileChart.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#080d18";
  context.fillRect(0, 0, width, height);

  const xForDistance = (distance: number): number => 42 + ((distance - START_DISTANCE) / (END_DISTANCE - START_DISTANCE)) * (width - 84);
  const yForHeight = (terrainHeight: number): number => height * 0.5 - terrainHeight * 10;

  context.beginPath();
  for (let distance = START_DISTANCE; distance <= END_DISTANCE; distance += 0.5) {
    const x = xForDistance(distance);
    const y = yForHeight(sampleTerrainHeight(distance));
    if (distance === START_DISTANCE) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.lineTo(xForDistance(END_DISTANCE), height - 28);
  context.lineTo(xForDistance(START_DISTANCE), height - 28);
  context.closePath();
  const gradient = context.createLinearGradient(0, 40, 0, height);
  gradient.addColorStop(0, "rgba(92, 169, 120, 0.78)");
  gradient.addColorStop(1, "rgba(33, 77, 52, 0.92)");
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = "#75d79a";
  context.lineWidth = 3;
  context.stroke();

  const currentDistance = -lanes[0].position.z;
  const currentHeight = sampleTerrainHeight(currentDistance);
  const x = xForDistance(currentDistance);
  const y = yForHeight(currentHeight);
  context.strokeStyle = "rgba(255,255,255,0.34)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x, 20);
  context.lineTo(x, height - 24);
  context.stroke();

  lanes.forEach((lane, index) => {
    const latest = lane.samples.at(-1)!;
    const length = 54;
    const offset = index === 0 ? -7 : 7;
    context.strokeStyle = lane.color;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x, y + offset);
    context.lineTo(x + Math.cos(latest.cameraPitch) * length, y + offset - Math.sin(latest.cameraPitch) * length);
    context.stroke();
  });

  context.fillStyle = "#aebbd7";
  context.font = "13px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText("下坡手动对齐", 42, 24);
  context.textAlign = "center";
  context.fillText("谷底", xForDistance(VALLEY_HALF_PERIOD), height - 8);
  context.textAlign = "right";
  context.fillText("上坡", width - 42, 24);
  context.textAlign = "left";
}

function drawPitchChart(): void {
  const context = requiredContext(pitchChart);
  const width = pitchChart.width;
  const height = pitchChart.height;
  const left = 52;
  const right = width - 24;
  const top = 24;
  const bottom = height - 36;
  const minPitch = -26;
  const maxPitch = 26;
  const xForDistance = (distance: number): number => left + ((distance - START_DISTANCE) / (END_DISTANCE - START_DISTANCE)) * (right - left);
  const yForPitch = (pitchDegrees: number): number => bottom - ((pitchDegrees - minPitch) / (maxPitch - minPitch)) * (bottom - top);

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#080d18";
  context.fillRect(0, 0, width, height);
  context.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillStyle = "#72809f";
  context.strokeStyle = "rgba(142,164,216,0.14)";
  context.lineWidth = 1;
  for (let pitch = -20; pitch <= 20; pitch += 10) {
    const y = yForPitch(pitch);
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    context.fillText(`${pitch}°`, 12, y + 4);
  }

  drawLine(context, lanes[0].samples, "#8ea4d8", (sample) => sample.terrainPitch * RAD_TO_DEG, xForDistance, yForPitch);
  for (const lane of lanes) {
    drawLine(context, lane.samples, lane.color, (sample) => sample.cameraPitch * RAD_TO_DEG, xForDistance, yForPitch);
  }
}

function drawLine(
  context: CanvasRenderingContext2D,
  samples: readonly Sample[],
  color: string,
  readPitch: (sample: Sample) => number,
  xForDistance: (distance: number) => number,
  yForPitch: (pitch: number) => number
): void {
  context.beginPath();
  samples.forEach((sample, index) => {
    const x = xForDistance(sample.distance);
    const y = yForPitch(readPitch(sample));
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = color;
  context.lineWidth = 2.5;
  context.stroke();
}

function renderMetrics(): void {
  const currentLane = lanes[0];
  const legacyLane = lanes[1];
  const current = currentLane.samples.at(-1)!;
  const legacy = legacyLane.samples.at(-1)!;
  currentMetrics.innerHTML = metricRows([
    ["距离", `${current.distance.toFixed(1)} m`],
    ["当前地势 pitch", formatDegrees(current.terrainPitch)],
    ["成熟方案相机", formatDegrees(current.cameraPitch)],
    ["旧 0.3 秒相机", formatDegrees(legacy.cameraPitch)],
    ["手动 pitch 输入", current.distance <= START_DISTANCE + 0.01 ? "已对齐" : "无"]
  ]);

  const currentError = maximumUphillUnderPitch(currentLane);
  const legacyError = maximumUphillUnderPitch(legacyLane);
  resultMetrics.innerHTML = metricRows([
    ["成熟方案最大抬头不足", `${currentError.toFixed(2)}°`, currentError > 1 ? "warning" : "good"],
    ["旧方案最大抬头不足", `${legacyError.toFixed(2)}°`, legacyError > 1 ? "warning" : "good"],
    ["成熟方案瞬时误差", `${(current.error * RAD_TO_DEG).toFixed(2)}°`, current.error < -1 ? "warning" : "good"],
    ["测试状态", completed ? "完成" : running ? "运行中" : "已暂停", completed ? "good" : ""]
  ]);
}

function maximumUphillUnderPitch(lane: Lane): number {
  let maximum = 0;
  for (const sample of lane.samples) {
    if (sample.distance <= VALLEY_HALF_PERIOD || sample.terrainPitch <= 0) continue;
    maximum = Math.max(maximum, -sample.error * RAD_TO_DEG);
  }
  return maximum;
}

function metricRows(rows: ReadonlyArray<readonly [string, string, string?]>): string {
  return rows
    .map(([label, value, className]) => `<span>${label}</span><strong class="${className ?? ""}">${value}</strong>`)
    .join("");
}

function sampleTerrainHeight(distance: number): number {
  return VALLEY_AMPLITUDE * Math.cos((Math.PI * distance) / VALLEY_HALF_PERIOD);
}

function sampleTerrainSlope(distance: number): number {
  return (-(VALLEY_AMPLITUDE * Math.PI) / VALLEY_HALF_PERIOD) * Math.sin(
    (Math.PI * distance) / VALLEY_HALF_PERIOD
  );
}

function sampleTerrainPitch(distance: number): number {
  return Math.atan(sampleTerrainSlope(distance));
}

function formatDegrees(radians: number): string {
  return `${(radians * RAD_TO_DEG).toFixed(2)}°`;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

function requiredContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error(`Canvas #${canvas.id} does not expose a 2D context`);
  return context;
}
