import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertImmutableShowcaseCases,
  assertImmutableShowcaseHashes,
  assertMissingShowcaseBaselineAllowed,
  assertShowcaseBaselineCaseIds,
  commitShowcaseBaselineTransaction,
  resolveShowcaseVisualSelection,
  WATER_SHOWCASE_VISUAL_APPROVED_CASE_IDS,
  WATER_SHOWCASE_VISUAL_CANDIDATE_CASE_IDS
} from "../../e2e/water-showcase-visual-policy.mjs";

const CANDIDATE_CASE_IDS = WATER_SHOWCASE_VISUAL_CANDIDATE_CASE_IDS;
const APPROVED_CASE_IDS = WATER_SHOWCASE_VISUAL_APPROVED_CASE_IDS;

function resolveSelection(overrides: Partial<Parameters<typeof resolveShowcaseVisualSelection>[0]> = {}) {
  return resolveShowcaseVisualSelection({
    mode: "capture",
    caseFilter: "",
    updateReason: "",
    updateApproval: "",
    availableCaseIds: CANDIDATE_CASE_IDS,
    defaultCaseIds: APPROVED_CASE_IDS,
    updateEligibleCaseIds: APPROVED_CASE_IDS,
    ...overrides
  });
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function createManifest(cases: Record<string, unknown>) {
  return { schemaVersion: 1, cases };
}

function createCaseEntry(caseId: string, bytesByState: Readonly<Record<string, Uint8Array>>) {
  return {
    runtime: caseId.includes("grasslands") ? "grasslands" : "river",
    preset: caseId.includes("grasslands") ? "hero-grasslands" : "hero-river",
    states: Object.fromEntries(
      Object.entries(bytesByState).map(([state, bytes]) => [
        state,
        { file: `${caseId}/${state}.png`, sha256: hash(bytes) }
      ])
    )
  };
}

async function validateManifestFiles(manifest: Readonly<Record<string, unknown>>, root: string) {
  const cases = manifest.cases as Record<
    string,
    { states: Record<string, { readonly file: string; readonly sha256: string }> }
  >;
  const hashes: Record<string, Record<string, string>> = {};
  for (const [caseId, caseEntry] of Object.entries(cases)) {
    hashes[caseId] = {};
    for (const [state, entry] of Object.entries(caseEntry.states)) {
      const bytes = await readFile(resolve(root, entry.file));
      const actualHash = hash(bytes);
      if (actualHash !== entry.sha256) throw new Error(`${caseId}/${state} hash mismatch.`);
      hashes[caseId][state] = actualHash;
    }
  }
  return hashes;
}

async function createTemporaryBaseline() {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "water-showcase-visual-policy-"));
  const baselineRoot = resolve(temporaryRoot, "showcases");
  const oldBytes = {
    hero: Buffer.from("old-hero"),
    interaction: Buffer.from("old-interaction"),
    detail: Buffer.from("old-detail")
  };
  const previousManifest = createManifest({
    "showcase-river": createCaseEntry("showcase-river", oldBytes)
  });
  await mkdir(resolve(baselineRoot, "showcase-river"), { recursive: true });
  for (const [state, bytes] of Object.entries(oldBytes)) {
    await writeFile(resolve(baselineRoot, "showcase-river", `${state}.png`), bytes);
  }
  await writeFile(resolve(baselineRoot, "manifest.json"), `${JSON.stringify(previousManifest, null, 2)}\n`);
  return { temporaryRoot, baselineRoot, oldBytes, previousManifest };
}

