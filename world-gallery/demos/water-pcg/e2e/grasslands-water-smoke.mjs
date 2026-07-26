import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import {
  assertAcceptance,
  assertCanvasHealthy,
  assertCaseIdentity,
  assertNoPageErrors,
  assertRuntimeHealthy,
  collectNonFinite,
  collectPageDiagnostics,
  collectWebGlEnvironment,
  createRunContext,
  DEFAULT_WATER_PCG_URL,
  readCanvasProbe,
  readCaseSnapshot,
  readGitEvidence,
  serializeError,
  SOFTWARE_RENDERER_PATTERN,
  summarizeCanvasProbe,
  waitForAnimationFrames,
  waitForCaseReady,
  WORLD_GALLERY_ROOT,
  writeAcceptanceReport
} from "./water-acceptance-harness.mjs";

const GATE = "grasslands-water-smoke";
const CASE_DEFINITION = Object.freeze({
  id: "showcase-grasslands-stylized-water",
  group: "developer",
  runtime: "grasslands",
  preset: "hero-grasslands"
});
const VIEWPORT = Object.freeze({ width: 1340, height: 662 });
const DEVICE_SCALE_FACTOR = 1;
const FIXED_SURFACE_TIME = 12.5;
const FIXED_SEED = 20260724;
const ALTERNATE_SEED = 20260725;
const ALTERNATE_SEED_RUNS = 2;
const FRESH_DETERMINISM_RUNS = 3;
const LIFECYCLE_ROUNDS = 10;
const LIFECYCLE_STABLE_FRAMES = 300;
const QUALITY_ROUNDS = 10;
const LONG_STABILITY_FRAMES = 600;
const EXPECTED = Object.freeze({
  descriptorHash: "9b1d092e9384d794",
  appearanceHash: "b137ea12b87e0af0",
  fixtureHash: "9d863296d9ed7303",
  normalAssetId: "grasslands-water-normal-1024",
  normalContentHash: "0d9bfdded6d8c46cff4afe145cf052ec31f079ae03d89b73599ccb7807c02332"
});
const headed = process.env.WATER_PCG_HEADED === "1";
const diagnosticMode = process.env.GRASSLANDS_WATER_DIAGNOSTIC === "1";
const baseUrl = process.env.WATER_PCG_URL?.trim() || DEFAULT_WATER_PCG_URL;
const REPOSITORY_ROOT = resolve(WORLD_GALLERY_ROOT, "..");
const GRASSLANDS_MAIN_PATH = resolve(WORLD_GALLERY_ROOT, "demos/water-pcg/demo/grasslands/main.ts");
const GRASSLANDS_MAIN_REPOSITORY_PATH = "world-gallery/demos/water-pcg/demo/grasslands/main.ts";
const LIFECYCLE_JOURNAL_KEY = "water-pcg-grasslands-last-dispose";
const FORMAL_EXCLUSION_EVIDENCE_PATH = "snapshot.exclusionResources";
const missingFormalFields = new Set();
const runEnvironment = { ...process.env };
if (process.env.GRASSLANDS_WATER_SMOKE_OUTPUT_DIR?.trim()) {
  runEnvironment.WATER_PCG_ACCEPTANCE_OUTPUT_DIR = process.env.GRASSLANDS_WATER_SMOKE_OUTPUT_DIR.trim();
}
const run = createRunContext(GATE, runEnvironment);

function runGit(args) {
  return execFileSync("git", args, { cwd: REPOSITORY_ROOT, encoding: "utf8" }).trim();
}

function readFullGitEvidence() {
  try {
    return {
      root: runGit(["rev-parse", "--show-toplevel"]),
      head: runGit(["rev-parse", "HEAD"]),
      branch: runGit(["branch", "--show-current"]) || "detached",
      fullRepositoryStatus: runGit(["status", "--porcelain=v1", "--untracked-files=all"]),
      waterPcgStatus: runGit([
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        "world-gallery/demos/water-pcg"
      ])
    };
  } catch (error) {
    return { status: "unavailable", error: serializeError(error) };
  }
}

function collectSourceMatches(source, pattern) {
  return Array.from(source.matchAll(pattern), (match) => ({
    line: source.slice(0, match.index).split("\n").length,
    match: match[0]
  }));
}

function readGrasslandsMainSourceEvidence(head) {
  const source = readFileSync(GRASSLANDS_MAIN_PATH, "utf8");
  const checks = {
    waterWorldIdentifier: collectSourceMatches(source, /\bWaterWorld\b/gu),
    waterWorldImport: collectSourceMatches(
      source,
      /\bimport\s+(?:type\s+)?(?:WaterWorld\b|\{[^}]*\bWaterWorld\b[^}]*\}\s+from\b)/gu
    ),
    waterWorldConstructor: collectSourceMatches(source, /\bnew\s+WaterWorld\s*\(/gu),
    gameplayRegistrationCall: collectSourceMatches(
      source,
      /(?:\??\.\s*|\[\s*["'])(?:register|unregister|registerBody|unregisterBody)(?:\s*["']\s*\])?\s*\(/gu
    )
  };
  return {
    repositoryPath: GRASSLANDS_MAIN_REPOSITORY_PATH,
    absolutePath: GRASSLANDS_MAIN_PATH,
    head,
    sha256: createHash("sha256").update(source).digest("hex"),
    byteLength: Buffer.byteLength(source),
    lineCount: source.split("\n").length,
    checks,
    cleanBoundary:
      checks.waterWorldIdentifier.length === 0 &&
      checks.waterWorldImport.length === 0 &&
      checks.waterWorldConstructor.length === 0 &&
      checks.gameplayRegistrationCall.length === 0
  };
}

function assertGrasslandsMainSourceBoundary(evidence, label) {
  assertAcceptance(
    evidence.cleanBoundary === true,
    `${label} imports, constructs, references, or registers a gameplay WaterWorld.`,
    evidence
  );
}

function readServerProvenance() {
  const url = new URL(baseUrl);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  assertAcceptance(url.protocol === "http:", `Formal source URL must use local HTTP, received '${url.protocol}'.`);
  assertAcceptance(allowedHosts.has(url.hostname), `Formal source URL must be localhost, received '${url.hostname}'.`);
  const port = Number(url.port || 80);
  assertAcceptance(Number.isInteger(port) && port > 0 && port <= 65_535, `Invalid local Vite port '${url.port}'.`);
  const listenerOutput = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8"
  }).trim();
  const listenerPids = [...new Set(listenerOutput.split(/\s+/).filter(Boolean))];
  assertAcceptance(listenerPids.length === 1, `Expected one Vite listener on port ${port}.`, { listenerPids });
  const pid = listenerPids[0];
  const cwdOutput = execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], {
    encoding: "utf8"
  });
  const cwd = cwdOutput
    .split(/\r?\n/)
    .find((line) => line.startsWith("n"))
    ?.slice(1);
  const command = execFileSync("ps", ["-p", pid, "-o", "command="], { encoding: "utf8" }).trim();
  assertAcceptance(cwd === WORLD_GALLERY_ROOT, `Port ${port} is served from '${cwd}', not '${WORLD_GALLERY_ROOT}'.`, {
    pid,
    cwd,
    command
  });
  assertAcceptance(/\bvite(?:\.js)?\b/i.test(command), `Port ${port} listener is not a Vite process.`, {
    pid,
    cwd,
    command
  });
  assertAcceptance(
    new RegExp(`(?:--port(?:=|\\s+)|:)${port}(?:\\s|$)`).test(command),
    `Vite listener command does not prove port ${port}.`,
    { pid, cwd, command }
  );
  return {
    url: url.href,
    protocol: url.protocol,
    hostname: url.hostname,
    port,
    pid: Number(pid),
    cwd,
    command
  };
}

function createGrasslandsUrl(fixed, options = {}) {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = CASE_DEFINITION.id;
  url.searchParams.set("quality", "high");
  url.searchParams.set("surfaceTime", String(FIXED_SURFACE_TIME));
  url.searchParams.set("seed", String(options.seed ?? FIXED_SEED));
  url.searchParams.set("stats", "0");
  url.searchParams.set("tour", "0");
  if (options.normalSource) url.searchParams.set("normalSource", options.normalSource);
  if (options.developmentLocalOverride) url.searchParams.set("developmentLocalOverride", "1");
  if (fixed) url.searchParams.set("acceptance", "1");
  return url;
}

function distance(left, right) {
  return Math.hypot(...left.map((value, axis) => value - right[axis]));
}

function assertDeepEqual(actual, expected, message) {
  assertAcceptance(JSON.stringify(actual) === JSON.stringify(expected), message, { actual, expected });
}

function assertNativeWebGl(webgl, label) {
  assertAcceptance(webgl.graphicsApi === "webgl2", `${label} did not create a WebGL2 context.`, webgl);
  assertAcceptance(webgl.contextLost === false, `${label} WebGL context is lost.`, webgl);
  assertAcceptance(
    webgl.contextLossEventCount === 0,
    `${label} observed ${webgl.contextLossEventCount} WebGL context-loss events.`,
    webgl
  );
  assertAcceptance(
    typeof webgl.unmaskedRenderer === "string" && webgl.unmaskedRenderer.trim().length > 0,
    `${label} exposed no unmasked renderer evidence.`,
    webgl
  );
  const rendererEvidence = `${webgl.unmaskedRenderer} ${webgl.renderer ?? ""}`.trim();
  assertAcceptance(
    !SOFTWARE_RENDERER_PATTERN.test(rendererEvidence),
    `${label} resolved a software renderer: ${rendererEvidence}.`,
    webgl
  );
}

