import { collectCallEvidence } from "../../../../packages/ai-chat/tests/llm/call-evidence.mjs";
import { Vector3 } from "@galacean/engine";
import type { SeedWorldChatPanel } from "../../../demos/seed-world/assistant/SeedWorldChatPanel";
import { SeedWorldPicker } from "@galacean/engine-world-planning/world/SeedWorldPicker.ts";
import type { AgentViewObservation } from "@galacean/engine-ai-chat/ai-chat/agent-types.ts";
import { decodeViewIdentity } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot.ts";
import type { ViewFrame } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot.ts";
type IndependentFrame = { point(x: number, y: number): unknown; surface(x: number, y: number): unknown; object(x: number, y: number): {kind:string;id:string} | undefined; dispose(): void };

const fixtures = new WeakMap<SeedWorldChatPanel, {
  snapshots: Map<string, IndependentFrame>;
  dispose: () => void;
  errors: string[];
  viewer: { position: number[]; forward: number[] };
  width: number;
  height: number;
  target: { kind: string; id: string };
}>();

/** Independent test snapshot. Neither coordinates nor identities are sent to the model. */
export async function prepareViewPointerFixture(panel: SeedWorldChatPanel, kind: "tree" | "building" = "tree", index = 0) {
  disposeViewPointerFixture(panel);
  const host = panel as unknown as { _options: {
    camera: import("@galacean/engine").Camera;
  }};
  const camera = host._options.camera;
  const application = panel.application as any;
  const context = application._engine._options.readContext();
  const candidate = kind === "tree"
    ? application.selectWorld({ kinds: ["tree"], limit: 1 }).items[0]
    : context.sourcePlan.buildings[index];
  if (!candidate || !application.viewSnapshots) throw new Error(`Real ${kind}/pointer provider unavailable`);
  const targetId = kind === "tree" ? candidate.ref.id : candidate.id;
  let position: number[], lookAt: number[];
  if (kind === "tree") {
    const [x, y, z] = candidate.position;
    position = [x + 5, y + 3, z + 7]; lookAt = [x, y + 2, z];
  } else {
    const { sampleSeedWorldHeight } = await import("@galacean/engine-world-planning/runtime/SeedWorldFields.ts");
    const { x, z } = candidate.center;
    const y = candidate.baseHeight ?? sampleSeedWorldHeight(context.fields, x, z);
    if (!Number.isFinite(y)) throw new Error("Building fixture has no ground height");
    const distance = Math.max(candidate.width, candidate.depth, candidate.height) * 1.7;
    position = [x + distance, y + candidate.height * .8, z + distance];
    lookAt = [x, y + candidate.height * .45, z];
  }
  context.navigation.enabled = false;
  context.orbit.enabled = false;
  camera.entity.transform.setWorldPosition(position[0], position[1], position[2]);
  camera.entity.transform.lookAt(new Vector3(lookAt[0], lookAt[1], lookAt[2]));
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const snapshots = new Map<string, IndependentFrame>();
  const errors: string[] = [];
  const ownedFrames = new Set<IndependentFrame>();
  const views = application.requireViewSnapshots();
  const originalObserve = views.snapshot;
  const closed = new AbortController();
  let restoreCapture: (() => void) | undefined;
  const releaseSnapshots = () => {
    const owned = [...ownedFrames];
    snapshots.clear();
    for (const snapshot of owned) {
      try { snapshot.dispose(); } catch (error) { errors.push(`Snapshot cleanup: ${String(error)}`); }
    }
  };
  const dispose = () => {
    if (closed.signal.aborted) return;
    closed.abort();
    if (views.snapshot === observe) views.snapshot = originalObserve;
    restoreCapture?.();
    releaseSnapshots();
    fixtures.delete(panel);
  };
  // Repeat the identity pass at the exact color-frame boundary, with an independent picker.
  const capture = async (signal: AbortSignal): Promise<AgentViewObservation> => {
    signal.throwIfAborted();
    const prototype = SeedWorldPicker.prototype as any;
    const originalCapture = prototype.captureIdentity;
    let independent: IndependentFrame | undefined;
    const intercepted = function(this: any, ...args: any[]) {
      const [visit, resolve, photo] = args;
      const actual = originalCapture.apply(this, args) as ViewFrame;
      if (this.camera === camera && !signal.aborted) {
        const oracle = new SeedWorldPicker(camera);
        let owned: ViewFrame | undefined;
        try {
          const singleObjects = new Map<number, string | undefined>();
          let projection: {view: number[]; projection: number[]; viewport: number[]; near: number; far: number} | undefined;
          const frozen = owned = originalCapture.call(oracle, (visitor: any) => {
            // Sample inside the capture pass: photo rendering normalizes the viewport.
            const v = camera.viewport;
            projection = {view: Array.from(camera.viewMatrix.elements), projection: Array.from(camera.projectionMatrix.elements),
              viewport: [v.x, v.y, v.z, v.w], near: camera.nearClipPlane, far: camera.farClipPlane};
            visit(visitor);
          }, (batch: any) => {
            const ref = resolve(batch);
            if (batch.count === 1) singleObjects.set(ref.componentId, batch.resolve(0));
            return ref;
          }, photo) as ViewFrame;
          const pixels = frozen.identities.read(0, 0, frozen.width, frozen.height);
          independent?.dispose();
          let released = false;
          const retained: IndependentFrame = {
            point(x, y) {
              if (x < 0 || y < 0 || x >= frozen.width || y >= frozen.height) return undefined;
              const i = (Math.floor(y) * frozen.width + Math.floor(x)) * 4;
              return frozen.identities.resolve(decodeViewIdentity(pixels, i, frozen.identities.identityBits));
            },
            surface(x, y) {
              if (!projection || x < 0 || y < 0 || x >= frozen.width || y >= frozen.height) return null;
              const offset = (Math.floor(y) * frozen.width + Math.floor(x)) * 4;
              return {...projection, width: frozen.width, height: frozen.height,
                identityBits: frozen.identities.identityBits, pixel: Array.from(pixels.subarray(offset, offset + 4))};
            },
            object(x, y) {
              const ref = this.point(x, y) as any;
              if (!ref) return;
              const key = ref.instanceKey ?? singleObjects.get(ref.componentId);
              const direct = key && application.resolvePickedObject(key)?.ref;
              if (direct) return {kind:direct.kind,id:direct.id};
              // Ordinary renderer descendants can belong to a host world object.
              for (let id = ref.entityId; id;) {
                const entity = application.runtimeInspection.inspectEntity(id).entity;
                if (!entity) break;
                const owner = application.resolvePickedObject(entity.name)?.ref;
                if (owner) return {kind:owner.kind,id:owner.id};
                id = entity.parentId;
              }
            }, dispose() {
              if (released) return;
              released = true; ownedFrames.delete(retained);
              frozen.identities.dispose();
            }
          };
          independent = retained; ownedFrames.add(retained);
          owned = undefined; // Ownership transferred to the independent frame.
        } catch (error) { errors.push(String(error)); }
        finally { try { owned?.identities.dispose(); } finally { oracle.dispose(); } }
      }
      return actual;
    };
    prototype.captureIdentity = intercepted;
    const restore = () => { if (prototype.captureIdentity === intercepted) prototype.captureIdentity = originalCapture; };
    restoreCapture = restore;
    const onAbort = () => {
      restore();
      try { independent?.dispose(); } catch (error) { errors.push(`Cancelled snapshot cleanup: ${String(error)}`); }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const observation = await originalObserve.call(views, signal);
      signal.throwIfAborted();
      if (independent) snapshots.set(observation.imagePath!, independent);
      return observation;
    } catch (error) { independent?.dispose(); throw error; }
    finally { signal.removeEventListener("abort", onAbort); restore(); if (restoreCapture === restore) restoreCapture = undefined; }
  };
  // One fixture owns one interception at a time, including asynchronous photo export.
  let pending: Promise<unknown> = Promise.resolve();
  const observe = (signal: AbortSignal): Promise<AgentViewObservation> => {
    const combined = AbortSignal.any([signal, closed.signal]);
    const result = pending.then(() => capture(combined));
    pending = result.catch(() => {});
    return result;
  };
  try {
    const initial = await observe(new AbortController().signal);
    const size = { width: initial.image.width, height: initial.image.height };
    const snapshot = snapshots.get(initial.imagePath!);
    let visible = false;
    try {
      if (!snapshot) throw new Error("Independent pointer snapshot missing");
      for (let py = 0; py < size.height && !visible; py += 4)
        for (let px = 0; px < size.width; px += 4)
          if (snapshot.object(px, py)?.id === targetId) { visible = true; break; }
    } finally { releaseSnapshots(); }
    if (!visible) throw new Error(`Fixture ${kind} is not visible`);
    const resolved = application.resolvePickedObject(targetId);
    if (resolved?.ref?.kind !== kind) throw new Error(`Fixture ${kind} has inconsistent query identity`);
    views.snapshot = observe;
    fixtures.set(panel, { snapshots, dispose, errors, ...size,
      target: { kind, id: targetId },
      viewer: { position: [camera.entity.transform.worldPosition.x, camera.entity.transform.worldPosition.y, camera.entity.transform.worldPosition.z], forward: [camera.entity.transform.worldForward.x, camera.entity.transform.worldForward.y, camera.entity.transform.worldForward.z] } });
  } catch (error) { dispose(); throw error; }
}

