import { expect, it, vi } from "vitest";
import {
  SeedWorldViewSnapshots,
  createViewAnnotation,
  rasterizeViewRegion,
  type ViewFrame,
  type ViewAnnotation,
  type ViewRegion
} from "../src/world/SeedWorldViewSnapshot";

const polygon: ViewRegion = {
  kind: "polygon",
  points: [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 2 },
    { x: 0, y: 2 }
  ]
};
const annotation: ViewAnnotation = {
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 }
  ],
  width: 0.3, color: "#71e6ff"
};
function fixture() {
  const pixels = [1, 1, 2, 2, 1, 1, 2, 2, 0, 0, 2, 2, 0, 0, 0, 0];
  const refs = [
    { entityId: 10, componentId: 11, componentType: "SkinnedMeshRenderer" },
    { entityId: 20, componentId: 21, componentType: "MeshRenderer" }
  ];
  return {
    image: { texture: {} as import("@galacean/engine").Texture2D, width: 2, height: 2, dispose: vi.fn(),
      export: vi.fn(async (marks: readonly ViewAnnotation[]) => ({ width: 2, height: 2,
        blob: new Blob([JSON.stringify(marks)], { type: "image/jpeg" }) })) }, width: 4, height: 4,
    identities: { identityBits: 14, estimatedPosition: () => undefined,
      byteLength: 64,
      read: vi.fn((x: number, y: number, width: number, height: number) => {
        const out = new Uint8Array(width * height * 4);
        for (let iy = 0; iy < height; iy++) for (let ix = 0; ix < width; ix++)
          out[(iy * width + ix) * 4] = pixels[(y + iy) * 4 + x + ix]!;
        return out;
      }),
      resolve: (id: number) => refs[id - 1], dispose: vi.fn()
    }
  } satisfies ViewFrame;
}

it("never exports during capture, pinning, editing or undo; caches each submitted immutable revision", async () => {
  const frame = fixture(), views = new SeedWorldViewSnapshots(() => frame, () => "a");
  const shot = await views.capture();
  views.setAttachment(shot.snapshotId, [annotation]);
  views.setAttachment(shot.snapshotId, []);
  views.setAttachment(shot.snapshotId, [annotation]);
  expect(frame.image.export).not.toHaveBeenCalled();
  expect(frame.identities.read).not.toHaveBeenCalled();
  expect(views.budget.stats.image).toBe(0);
  const selected = views.acquireAttachments()!;
  expect(frame.image.export).not.toHaveBeenCalled();
  const first = await selected.export();
  const again = await selected.export();
  expect(first[0].image.blob).toBe(again[0].image.blob);
  expect(frame.image.export).toHaveBeenCalledOnce();
  views.acquireImage(first[0].imagePath!).release();
  views.setAttachment(shot.snapshotId, []);
  views.setAttachment(shot.snapshotId, [annotation]);
  const redo = views.acquireAttachments()!;
  expect((await redo.export())[0].imagePath).toBe(first[0].imagePath);
  expect(frame.image.export).toHaveBeenCalledOnce();
  selected.release(); redo.release(); views.dispose();
  expect(frame.image.dispose).toHaveBeenCalledOnce();
  await Promise.resolve(); // Deferred GPU destruction settles before returning its reservation.
  expect(views.budget.stats.total).toBe(0);
});

