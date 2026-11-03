// Development recovery bridge. The algorithms themselves have no Node/Python API.
import { packUnits } from "../runtime/UnitPacking.js";
import { createInterface } from "node:readline";
import { SurfaceProjector } from "../runtime/SurfaceProjector.js";
import { generateCircularRoof, generateRoofClosure } from "../runtime/RecoveredRoofPlacement.ts";
import { generateRectangularRoof } from "../runtime/RecoveredRectangularRoof.ts";
const surfaces = new Map();
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  try {
    const q = JSON.parse(line);
    let result;
    if (q.operation === "roof-layout") {
      if (typeof q.seed !== "string" || !/^(0|[1-9][0-9]*)$/.test(q.seed)) throw Error("Decimal uint64 seed required");
      const generate =
        q.descriptor.type === "native_circular_roof_profile" ? generateCircularRoof : generateRectangularRoof;
      result = generate(q.descriptor, q.footprint, BigInt(q.seed), q.metrics, q.slot);
    } else if (q.operation === "roof-closure") {
      if (typeof q.placement.row_index !== "string" || !/^(0|[1-9][0-9]*)$/.test(q.placement.row_index))
        throw Error("Decimal uint64 row required");
      result = generateRoofClosure({ ...q.placement, row_index: BigInt(q.placement.row_index) });
    } else if (q.operation === "pack") {
      result = Object.fromEntries(
        Object.entries(await packUnits(q.spec)).map(([unit, bytes]) => [unit, Buffer.from(bytes).toString("base64")])
      );
    } else if (q.operation === "prepare") {
      const key = JSON.stringify(q.surface);
      let row = surfaces.get(key);
      if (!row) {
        row = { id: surfaces.size, projector: new SurfaceProjector(q.surface) };
        surfaces.set(key, row);
      }
      result = row.id;
    } else {
      const row = [...surfaces.values()].find((r) => r.id === q.surface);
      if (!row) throw Error("Unknown surface owner");
      if (q.operation === "anchors") result = row.projector.anchors(q.points);
      else if (q.operation === "project") result = q.points.map((p) => row.projector.project(p, q.pieceIndex));
      else throw Error("Unknown kernel operation");
    }
    process.stdout.write(JSON.stringify({ result }) + "\n");
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + "\n");
  }
}