function assertDisplayEnvironment(display, label) {
  assertAcceptance(
    display.innerWidth === VIEWPORT.width && display.innerHeight === VIEWPORT.height,
    `${label} viewport is ${display.innerWidth}×${display.innerHeight}, expected ${VIEWPORT.width}×${VIEWPORT.height}.`,
    display
  );
  assertAcceptance(
    display.devicePixelRatio === DEVICE_SCALE_FACTOR,
    `${label} DPR is ${display.devicePixelRatio}, expected ${DEVICE_SCALE_FACTOR}.`,
    display
  );
  assertAcceptance(
    display.canvasWidth === VIEWPORT.width * DEVICE_SCALE_FACTOR &&
      display.canvasHeight === VIEWPORT.height * DEVICE_SCALE_FACTOR &&
      display.canvasClientWidth === VIEWPORT.width &&
      display.canvasClientHeight === VIEWPORT.height &&
      display.canvasRectWidth === VIEWPORT.width &&
      display.canvasRectHeight === VIEWPORT.height,
    `${label} canvas backing/client/rect dimensions do not match the frozen viewport and DPR.`,
    display
  );
}

function readFormalExclusionEvidence(snapshot) {
  const evidence = snapshot.exclusionResources;
  if (
    evidence?.source !== "runtime-observed" ||
    !Number.isInteger(evidence.cameraComponentCount) ||
    !Number.isInteger(evidence.directLightComponentCount) ||
    !Number.isInteger(evidence.skyboxCount) ||
    !Number.isInteger(evidence.planarCameraCount) ||
    !Number.isInteger(evidence.reflectionProbeCount) ||
    !Number.isInteger(evidence.renderTargetCount)
  ) {
    return null;
  }
  return evidence;
}