it("freezes marks at submission and retains textures while an unpinned export is still pending", async () => {
  const frame = fixture(), views = new SeedWorldViewSnapshots(() => frame, () => "a");
  const shot = await views.capture();
  views.setAttachment(shot.snapshotId, [annotation]);
  let resolve!: (image: Awaited<ReturnType<typeof frame.image.export>>) => void;
  frame.image.export.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const selected = views.acquireAttachments()!, pending = selected.export();
  views.setAttachment(shot.snapshotId, []);
  views.removeAttachment(shot.snapshotId);
  views.beginTurn(100);
  expect(frame.image.dispose).not.toHaveBeenCalled();
  resolve({ width: 2, height: 2, blob: new Blob(["first"], {type:"image/jpeg"}) });
  const result = await pending;
  expect(result[0].metadata).not.toHaveProperty("annotations");
  expect(frame.image.export).toHaveBeenCalledWith([annotation]);
  selected.release();
  expect(frame.image.dispose).toHaveBeenCalledOnce();
  await Promise.resolve(); // Deferred GPU destruction settles before returning its reservation.
  expect(views.budget.stats.total).toBe(0);
});

it("releases a cancelled submission after its in-flight export and never resurrects disposed resources", async () => {
  for (const dispose of [false, true]) {
    const frame = fixture(), views = new SeedWorldViewSnapshots(() => frame, () => "a");
    const shot = await views.capture(); views.setAttachment(shot.snapshotId, []);
    let resolve!: (image: Awaited<ReturnType<typeof frame.image.export>>) => void;
    frame.image.export.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const selected = views.acquireAttachments()!, pending = selected.export();
    const assertion = expect(pending).rejects.toThrow();
    views.removeAttachment(shot.snapshotId); selected.release();
    if (dispose) views.dispose();
    resolve({width:2,height:2,blob:new Blob(["late"],{type:"image/jpeg"})});
    await assertion;
    expect(frame.image.dispose).toHaveBeenCalledOnce();
    await Promise.resolve(); // Deferred GPU destruction settles before returning its reservation.
  expect(views.budget.stats.total).toBe(0);
  }
});

it("can retry a failed export without losing the pinned photograph", async () => {
  const frame = fixture(), views = new SeedWorldViewSnapshots(() => frame, () => "a");
  const shot = await views.capture(); views.setAttachment(shot.snapshotId, []);
  frame.image.export.mockRejectedValueOnce(new Error("readback failed"));
  const selected = views.acquireAttachments()!;
  await expect(selected.export()).rejects.toThrow("readback failed");
  expect(frame.image.dispose).not.toHaveBeenCalled();
  expect((await selected.export())[0].image.width).toBe(2);
  selected.release(); views.dispose();
  await Promise.resolve(); // Deferred GPU destruction settles before returning its reservation.
  expect(views.budget.stats.total).toBe(0);
});

async function submission(views: SeedWorldViewSnapshots) {
  const lease = views.acquireAttachments()!;
  const observations = await lease.export();
  for (const observation of observations) expect(observation.metadata).not.toHaveProperty("annotations");
  return { ...lease, observations };
}