describe("Water Showcase visual policy", () => {
  it("keeps the default lane on approved Grasslands while allowing an explicit Ocean candidate capture", () => {
    expect(resolveSelection().selectedCaseIds).toEqual(APPROVED_CASE_IDS);
    expect(resolveSelection({ mode: "compare" }).selectedCaseIds).toEqual(APPROVED_CASE_IDS);
    expect(resolveSelection({ caseFilter: "showcase-ocean" }).selectedCaseIds).toEqual(["showcase-ocean"]);
    expect(() => resolveSelection({ caseFilter: "showcase-river" })).toThrow("Unknown Showcase visual case filter");
  });

  it("fails closed when update is unfiltered, multi-case, unreviewed, or has a short reason", () => {
    expect(() => resolveSelection({ mode: "update" })).toThrow("exactly one explicit");
    expect(() =>
      resolveSelection({
        mode: "update",
        caseFilter: "showcase-river,showcase-ocean",
        updateReason: "Approved visual update",
        updateApproval: "approved:showcase-river",
        availableCaseIds: ["showcase-river", "showcase-ocean"],
        defaultCaseIds: ["showcase-river", "showcase-ocean"],
        updateEligibleCaseIds: ["showcase-river", "showcase-ocean"]
      })
    ).toThrow("exactly one explicit");
    expect(() =>
      resolveSelection({
        mode: "update",
        caseFilter: "showcase-ocean",
        updateReason: "Approve Ocean visual update",
        updateApproval: "approved:showcase-ocean"
      })
    ).toThrow("candidate-only");
    expect(() =>
      resolveShowcaseVisualSelection({
        mode: "update",
        caseFilter: "showcase-grasslands-stylized-water",
        updateReason: "Create reviewed Grasslands baseline",
        updateApproval: "approved:showcase-grasslands-stylized-water",
        availableCaseIds: ["showcase-grasslands-stylized-water"]
      })
    ).toThrow("candidate-only");
    expect(() =>
      resolveSelection({
        mode: "update",
        caseFilter: "showcase-grasslands-stylized-water",
        updateReason: "short",
        updateApproval: "approved:showcase-grasslands-stylized-water"
      })
    ).toThrow("at least 12 characters");
    expect(() =>
      resolveSelection({
        mode: "update",
        caseFilter: "showcase-grasslands-stylized-water",
        updateReason: "Create reviewed Grasslands baseline",
        updateApproval: ""
      })
    ).toThrow("after human review");
  });

  it("permits one explicitly reviewed case-scoped update", () => {
    expect(
      resolveSelection({
        mode: "update",
        caseFilter: "showcase-grasslands-stylized-water",
        updateReason: "Create reviewed Grasslands baseline",
        updateApproval: "approved:showcase-grasslands-stylized-water"
      }).selectedCaseIds
    ).toEqual(["showcase-grasslands-stylized-water"]);
  });

  it("accepts only approved Golden cases without requiring the Ocean candidate in the manifest", () => {
    expect(() => assertShowcaseBaselineCaseIds(APPROVED_CASE_IDS, APPROVED_CASE_IDS)).not.toThrow();
    expect(() => assertShowcaseBaselineCaseIds([...APPROVED_CASE_IDS, "showcase-ocean"], APPROVED_CASE_IDS)).toThrow(
      "without Golden approval"
    );
    expect(() => assertShowcaseBaselineCaseIds([], APPROVED_CASE_IDS)).toThrow("missing approved Golden cases");
  });

  it("keeps a missing-case capture non-mutating, rejects compare, and atomically adds an approved update", async () => {
    const fixture = await createTemporaryBaseline();
    try {
      const grasslandsDirectory = resolve(fixture.baselineRoot, "showcase-grasslands-stylized-water");
      expect(assertMissingShowcaseBaselineAllowed("capture", "showcase-grasslands-stylized-water")).toBe("candidate");
      expect(await pathExists(grasslandsDirectory)).toBe(false);
      expect(() => assertMissingShowcaseBaselineAllowed("compare", "showcase-grasslands-stylized-water")).toThrow(
        "no reviewed Showcase baseline"
      );
      expect(await pathExists(grasslandsDirectory)).toBe(false);

      const newBytes = {
        hero: Buffer.from("new-hero"),
        interaction: Buffer.from("new-interaction"),
        detail: Buffer.from("new-detail")
      };
      const nextManifest = createManifest({
        ...(fixture.previousManifest.cases as Record<string, unknown>),
        "showcase-grasslands-stylized-water": createCaseEntry("showcase-grasslands-stylized-water", newBytes)
      });
      const previousHashes = await validateManifestFiles(fixture.previousManifest, fixture.baselineRoot);
      const result = await commitShowcaseBaselineTransaction({
        baselineRoot: fixture.baselineRoot,
        manifest: nextManifest,
        updatedCaseId: "showcase-grasslands-stylized-water",
        files: Object.entries(newBytes).map(([state, bytes]) => ({
          relativePath: `showcase-grasslands-stylized-water/${state}.png`,
          bytes
        })),
        previousHashes,
        validateManifestFilesAtRoot: validateManifestFiles
      });

      expect(result.status).toBe("committed");
      expect(JSON.parse(await readFile(resolve(fixture.baselineRoot, "manifest.json"), "utf8"))).toEqual(nextManifest);
      expect(await validateManifestFiles(nextManifest, fixture.baselineRoot)).toMatchObject(previousHashes);
      for (const [state, bytes] of Object.entries(fixture.oldBytes)) {
        expect(await readFile(resolve(fixture.baselineRoot, "showcase-river", `${state}.png`))).toEqual(bytes);
      }
    } finally {
      await rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rolls back a fault after the commit point and preserves recovery files if rollback also fails", async () => {
    const fixture = await createTemporaryBaseline();
    const newBytes = {
      hero: Buffer.from("new-hero"),
      interaction: Buffer.from("new-interaction"),
      detail: Buffer.from("new-detail")
    };
    const nextManifest = createManifest({
      ...(fixture.previousManifest.cases as Record<string, unknown>),
      "showcase-grasslands-stylized-water": createCaseEntry("showcase-grasslands-stylized-water", newBytes)
    });
    const previousHashes = await validateManifestFiles(fixture.previousManifest, fixture.baselineRoot);
    const transactionInput = {
      baselineRoot: fixture.baselineRoot,
      manifest: nextManifest,
      updatedCaseId: "showcase-grasslands-stylized-water",
      files: Object.entries(newBytes).map(([state, bytes]) => ({
        relativePath: `showcase-grasslands-stylized-water/${state}.png`,
        bytes
      })),
      previousHashes,
      validateManifestFilesAtRoot: validateManifestFiles
    };
    try {
      await expect(
        commitShowcaseBaselineTransaction({
          ...transactionInput,
          onPhase(phase) {
            if (phase === "after-original-move") throw new Error("injected commit fault");
          }
        })
      ).rejects.toThrow("injected commit fault");
      expect(await validateManifestFiles(fixture.previousManifest, fixture.baselineRoot)).toEqual(previousHashes);
      expect(await pathExists(resolve(fixture.baselineRoot, "showcase-grasslands-stylized-water"))).toBe(false);

      let recovery:
        | {
            readonly transactionRoot: string;
            readonly backupRoot: string;
          }
        | undefined;
      try {
        await commitShowcaseBaselineTransaction({
          ...transactionInput,
          onPhase(phase) {
            if (phase === "after-original-move") throw new Error("injected commit fault");
            if (phase === "before-rollback-restore") throw new Error("injected rollback fault");
          }
        });
      } catch (error) {
        recovery = (
          error as {
            readonly recovery?: {
              readonly transactionRoot: string;
              readonly backupRoot: string;
            };
          }
        ).recovery;
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Recovery files are preserved");
      }
      expect(recovery).toBeDefined();
      expect(await pathExists(recovery!.transactionRoot)).toBe(true);
      expect(await pathExists(recovery!.backupRoot)).toBe(true);
      await rename(recovery!.backupRoot, fixture.baselineRoot);
      await rm(recovery!.transactionRoot, { recursive: true, force: true });
      expect(await validateManifestFiles(fixture.previousManifest, fixture.baselineRoot)).toEqual(previousHashes);
    } finally {
      await rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects any manifest or PNG hash mutation outside the selected case", () => {
    const previousManifest = {
      cases: {
        "showcase-river": { states: { hero: { sha256: "a" } } },
        "showcase-ocean": { states: { hero: { sha256: "b" } } }
      }
    };
    const previousHashes = {
      "showcase-river": { hero: "a" },
      "showcase-ocean": { hero: "b" }
    };
    expect(() =>
      assertImmutableShowcaseCases(
        previousManifest,
        {
          cases: {
            ...previousManifest.cases,
            "showcase-grasslands-stylized-water": { states: { hero: { sha256: "c" } } }
          }
        },
        "showcase-grasslands-stylized-water"
      )
    ).not.toThrow();
    expect(() =>
      assertImmutableShowcaseHashes(
        previousHashes,
        {
          ...previousHashes,
          "showcase-grasslands-stylized-water": { hero: "c" }
        },
        "showcase-grasslands-stylized-water"
      )
    ).not.toThrow();
    expect(() =>
      assertImmutableShowcaseCases(
        previousManifest,
        {
          cases: {
            ...previousManifest.cases,
            "showcase-river": { states: { hero: { sha256: "changed" } } }
          }
        },
        "showcase-grasslands-stylized-water"
      )
    ).toThrow("showcase-river");
    expect(() =>
      assertImmutableShowcaseHashes(
        previousHashes,
        { ...previousHashes, "showcase-ocean": { hero: "changed" } },
        "showcase-grasslands-stylized-water"
      )
    ).toThrow("showcase-ocean");
  });
});