function assertStrictHappyPath(snapshot, label, options = {}) {
  const expectedSeed = options.expectedSeed ?? FIXED_SEED;
  const expectedFixtureHash = Object.hasOwn(options, "expectedFixtureHash")
    ? options.expectedFixtureHash
    : EXPECTED.fixtureHash;
  assertAcceptance(snapshot, `${label} did not expose a Grasslands acceptance snapshot.`);
  assertAcceptance(snapshot.phase === "ready", `${label} phase is '${snapshot.phase}', expected 'ready'.`, snapshot);
  assertAcceptance(snapshot.ready === true, `${label} is not ready.`, snapshot);
  assertAcceptance(snapshot.strictMaterialReady === true, `${label} strict material lane is not ready.`, snapshot);
  assertAcceptance(snapshot.finite === true, `${label} is not finite.`, snapshot);
  assertAcceptance(snapshot.runtimeError === null, `${label} reported '${snapshot.runtimeError}'.`, snapshot);
  assertAcceptance(snapshot.disposed === false, `${label} is already disposed.`, snapshot);
  assertAcceptance(snapshot.caseId === CASE_DEFINITION.id, `${label} caseId is '${snapshot.caseId}'.`, snapshot);
  assertAcceptance(snapshot.runtime === "grasslands", `${label} runtime is '${snapshot.runtime}'.`, snapshot);
  assertAcceptance(snapshot.preset === "hero-grasslands", `${label} preset is '${snapshot.preset}'.`, snapshot);
  assertAcceptance(snapshot.waterBodyType === "heightfield", `${label} waterBodyType is '${snapshot.waterBodyType}'.`);
  assertAcceptance(snapshot.seed === expectedSeed, `${label} seed is ${snapshot.seed}, expected ${expectedSeed}.`);
  assertAcceptance(snapshot.surfaceTime === FIXED_SURFACE_TIME, `${label} surfaceTime is ${snapshot.surfaceTime}.`);
  assertAcceptance(snapshot.qualityTier === "high", `${label} quality is '${snapshot.qualityTier}'.`, snapshot);
  assertAcceptance(snapshot.opticsTier === "high", `${label} optics tier is '${snapshot.opticsTier}'.`, snapshot);
  assertAcceptance(snapshot.captureState === "hero", `${label} capture state is '${snapshot.captureState}'.`);
  assertAcceptance(snapshot.requestedDebugMode === 0, `${label} did not request Final debug output.`);
  assertAcceptance(snapshot.effectiveDebugMode === 0, `${label} did not resolve Final debug output.`);
  assertAcceptance(snapshot.descriptorSchema === 1, `${label} descriptor schema is ${snapshot.descriptorSchema}.`);
  assertAcceptance(
    snapshot.descriptorHash === EXPECTED.descriptorHash,
    `${label} descriptor hash drifted to '${snapshot.descriptorHash}'.`
  );
  assertAcceptance(
    snapshot.appearanceHash === EXPECTED.appearanceHash,
    `${label} appearance hash drifted to '${snapshot.appearanceHash}'.`
  );
  if (expectedFixtureHash) {
    assertAcceptance(
      snapshot.fixtureHash === expectedFixtureHash,
      `${label} fixture hash drifted to '${snapshot.fixtureHash}'.`
    );
  } else {
    assertAcceptance(
      typeof snapshot.fixtureHash === "string" &&
        snapshot.fixtureHash.length > 0 &&
        snapshot.fixtureHash !== EXPECTED.fixtureHash,
      `${label} alternate-seed fixture hash did not change.`,
      snapshot
    );
  }
  assertAcceptance(
    snapshot.externalAssetHash === EXPECTED.normalContentHash,
    `${label} fixture asset hash drifted to '${snapshot.externalAssetHash}'.`
  );
  assertAcceptance(snapshot.wetTexelCount === 160 * 96, `${label} wet texel count is ${snapshot.wetTexelCount}.`);
  assertDeepEqual(snapshot.captureViewport, [VIEWPORT.width, VIEWPORT.height], `${label} capture viewport drifted.`);

  assertAcceptance(snapshot.normal.requested === true, `${label} did not request its external normal.`);
  assertAcceptance(snapshot.normal.active === true, `${label} external normal is not active.`, snapshot.normal);
  assertAcceptance(snapshot.normal.source === "tracked", `${label} did not use the tracked normal.`, snapshot.normal);
  assertAcceptance(snapshot.normal.assetId === EXPECTED.normalAssetId, `${label} normal asset ID drifted.`);
  assertAcceptance(snapshot.normal.contentHash === EXPECTED.normalContentHash, `${label} normal hash drifted.`);
  assertAcceptance(
    snapshot.normal.expectedContentHash === EXPECTED.normalContentHash,
    `${label} expected normal hash drifted.`
  );
  assertAcceptance(snapshot.normal.width === 1024 && snapshot.normal.height === 1024, `${label} normal is not 1024².`);
  assertAcceptance(snapshot.normal.colorSpace === "linear", `${label} normal is not linear data.`);
  assertAcceptance(
    snapshot.normal.wrapU === "repeat" && snapshot.normal.wrapV === "repeat",
    `${label} normal is not Repeat/Repeat.`
  );
  assertAcceptance(snapshot.normal.filter === "bilinear", `${label} normal is not Bilinear.`);
  assertAcceptance(snapshot.normal.mipmaps === true, `${label} normal mipmaps are disabled.`);
  assertAcceptance(snapshot.normal.anisotropy === 1, `${label} normal anisotropy is ${snapshot.normal.anisotropy}.`);
  assertAcceptance(snapshot.normal.flipGreen === false, `${label} unexpectedly flips the normal green channel.`);
  assertAcceptance(snapshot.normal.layerCount === 2, `${label} normal layer count is ${snapshot.normal.layerCount}.`);
  assertAcceptance(snapshot.normal.tiling === 0.05, `${label} normal tiling is ${snapshot.normal.tiling}.`);
  assertAcceptance(
    snapshot.normal.scrollUvPerSecond === 0.02,
    `${label} normal scroll is ${snapshot.normal.scrollUvPerSecond}.`
  );
  assertAcceptance(snapshot.normal.strength === 0.2, `${label} normal strength is ${snapshot.normal.strength}.`);
  assertAcceptance(snapshot.normal.ownership === "borrowed", `${label} normal is not borrowed.`);
  assertAcceptance(
    snapshot.normal.fallbackReason === null,
    `${label} normal fallback is '${snapshot.normal.fallbackReason}'.`
  );

  assertAcceptance(snapshot.appearanceEnabled === true, `${label} Appearance is disabled.`);
  assertAcceptance(snapshot.appearance.requested === true, `${label} Appearance was not requested.`);
  assertAcceptance(snapshot.appearance.active === true, `${label} Appearance is not active.`);
  assertAcceptance(snapshot.appearance.enabled === true, `${label} Appearance readback is disabled.`);
  assertAcceptance(snapshot.appearance.assetId === snapshot.appearanceAssetId, `${label} Appearance ID mismatch.`);
  assertAcceptance(
    snapshot.appearance.appearanceHash === EXPECTED.appearanceHash,
    `${label} Appearance readback hash drifted.`
  );
  assertAcceptance(snapshot.appearance.variantKey === "surface-appearance-v1", `${label} Appearance variant drifted.`);
  assertAcceptance(
    Object.values(snapshot.appearance.featureFlags).every((enabled) => enabled === true),
    `${label} did not enable every Surface Appearance feature.`,
    snapshot.appearance.featureFlags
  );
  assertAcceptance(
    snapshot.appearance.depthTint.model === "scene-depth-power" &&
      snapshot.appearance.depthTint.enabled === true &&
      snapshot.appearance.depthTint.distance === 10 &&
      snapshot.appearance.depthTint.exponent === 0.5,
    `${label} depth tint contract drifted.`,
    snapshot.appearance.depthTint
  );
  assertAcceptance(
    snapshot.appearance.coastalAlpha.model === "scene-depth" &&
      snapshot.appearance.coastalAlpha.enabled === true &&
      snapshot.appearance.coastalAlpha.distance === 0.5,
    `${label} coastal alpha contract drifted.`,
    snapshot.appearance.coastalAlpha
  );
  assertAcceptance(
    snapshot.appearance.contactFoam.model === "scene-depth-voronoi" &&
      snapshot.appearance.contactFoam.enabled === true &&
      snapshot.appearance.contactFoam.worldScale === 2.5 &&
      snapshot.appearance.contactFoam.timeRate === 1 &&
      snapshot.appearance.contactFoam.opacity === 0.453 &&
      snapshot.appearance.contactFoam.contactDistance === 0.1791 &&
      snapshot.appearance.contactFoam.octaveCount === 3 &&
      snapshot.appearance.contactFoam.lacunarity === 2 &&
      snapshot.appearance.contactFoam.suppressRefraction === 1 &&
      snapshot.appearance.contactFoam.smoothnessReduction === 1,
    `${label} contact foam contract drifted.`,
    snapshot.appearance.contactFoam
  );
  assertDeepEqual(
    snapshot.appearance.contactFoam.weights,
    [0.5, 0.25, 0.125],
    `${label} contact foam weights drifted.`
  );
  assertAcceptance(snapshot.appearance.fallbackReason === null, `${label} Appearance fallback is not null.`);
  assertAcceptance(snapshot.appearanceFallbackReason === null, `${label} strict fallback is not null.`);

  assertAcceptance(
    snapshot.cameraFeatures.requested.depthTexture === true &&
      snapshot.cameraFeatures.requested.opaqueTexture === true &&
      snapshot.cameraFeatures.requested.quality === "high" &&
      snapshot.cameraFeatures.requested.opaqueDownsampling === "none",
    `${label} High broker request drifted.`,
    snapshot.cameraFeatures
  );
  assertAcceptance(
    snapshot.cameraFeatures.effective.depthTexture === true &&
      snapshot.cameraFeatures.effective.opaqueTexture === true &&
      snapshot.cameraFeatures.effective.activeConsumerCount === 1 &&
      snapshot.cameraFeatures.effective.depthCopyPassCount === 1 &&
      snapshot.cameraFeatures.effective.colorCopyPassCount === 1 &&
      snapshot.cameraFeatures.effective.opaqueDownsampling === "none",
    `${label} High broker ownership drifted.`,
    snapshot.cameraFeatures
  );
  assertAcceptance(
    snapshot.directLight.bound === true &&
      snapshot.directLight.matchesFixture === true &&
      snapshot.directLight.count === 1 &&
      snapshot.directLight.state === "default" &&
      snapshot.directLight.enabled === true &&
      snapshot.directLight.intensity === 1.05,
    `${label} real DirectLight is not bound.`,
    snapshot.directLight
  );
  assertDeepEqual(snapshot.directLight.color, [1, 1, 1], `${label} DirectLight color drifted.`);
  assertDeepEqual(snapshot.directLight.effectiveColor, [1.05, 1.05, 1.05], `${label} DirectLight radiance drifted.`);
  assertAcceptance(snapshot.compositionMode === "precomposed-replace", `${label} composition mode drifted.`);
  assertAcceptance(snapshot.depthWriteEnabled === true, `${label} depth write is disabled.`);
  assertAcceptance(
    snapshot.reflection.contributionEnabled === true &&
      snapshot.reflection.requestedSource === "sky" &&
      snapshot.reflection.effectiveSource === "sky" &&
      snapshot.reflection.intensity === 1 &&
      snapshot.reflection.effectiveIntensity === 1 &&
      snapshot.reflection.fallbackReason === null &&
      snapshot.reflection.cameraCount === 0 &&
      snapshot.reflection.renderTargetCount === 0,
    `${label} analytic reflection contract drifted.`,
    snapshot.reflection
  );

  assertAcceptance(snapshot.runtimeSet.activeSetCount === 1, `${label} does not own exactly one runtime set.`);
  assertAcceptance(snapshot.runtimeSet.activeId === "grasslands-heightfield-water", `${label} runtime set ID drifted.`);
  assertAcceptance(
    snapshot.runtimeSet.compiledHash === snapshot.runtimeCompiledHash && snapshot.runtimeCompiledHash.length > 0,
    `${label} runtime compiled hash is missing or inconsistent.`
  );
  assertAcceptance(
    snapshot.runtimeSet.chunkCount > 0 &&
      snapshot.runtimeSet.drawCount === snapshot.runtimeSet.chunkCount &&
      snapshot.runtimeSet.drawCount <= 8,
    `${label} chunk/draw contract is invalid.`,
    snapshot.runtimeSet
  );
  assertAcceptance(snapshot.runtimeSet.meshUploadCount > 0, `${label} did not upload its static mesh.`);
  assertAcceptance(snapshot.runtimeSet.perFrameMeshUpload === false, `${label} reports per-frame mesh uploads.`);
  assertAcceptance(
    snapshot.runtimeSet.activeWaveCount === 0 && snapshot.runtimeSet.waveStrength === 0,
    `${label} unexpectedly enabled waves.`,
    snapshot.runtimeSet
  );
  assertAcceptance(snapshot.runtimeSet.gameplayQueryRegistered === false, `${label} registered gameplay queries.`);

  assertAcceptance(snapshot.resources.ownedTextureCount === 2, `${label} does not own exactly two active textures.`);
  assertAcceptance(snapshot.resources.borrowedTextureCount === 1, `${label} does not expose one borrowed texture.`);
  assertAcceptance(snapshot.resources.materialCount > 0, `${label} has no active runtime materials.`);
  assertAcceptance(snapshot.resources.renderTargetCount === 0, `${label} created a render target.`);
  assertAcceptance(snapshot.resources.reflectionCameraCount === 0, `${label} created a reflection camera.`);
  assertAcceptance(snapshot.resources.cameraCount === 1, `${label} does not own exactly one scene camera.`);
  assertAcceptance(
    snapshot.resources.textureCreateCount - snapshot.resources.localMapTextureCreateCount === 1,
    `${label} external texture create count is not one.`,
    snapshot.resources
  );
  assertAcceptance(
    snapshot.resources.textureDestroyCount - snapshot.resources.localMapTextureDestroyCount === 0,
    `${label} destroyed the caller-owned normal while active.`,
    snapshot.resources
  );
  assertAcceptance(
    snapshot.normal.textureDestroyed === false,
    `${label} caller-owned normal is destroyed while active.`
  );

  assertAcceptance(snapshot.camera.mode === "fixed", `${label} automation camera is not fixed.`);
  assertAcceptance(snapshot.camera.freeControlActive === false, `${label} fixed camera left FreeControl active.`);
  assertAcceptance(snapshot.camera.movementSpeed === 14, `${label} camera speed drifted.`);
  assertAcceptance(
    snapshot.scene.ready === true &&
      snapshot.scene.finite === true &&
      snapshot.scene.fixtureId === snapshot.fixtureId &&
      snapshot.scene.fixtureHash === snapshot.fixtureHash,
    `${label} scene fixture is not ready or shared.`,
    snapshot.scene
  );
  assertAcceptance(
    snapshot.scene.terrainEntityCount === 1 &&
      snapshot.scene.anchorRockCount === 3 &&
      snapshot.scene.activeRockCount === 3 &&
      snapshot.scene.scenicRockCount === 7 &&
      snapshot.scene.submergedScenicRockCount === 3 &&
      snapshot.scene.shoreScenicRockCount === 4 &&
      snapshot.scene.contactProbeCount === 3 &&
      snapshot.scene.terrainIndexCount === snapshot.scene.terrainBedIndexCount + snapshot.scene.terrainBankIndexCount &&
      snapshot.scene.terrainBedIndexCount > 0 &&
      snapshot.scene.terrainBankIndexCount > 0 &&
      snapshot.scene.directLightCount === 1,
    `${label} scene entity contract drifted.`,
    snapshot.scene
  );
  assertAcceptance(
    snapshot.scene.skyboxCount === 0 &&
      snapshot.scene.planarCameraCount === 0 &&
      snapshot.scene.reflectionProbeCount === 0 &&
      snapshot.scene.renderTargetCount === 0,
    `${label} created an excluded reflection or sky resource.`,
    snapshot.scene
  );
  const exclusionEvidence = readFormalExclusionEvidence(snapshot);
  if (exclusionEvidence) {
    assertAcceptance(
      exclusionEvidence.cameraComponentCount === 1 &&
        exclusionEvidence.directLightComponentCount === 1 &&
        exclusionEvidence.skyboxCount === 0 &&
        exclusionEvidence.planarCameraCount === 0 &&
        exclusionEvidence.reflectionProbeCount === 0 &&
        exclusionEvidence.renderTargetCount === 0,
      `${label} runtime-observed excluded resources are non-zero.`,
      exclusionEvidence
    );
  } else {
    missingFormalFields.add(FORMAL_EXCLUSION_EVIDENCE_PATH);
    if (!diagnosticMode) {
      assertAcceptance(
        false,
        `${label} lacks formal runtime-observed exclusion provenance at ${FORMAL_EXCLUSION_EVIDENCE_PATH}.`,
        { requiredPath: FORMAL_EXCLUSION_EVIDENCE_PATH, actual: snapshot.exclusionResources }
      );
    }
  }
  assertAcceptance(
    snapshot.scene.anchorRocks.every(
      (rock) => rock.active && rock.crossesWaterSurface && rock.sceneDepthContactExpected && rock.state === "default"
    ),
    `${label} anchor rocks do not all cross the water surface.`,
    snapshot.scene.anchorRocks
  );
  assertAcceptance(snapshot.frame.finite === true, `${label} frame sampler is not finite.`, snapshot.frame);
  assertAcceptance(
    Number.isInteger(snapshot.frame.engineUpdateCount) && snapshot.frame.engineUpdateCount > 0,
    `${label} lacks a positive Engine update count.`,
    snapshot.frame
  );
  assertAcceptance(
    collectNonFinite(snapshot, label).length === 0,
    `${label} contains non-finite numeric evidence.`,
    collectNonFinite(snapshot, label)
  );
}