it("queries the captured pixels after camera, catalog and world changes, with image-to-buffer mapping", async () => {
  let revision = "a",
    calls = 0;
  const views = new SeedWorldViewSnapshots(
    () => {
      calls++;
      return fixture();
    },
    () => revision
  );
  const { snapshotId } = await views.capture();
  const points = [
    { x: 0.25, y: 0.25 },
    { x: 1.25, y: 0.25 },
    { x: 0.25, y: 1.25 },
    { x: 2, y: 0 }
  ];
  const before = views.hitPoints(snapshotId, points);
  expect(before.hits.map((h) => h.status)).toEqual(["hit", "hit", "no-registered-hit", "outside-image"]);
  expect(before.hits[0]!.hit).toMatchObject({ ref: { entityId: 10 } });
  revision = "b";
  expect(views.hitPoints(snapshotId, points)).toEqual({ ...before, currentScene: false });
  expect(calls).toBe(1);
});
it("enumerates all visible identities, pages without losing counts and filters after visibility", async () => {
  const views = new SeedWorldViewSnapshots(fixture, () => "a"),
    id = (await views.capture()).snapshotId;
  const first = views.queryRegion(id, polygon, undefined, 0, 1);
  expect(first).toMatchObject({
    matchedCount: 2,
    selectedPixels: 16,
    unregisteredPixels: 6,
    complete: false,
    nextOffset: 1
  });
  expect(first.items[0]).toMatchObject({ ref: { entityId: 20 }, visiblePixels: 6 });
  const second = views.queryRegion(id, polygon, undefined, 1, 1);
  expect(second).toMatchObject({ complete: true, items: [{ ref: { entityId: 10 }, visiblePixels: 4 }] });
  expect(views.queryRegion(id, polygon, { componentTypes: ["SkinnedMeshRenderer"] }).items).toEqual(second.items);
  expect(views.queryRegion(id, polygon, { componentTypes: ["UnknownRenderer"] }).matchedCount).toBe(0);
});
it("keeps attachments pinned during task replacement and explicitly expires released observations", async () => {
  const views = new SeedWorldViewSnapshots(fixture, () => "a"),
    id = (await views.capture()).snapshotId;
  views.setAttachment(id, [annotation]);
  const task = await submission(views);
  views.clearAttachments();
  for (let i = 0; i < 4; i++) await views.capture();
  expect(views.hitPoints(id, [{ x: 0, y: 0 }]).hits[0]!.status).toBe("hit");
  expect(task.observations[0]!.imagePath).toContain(id);
  task.release();
  task.release();
  views.beginTurn(3);
  expect(() => views.hitPoints(id, [])).toThrow("SNAPSHOT_EXPIRED");
  views.dispose();
});
it("preserves open, near-closed and closed gestures exactly as freehand marks", async () => {
  for (const points of [
    [
      { x: 20, y: 20 },
      { x: 120, y: 20 },
      { x: 120, y: 120 },
      { x: 20, y: 120 },
      { x: 22, y: 25 }
    ],
    [
      { x: 20, y: 20 },
      { x: 120, y: 20 },
      { x: 120, y: 120 }
    ],
    [{ x: 20, y: 20 }],
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 }
    ]
  ]) {
    const mark = createViewAnnotation(points, 2);
    expect(mark).toEqual({ points, width: 6, color: "#71e6ff" });
    points[0]!.x += 1;
    expect(mark.points[0]!.x).not.toBe(points[0]!.x);
  }
});
it("rasterizes an open stroke as a capsule rather than closing a triangle", async () => {
  const mask = rasterizeViewRegion(
    {
      kind: "stroke",
      points: [
        { x: 2, y: 2 },
        { x: 8, y: 2 },
        { x: 8, y: 8 }
      ],
      radius: 1
    },
    10,
    10,
    10,
    10
  );
  expect(mask[2 * 10 + 5]).toBe(1);
  expect(mask[5 * 10 + 7]).toBe(1);
  expect(mask[4 * 10 + 5]).toBe(0);
  expect(() =>
    rasterizeViewRegion({ kind: "stroke", points: [{ x: NaN, y: 0 }], radius: 1 }, 10, 10, 10, 10)
  ).toThrow();
});

it("rejects oversized local vector history before replacing a usable attachment", async () => {
  const views = new SeedWorldViewSnapshots(fixture, () => "a");
  const id = (await views.capture()).snapshotId;
  views.setAttachment(id, [annotation]);
  const longStroke: ViewAnnotation = {
    width: 1, color: "#ff453a",
    points: Array.from({ length: 5000 }, () => ({ x: 1, y: 1 }))
  };
  expect(() => views.setAttachment(id, [longStroke])).toThrow("65536");
  const task = await submission(views);
  expect(JSON.parse(await task.observations[0]!.image.blob.text())).toEqual([annotation]);
  task.release();
});

