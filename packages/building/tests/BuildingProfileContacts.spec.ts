import { describe, expect, it } from "vitest";
import {
  planProfileContacts,
  placeProfileContacts,
  type ProfileContactInputs
} from "../src/tiny-glade/runtime/ProfileContacts";
import { publishWallConnectionOwner } from "../src/tiny-glade/runtime/WallConnectionPipeline";
import {
  profileShape,
  profileRoofGeometry,
  publishProfileWall
} from "../src/tiny-glade/runtime/ProfileGeometry";
import { normalizeProfileFootprint, normalizeProfileRoof } from "../src/tiny-glade/runtime/ProfileParameters";
import { profileWallEnvelope } from "../src/tiny-glade/runtime/ConstructionWallEnvelope";
import { isFlatRoofHeight } from "../src/tiny-glade/runtime/RoofMode";

const rectangle = (x: number, angle = 0) => ({ rectangle: { center: [x, 0], size: [8, 6], rotation: angle } });
const cases = [
  { name: "crossing masonry", a: { ...rectangle(0) }, b: { ...rectangle(5, Math.PI / 2) } },
  { name: "crossing timber", a: { ...rectangle(0), material: 1 }, b: { ...rectangle(5, Math.PI / 2), material: 1 } },
  { name: "circular crossing", a: { circle: { center: [0, 0], radius: 4, phase: 0.3 } }, b: { ...rectangle(4, 0.7) } },
  {
    name: "flat-pitched junction",
    a: { ...rectangle(0), height: 5, roof: { height: 0 } },
    b: { ...rectangle(4, Math.PI / 2), height: 3, roof: { height: 0.7 } }
  },
  {
    name: "flat-timber junction",
    a: { ...rectangle(0), height: 5, material: 1, roof: { height: 0 } },
    b: { ...rectangle(4, Math.PI / 2), height: 3, roof: { height: 0.7 } }
  }
];
const terrain = (x: number, z: number) => 0.03 * x - 0.02 * z;
/** Build numerical inputs without publishing or assembling a ConstructionBuilding. */
function contactInputs(parts: Record<string, any>[]): ProfileContactInputs {
  const walls = [],
    roofs = [];
  const slots = new Map<bigint, number>();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i],
      id = BigInt(i + 1),
      seed = 17n;
    const footprint = normalizeProfileFootprint(p.circle ? { circle: p.circle } : { rectangle: p.rectangle });
    const shape = profileShape(footprint),
      parameters = normalizeProfileRoof(p.roof ?? {});
    const profile = publishProfileWall(
      { shape, height: p.height ?? 4, roof: parameters },
      terrain,
      true,
      profileWallEnvelope(footprint)
    );
    const roof = profileRoofGeometry(shape, parameters, profile.topY, profileWallEnvelope(footprint).finishOuter);
    slots.set(id, i);
    walls.push(
      publishWallConnectionOwner(
        {
          id,
          seed,
          shape,
          height: p.height ?? 4,
          elevation: -3.4028234663852886e38,
          material: p.material ?? 0,
          style: 0,
          foundationOffset: 0,
          roof: { height01: parameters.height, flatRoofStyle: parameters.flat_rim }
        },
        terrain,
        isFlatRoofHeight(parameters.height)
          ? { ...profile, top: profile.top.map(() => profile.topY), maxY: profile.topY, maxYGable: profile.topY }
          : profile
      )
    );
    roofs.push({ nativeId: id, seed, slot: i, shape, roof, material: p.material ?? 0, profile });
  }
  return { walls, roofs, slots };
}
describe("support-only contact geometry and placement", () => {
  it.each(cases)("derives contact reservations and units: $name", (fixture) => {
    const parts = [fixture.a, fixture.b];
    const inputs = contactInputs(parts);
    const plan = planProfileContacts(inputs, terrain);
    const actual = placeProfileContacts(plan, inputs);

    expect(plan.connections.candidates.length).toBeGreaterThan(0);
    if (fixture.name.startsWith("flat-")) expect(actual.merlons.groups.length).toBeGreaterThan(0);
    expect("placements" in plan.connections).toBe(false);
    expect("building" in inputs.roofs[0]).toBe(false);
  });
  it("moving and removing a participating support removes its paths and reservations", () => {
    const touching = contactInputs([rectangle(0), rectangle(5, Math.PI / 2)]);
    expect(planProfileContacts(touching, terrain).connections.candidates.length).toBeGreaterThan(0);
    for (const parts of [[rectangle(0), rectangle(50, Math.PI / 2)], [rectangle(0)]]) {
      const inputs = contactInputs(parts),
        result = placeProfileContacts(planProfileContacts(inputs, terrain), inputs);
      expect(result.connections.candidates).toHaveLength(0);
      expect([...result.contactHoles.values()].flat()).toHaveLength(0);
      expect(result.connections.bricks).toHaveLength(0);
    }
  });
  it("rejects missing render ownership rather than encoding a wrong slot", () => {
    const inputs = contactInputs([rectangle(0)]);
    inputs.slots = new Map();
    expect(() => planProfileContacts(inputs, terrain)).toThrow("Missing contact render slot");
  });
});