function activeResourceVector(snapshot) {
  return {
    bufferMemory: snapshot.resources.bufferMemory,
    textureMemory: snapshot.resources.textureMemory,
    totalMemory: snapshot.resources.totalMemory,
    ownedTextureCount: snapshot.resources.ownedTextureCount,
    borrowedTextureCount: snapshot.resources.borrowedTextureCount,
    textureCreateCount: snapshot.resources.textureCreateCount,
    textureDestroyCount: snapshot.resources.textureDestroyCount,
    materialCount: snapshot.resources.materialCount,
    runtimeSetCreateCount: snapshot.resources.runtimeSetCreateCount,
    runtimeSetDestroyCount: snapshot.resources.runtimeSetDestroyCount,
    materialCreateCount: snapshot.resources.materialCreateCount,
    materialDestroyCount: snapshot.resources.materialDestroyCount,
    localMapTextureCreateCount: snapshot.resources.localMapTextureCreateCount,
    localMapTextureDestroyCount: snapshot.resources.localMapTextureDestroyCount,
    meshCreateCount: snapshot.resources.meshCreateCount,
    meshDestroyCount: snapshot.resources.meshDestroyCount,
    sceneMeshCreateCount: snapshot.resources.sceneMeshCreateCount,
    sceneMeshDestroyCount: snapshot.resources.sceneMeshDestroyCount,
    sceneMaterialCreateCount: snapshot.resources.sceneMaterialCreateCount,
    sceneMaterialDestroyCount: snapshot.resources.sceneMaterialDestroyCount,
    sceneEntityCreateCount: snapshot.resources.sceneEntityCreateCount,
    sceneEntityDestroyCount: snapshot.resources.sceneEntityDestroyCount,
    renderTargetCount: snapshot.resources.renderTargetCount,
    reflectionCameraCount: snapshot.resources.reflectionCameraCount,
    cameraCount: snapshot.resources.cameraCount,
    activeRuntimeSetCount: snapshot.runtimeSet.activeSetCount,
    chunkCount: snapshot.runtimeSet.chunkCount,
    drawCount: snapshot.runtimeSet.drawCount,
    meshUploadCount: snapshot.runtimeSet.meshUploadCount,
    depthCopyPassCount: snapshot.cameraFeatures.effective.depthCopyPassCount,
    colorCopyPassCount: snapshot.cameraFeatures.effective.colorCopyPassCount,
    brokerConsumerCount: snapshot.cameraFeatures.effective.activeConsumerCount,
    externalNormalTextureDestroyed: snapshot.normal.textureDestroyed
  };
}

function liveResourceVector(snapshot) {
  return {
    bufferMemory: snapshot.resources.bufferMemory,
    textureMemory: snapshot.resources.textureMemory,
    totalMemory: snapshot.resources.totalMemory,
    ownedTextureCount: snapshot.resources.ownedTextureCount,
    borrowedTextureCount: snapshot.resources.borrowedTextureCount,
    materialCount: snapshot.resources.materialCount,
    renderTargetCount: snapshot.resources.renderTargetCount,
    reflectionCameraCount: snapshot.resources.reflectionCameraCount,
    cameraCount: snapshot.resources.cameraCount,
    activeRuntimeSetCount: snapshot.runtimeSet.activeSetCount,
    chunkCount: snapshot.runtimeSet.chunkCount,
    drawCount: snapshot.runtimeSet.drawCount,
    depthCopyPassCount: snapshot.cameraFeatures.effective.depthCopyPassCount,
    colorCopyPassCount: snapshot.cameraFeatures.effective.colorCopyPassCount,
    brokerConsumerCount: snapshot.cameraFeatures.effective.activeConsumerCount,
    sceneMeshRetainedCount: snapshot.resources.sceneMeshCreateCount - snapshot.resources.sceneMeshDestroyCount,
    sceneMaterialRetainedCount:
      snapshot.resources.sceneMaterialCreateCount - snapshot.resources.sceneMaterialDestroyCount,
    sceneEntityRetainedCount: snapshot.resources.sceneEntityCreateCount - snapshot.resources.sceneEntityDestroyCount,
    externalNormalTextureDestroyed: snapshot.normal.textureDestroyed
  };
}

function assertActiveOwnership(snapshot, label) {
  assertAcceptance(snapshot.normal.textureDestroyed === false, `${label} external normal is already destroyed.`);
  assertAcceptance(
    snapshot.resources.sceneMeshCreateCount > 0 &&
      snapshot.resources.sceneMeshDestroyCount === 0 &&
      snapshot.resources.sceneMaterialCreateCount > 0 &&
      snapshot.resources.sceneMaterialDestroyCount === 0 &&
      snapshot.resources.sceneEntityCreateCount > 0 &&
      snapshot.resources.sceneEntityDestroyCount === 0,
    `${label} Scene resource ownership counters are not active and unbalanced as expected.`,
    snapshot.resources
  );
}

function assertStableResources(before, after, label) {
  assertDeepEqual(activeResourceVector(after), activeResourceVector(before), `${label} resources grew or drifted.`);
  assertAcceptance(after.runtimeSet.perFrameMeshUpload === false, `${label} detected per-frame mesh uploads.`);
  assertActiveOwnership(after, label);
}

function disposedResourceEvidence(snapshot) {
  return {
    bufferMemory: snapshot.resources.bufferMemory,
    textureMemory: snapshot.resources.textureMemory,
    totalMemory: snapshot.resources.totalMemory,
    ownedTextureCount: snapshot.resources.ownedTextureCount,
    borrowedTextureCount: snapshot.resources.borrowedTextureCount,
    externalTextureCreateCount: snapshot.resources.textureCreateCount - snapshot.resources.localMapTextureCreateCount,
    externalTextureDestroyCount:
      snapshot.resources.textureDestroyCount - snapshot.resources.localMapTextureDestroyCount,
    textureCreateCount: snapshot.resources.textureCreateCount,
    textureDestroyCount: snapshot.resources.textureDestroyCount,
    localMapTextureCreateCount: snapshot.resources.localMapTextureCreateCount,
    localMapTextureDestroyCount: snapshot.resources.localMapTextureDestroyCount,
    materialCount: snapshot.resources.materialCount,
    materialCreateCount: snapshot.resources.materialCreateCount,
    materialDestroyCount: snapshot.resources.materialDestroyCount,
    runtimeSetCreateCount: snapshot.resources.runtimeSetCreateCount,
    runtimeSetDestroyCount: snapshot.resources.runtimeSetDestroyCount,
    meshCreateCount: snapshot.resources.meshCreateCount,
    meshDestroyCount: snapshot.resources.meshDestroyCount,
    sceneMeshCreateCount: snapshot.resources.sceneMeshCreateCount,
    sceneMeshDestroyCount: snapshot.resources.sceneMeshDestroyCount,
    sceneMaterialCreateCount: snapshot.resources.sceneMaterialCreateCount,
    sceneMaterialDestroyCount: snapshot.resources.sceneMaterialDestroyCount,
    sceneEntityCreateCount: snapshot.resources.sceneEntityCreateCount,
    sceneEntityDestroyCount: snapshot.resources.sceneEntityDestroyCount,
    renderTargetCount: snapshot.resources.renderTargetCount,
    reflectionCameraCount: snapshot.resources.reflectionCameraCount,
    cameraCount: snapshot.resources.cameraCount,
    activeRuntimeSetCount: snapshot.runtimeSet.activeSetCount,
    activeChunkCount: snapshot.runtimeSet.chunkCount,
    activeDrawCount: snapshot.runtimeSet.drawCount,
    brokerConsumerCount: snapshot.cameraFeatures.effective.activeConsumerCount,
    depthCopyPassCount: snapshot.cameraFeatures.effective.depthCopyPassCount,
    colorCopyPassCount: snapshot.cameraFeatures.effective.colorCopyPassCount,
    externalNormalTextureDestroyed: snapshot.normal.textureDestroyed
  };
}

function assertDisposedSnapshot(snapshot, label) {
  const resources = disposedResourceEvidence(snapshot);
  assertAcceptance(snapshot.phase === "disposed", `${label} phase is '${snapshot.phase}'.`, snapshot);
  assertAcceptance(snapshot.disposed === true, `${label} did not report disposed=true.`);
  assertAcceptance(snapshot.ready === false, `${label} still reports ready=true.`);
  assertAcceptance(snapshot.runtimeError === null, `${label} cleanup reported '${snapshot.runtimeError}'.`);
  assertAcceptance(snapshot.runtimeSet.activeId === null, `${label} retained an active runtime ID.`);
  assertAcceptance(
    resources.ownedTextureCount === 0 &&
      resources.borrowedTextureCount === 0 &&
      resources.bufferMemory === 0 &&
      resources.textureMemory === 0 &&
      resources.totalMemory === 0 &&
      resources.materialCount === 0 &&
      resources.renderTargetCount === 0 &&
      resources.reflectionCameraCount === 0 &&
      resources.cameraCount === 0 &&
      resources.activeRuntimeSetCount === 0 &&
      resources.activeChunkCount === 0 &&
      resources.activeDrawCount === 0 &&
      resources.brokerConsumerCount === 0 &&
      resources.depthCopyPassCount === 0 &&
      resources.colorCopyPassCount === 0,
    `${label} retained live resources after dispose.`,
    resources
  );
  assertAcceptance(
    resources.textureCreateCount === resources.textureDestroyCount &&
      resources.localMapTextureCreateCount === resources.localMapTextureDestroyCount &&
      resources.materialCreateCount === resources.materialDestroyCount &&
      resources.runtimeSetCreateCount === resources.runtimeSetDestroyCount &&
      resources.meshCreateCount === resources.meshDestroyCount &&
      resources.sceneMeshCreateCount === resources.sceneMeshDestroyCount &&
      resources.sceneMaterialCreateCount === resources.sceneMaterialDestroyCount &&
      resources.sceneEntityCreateCount === resources.sceneEntityDestroyCount,
    `${label} create/destroy counters are not balanced.`,
    resources
  );
  assertAcceptance(
    resources.externalTextureCreateCount === 1 &&
      resources.externalTextureDestroyCount === 1 &&
      resources.externalNormalTextureDestroyed === true,
    `${label} caller-owned external normal was not created and destroyed exactly once.`,
    resources
  );
  return resources;
}

async function readGrasslandsSnapshot(page) {
  return page.evaluate(() => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    return structuredClone(api.snapshot());
  });
}