/** Idempotent teardown also used by the runner when observation/setup fails. */
export function disposeViewPointerFixture(panel: SeedWorldChatPanel): void {
  fixtures.get(panel)?.dispose();
}

export function captureSnapshotPointer(panel: SeedWorldChatPanel, phase: "before" | "after") {
  const fixture = fixtures.get(panel);
  if (!fixture) throw new Error("Pointer fixture missing");
  const base = { width: fixture.width, height: fixture.height, viewer: fixture.viewer,
    target: fixture.target,
    resources: panel.application.requireViewSnapshots().resourceStats };
  if (phase === "before") return { ...base, samples: [], errors: [...fixture.errors] };
  let samples: any[] = [];
  try {
    const trace = panel.debug.getCurrentTrace?.() ?? panel.debug.getLastTrace();
    if (!trace) throw new Error("Task trace missing");
    const evidence = collectCallEvidence(trace);
    samples = evidence.exchanges.filter(record => record.call.function.name === "pick").map(record => {
      const identity = { invocationKey: record.key, callId: record.call.id };
      try {
        if (!record.complete) throw new Error(record.errors.join("; "));
        const args = JSON.parse(record.call.function.arguments);
        if (!args || typeof args.file_path !== "string" || !Array.isArray(args.points) || !args.points.length ||
          !args.points.every((point: any) => point && Number.isFinite(point.x) && Number.isFinite(point.y)))
          throw new Error("Point-pick arguments are invalid or unsupported by this scenario");
        const snapshot = fixture.snapshots.get(args.file_path);
        if (!snapshot) throw new Error("Independent observation snapshot missing");
        return { ...identity, file_path: args.file_path, points: args.points,
          expected: args.points.map((point: any) => snapshot.point(point.x, point.y) ?? null),
          surfaces: args.points.map((point: any) => snapshot.surface(point.x, point.y)),
          objects: args.points.map((point: any) => snapshot.object(point.x, point.y)) };
      } catch (error) { return { ...identity, error: String(error) }; }
    });
  } catch (error) { fixture.errors.push(String(error)); }
  finally { fixture.dispose(); }
  return { ...base, samples, errors: [...fixture.errors] };
}