it("attaches visual hints without automatically selecting refs or querying a region, even after the world changes", async () => {
  let revision = "a";
  const views = new SeedWorldViewSnapshots(fixture, () => revision);
  const id = (await views.capture()).snapshotId;
  const query = vi.spyOn(views, "queryRegion");
  revision = "b";
  views.setAttachment(id, [annotation]);
  const task = await submission(views);
  expect(query).not.toHaveBeenCalled();
  expect(await task.observations[0]!.image.blob.text()).toBe(JSON.stringify([annotation]));
  expect(task.observations[0]!.metadata).toMatchObject({
    capturedWorldState: "a",
    queryTool: "pick"
  });
  expect(task.observations[0]!.metadata).not.toHaveProperty("items");
  expect(task.observations[0]!.metadata).not.toHaveProperty("region");
  expect(views.hitPoints(id, [{ x: 0, y: 0 }]).hits[0]!.hit!.ref.entityId).toBe(10);
  task.release();
});
it("accepts an unmarked screenshot and retains the original image", async () => {
  const views = new SeedWorldViewSnapshots(fixture, () => "a");
  const id = (await views.capture()).snapshotId;
  views.setAttachment(id, []);
  const task = await submission(views);
  expect(await task.observations[0]!.image.blob.text()).toBe("[]");
  expect(task.observations[0]!.metadata).toMatchObject({ imageAnnotation: "none" });
  task.release();
});

it("retains a captured runtime identity without business classification", async () => {
  const frame = fixture();

  const views = new SeedWorldViewSnapshots(() => frame, () => "same-authoring-state");
  const id = (await views.capture()).snapshotId;
  const hit = views.hitPoints(id, [{ x: 0.25, y: 0.25 }]).hits[0]!.hit!;
  expect(hit.ref).toEqual({ entityId: 10, componentId: 11, componentType: "SkinnedMeshRenderer" });
  expect(views.queryRegion(id, polygon, { componentTypes: ["SkinnedMeshRenderer"] }).items).toEqual([{ ...hit, visiblePixels: 4 }]);
});