async function disposeGrasslands(page, diagnostics, label) {
  const disposed = await page.evaluate(() => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable before dispose.");
    return structuredClone(api.dispose());
  });
  const resources = assertDisposedSnapshot(disposed, label);
  await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
  assertNoPageErrors(diagnostics, `${label} console/WebGL cleanup`);
  return { snapshot: disposed, resources };
}

async function collectDisplayEnvironment(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas#canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Grasslands canvas is unavailable.");
    const rect = canvas.getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      canvasClientWidth: canvas.clientWidth,
      canvasClientHeight: canvas.clientHeight,
      canvasRectWidth: rect.width,
      canvasRectHeight: rect.height
    };
  });
}

async function collectStrictWebGlEnvironment(page) {
  const shared = await collectWebGlEnvironment(page);
  const contextState = await page.evaluate(() => {
    const canvas = document.querySelector("canvas#canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return {
        contextLost: null,
        contextLossEventCount: window.__grasslandsWaterContextLossEventCount ?? 0
      };
    }
    const gl = canvas.getContext("webgl2");
    return {
      contextLost: gl ? gl.isContextLost() : null,
      contextLossEventCount: window.__grasslandsWaterContextLossEventCount ?? 0
    };
  });
  return { ...shared, ...contextState };
}

async function waitForEngineUpdates(page, minimumDelta, label, timeout = 45_000) {
  const before = await readGrasslandsSnapshot(page);
  const start = before.frame.engineUpdateCount;
  assertAcceptance(
    Number.isInteger(start) && start >= 0,
    `${label} has no valid Engine update baseline.`,
    before.frame
  );
  await page.waitForFunction(
    ({ startCount, requiredDelta }) => {
      const count = window.waterPcgGrasslands?.snapshot().frame.engineUpdateCount;
      return Number.isInteger(count) && count >= startCount + requiredDelta;
    },
    { startCount: start, requiredDelta: minimumDelta },
    { timeout }
  );
  const after = await readGrasslandsSnapshot(page);
  const delta = after.frame.engineUpdateCount - start;
  assertAcceptance(delta >= minimumDelta, `${label} observed only ${delta} Engine updates.`, {
    start,
    end: after.frame.engineUpdateCount,
    minimumDelta
  });
  return { before, after, start, end: after.frame.engineUpdateCount, delta };
}

async function assertPostStabilityGraphics(page, label) {
  const webgl = await collectStrictWebGlEnvironment(page);
  assertNativeWebGl(webgl, label);
  const canvas = await readCanvasProbe(page);
  assertCanvasHealthy(canvas, label);
  return {
    webgl,
    canvas: summarizeCanvasProbe(canvas)
  };
}

async function openGrasslandsPage(browser, fixed, label, options = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  await context.addInitScript(() => {
    window.__grasslandsWaterContextLossEventCount = 0;
    document.addEventListener(
      "webglcontextlost",
      () => {
        window.__grasslandsWaterContextLossEventCount++;
      },
      true
    );
  });
  const page = await context.newPage();
  const diagnostics = collectPageDiagnostics(page);
  const url = createGrasslandsUrl(fixed, options);
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const ready = await waitForCaseReady(page, CASE_DEFINITION);
  assertCaseIdentity(ready, CASE_DEFINITION);
  assertRuntimeHealthy(ready, CASE_DEFINITION);
  await waitForAnimationFrames(page, 5);
  const webgl = await collectStrictWebGlEnvironment(page);
  assertNativeWebGl(webgl, label);
  const display = await collectDisplayEnvironment(page);
  assertDisplayEnvironment(display, label);
  return { context, page, diagnostics, url, webgl, display };
}

async function readDeterminismVector(page) {
  return page.evaluate(() => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    const fixture = api.fixture;
    const snapshot = api.snapshot();
    return structuredClone({
      fixtureId: snapshot.fixtureId,
      fixtureHash: snapshot.fixtureHash,
      descriptorHash: snapshot.descriptorHash,
      appearanceHash: snapshot.appearanceHash,
      externalAssetHash: snapshot.externalAssetHash,
      runtimeCompiledHash: snapshot.runtimeCompiledHash,
      wetTexelCount: snapshot.wetTexelCount,
      waterBounds: snapshot.waterBounds,
      sceneBounds: snapshot.scene.bounds,
      runtimeChunkCount: snapshot.runtimeSet.chunkCount,
      runtimeDrawCount: snapshot.runtimeSet.drawCount,
      cameraFixture: fixture.camera,
      cameraReadback: snapshot.camera,
      directLightFixture: fixture.directLight,
      directLightReadback: snapshot.directLight,
      terrain: fixture.terrain,
      sceneMaterials: fixture.sceneMaterials,
      anchorRocks: fixture.anchorRocks,
      scenicRocks: fixture.scenicRocks,
      anchorRockReadback: snapshot.scene.anchorRocks,
      mechanismRois: fixture.mechanismRois,
      decorations: fixture.decorations
    });
  });
}

function fixedSeedInvariantVector(vector) {
  const { fixtureHash: _fixtureHash, decorations: _decorations, ...invariant } = vector;
  return invariant;
}

async function runFreshDeterminism(browser) {
  const results = [];
  let expectedVector;
  for (let iteration = 1; iteration <= FRESH_DETERMINISM_RUNS; iteration++) {
    const label = `fresh determinism ${iteration}`;
    const target = await openGrasslandsPage(browser, true, label);
    try {
      const snapshot = await readGrasslandsSnapshot(target.page);
      assertStrictHappyPath(snapshot, label);
      const canvas = await readCanvasProbe(target.page);
      assertCanvasHealthy(canvas, label);
      const determinism = await readDeterminismVector(target.page);
      if (!expectedVector) expectedVector = determinism;
      else assertDeepEqual(determinism, expectedVector, `${label} fixture/runtime determinism drifted.`);
      const disposed = await disposeGrasslands(target.page, target.diagnostics, label);
      results.push({
        iteration,
        url: target.url.href,
        webgl: target.webgl,
        display: target.display,
        determinism,
        canvas: summarizeCanvasProbe(canvas),
        strictSnapshot: snapshot,
        disposedResources: disposed.resources,
        diagnostics: target.diagnostics
      });
    } finally {
      await target.context.close();
    }
  }
  return results;
}

async function runAlternateSeed(browser, defaultDeterminism) {
  const runs = [];
  let expectedAlternateDeterminism;
  for (let iteration = 1; iteration <= ALTERNATE_SEED_RUNS; iteration++) {
    const label = `alternate seed ${iteration}`;
    const target = await openGrasslandsPage(browser, true, label, { seed: ALTERNATE_SEED });
    try {
      const snapshot = await readGrasslandsSnapshot(target.page);
      assertStrictHappyPath(snapshot, label, {
        expectedSeed: ALTERNATE_SEED,
        expectedFixtureHash: null
      });
      const determinism = await readDeterminismVector(target.page);
      assertDeepEqual(
        fixedSeedInvariantVector(determinism),
        fixedSeedInvariantVector(defaultDeterminism),
        `${label} changed validation-critical fixture fields.`
      );
      assertAcceptance(
        JSON.stringify(determinism.decorations) !== JSON.stringify(defaultDeterminism.decorations),
        `${label} did not change non-validation decorations.`,
        { defaultDecorations: defaultDeterminism.decorations, alternateDecorations: determinism.decorations }
      );
      if (!expectedAlternateDeterminism) expectedAlternateDeterminism = determinism;
      else {
        assertDeepEqual(
          determinism,
          expectedAlternateDeterminism,
          `${label} full alternate-seed determinism vector drifted across fresh contexts.`
        );
      }
      const disposed = await disposeGrasslands(target.page, target.diagnostics, label);
      runs.push({
        iteration,
        url: target.url.href,
        webgl: target.webgl,
        display: target.display,
        determinism,
        disposedResources: disposed.resources,
        diagnostics: target.diagnostics
      });
    } finally {
      await target.context.close();
    }
  }
  return {
    seed: ALTERNATE_SEED,
    runCount: runs.length,
    defaultFixtureHash: defaultDeterminism.fixtureHash,
    determinism: expectedAlternateDeterminism,
    runs
  };
}

async function runFreeCameraReset(browser) {
  const label = "ordinary free/reset";
  const target = await openGrasslandsPage(browser, false, label);
  try {
    const initial = await target.page.evaluate(() => {
      const acceptance = window.waterPcgGrasslands;
      const camera = window.waterPcgShowcaseCamera;
      if (!acceptance || !camera) throw new Error("Grasslands free camera APIs are unavailable.");
      return structuredClone({
        acceptance: acceptance.snapshot(),
        camera: camera.snapshot,
        fixtureCamera: acceptance.fixture.camera
      });
    });
    assertAcceptance(initial.acceptance.camera.mode === "free", `${label} acceptance camera is not free.`);
    assertAcceptance(initial.acceptance.camera.freeControlActive === true, `${label} FreeControl is inactive.`);
    assertAcceptance(
      initial.camera.mode === "free" && initial.camera.active === true,
      `${label} camera API is inactive.`
    );
    assertAcceptance(
      initial.camera.movementSpeed === 14,
      `${label} movement speed is ${initial.camera.movementSpeed}.`
    );

    await target.page.keyboard.down("KeyW");
    await waitForAnimationFrames(target.page, 8);
    await target.page.keyboard.up("KeyW");
    await waitForAnimationFrames(target.page, 2);
    const moved = await readGrasslandsSnapshot(target.page);
    const forwardMovement = distance(initial.acceptance.camera.position, moved.camera.position);
    assertAcceptance(forwardMovement > 1e-3, `${label} did not move after W (${forwardMovement}).`);

    const reset = await target.page.evaluate(() => {
      const acceptance = window.waterPcgGrasslands;
      const camera = window.waterPcgShowcaseCamera;
      if (!acceptance || !camera) throw new Error("Grasslands free camera APIs disappeared before reset.");
      acceptance.resetHeroCamera();
      return structuredClone({
        acceptance: acceptance.snapshot(),
        camera: camera.snapshot,
        fixtureCamera: acceptance.fixture.camera
      });
    });
    await waitForAnimationFrames(target.page, 2);
    const resetAfterFrames = await readGrasslandsSnapshot(target.page);
    assertAcceptance(reset.acceptance.camera.mode === "free", `${label} reset changed camera mode.`);
    assertAcceptance(reset.acceptance.camera.freeControlActive === true, `${label} reset disabled FreeControl.`);
    assertAcceptance(reset.camera.active === true, `${label} reset disabled the camera API.`);
    assertAcceptance(
      distance(resetAfterFrames.camera.position, reset.fixtureCamera.position) <= 1e-6,
      `${label} did not restore the Hero position.`,
      resetAfterFrames.camera
    );
    assertAcceptance(
      distance(resetAfterFrames.camera.forward, reset.fixtureCamera.forward) <= 1e-6,
      `${label} did not restore the Hero forward vector.`,
      resetAfterFrames.camera
    );
    const disposed = await disposeGrasslands(target.page, target.diagnostics, label);
    return {
      url: target.url.href,
      webgl: target.webgl,
      display: target.display,
      initial,
      movedCamera: moved.camera,
      forwardMovement,
      reset: resetAfterFrames.camera,
      disposedResources: disposed.resources,
      diagnostics: target.diagnostics
    };
  } finally {
    await target.context.close();
  }
}

