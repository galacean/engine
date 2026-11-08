import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { ConstructionDecorationSpec } from "../src/building/runtime/ConstructionDecorations";
import { planProfileDecorations } from "../src/building/runtime/ProfileDecorations";
import {
  profileShape,
  profileRoofGeometry,
  publishProfileWall
} from "../src/building/runtime/ProfileGeometry";
import { profileWallEnvelope } from "../src/building/runtime/ConstructionWallEnvelope";
import { normalizeProfileFootprint, normalizeProfileRoof } from "../src/building/runtime/ProfileParameters";
import { constructionDecorationRecipe } from "../src/building/runtime/ConstructionDecorationRecipe";
import { constructionGeometry } from "./fixtures/constructionGeometry";

const digest = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(v, (_, v) => (typeof v === "bigint" ? String(v) : v)))
    .digest("hex");
describe("attachment algorithms consume resolved surfaces", () => {
  for (const type of ["dormer-cottage", "dormer-gothic", "dormer-cottage-half", "dormer-gothic-half"])
    for (const circle of [false, true])
      for (const rank of [1, 2, 3] as const)
        it(`${type} ${circle ? "circle" : "rectangle"} rank ${rank} publishes resolved openings`, () => {
          const footprint = normalizeProfileFootprint(
            circle
              ? { circle: { center: [0, 0], radius: 5, phase: 0 } }
              : { rectangle: { center: [0, 0], size: [10, 8], rotation: 0 } }
          );
          const parameters = normalizeProfileRoof({
            height: 0.9,
            ridge_length: 0.35,
            profile: 0.7,
            ridge_direction: 0,
            tip: [0, 0]
          });
          const shape = profileShape(footprint),
            wallEnvelope = profileWallEnvelope(footprint);
          const profile = publishProfileWall({ shape, height: 5, roof: parameters }, () => 0, false, wallEnvelope);
          const owner = {
            id: "host",
            seed: 17,
            wallMaterial: 0,
            woodColor: 2,
            roof: profileRoofGeometry(shape, parameters, profile.topY, wallEnvelope.finishOuter),
            wallEnvelope
          };
          const recipe = constructionDecorationRecipe(constructionGeometry.decorations, type, rank)!;
          const half = type.endsWith("-half");
          const spec: ConstructionDecorationSpec = {
            id: "opening",
            kind: "window",
            type,
            rank,
            host: half ? "wall" : "roof",
            ...(half ? { u: circle ? 0 : 1 / 9 } : { uv: [0.02, 0.5] }),
            bottom: half ? profile.topY - 0.2 + recipe.bounds.min[1] : 0,
            width: recipe.installationSize[0],
            height: recipe.installationSize[1]
          };
          const packing = { wallSlot: 7, seed: 1, assets: constructionGeometry };
          const before = digest({ owner, profile, spec });
          const { arches, mounts, dormerRoofs, ...actual } = planProfileDecorations(
            owner,
            shape,
            profile,
            [spec],
            [],
            packing
          );

          expect(arches).toEqual([]);
          expect(mounts).toHaveLength(1);
          expect(dormerRoofs).toHaveLength(1);
          expect(actual.parts).toEqual([]);
          expect(actual.roofUnits).toEqual([]);
          expect(actual.roofOpenings).toHaveLength(type === "dormer-cottage" ? rank : 1);
          expect(actual.diagnostics).toEqual([]);

          expect(digest({ owner, profile, spec })).toBe(before);
        });
});