it("does not read any identity pixels at capture and coalesces nearby pointers", async () => {
  const frame = fixture(), views = new SeedWorldViewSnapshots(() => frame, () => "a");
  const id = (await views.capture()).snapshotId;
  expect(frame.identities.read).not.toHaveBeenCalled();
  views.hitPoints(id, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  expect(frame.identities.read).toHaveBeenCalledTimes(1);
  views.dispose();
  expect(frame.identities.dispose).toHaveBeenCalledTimes(1);
});
it("disposes evicted GPU frames and refuses to evict screenshots held by running tasks", async () => {
  const frames: ReturnType<typeof fixture>[] = [];
  const capture = vi.fn(() => { const frame = fixture(); frames.push(frame); return frame; });
  const views = new SeedWorldViewSnapshots(capture, () => "a", { memoryLimit: 4 * 72 });
  const old = (await views.capture()).snapshotId;
  await views.capture(); await views.capture();
  expect(frames[0]!.identities.dispose).toHaveBeenCalledTimes(1);
  expect(() => views.hitPoints(old, [])).toThrow("SNAPSHOT_EXPIRED");
  const releases: (() => void)[] = [];
  for (let i = 0; i < 4; i++) releases.push(views.pin((await views.capture()).snapshotId));
  const calls = capture.mock.calls.length;
  await expect(views.capture()).rejects.toThrow("IMAGE_MEMORY_LIMIT");
  expect(capture.mock.calls.length).toBe(calls + 1);
  releases.forEach(release => release());
  views.dispose();
  expect(frames.every(frame => frame.identities.dispose.mock.calls.length === 1)).toBe(true);
});
it("bounds total frozen texture bytes and releases a rejected allocation", async () => {
  const frame = fixture(); frame.identities.byteLength = 9 * 1024 * 1024;
  const views = new SeedWorldViewSnapshots(() => frame, () => "a", { memoryLimit: 8 * 1024 * 1024 });
  await expect(views.capture()).rejects.toThrow("IMAGE_MEMORY_LIMIT");
  expect(frame.identities.dispose).toHaveBeenCalledTimes(1);
});

it("keeps ordered independent photos, edits in place, and pins every submitted image until task completion", async () => {
  const views = new SeedWorldViewSnapshots(fixture, () => "a");
  const first = (await views.capture()).snapshotId;
  views.setAttachment(first, [annotation]);
  const second = (await views.capture()).snapshotId;
  views.setAttachment(second, []);
  const submitted = await submission(views);
  expect(submitted.observations.map(view => view.imagePath!.split("/")[2])).toEqual([first, second]);
  views.setAttachment(first, []);
  const edited = await submission(views);
  expect(edited.observations[0].imagePath).toContain(first);
  expect(JSON.parse(await submitted.observations[0].image.blob.text())).toEqual([annotation]);
  expect(JSON.parse(await edited.observations[0].image.blob.text())).toEqual([]);
  edited.release();
  views.removeAttachment(first);
  views.removeAttachment(second);
  expect(views.acquireAttachments()).toBeUndefined();
  for (let i = 0; i < 4; i++) await views.capture();
  expect(views.hitPoints(first, [{ x: 0, y: 0 }]).hits[0].status).toBe("hit");
  expect(views.hitPoints(second, [{ x: 0, y: 0 }]).hits[0].status).toBe("hit");
  submitted.release(); submitted.release();
  views.beginTurn(3);
  expect(() => views.hitPoints(first, [])).toThrow("SNAPSHOT_EXPIRED");
  expect(() => views.hitPoints(second, [])).toThrow("SNAPSHOT_EXPIRED");
});

it("enforces a shared configurable photo limit without replacing earlier references", async () => {
  const views = new SeedWorldViewSnapshots(fixture, () => "a", { maxPhotos: 4 });
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    const id = (await views.capture()).snapshotId;
    views.setAttachment(id, []);
    ids.push(id);
  }
  const extra = (await views.capture()).snapshotId;
  const releaseExtra = views.pin(extra);
  expect(() => views.setAttachment(extra, [])).toThrow("最多保留 4 张");
  const batch = await submission(views);
  expect(batch.observations.map(view => view.imagePath!.split("/")[2])).toEqual(ids);
  batch.release();
  views.removeAttachment(ids[1]);
  views.setAttachment(extra, []);
  const after = await submission(views);
  expect(after.observations.map(view => view.imagePath!.split("/")[2])).toEqual([ids[0], ids[2], ids[3], extra]);
  after.release(); releaseExtra(); views.dispose();
});


it("retains each stroke color and rejects alpha colors without replacing the attachment", async () => {
  const views = new SeedWorldViewSnapshots(fixture, () => "a");
  const id = (await views.capture()).snapshotId;
  const red = createViewAnnotation([{ x: 1, y: 1 }], 1, "#ff453a");
  const blue = createViewAnnotation([{ x: 0, y: 0 }], 1, "#4285ff");
  views.setAttachment(id, [red, blue]);
  expect(() => createViewAnnotation([{ x: 1, y: 1 }], 1, "#ff453a80")).toThrow("color");
  expect(() => views.setAttachment(id, [{ ...red, color: "rgba(255,0,0,0.5)" }])).toThrow("annotations");
  const task = await submission(views);
  expect(JSON.parse(await task.observations[0].image.blob.text())).toEqual([red, blue]);
  task.release(); views.dispose();
});


it("releases a late frame after cancellation or store disposal", async () => {
  for (const dispose of [false, true]) {
    let deliver!: (frame: ViewFrame) => void;
    const frame = fixture();
    const views = new SeedWorldViewSnapshots(() => new Promise(resolve => { deliver = resolve; }), () => "a");
    const controller = new AbortController();
    const result = views.capture(controller.signal);
    if (dispose) views.dispose(); else controller.abort();
    deliver(frame);
    await expect(result).rejects.toThrow();
    expect(frame.identities.dispose).toHaveBeenCalledTimes(1);
  }
});