async function setQuality(page, quality) {
  await page.evaluate(async (requestedQuality) => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    await api.setQuality(requestedQuality);
  }, quality);
  await page.waitForFunction(
    (requestedQuality) => {
      const snapshot = window.waterPcgGrasslands?.snapshot();
      return snapshot?.ready === true && snapshot.qualityTier === requestedQuality;
    },
    quality,
    { timeout: 45_000 }
  );
  await waitForAnimationFrames(page, 2);
  return readGrasslandsSnapshot(page);
}

function assertMedium(snapshot, label) {
  assertAcceptance(snapshot.ready === true && snapshot.finite === true, `${label} is not healthy.`, snapshot);
  assertAcceptance(snapshot.qualityTier === "medium" && snapshot.opticsTier === "medium", `${label} tier drifted.`);
  assertAcceptance(snapshot.strictMaterialReady === false, `${label} incorrectly claims strict High parity.`);
  assertAcceptance(snapshot.appearance.active === true && snapshot.normal.active === true, `${label} lost Appearance.`);
  assertAcceptance(snapshot.normal.layerCount === 2, `${label} normal layer count drifted.`);
  assertAcceptance(snapshot.foamOctaveCount === 2, `${label} foam octave count is ${snapshot.foamOctaveCount}.`);
  assertAcceptance(snapshot.appearanceFallbackReason === null, `${label} reported a fallback.`);
  assertAcceptance(
    snapshot.cameraFeatures.effective.activeConsumerCount === 1 &&
      snapshot.cameraFeatures.effective.depthCopyPassCount === 1 &&
      snapshot.cameraFeatures.effective.colorCopyPassCount === 1 &&
      snapshot.cameraFeatures.effective.opaqueDownsampling === "2x",
    `${label} broker state drifted.`,
    snapshot.cameraFeatures
  );
}

function assertLow(snapshot, label) {
  assertAcceptance(snapshot.ready === true && snapshot.finite === true, `${label} is not healthy.`, snapshot);
  assertAcceptance(snapshot.qualityTier === "low" && snapshot.opticsTier === "off", `${label} tier drifted.`);
  assertAcceptance(snapshot.strictMaterialReady === false, `${label} incorrectly claims strict parity.`);
  assertAcceptance(
    snapshot.appearance.requested === false && snapshot.appearance.active === false,
    `${label} kept Appearance.`
  );
  assertAcceptance(
    snapshot.normal.requested === false && snapshot.normal.active === false,
    `${label} kept external normal.`
  );
  assertAcceptance(snapshot.foamOctaveCount === 0, `${label} foam octave count is ${snapshot.foamOctaveCount}.`);
  assertAcceptance(
    snapshot.appearanceFallbackReason === "surface-appearance-quality-unsupported",
    `${label} fallback reason is '${snapshot.appearanceFallbackReason}'.`
  );
  assertAcceptance(
    snapshot.cameraFeatures.requested.depthTexture === false &&
      snapshot.cameraFeatures.requested.opaqueTexture === false &&
      snapshot.cameraFeatures.requested.quality === "off" &&
      snapshot.cameraFeatures.requested.opaqueDownsampling === "off" &&
      snapshot.cameraFeatures.effective.depthTexture === false &&
      snapshot.cameraFeatures.effective.opaqueTexture === false &&
      snapshot.cameraFeatures.effective.activeConsumerCount === 0 &&
      snapshot.cameraFeatures.effective.depthCopyPassCount === 0 &&
      snapshot.cameraFeatures.effective.colorCopyPassCount === 0 &&
      snapshot.cameraFeatures.effective.opaqueDownsampling === "off",
    `${label} retained a Scene Color/Depth broker request or copy.`,
    snapshot.cameraFeatures
  );
}

function summarizeTier(snapshot) {
  return {
    qualityTier: snapshot.qualityTier,
    opticsTier: snapshot.opticsTier,
    strictMaterialReady: snapshot.strictMaterialReady,
    appearanceActive: snapshot.appearance.active,
    normalActive: snapshot.normal.active,
    normalLayerCount: snapshot.normal.layerCount,
    foamOctaveCount: snapshot.foamOctaveCount,
    fallbackReason: snapshot.appearanceFallbackReason,
    broker: snapshot.cameraFeatures,
    runtimeCompiledHash: snapshot.runtimeCompiledHash,
    resources: activeResourceVector(snapshot)
  };
}

async function setAppearanceEnabled(page, enabled) {
  await page.evaluate((nextEnabled) => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    api.setAppearanceEnabled(nextEnabled);
  }, enabled);
  await waitForAnimationFrames(page, 2);
  return readGrasslandsSnapshot(page);
}

async function runQualityAppearanceAndLongStability(browser) {
  const label = "quality/appearance/600-frame";
  const target = await openGrasslandsPage(browser, true, label);
  try {
    const initial = await readGrasslandsSnapshot(target.page);
    assertStrictHappyPath(initial, `${label} initial High`);
    const qualityRounds = [];
    for (let iteration = 1; iteration <= QUALITY_ROUNDS; iteration++) {
      const highBefore = await readGrasslandsSnapshot(target.page);
      assertStrictHappyPath(highBefore, `${label} round ${iteration} High before`);
      const medium = await setQuality(target.page, "medium");
      assertMedium(medium, `${label} round ${iteration} Medium`);
      const low = await setQuality(target.page, "low");
      assertLow(low, `${label} round ${iteration} Low`);
      const highAfter = await setQuality(target.page, "high");
      assertStrictHappyPath(highAfter, `${label} round ${iteration} High after`);
      assertActiveOwnership(highAfter, `${label} round ${iteration} High after`);
      assertAcceptance(
        highAfter.resources.textureCreateCount - highAfter.resources.localMapTextureCreateCount === 1 &&
          highAfter.resources.textureDestroyCount - highAfter.resources.localMapTextureDestroyCount === 0 &&
          highAfter.resources.borrowedTextureCount === 1,
        `${label} round ${iteration} recreated or destroyed the external normal.`,
        highAfter.resources
      );
      qualityRounds.push({
        iteration,
        highBefore: summarizeTier(highBefore),
        medium: summarizeTier(medium),
        low: summarizeTier(low),
        highAfter: summarizeTier(highAfter)
      });
    }
    const finalQualityHigh = await readGrasslandsSnapshot(target.page);
    assertDeepEqual(
      liveResourceVector(finalQualityHigh),
      liveResourceVector(initial),
      `${label} did not return to the initial live High resource baseline after ${QUALITY_ROUNDS} cycles.`
    );

    const appearanceOffFirst = await setAppearanceEnabled(target.page, false);
    assertAcceptance(
      appearanceOffFirst.appearanceEnabled === false &&
        appearanceOffFirst.appearance.requested === false &&
        appearanceOffFirst.appearance.active === false &&
        appearanceOffFirst.normal.active === false &&
        appearanceOffFirst.strictMaterialReady === false,
      `${label} first Appearance Off state is invalid.`,
      appearanceOffFirst
    );
    assertAcceptance(
      appearanceOffFirst.normal.textureDestroyed === false,
      `${label} Runtime destroyed the caller-owned normal after Appearance Off.`,
      appearanceOffFirst.normal
    );
    const appearanceOn = await setAppearanceEnabled(target.page, true);
    assertStrictHappyPath(appearanceOn, `${label} Appearance On`);
    const appearanceOffSecond = await setAppearanceEnabled(target.page, false);
    assertAcceptance(
      appearanceOffSecond.appearanceEnabled === false &&
        appearanceOffSecond.appearance.requested === false &&
        appearanceOffSecond.appearance.active === false &&
        appearanceOffSecond.normal.active === false &&
        appearanceOffSecond.strictMaterialReady === false,
      `${label} second Appearance Off state is invalid.`,
      appearanceOffSecond
    );
    assertAcceptance(
      appearanceOffSecond.normal.textureDestroyed === false,
      `${label} Runtime destroyed the caller-owned normal after Appearance Off/On/Off.`,
      appearanceOffSecond.normal
    );
    assertAcceptance(
      appearanceOffSecond.resources.textureCreateCount - appearanceOffSecond.resources.localMapTextureCreateCount ===
        1 &&
        appearanceOffSecond.resources.textureDestroyCount -
          appearanceOffSecond.resources.localMapTextureDestroyCount ===
          0,
      `${label} Appearance Off/On/Off changed external normal ownership.`,
      appearanceOffSecond.resources
    );

    const restoredAppearance = await setAppearanceEnabled(target.page, true);
    assertStrictHappyPath(restoredAppearance, `${label} restored Appearance`);
    await waitForAnimationFrames(target.page, 10);
    const beforeStability = await readGrasslandsSnapshot(target.page);
    const engineUpdates = await waitForEngineUpdates(
      target.page,
      LONG_STABILITY_FRAMES,
      `${label} ${LONG_STABILITY_FRAMES}-update`
    );
    const afterStability = engineUpdates.after;
    assertStrictHappyPath(afterStability, `${label} after ${LONG_STABILITY_FRAMES} frames`);
    assertStableResources(beforeStability, afterStability, `${label} ${LONG_STABILITY_FRAMES}-frame`);
    const graphicsAfterStability = await assertPostStabilityGraphics(
      target.page,
      `${label} after ${LONG_STABILITY_FRAMES} Engine updates`
    );
    assertNoPageErrors(target.diagnostics, label);
    const disposed = await disposeGrasslands(target.page, target.diagnostics, label);

    return {
      url: target.url.href,
      webgl: target.webgl,
      display: target.display,
      qualityRounds,
      activeHighBaseline: {
        initial: liveResourceVector(initial),
        afterQualityCycles: liveResourceVector(finalQualityHigh)
      },
      appearanceSequence: {
        off: summarizeTier(appearanceOffFirst),
        on: summarizeTier(appearanceOn),
        offAgain: summarizeTier(appearanceOffSecond),
        restoredOn: summarizeTier(restoredAppearance)
      },
      longStability: {
        requiredEngineUpdates: LONG_STABILITY_FRAMES,
        observedEngineUpdates: engineUpdates.delta,
        engineUpdateStart: engineUpdates.start,
        engineUpdateEnd: engineUpdates.end,
        before: activeResourceVector(beforeStability),
        after: activeResourceVector(afterStability),
        beforeFrameSampler: beforeStability.frame,
        afterFrameSampler: afterStability.frame,
        graphicsAfterStability
      },
      disposedResources: disposed.resources,
      diagnostics: target.diagnostics
    };
  } finally {
    await target.context.close();
  }
}

