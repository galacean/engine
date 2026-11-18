import { generateColdSmokeMountain, traceFallLineFeature } from "./generator";
import {
  createPresetRecipe,
  type ColdSmokeMountainRecipe,
  type FeatureKind,
  type GuideRole,
  type MountainPresetId,
  type RockAppearanceMode,
  type VistaLightingMode
} from "./model";
import { createColdSmokeRenderer } from "./renderer";

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id);
const select = (id: string) => el<HTMLSelectElement>(id);
const button = (id: string) => el<HTMLButtonElement>(id);

type ClickMode =
  | "select"
  | "place-guide"
  | "carve-gully"
  | "carve-valley"
  | "sculpt-raise"
  | "sculpt-carve";

async function boot() {
  const params = new URLSearchParams(location.search);
  const initialPreset = (params.get("preset") as MountainPresetId) || "hanyan-valley";
  const initialSeed = Number(params.get("seed")) || 261111;

  let recipe: ColdSmokeMountainRecipe = createPresetRecipe(
    ["hanyan-valley", "twin-couloirs", "knife-ridge", "cirque-basin"].includes(initialPreset)
      ? initialPreset
      : "hanyan-valley",
    initialSeed
  );

  let selectedGuideId = recipe.guides[0]?.id ?? "";
  let selectedFeatureId = recipe.features[0]?.id ?? "";
  let clickMode: ClickMode = "select";
  let brushRadius = 75;
  let guideCounter = recipe.guides.length + 1;
  let featureCounter = recipe.features.length + 1;

  const renderer = await createColdSmokeRenderer("canvas");

  function setClickMode(next: ClickMode) {
    clickMode = next;
    button("place-guide-click").setAttribute("aria-pressed", String(clickMode === "place-guide"));
    button("carve-gully-click").setAttribute("aria-pressed", String(clickMode === "carve-gully"));
    button("carve-valley-click").setAttribute("aria-pressed", String(clickMode === "carve-valley"));
    button("sculpt-raise-btn").setAttribute("aria-pressed", String(clickMode === "sculpt-raise"));
    button("sculpt-carve-btn").setAttribute("aria-pressed", String(clickMode === "sculpt-carve"));
    if (clickMode !== "sculpt-raise" && clickMode !== "sculpt-carve") {
      renderer.setBrushCursor(0, 0, brushRadius, false);
    }
    const hint = el("pick-hint");
    if (clickMode === "place-guide") {
      hint.textContent = "Click any spot on the mountain to place a new Guide OBB";
    } else if (clickMode === "carve-gully") {
      hint.textContent = "Click any mountain wall to trace & carve a fall-line Couloir/Gully";
    } else if (clickMode === "carve-valley") {
      hint.textContent = "Click any slope to trace & carve a U/V Valley with tributaries";
    } else if (clickMode === "sculpt-raise") {
      hint.textContent = "Click or drag on the mountain to sculpt & raise peaks/ridges";
    } else if (clickMode === "sculpt-carve") {
      hint.textContent = "Click or drag on the mountain to carve custom bowls & gullies";
    } else {
      hint.textContent = "Drag any 3D Guide OBB or Gully/Valley diamond handle, or use 3D Carve/Sculpt tools";
    }
  }

  function currentGuide() {
    return recipe.guides.find((g) => g.id === selectedGuideId) ?? recipe.guides[0];
  }

  function currentFeature() {
    return recipe.features.find((f) => f.id === selectedFeatureId) ?? recipe.features[0];
  }

  function syncUIFromRecipe() {
    select("preset-select").value = recipe.presetId;
    input("seed-input").value = String(recipe.seed);
    select("resolution-select").value = String(recipe.domain.resolution);

    // Vista
    select("vista-lighting").value = recipe.vista.lighting;
    input("sun-azimuth").value = String(recipe.vista.sunAzimuthDegrees);
    el("val-sun-az").textContent = `${recipe.vista.sunAzimuthDegrees}°`;
    input("sun-elevation").value = String(recipe.vista.sunElevationDegrees);
    el("val-sun-el").textContent = `${recipe.vista.sunElevationDegrees.toFixed(1)}°`;
    input("vista-far-ranges").checked = recipe.vista.showFarRanges;
    input("vista-cloud-sea").checked = recipe.vista.showCloudSea;
    input("vista-city").checked = recipe.vista.showCity;

    // Guide list
    const guideSelect = select("guide-select");
    guideSelect.replaceChildren(
      ...recipe.guides.map((g) => {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = `${g.enabled ? "●" : "○"} ${g.name} (${g.role})`;
        return opt;
      })
    );
    const g = currentGuide();
    if (g) {
      selectedGuideId = g.id;
      guideSelect.value = g.id;
      input("guide-enabled").checked = g.enabled;
      select("guide-role").value = g.role;
      input("guide-cx").value = String(Math.round(g.center[0]));
      input("guide-cy").value = String(Math.round(g.center[1]));
      input("guide-cz").value = String(Math.round(g.center[2]));
      input("guide-sx").value = String(Math.round(g.size[0]));
      input("guide-sy").value = String(Math.round(g.size[1]));
      input("guide-sz").value = String(Math.round(g.size[2]));
      input("guide-yaw").value = String(g.yawDegrees);
      el("val-guide-yaw").textContent = `${g.yawDegrees}°`;
      input("guide-slope").value = String(g.slopeRate);
      el("val-guide-slope").textContent = g.slopeRate.toFixed(2);
      input("guide-crown").value = String(g.crownShape);
      el("val-guide-crown").textContent = g.crownShape.toFixed(2);
      input("guide-boost").value = String(g.reliefBoost);
      el("val-guide-boost").textContent = `${g.reliefBoost.toFixed(2)}×`;
    }

    // Corridor
    input("corridor-enabled").checked = recipe.corridor.enabled;
    input("corridor-hw").value = String(recipe.corridor.halfWidth);
    el("val-corridor-hw").textContent = `${recipe.corridor.halfWidth} m`;
    input("corridor-apron").value = String(recipe.corridor.apronWidth);
    el("val-corridor-apron").textContent = `${recipe.corridor.apronWidth} m`;
    input("corridor-wall").value = String(recipe.corridor.wallHeight);
    el("val-corridor-wall").textContent = `${recipe.corridor.wallHeight} m`;
    input("corridor-sin").value = String(recipe.corridor.sinuosity);
    el("val-corridor-sin").textContent = recipe.corridor.sinuosity.toFixed(2);

    // Feature list (Gullies / Valleys / Ridges)
    const featSelect = select("feature-select");
    featSelect.replaceChildren(
      ...recipe.features.map((f) => {
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = `${f.enabled ? "●" : "○"} ${f.name}`;
        return opt;
      })
    );
    const f = currentFeature();
    if (f) {
      selectedFeatureId = f.id;
      featSelect.value = f.id;
      input("feature-enabled").checked = f.enabled;
      select("feature-kind").value = f.kind;
      input("feature-depth").value = String(f.depth);
      el("val-feat-depth").textContent = `${f.depth} m`;
      input("feature-width").value = String(f.width);
      el("val-feat-width").textContent = `${f.width} m`;
      input("feature-sharpness").value = String(f.sharpness);
      el("val-feat-sharp").textContent = f.sharpness.toFixed(2);
      input("feature-tributaries").checked = f.tributaries;
      input("feature-trib-strength").value = String(f.tributaryStrength);
      el("val-feat-trib").textContent = f.tributaryStrength.toFixed(2);
      input("feat-p0x").value = String(Math.round(f.points[0][0]));
      input("feat-p0z").value = String(Math.round(f.points[0][1]));
      input("feat-p1x").value = String(Math.round(f.points[1][0]));
      input("feat-p1z").value = String(Math.round(f.points[1][1]));
      input("feat-p2x").value = String(Math.round(f.points[2][0]));
      input("feat-p2z").value = String(Math.round(f.points[2][1]));
    }

    // Pipeline controls
    select("rock-mode").value = recipe.strata.rockMode;
    input("proc-gullies-enabled").checked = recipe.proceduralGullies.enabled;
    select("proc-gully-octaves").value = String(recipe.proceduralGullies.octaves);
    input("proc-gully-scale").value = String(recipe.proceduralGullies.wavelengthScale);
    input("proc-gully-strength").value = String(recipe.proceduralGullies.strength);
    el("val-proc-gully").textContent = recipe.proceduralGullies.strength.toFixed(2);
    input("proc-gully-bend").value = String(recipe.proceduralGullies.tributaryBend);
    el("val-proc-bend").textContent = recipe.proceduralGullies.tributaryBend.toFixed(2);

    input("relief-enabled").checked = recipe.relief.enabled;
    input("relief-amp").value = String(recipe.relief.amplitude);
    el("val-relief-amp").textContent = recipe.relief.amplitude.toFixed(2);

    input("strata-enabled").checked = recipe.strata.enabled;
    input("strata-carving").value = String(recipe.strata.benchCarving);
    el("val-strata-carve").textContent = recipe.strata.benchCarving.toFixed(2);
    input("strata-thickness").value = String(recipe.strata.bedThickness);
    el("val-strata-bed").textContent = `${recipe.strata.bedThickness} m`;
    input("strata-fold").value = String(recipe.strata.foldStrength);
    el("val-strata-fold").textContent = recipe.strata.foldStrength.toFixed(2);

    input("forest-enabled").checked = recipe.forest.enabled;
    input("forest-density").value = String(recipe.forest.density);
    el("val-forest-density").textContent = `${recipe.forest.density.toFixed(2)}×`;
    input("forest-treeline").value = String(recipe.forest.treeLineHeight);
    el("val-forest-treeline").textContent = `${recipe.forest.treeLineHeight} m`;
  }

  function rebuildTerrain() {
    const result = generateColdSmokeMountain(recipe);
    renderer.updateTerrainMesh(result);
    renderer.updateOverlays(recipe, {
      showGuides: input("show-guides").checked,
      showFeatures: input("show-features").checked,
      selectedGuideId,
      selectedFeatureId
    });
    const d = result.diagnostics;
    el("status").textContent =
      `Seed ${recipe.seed} · ${recipe.domain.resolution}×${recipe.domain.resolution} (${d.triangles.toLocaleString()} tris) · ` +
      `${d.activeGuides} Guide OBBs · ${d.activeFeatures} Gullies/Valleys · ` +
      `Elevation ${Math.round(d.minHeight)}…${Math.round(d.maxHeight)} m · ${d.generationMs.toFixed(1)} ms`;
  }

  function refreshOverlaysOnly() {
    renderer.updateOverlays(recipe, {
      showGuides: input("show-guides").checked,
      showFeatures: input("show-features").checked,
      selectedGuideId,
      selectedFeatureId
    });
  }

  // Header & Camera buttons
  button("view-overview").onclick = () => renderer.resetCameraView("overview");
  button("view-valley").onclick = () => renderer.resetCameraView("valley");
  button("view-top").onclick = () => renderer.resetCameraView("top");
  button("export-json").onclick = () => {
    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cold-smoke-mountain-${recipe.presetId}-${recipe.seed}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Preset & Seed events
  select("preset-select").onchange = () => {
    const nextPreset = select("preset-select").value as MountainPresetId;
    recipe = createPresetRecipe(nextPreset, recipe.seed);
    selectedGuideId = recipe.guides[0]?.id ?? "";
    selectedFeatureId = recipe.features[0]?.id ?? "";
    syncUIFromRecipe();
    rebuildTerrain();
  };
  input("seed-input").onchange = () => {
    recipe.seed = Math.max(1, Math.floor(Number(input("seed-input").value) || 261111));
    rebuildTerrain();
  };
  button("next-seed").onclick = () => {
    recipe.seed += 1;
    syncUIFromRecipe();
    rebuildTerrain();
  };
  button("reset-preset").onclick = () => {
    recipe = createPresetRecipe(recipe.presetId, recipe.seed);
    selectedGuideId = recipe.guides[0]?.id ?? "";
    selectedFeatureId = recipe.features[0]?.id ?? "";
    syncUIFromRecipe();
    rebuildTerrain();
  };
  select("resolution-select").onchange = () => {
    recipe.domain.resolution = Number(select("resolution-select").value) || 193;
    rebuildTerrain();
  };

  input("show-guides").onchange = refreshOverlaysOnly;
  input("show-features").onchange = refreshOverlaysOnly;

  // Vista events
  select("vista-lighting").onchange = () => {
    const mode = select("vista-lighting").value as VistaLightingMode;
    recipe.vista.lighting = mode;
    if (mode === "golden") recipe.vista.sunElevationDegrees = 5.5;
    else if (mode === "night") recipe.vista.sunElevationDegrees = -9.5;
    else if (mode === "day") recipe.vista.sunElevationDegrees = 11.5;
    syncUIFromRecipe();
    renderer.syncAtmosphere(recipe);
  };
  input("sun-azimuth").oninput = () => {
    recipe.vista.sunAzimuthDegrees = Number(input("sun-azimuth").value);
    el("val-sun-az").textContent = `${recipe.vista.sunAzimuthDegrees}°`;
    renderer.syncAtmosphere(recipe);
  };
  input("sun-azimuth").onchange = rebuildTerrain; // Re-bake horizon self-shadow channel toward new sun azimuth
  input("sun-elevation").oninput = () => {
    recipe.vista.sunElevationDegrees = Number(input("sun-elevation").value);
    el("val-sun-el").textContent = `${recipe.vista.sunElevationDegrees.toFixed(1)}°`;
    renderer.syncAtmosphere(recipe);
  };
  for (const [id, key] of [
    ["vista-far-ranges", "showFarRanges"],
    ["vista-cloud-sea", "showCloudSea"],
    ["vista-city", "showCity"]
  ] as const) {
    input(id).onchange = () => {
      recipe.vista[key] = input(id).checked;
      renderer.syncAtmosphere(recipe);
    };
  }

  // Guide OBB events
  select("guide-select").onchange = () => {
    selectedGuideId = select("guide-select").value;
    syncUIFromRecipe();
    refreshOverlaysOnly();
  };
  button("place-guide-click").onclick = () => {
    setClickMode(clickMode === "place-guide" ? "select" : "place-guide");
  };

  function addGuide(role: GuideRole, center: [number, number, number] = [0, 0, 0]) {
    const id = `guide-${role}-${guideCounter++}`;
    const roleLabel: Record<GuideRole, string> = {
      massif: "Massif · 邻山主峰",
      wall: "Wall · 侧壁山肩",
      ridge: "Ridge · 山脊引导",
      basin: "Basin · 盆地下切"
    };
    recipe.guides.push({
      id,
      name: `${roleLabel[role]} #${guideCounter - 1}`,
      role,
      enabled: true,
      center,
      size: role === "ridge" ? [240, 260, 520] : role === "basin" ? [320, 80, 420] : [380, 290, 480],
      yawDegrees: 0,
      slopeRate: role === "basin" ? 0.85 : 1.3,
      crownShape: role === "basin" ? -0.6 : role === "ridge" ? 0.8 : 0.6,
      reliefBoost: role === "basin" ? 0.2 : 1.2
    });
    selectedGuideId = id;
    syncUIFromRecipe();
    rebuildTerrain();
  }

  button("add-guide-massif").onclick = () => addGuide("massif", [-280, 0, 40]);
  button("add-guide-ridge").onclick = () => addGuide("ridge", [240, 0, -80]);
  button("add-guide-basin").onclick = () => addGuide("basin", [0, 0, 60]);
  button("remove-guide").onclick = () => {
    if (recipe.guides.length <= 1) return;
    recipe.guides = recipe.guides.filter((g) => g.id !== selectedGuideId);
    selectedGuideId = recipe.guides[0]?.id ?? "";
    syncUIFromRecipe();
    rebuildTerrain();
  };

  const updateGuideFromInputs = () => {
    const g = currentGuide();
    if (!g) return;
    g.enabled = input("guide-enabled").checked;
    g.role = select("guide-role").value as GuideRole;
    g.center = [
      Number(input("guide-cx").value) || 0,
      Number(input("guide-cy").value) || 0,
      Number(input("guide-cz").value) || 0
    ];
    g.size = [
      Math.max(20, Number(input("guide-sx").value) || 200),
      Math.max(10, Number(input("guide-sy").value) || 200),
      Math.max(20, Number(input("guide-sz").value) || 200)
    ];
    g.yawDegrees = Number(input("guide-yaw").value) || 0;
    g.slopeRate = Number(input("guide-slope").value) || 1.2;
    g.crownShape = Number(input("guide-crown").value) || 0;
    g.reliefBoost = Number(input("guide-boost").value) || 1.0;
    syncUIFromRecipe();
    rebuildTerrain();
  };

  for (const id of [
    "guide-enabled",
    "guide-role",
    "guide-cx",
    "guide-cy",
    "guide-cz",
    "guide-sx",
    "guide-sy",
    "guide-sz",
    "guide-yaw",
    "guide-slope",
    "guide-crown",
    "guide-boost"
  ]) {
    el(id).addEventListener("input", updateGuideFromInputs);
  }

  // Corridor events
  const updateCorridorFromInputs = () => {
    recipe.corridor.enabled = input("corridor-enabled").checked;
    recipe.corridor.halfWidth = Number(input("corridor-hw").value) || 48;
    recipe.corridor.apronWidth = Number(input("corridor-apron").value) || 36;
    recipe.corridor.wallHeight = Number(input("corridor-wall").value) || 145;
    recipe.corridor.sinuosity = Number(input("corridor-sin").value) || 0;
    syncUIFromRecipe();
    rebuildTerrain();
  };
  for (const id of ["corridor-enabled", "corridor-hw", "corridor-apron", "corridor-wall", "corridor-sin"]) {
    el(id).addEventListener("input", updateCorridorFromInputs);
  }

  // Gully / Valley / Ridge Feature events
  select("feature-select").onchange = () => {
    selectedFeatureId = select("feature-select").value;
    syncUIFromRecipe();
    refreshOverlaysOnly();
  };
  button("carve-gully-click").onclick = () => {
    setClickMode(clickMode === "carve-gully" ? "select" : "carve-gully");
  };
  button("carve-valley-click").onclick = () => {
    setClickMode(clickMode === "carve-valley" ? "select" : "carve-valley");
  };
  button("sculpt-raise-btn").onclick = () => {
    setClickMode(clickMode === "sculpt-raise" ? "select" : "sculpt-raise");
  };
  button("sculpt-carve-btn").onclick = () => {
    setClickMode(clickMode === "sculpt-carve" ? "select" : "sculpt-carve");
  };
  button("clear-sculpt-btn").onclick = () => {
    recipe.sculptStamps = [];
    rebuildTerrain();
  };
  input("brush-radius").oninput = () => {
    brushRadius = Number(input("brush-radius").value) || 75;
    el("val-brush-rad").textContent = `${brushRadius} m`;
  };

  function addAuthoredFeature(kind: FeatureKind, clickX?: number, clickZ?: number) {
    const cx = clickX ?? (kind === "gully" ? 240 : kind === "valley" ? -220 : 260);
    const cz = clickZ ?? (kind === "gully" ? -40 : kind === "valley" ? 80 : -160);
    const feat = traceFallLineFeature(recipe, cx, cz, kind, featureCounter++);
    recipe.features.push(feat);
    selectedFeatureId = feat.id;
    syncUIFromRecipe();
    rebuildTerrain();
  }

  button("add-feature-gully").onclick = () => addAuthoredFeature("gully");
  button("add-feature-valley").onclick = () => addAuthoredFeature("valley");
  button("add-feature-ridge").onclick = () => addAuthoredFeature("ridge");
  button("remove-feature").onclick = () => {
    if (!recipe.features.length) return;
    recipe.features = recipe.features.filter((f) => f.id !== selectedFeatureId);
    selectedFeatureId = recipe.features[0]?.id ?? "";
    syncUIFromRecipe();
    rebuildTerrain();
  };

  const updateFeatureFromInputs = () => {
    const f = currentFeature();
    if (!f) return;
    f.enabled = input("feature-enabled").checked;
    f.kind = select("feature-kind").value as FeatureKind;
    f.depth = Number(input("feature-depth").value) || 40;
    f.width = Number(input("feature-width").value) || 60;
    f.sharpness = Number(input("feature-sharpness").value) || 0.5;
    f.tributaries = input("feature-tributaries").checked;
    f.tributaryStrength = Number(input("feature-trib-strength").value) || 0;
    f.points = [
      [Number(input("feat-p0x").value) || 0, Number(input("feat-p0z").value) || 0],
      [Number(input("feat-p1x").value) || 0, Number(input("feat-p1z").value) || 0],
      [Number(input("feat-p2x").value) || 0, Number(input("feat-p2z").value) || 0]
    ];
    syncUIFromRecipe();
    rebuildTerrain();
  };

  for (const id of [
    "feature-enabled",
    "feature-kind",
    "feature-depth",
    "feature-width",
    "feature-sharpness",
    "feature-tributaries",
    "feature-trib-strength",
    "feat-p0x",
    "feat-p0z",
    "feat-p1x",
    "feat-p1z",
    "feat-p2x",
    "feat-p2z"
  ]) {
    el(id).addEventListener("input", updateFeatureFromInputs);
  }

  // Cold Smoke Procedural Pipeline events
  select("rock-mode").onchange = () => {
    recipe.strata.rockMode = select("rock-mode").value as RockAppearanceMode;
    renderer.syncAtmosphere(recipe);
  };

  const updatePipelineFromInputs = () => {
    recipe.proceduralGullies.enabled = input("proc-gullies-enabled").checked;
    recipe.proceduralGullies.octaves = (Number(select("proc-gully-octaves").value) || 4) as 1 | 2 | 3 | 4;
    recipe.proceduralGullies.wavelengthScale = Number(input("proc-gully-scale").value) || 1.0;
    recipe.proceduralGullies.strength = Number(input("proc-gully-strength").value) || 0;
    recipe.proceduralGullies.tributaryBend = Number(input("proc-gully-bend").value) || 0;

    recipe.relief.enabled = input("relief-enabled").checked;
    recipe.relief.amplitude = Number(input("relief-amp").value) || 0;

    recipe.strata.enabled = input("strata-enabled").checked;
    recipe.strata.benchCarving = Number(input("strata-carving").value) || 0;
    recipe.strata.bedThickness = Number(input("strata-thickness").value) || 64;
    recipe.strata.foldStrength = Number(input("strata-fold").value) || 1.0;

    recipe.forest.enabled = input("forest-enabled").checked;
    recipe.forest.density = Number(input("forest-density").value) || 1.0;
    recipe.forest.treeLineHeight = Number(input("forest-treeline").value) || 155;

    syncUIFromRecipe();
    rebuildTerrain();
  };

  for (const id of [
    "proc-gullies-enabled",
    "proc-gully-octaves",
    "proc-gully-scale",
    "proc-gully-strength",
    "proc-gully-bend",
    "relief-enabled",
    "relief-amp",
    "strata-enabled",
    "strata-carving",
    "strata-thickness",
    "strata-fold",
    "forest-enabled",
    "forest-density",
    "forest-treeline"
  ]) {
    el(id).addEventListener("input", updatePipelineFromInputs);
  }

  // 3D Viewport interaction: direct handle/guide dragging, sculpt brushing, and click-to-place/carve
  const canvas = el<HTMLCanvasElement>("canvas");
  let downPos: [number, number] | null = null;
  let activeDrag:
    | { kind: "feature-point"; featureId: string; pointIndex: 0 | 1 | 2 }
    | { kind: "guide"; guideId: string; offsetX: number; offsetZ: number }
    | { kind: "sculpt"; deltaSign: number; lastX: number; lastZ: number }
    | null = null;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    downPos = [e.clientX, e.clientY];

    if (clickMode === "sculpt-raise" || clickMode === "sculpt-carve") {
      const hit = renderer.pickScene(e.clientX, e.clientY, recipe, true);
      if (hit) {
        const deltaSign = clickMode === "sculpt-raise" ? 1 : -1;
        renderer.setOrbitEnabled(false);
        recipe.sculptStamps.push({
          x: hit.point[0],
          z: hit.point[2],
          radius: brushRadius,
          deltaHeight: deltaSign * 18
        });
        activeDrag = { kind: "sculpt", deltaSign, lastX: hit.point[0], lastZ: hit.point[2] };
        rebuildTerrain();
      }
      return;
    }

    if (clickMode === "select") {
      const hit = renderer.pickScene(e.clientX, e.clientY, recipe, false);
      if (hit?.kind === "feature-point" && hit.featureId && hit.pointIndex !== undefined) {
        selectedFeatureId = hit.featureId;
        activeDrag = {
          kind: "feature-point",
          featureId: hit.featureId,
          pointIndex: hit.pointIndex
        };
        renderer.setOrbitEnabled(false);
        syncUIFromRecipe();
        refreshOverlaysOnly();
      } else if (hit?.kind === "guide" && hit.guideId) {
        selectedGuideId = hit.guideId;
        const g = recipe.guides.find((item) => item.id === hit.guideId);
        if (g) {
          activeDrag = {
            kind: "guide",
            guideId: g.id,
            offsetX: g.center[0] - hit.point[0],
            offsetZ: g.center[2] - hit.point[2]
          };
          renderer.setOrbitEnabled(false);
        }
        syncUIFromRecipe();
        refreshOverlaysOnly();
      }
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (clickMode === "sculpt-raise" || clickMode === "sculpt-carve") {
      const hit = renderer.pickScene(e.clientX, e.clientY, recipe, true);
      if (hit) {
        renderer.setBrushCursor(hit.point[0], hit.point[2], brushRadius, true);
        if (activeDrag?.kind === "sculpt") {
          const dist = Math.hypot(hit.point[0] - activeDrag.lastX, hit.point[2] - activeDrag.lastZ);
          if (dist > brushRadius * 0.28) {
            activeDrag.lastX = hit.point[0];
            activeDrag.lastZ = hit.point[2];
            recipe.sculptStamps.push({
              x: hit.point[0],
              z: hit.point[2],
              radius: brushRadius,
              deltaHeight: activeDrag.deltaSign * 14
            });
            rebuildTerrain();
          }
        }
      } else {
        renderer.setBrushCursor(0, 0, brushRadius, false);
      }
      return;
    }

    if (!activeDrag) return;
    const hit = renderer.pickScene(e.clientX, e.clientY, recipe, true);
    if (!hit) return;

    if (activeDrag.kind === "feature-point") {
      const targetFeatureId = activeDrag.featureId;
      const targetPointIndex = activeDrag.pointIndex;
      const f = recipe.features.find((item) => item.id === targetFeatureId);
      if (f) {
        f.points[targetPointIndex] = [Math.round(hit.point[0]), Math.round(hit.point[2])];
        syncUIFromRecipe();
        rebuildTerrain();
      }
    } else if (activeDrag.kind === "guide") {
      const targetGuideId = activeDrag.guideId;
      const g = recipe.guides.find((item) => item.id === targetGuideId);
      if (g) {
        g.center[0] = Math.round(hit.point[0] + activeDrag.offsetX);
        g.center[2] = Math.round(hit.point[2] + activeDrag.offsetZ);
        syncUIFromRecipe();
        rebuildTerrain();
      }
    }
  });

  window.addEventListener("pointerup", (e) => {
    if (activeDrag) {
      activeDrag = null;
      renderer.setOrbitEnabled(true);
    }
    if (e.button !== 0 || !downPos) return;
    const dist = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
    downPos = null;
    if (dist > 5) return; // Was an orbit or handle drag

    if (clickMode === "place-guide" || clickMode === "carve-gully" || clickMode === "carve-valley") {
      const hit = renderer.pickScene(e.clientX, e.clientY, recipe, true);
      if (!hit) return;
      if (clickMode === "place-guide") {
        addGuide("massif", [Math.round(hit.point[0]), 0, Math.round(hit.point[2])]);
      } else if (clickMode === "carve-gully") {
        addAuthoredFeature("gully", hit.point[0], hit.point[2]);
      } else if (clickMode === "carve-valley") {
        addAuthoredFeature("valley", hit.point[0], hit.point[2]);
      }
      setClickMode("select");
    }
  });

  syncUIFromRecipe();
  rebuildTerrain();
}

boot().catch((err) => {
  console.error("Failed to start Cold Smoke Mountain Lab:", err);
  const status = document.getElementById("status");
  if (status) status.textContent = `Startup error: ${err instanceof Error ? err.message : String(err)}`;
});