it("retains an unpinned photo for two conversation turns, expires on the third, and waits for active leases", async () => {
  const frame = fixture(), views = new SeedWorldViewSnapshots(() => frame, () => "a");
  const shot = await views.capture();
  views.setAttachment(shot.snapshotId, []);
  views.beginTurn(1);
  (await submission(views)).release();
  const task = views.acquireImage(shot.imagePath!);
  views.removeAttachment(shot.snapshotId);
  task.release();
  views.beginTurn(2);
  expect(views.hasImage(shot.imagePath!)).toBe(true);
  views.beginTurn(3);
  expect(views.hasImage(shot.imagePath!)).toBe(true);
  // A task that actually reads the picture refreshes its last-used turn.
  const active = views.acquireImage(shot.imagePath!);
  views.beginTurn(6);
  expect(frame.identities.dispose).not.toHaveBeenCalled();
  active.release();
  expect(frame.identities.dispose).toHaveBeenCalledOnce();
  expect(views.hasImage(shot.imagePath!)).toBe(false);
  await Promise.resolve(); // Deferred GPU destruction settles before returning its reservation.
  expect(views.budget.stats.total).toBe(0);
  expect(() => views.acquireImage(shot.imagePath!)).toThrow(/已过期/);
});

it("retains pinned photos indefinitely and expires untouched unpinned photos exactly at turn +3", async () => {
  const views = new SeedWorldViewSnapshots(fixture, () => "a");
  const first = await views.capture();
  views.setAttachment(first.snapshotId, []);
  views.beginTurn(1);
  (await submission(views)).release();
  views.acquireImage(first.imagePath!).release();
  views.beginTurn(20);
  expect(views.hasImage(first.imagePath!)).toBe(true);
  views.acquireImage(first.imagePath!).release();
  views.removeAttachment(first.snapshotId);
  views.beginTurn(21); views.beginTurn(22);
  expect(views.hasImage(first.imagePath!)).toBe(true);
  views.beginTurn(23);
  expect(views.hasImage(first.imagePath!)).toBe(false);
  await Promise.resolve(); // Deferred GPU destruction settles before returning its reservation.
  expect(views.budget.stats.total).toBe(0);
});

it("versions annotations without rewriting old messages or identity pixels and accounts all binary versions", async () => {
  const frame = fixture(), views = new SeedWorldViewSnapshots(() => frame, () => "a");
  const shot = await views.capture();
  views.setAttachment(shot.snapshotId, [annotation]);
  views.beginTurn(1);
  const first = await submission(views);
  const oldId = first.observations[0].imagePath!;
  views.acquireImage(oldId).release();
  first.release();
  views.setAttachment(shot.snapshotId, [{...annotation,color:"#0000ff"}]);
  const second = await submission(views);
  expect(second.observations[0].imagePath).not.toBe(oldId);
  const old = views.acquireImage(oldId);
  expect(await old.observation.image.blob.text()).toBe(JSON.stringify([annotation]));
  expect(await second.observations[0].image.blob.text()).toBe(JSON.stringify([{...annotation,color:"#0000ff"}]));
  expect(old.observation.imagePath).toContain(shot.snapshotId);
  expect(frame.identities.read).not.toHaveBeenCalled();
  expect(views.budget.stats.image).toBe(first.observations[0].image.blob.size + second.observations[0].image.blob.size);
  old.release(); second.release(); views.removeAttachment(shot.snapshotId);
  views.beginTurn(4);
  await Promise.resolve(); // Deferred GPU destruction settles before returning its reservation.
  expect(views.budget.stats.total).toBe(0);
});