function assertLifecycleJournal(journal, label) {
  assertAcceptance(journal !== null, `${label} did not persist a lifecycle journal.`);
  assertAcceptance(journal.schemaVersion === 1, `${label} lifecycle journal schema drifted.`, journal);
  assertAcceptance(journal.stage === "final", `${label} lifecycle journal is not the settled final record.`, journal);
  assertAcceptance(journal.mode === "manual", `${label} did not leave through the beforeunload cleanup path.`, journal);
  assertAcceptance(
    journal.seed === FIXED_SEED && journal.fixtureHash === EXPECTED.fixtureHash,
    `${label} lifecycle journal identity drifted.`,
    journal
  );
  assertAcceptance(
    journal.phase === "disposed" &&
      journal.disposed === true &&
      journal.runtimeError === null &&
      journal.engineDestroyed === true &&
      journal.pendingAsyncOperationCount === 0,
    `${label} lifecycle journal did not finish synchronous ready-state teardown.`,
    journal
  );
  const resources = journal.resources;
  const runtimeSet = journal.runtimeSet;
  const cameraFeatures = journal.cameraFeatures;
  assertAcceptance(
    resources.bufferMemory === 0 &&
      resources.textureMemory === 0 &&
      resources.totalMemory === 0 &&
      resources.ownedTextureCount === 0 &&
      resources.borrowedTextureCount === 0 &&
      resources.materialCount === 0 &&
      resources.renderTargetCount === 0 &&
      resources.reflectionCameraCount === 0 &&
      resources.cameraCount === 0 &&
      runtimeSet.activeSetCount === 0 &&
      runtimeSet.chunkCount === 0 &&
      runtimeSet.drawCount === 0 &&
      cameraFeatures.effective.activeConsumerCount === 0 &&
      cameraFeatures.effective.depthCopyPassCount === 0 &&
      cameraFeatures.effective.colorCopyPassCount === 0,
    `${label} retained live resources after direct navigation.`,
    { resources, runtimeSet, cameraFeatures }
  );
  const externalTextureCreateCount = resources.textureCreateCount - resources.localMapTextureCreateCount;
  const externalTextureDestroyCount = resources.textureDestroyCount - resources.localMapTextureDestroyCount;
  assertAcceptance(
    resources.textureCreateCount === resources.textureDestroyCount &&
      resources.localMapTextureCreateCount === resources.localMapTextureDestroyCount &&
      resources.materialCreateCount === resources.materialDestroyCount &&
      resources.runtimeSetCreateCount === resources.runtimeSetDestroyCount &&
      resources.meshCreateCount === resources.meshDestroyCount &&
      resources.sceneMeshCreateCount === resources.sceneMeshDestroyCount &&
      resources.sceneMaterialCreateCount === resources.sceneMaterialDestroyCount &&
      resources.sceneEntityCreateCount === resources.sceneEntityDestroyCount &&
      externalTextureCreateCount === 1 &&
      externalTextureDestroyCount === 1,
    `${label} direct-navigation create/destroy counters are not balanced.`,
    resources
  );
  return {
    ...resources,
    externalTextureCreateCount,
    externalTextureDestroyCount,
    activeRuntimeSetCount: runtimeSet.activeSetCount,
    activeChunkCount: runtimeSet.chunkCount,
    activeDrawCount: runtimeSet.drawCount,
    brokerConsumerCount: cameraFeatures.effective.activeConsumerCount,
    depthCopyPassCount: cameraFeatures.effective.depthCopyPassCount,
    colorCopyPassCount: cameraFeatures.effective.colorCopyPassCount,
    engineDestroyed: journal.engineDestroyed,
    pendingAsyncOperationCount: journal.pendingAsyncOperationCount
  };
}

async function runMissingNormalNegativeLane(browser) {
  const label = "missing normal fail-closed";
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  let interceptedAssetUrl = null;
  await context.route("**/demo/grasslands/assets/grasslands-water-normal-1024.png", async (route) => {
    interceptedAssetUrl = route.request().url();
    await route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "Grasslands smoke intentional missing-normal fixture"
    });
  });
  const page = await context.newPage();
  const diagnostics = collectPageDiagnostics(page);
  const url = createGrasslandsUrl(true);
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForFunction(
      () => {
        const snapshot = window.waterPcgGrasslands?.snapshot();
        return snapshot?.phase === "error" && snapshot.disposed === true;
      },
      undefined,
      { timeout: 45_000 }
    );
    const identity = await readCaseSnapshot(page, CASE_DEFINITION);
    assertCaseIdentity(identity, CASE_DEFINITION);
    const snapshot = await readGrasslandsSnapshot(page);
    assertAcceptance(snapshot.ready === false, `${label} unexpectedly reports ready.`, snapshot);
    assertAcceptance(snapshot.strictMaterialReady === false, `${label} unexpectedly reports strict parity.`, snapshot);
    assertAcceptance(
      snapshot.phase === "error" && snapshot.disposed === true,
      `${label} did not fail closed.`,
      snapshot
    );
    assertAcceptance(
      snapshot.normal.source === "tracked" &&
        snapshot.normal.active === false &&
        snapshot.normal.fallbackReason === "grasslands-normal-fetch-failed",
      `${label} did not preserve its explicit normal fallback reason.`,
      snapshot.normal
    );
    assertAcceptance(
      typeof snapshot.runtimeError === "string" &&
        snapshot.runtimeError.includes("Grasslands normal is unavailable") &&
        snapshot.runtimeError.includes("HTTP 404"),
      `${label} runtime error is not actionable.`,
      snapshot
    );
    assertAcceptance(
      typeof interceptedAssetUrl === "string" &&
        interceptedAssetUrl.endsWith("/demo/grasslands/assets/grasslands-water-normal-1024.png"),
      `${label} did not intercept the tracked normal request.`,
      { interceptedAssetUrl }
    );
    const resources = disposedResourceEvidence(snapshot);
    assertAcceptance(
      resources.bufferMemory === 0 &&
        resources.textureMemory === 0 &&
        resources.totalMemory === 0 &&
        resources.ownedTextureCount === 0 &&
        resources.borrowedTextureCount === 0 &&
        resources.externalTextureCreateCount === 0 &&
        resources.externalTextureDestroyCount === 0 &&
        resources.textureCreateCount === resources.textureDestroyCount &&
        resources.localMapTextureCreateCount === resources.localMapTextureDestroyCount &&
        resources.materialCreateCount === resources.materialDestroyCount &&
        resources.runtimeSetCreateCount === resources.runtimeSetDestroyCount &&
        resources.meshCreateCount === resources.meshDestroyCount &&
        resources.sceneMeshCreateCount === resources.sceneMeshDestroyCount &&
        resources.sceneMaterialCreateCount === resources.sceneMaterialDestroyCount &&
        resources.sceneEntityCreateCount === resources.sceneEntityDestroyCount &&
        resources.renderTargetCount === 0 &&
        resources.reflectionCameraCount === 0 &&
        resources.cameraCount === 0 &&
        resources.activeRuntimeSetCount === 0 &&
        resources.brokerConsumerCount === 0,
      `${label} leaked resources.`,
      resources
    );
    assertAcceptance(
      diagnostics.errors.length > 0 &&
        diagnostics.errors.every((entry) =>
          /GrasslandsAssetLoadError|Grasslands normal is unavailable|\[http\] 404 .*grasslands-water-normal-1024\.png|Failed to load resource:.*404/.test(
            entry
          )
        ),
      `${label} emitted unexpected or missing browser errors.`,
      diagnostics
    );
    assertDeepEqual(
      diagnostics.failedResponses,
      [`404 ${interceptedAssetUrl}`],
      `${label} HTTP failure evidence drifted.`
    );
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    return { url: url.href, interceptedAssetUrl, snapshot, resources, diagnostics };
  } finally {
    await context.close();
  }
}

