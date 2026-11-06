import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { attachmentFrameDefinition } from "../src/tiny-glade/parts/architecture/BuildingAttachmentFrame";
import { European } from "../src/tiny-glade/parts/architecture/European";
import { attachmentSpecification } from "../src/tiny-glade/parts/architecture/BuildingGenerators";
import { profileShape } from "../src/tiny-glade/runtime/ProfileGeometry";
import { wallMountCurve, wallMountPoint, projectWallMount } from "../src/tiny-glade/runtime/WallMountGeometry";

function fixture() {
  const draft = European.buildHouses({
    id: "house",
    attachments: [
      {
        id: "lamp",
        kind: "wall-lamp",
        type: "wall-lantern",
        host: "wall",
        u: 0.2,
        bottom: 1.7,
        width: 0.3,
        height: 0.4
      }
    ]
  });
  const wall = draft.parts.find((p) => p.type === "wall")!;
  const mount = draft.parts.find((p) => p.support.generator === "attachmentMount")!;
  const point = wallMountPoint(wallMountCurve(profileShape(wall.support.params)), 0.2, 1.7);
  delete mount.support.params.spec.u;
  delete mount.support.params.spec.bottom;
  mount.support.params.point = [0, 0, 0];
  const node = (parent: any, position = new Vector3(), yaw = 0) => {
    const matrix = new Matrix(),
      q = new Quaternion();
    Quaternion.rotationEuler(0, yaw, 0, q);
    Matrix.affineTransformation(new Vector3(1, 1, 1), q, position, matrix);
    return { parent, transform: { position, localMatrix: matrix } };
  };
  const root = node(null, new Vector3(877.123456789, 0, 180.87654321), 0.6925374),
    host = node(root);
  const child = node(host, new Vector3(...point));
  const part = (definition: any, entity: any): any => ({
    get definition() {
      return structuredClone(definition);
    },
    entity,
    relations: draft.relations.filter((r) => r.from.part === definition.id)
  });
  const hostPart = part(wall, host),
    attachment = part(mount, child);
  return { draft, wall, mount, point, root, host, child, hostPart, attachment, node, parts: [hostPart, attachment] };
}
it("preserves a native child mounting point without float32 translation round trips", () => {
  const f = fixture(),
    resolved = attachmentFrameDefinition(f.attachment, f.parts);
  expect(resolved.definition.support.params.point).toEqual(f.point);
  expect(f.mount.support.params.point).toEqual([0, 0, 0]);
  const actual = attachmentSpecification(resolved.definition, profileShape(f.wall.support.params));
  const expected = projectWallMount(wallMountCurve(profileShape(f.wall.support.params)), f.point);
  expect(actual.u).toBe(expected.u);
  expect(actual.bottom).toBe(expected.bottom);
  expect(f.child.transform.localMatrix.elements[13]).not.toBe(f.point[1]);
});
it("keeps existing support coordinates when attachment and host share a node frame", () => {
  const f = fixture();
  f.attachment.entity = f.host;
  f.mount.support.params.point = f.point;
  expect(attachmentFrameDefinition(f.attachment, f.parts).definition).toEqual(f.mount);
});
it("updates mount height from the actual node and strips shared ancestors", () => {
  const f = fixture();
  f.child.transform.position.y += 0.5;
  expect(attachmentFrameDefinition(f.attachment, f.parts).definition.support.params.point).toEqual([
    f.point[0],
    f.point[1] + 0.5,
    f.point[2]
  ]);
  f.root.transform.position.set(90000, 90000, 90000);
  expect(attachmentFrameDefinition(f.attachment, f.parts).definition.support.params.point).toEqual([
    f.point[0],
    f.point[1] + 0.5,
    f.point[2]
  ]);
});
it("resolves sibling translation and canonical host orientation", () => {
  const f = fixture();
  f.host.transform.position.set(5, 0, 7);
  f.child.parent = f.root;
  f.child.transform.position.set(6, 2, 9);
  f.wall.support.params.rectangle.rotation = Math.PI / 2;
  const point = attachmentFrameDefinition(f.attachment, f.parts).definition.support.params.point;
  expect(point[0]).toBeCloseTo(2);
  expect(point[1]).toBe(2);
  expect(point[2]).toBeCloseTo(-1);
});
it("rejects rotated mounting nodes and translated UV mounts rather than ignoring transforms", () => {
  const f = fixture();
  f.child.transform.localMatrix = f.node(null, new Vector3(), 0.2).transform.localMatrix;
  expect(() => attachmentFrameDefinition(f.attachment, f.parts)).toThrow(/translation relative/);
  f.child.transform.localMatrix = new Matrix();
  delete f.mount.support.params.point;
  f.mount.support.params.spec.u = 0.2;
  f.mount.support.params.spec.bottom = 1.7;
  expect(() => attachmentFrameDefinition(f.attachment, f.parts)).toThrow(/UV mounts/);
});