it("Agent snapshot uses the same captured frame and timestamp as user photos", async () => {
  const metadata = { capturedAt: "2026-11-04T09:30:00.000Z", viewer: { position: [1, 2, 3], forward: [0, 0, -1] } };
  const frame = {...fixture(), metadata}, capture = vi.fn(() => frame);
  const views = new SeedWorldViewSnapshots(capture, () => "a");
  const image = await views.snapshot(new AbortController().signal);
  expect(image.metadata).toMatchObject(metadata);
  expect(image.imagePath).toMatch(/^\.ai\/snapshots\//);
  expect(capture).toHaveBeenCalledOnce();
  expect(frame.identities.read).not.toHaveBeenCalled();
  expect(views.pick({file_path:image.imagePath!, points:[{x:0,y:0}]})).toMatchObject({...metadata,hits:[{status:"hit"}]});
  views.dispose(); await Promise.resolve(); expect(views.budget.stats.total).toBe(0);
});

it("bounds local vector history before accepting marks and does not leak leases at its byte limit", async () => {
  const views = new SeedWorldViewSnapshots(() => {
    const frame = fixture();
    frame.image.width = 768; frame.image.height = 432;
    return frame;
  }, () => "a");
  const first = await views.capture();
  views.setAttachment(first.snapshotId, []);
  const second = await views.capture();
  let low = 1, high = 5000;
  while (low < high) {
    const count = Math.ceil((low + high) / 2);
    try {
      views.setAttachment(second.snapshotId, [{ points: Array.from({ length: count }, (_, i) => ({ x: i % 2 ? 700 : 20, y: 50 + i % 200 })), width: 1, color: "#ff0000" }]);
      low = count;
    } catch { high = count - 1; }
  }
  views.setAttachment(second.snapshotId, [{ points: Array.from({ length: low }, (_, i) => ({ x: i % 2 ? 700 : 20, y: 50 + i % 200 })), width: 1, color: "#ff0000" }]);
  let failure: unknown;
  try { views.acquireAttachments()?.release(); } catch (error) { failure = error; }
  views.clearAttachments();
  await Promise.resolve();
  expect({ failure: failure ? String(failure) : null, snapshots: views.resourceStats.snapshots, total: views.budget.stats.total })
    .toEqual({ failure: null, snapshots: [], total: 0 });
});

it("preserves capture pose and time when a stored photo is exported or read again", async () => {
  const metadata = { capturedAt: "2026-11-04T09:30:00.000Z", viewer: { position: [1, 2, 3], forward: [0, 0, -1] } };
  const views = new SeedWorldViewSnapshots(() => ({ ...fixture(), metadata }), () => "a");
  const shot = await views.capture();
  views.setAttachment(shot.snapshotId, []);
  const lease = views.acquireAttachments()!;
  const [observation] = await lease.export();
  expect(observation.metadata).toMatchObject(metadata);
  const reread = views.acquireImage(observation.imagePath!);
  expect(reread.observation.metadata).toMatchObject(metadata);
  reread.release(); lease.release(); views.dispose();
});

it("reclaims only the least recently used unpinned frame and retries after deferred release", async () => {
  const frames: ReturnType<typeof fixture>[] = [];
  const views = new SeedWorldViewSnapshots(() => { const frame = fixture(); frames.push(frame); return frame; }, () => "a", {memoryLimit:140});
  const a = await views.snapshot(new AbortController().signal);
  const b = await views.snapshot(new AbortController().signal);
  views.acquireImage(a.imagePath!).release(); // A was used most recently.
  const c = await views.snapshot(new AbortController().signal);
  expect(views.hasImage(a.imagePath!)).toBe(true);
  expect(views.hasImage(b.imagePath!)).toBe(false);
  expect(views.hasImage(c.imagePath!)).toBe(true);
  expect(frames[0].identities.dispose).not.toHaveBeenCalled();
  expect(frames[1].identities.dispose).toHaveBeenCalledOnce();
  expect(views.budget.stats.total).toBeLessThanOrEqual(140);
  expect(views.budget.stats.peak).toBeLessThanOrEqual(140);
  views.dispose(); await Promise.resolve(); expect(views.budget.stats.total).toBe(0);
});