async function runLifecycle(browser) {
  const results = [];
  let expectedDisposedResources;
  for (let iteration = 1; iteration <= LIFECYCLE_ROUNDS; iteration++) {
    const label = `lifecycle ${iteration}`;
    const target = await openGrasslandsPage(browser, true, label);
    try {
      await target.page.evaluate((key) => window.sessionStorage.removeItem(key), LIFECYCLE_JOURNAL_KEY);
      const initial = await readGrasslandsSnapshot(target.page);
      assertStrictHappyPath(initial, `${label} initial`);
      await waitForAnimationFrames(target.page, 10);
      const before = await readGrasslandsSnapshot(target.page);
      const engineUpdates = await waitForEngineUpdates(
        target.page,
        LIFECYCLE_STABLE_FRAMES,
        `${label} ${LIFECYCLE_STABLE_FRAMES}-update`
      );
      const after = engineUpdates.after;
      assertStrictHappyPath(after, `${label} after ${LIFECYCLE_STABLE_FRAMES} frames`);
      assertStableResources(before, after, `${label} ${LIFECYCLE_STABLE_FRAMES}-frame`);
      const graphicsAfterStability = await assertPostStabilityGraphics(
        target.page,
        `${label} after ${LIFECYCLE_STABLE_FRAMES} Engine updates`
      );
      assertNoPageErrors(target.diagnostics, label);
      const lifecycleJournalUrl = new URL("demo/grasslands/assets/manifest.json", baseUrl);
      await target.page.goto(lifecycleJournalUrl.href, { waitUntil: "load", timeout: 10_000 });
      const journal = await target.page.evaluate((key) => {
        const raw = window.sessionStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      }, LIFECYCLE_JOURNAL_KEY);
      const disposedResources = assertLifecycleJournal(journal, label);
      assertNoPageErrors(target.diagnostics, `${label} true leave`);
      if (!expectedDisposedResources) expectedDisposedResources = disposedResources;
      else {
        assertDeepEqual(
          disposedResources,
          expectedDisposedResources,
          `${label} final resource counters differ from lifecycle 1.`
        );
      }
      results.push({
        iteration,
        url: target.url.href,
        webgl: target.webgl,
        display: target.display,
        leaveMethod: "direct-navigation-without-api-dispose",
        requiredEngineUpdates: LIFECYCLE_STABLE_FRAMES,
        observedEngineUpdates: engineUpdates.delta,
        engineUpdateStart: engineUpdates.start,
        engineUpdateEnd: engineUpdates.end,
        before: activeResourceVector(before),
        after: activeResourceVector(after),
        beforeFrameSampler: before.frame,
        afterFrameSampler: after.frame,
        graphicsAfterStability,
        journal,
        disposedResources,
        diagnostics: target.diagnostics
      });
    } finally {
      await target.context.close();
    }
  }
  return results;
}

const sourceAtStart = readGitEvidence();
const fullSourceAtStart = readFullGitEvidence();
const report = {
  schemaVersion: 1,
  gate: GATE,
  status: "running",
  finalEvidenceEligible: false,
  qualification: "pending",
  runId: run.runId,
  generatedAt: new Date().toISOString(),
  resultPath: run.resultPath,
  outputDirectory: run.outputDirectory,
  baseUrl,
  headed,
  diagnosticMode,
  environment: {
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    quality: "high",
    surfaceTime: FIXED_SURFACE_TIME,
    seed: FIXED_SEED,
    stats: false,
    tour: false,
    routeGroup: "developer",
    expected: EXPECTED
  },
  sourceAtStart,
  fullSourceAtStart,
  grasslandsMainSourceAtStart: null,
  sourceAtEnd: null,
  fullSourceAtEnd: null,
  grasslandsMainSourceAtEnd: null,
  serverAtStart: null,
  serverAtEnd: null,
  formalRequirements: {
    explicitDiagnosticOptOut: diagnosticMode,
    headedRequired: true,
    nativeUnmaskedWebGl2Required: true,
    contextMustRemainValid: true,
    fullRepositoryCleanRequired: true,
    sameHeadRequired: true,
    grasslandsMainSourceBoundaryRequired: GRASSLANDS_MAIN_REPOSITORY_PATH,
    grasslandsMainSourceHashMustRemainStable: true,
    localhostViteCwdRequired: WORLD_GALLERY_ROOT,
    runtimeObservedExclusionEvidenceRequired: FORMAL_EXCLUSION_EVIDENCE_PATH,
    missingFields: []
  },
  freshDeterminism: [],
  alternateSeed: null,
  freeCameraReset: null,
  qualityAppearanceAndLongStability: null,
  missingNormalNegativeLane: null,
  lifecycle: [],
  failures: []
};

let browser;
try {
  report.serverAtStart = readServerProvenance();
  assertAcceptance(fullSourceAtStart.root === REPOSITORY_ROOT, `Git root drifted to '${fullSourceAtStart.root}'.`);
  assertAcceptance(
    fullSourceAtStart.head === sourceAtStart.head,
    `Scoped and full-repository HEAD evidence disagree.`,
    { sourceAtStart, fullSourceAtStart }
  );
  report.grasslandsMainSourceAtStart = readGrasslandsMainSourceEvidence(fullSourceAtStart.head);
  assertGrasslandsMainSourceBoundary(report.grasslandsMainSourceAtStart, "Grasslands main.ts at start");
  if (!diagnosticMode) {
    assertAcceptance(headed, `Formal ${GATE} requires WATER_PCG_HEADED=1.`);
    assertAcceptance(
      fullSourceAtStart.fullRepositoryStatus === "",
      `Formal ${GATE} requires a completely clean repository, including untracked files.`,
      fullSourceAtStart
    );
  }
  browser = await chromium.launch({ headless: !headed });
  report.browserVersion = browser.version();
  report.freshDeterminism = await runFreshDeterminism(browser);
  report.alternateSeed = await runAlternateSeed(browser, report.freshDeterminism[0].determinism);
  report.freeCameraReset = await runFreeCameraReset(browser);
  report.qualityAppearanceAndLongStability = await runQualityAppearanceAndLongStability(browser);
  report.missingNormalNegativeLane = await runMissingNormalNegativeLane(browser);
  report.lifecycle = await runLifecycle(browser);
  report.sourceAtEnd = readGitEvidence();
  report.fullSourceAtEnd = readFullGitEvidence();
  report.grasslandsMainSourceAtEnd = readGrasslandsMainSourceEvidence(report.fullSourceAtEnd.head);
  report.serverAtEnd = readServerProvenance();
  assertAcceptance(
    report.sourceAtEnd.head === sourceAtStart.head,
    `Git HEAD changed during ${GATE}: ${sourceAtStart.head} -> ${report.sourceAtEnd.head}.`,
    { sourceAtStart, sourceAtEnd: report.sourceAtEnd }
  );
  assertAcceptance(
    report.fullSourceAtEnd.head === fullSourceAtStart.head &&
      report.fullSourceAtEnd.branch === fullSourceAtStart.branch,
    `Full-repository Git identity changed during ${GATE}.`,
    { fullSourceAtStart, fullSourceAtEnd: report.fullSourceAtEnd }
  );
  assertGrasslandsMainSourceBoundary(report.grasslandsMainSourceAtEnd, "Grasslands main.ts at end");
  assertAcceptance(
    report.grasslandsMainSourceAtStart.sha256 === report.grasslandsMainSourceAtEnd.sha256 &&
      report.grasslandsMainSourceAtStart.head === fullSourceAtStart.head &&
      report.grasslandsMainSourceAtEnd.head === report.fullSourceAtEnd.head,
    `Grasslands main.ts source or HEAD provenance changed during ${GATE}.`,
    {
      grasslandsMainSourceAtStart: report.grasslandsMainSourceAtStart,
      grasslandsMainSourceAtEnd: report.grasslandsMainSourceAtEnd
    }
  );
  assertDeepEqual(report.serverAtEnd, report.serverAtStart, `Local Vite server provenance changed during ${GATE}.`);
  const cleanCommitEvidence =
    fullSourceAtStart.fullRepositoryStatus === "" &&
    report.fullSourceAtEnd.fullRepositoryStatus === "" &&
    fullSourceAtStart.head === report.fullSourceAtEnd.head;
  if (!diagnosticMode) {
    assertAcceptance(missingFormalFields.size === 0, `Formal ${GATE} is missing runtime-observed evidence fields.`, {
      missingFields: [...missingFormalFields]
    });
    assertAcceptance(cleanCommitEvidence, `Formal ${GATE} did not remain on one completely clean commit.`, {
      fullSourceAtStart,
      fullSourceAtEnd: report.fullSourceAtEnd
    });
    report.finalEvidenceEligible = true;
    report.qualification = "clean-commit-formal-evidence";
    report.status = "passed";
  } else {
    report.finalEvidenceEligible = false;
    report.qualification = cleanCommitEvidence ? "diagnostic-only" : "dirty-diagnostic-only";
    report.status = cleanCommitEvidence ? "diagnostic-passed" : "diagnostic-passed-dirty";
  }
} catch (error) {
  report.failures.push(serializeError(error));
  report.status = "failed";
  report.qualification = "failed";
  report.sourceAtEnd = readGitEvidence();
  report.fullSourceAtEnd = readFullGitEvidence();
  try {
    report.grasslandsMainSourceAtEnd = readGrasslandsMainSourceEvidence(report.fullSourceAtEnd.head);
  } catch (sourceError) {
    report.failures.push({ phase: "grasslands-main-source-end", ...serializeError(sourceError) });
  }
  try {
    report.serverAtEnd = readServerProvenance();
  } catch (serverError) {
    report.failures.push({ phase: "server-end-provenance", ...serializeError(serverError) });
  }
} finally {
  await browser?.close().catch((error) => {
    report.failures.push({ phase: "browser-close", ...serializeError(error) });
    report.finalEvidenceEligible = false;
    report.status = "failed";
    report.qualification = "failed";
  });
  report.formalRequirements.missingFields = [...missingFormalFields];
  report.completedAt = new Date().toISOString();
  await writeAcceptanceReport(run, report);
  console.log(JSON.stringify(report, null, 2));
}

if (report.status === "failed") process.exitCode = 1;
