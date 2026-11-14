import type { BehaviorNode } from "../behavior/BehaviorTree";
import { validateAnimalTaskProfile, type AnimalTaskProfile, type AnimalAnimationChoice } from "./AnimalTaskController";

/** Authored animation meaning; source clip names never determine runtime decisions. */
export enum AnimalActivity {
  Idle = "idle",
  Move = "move",
  Eat = "eat",
  Rest = "rest",
  Stretch = "stretch",
  Display = "display",
  Unclassified = "unclassified"
}
/** Locomotion style, independent of the mesh or source animation name. */
export enum AnimalGait {
  Walk = "walk",
  Run = "run",
  Hop = "hop",
  Fly = "fly",
  Swim = "swim"
}
/** Physical medium required by an animation. */
export enum AnimalMedium {
  Ground = "ground",
  Water = "water",
  Air = "air"
}
/** Authored pose; crossfade is allowed between poses without mandatory transition clips. */
export enum AnimalPosture {
  Standing = "standing",
  Sitting = "sitting",
  Lying = "lying",
  Floating = "floating",
  Airborne = "airborne"
}
/** Host-provided habitat tags. Climate simulation is not implied by a tag. */
export enum AnimalHabitat {
  Grassland = "grassland",
  River = "river",
  Woodland = "woodland",
  Waterside = "waterside",
  Arid = "arid",
  Cold = "cold",
  Settlement = "settlement"
}
/** Runtime target queries supplied by the application/world adapter. */
export enum AnimalQuery {
  Wander = "wander",
  Riverbank = "riverbank",
  Flee = "flee",
  Food = "food",
  FoodAtMouth = "foodAtMouth",
  MediumAvailable = "mediumAvailable"
}
/** Shared condition identifiers understood by the task recipe compiler. */
export enum AnimalCondition {
  TargetAvailable = "targetAvailable",
  InMedium = "inMedium"
}
/** Distinguish raw-name attribution, reviewed semantics and non-moving source clips. */
export enum AnimalSemanticEvidence {
  SourceName = "source-name",
  Reviewed = "reviewed",
  Unknown = "unknown",
  Static = "static"
}

/** One source binding, classified explicitly at content registration time. */
export interface AnimalAnimationSemantic {
  activity: AnimalActivity;
  medium: AnimalMedium;
  gait?: AnimalGait;
  posture?: AnimalPosture;
  evidence: AnimalSemanticEvidence;
}
/** Weighted autonomous task, evaluated only when its world conditions are satisfied. */
export interface AnimalAutonomyRule {
  activity: AnimalActivity;
  gait?: AnimalGait;
  posture?: AnimalPosture;
  weight: number;
}
/** Shared species/gameplay data. Variants reuse this record; values are application-authored preferences. */
export interface AnimalSpeciesRegistration {
  id: string;
  habitats: { habitat: AnimalHabitat; weight: number }[];
  autonomy: AnimalAutonomyRule[];
  groundGaits: AnimalGait[];
  fleeGaits: AnimalGait[];
  preferredMedium?: AnimalMedium;
  fleeWeights?: { gait: AnimalGait; weight: number }[];
  /** Escape travel and gait pace relative to the same ordinary movement, default 1. */
  fleeSpeedMultiplier?: number;
  provenance: string;
}
/** Per-model meaning and physical calibration; no source-name heuristics run after registration. */
export interface AnimalModelRegistration {
  assetId: string;
  species: string;
  spawnRadius: number;
  /** Slow pace when one executable gait serves both movement intents; defaults to 0.5. */
  slowMovementRatio?: number;
  animations: Record<string, AnimalAnimationSemantic>;
}
/** JSON content package; species and model IDs remain extensible content identities. */
export interface AnimalRegistrationCatalog {
  version: 1;
  species: Record<string, AnimalSpeciesRegistration>;
  models: AnimalModelRegistration[];
}
/** Minimal asset contract needed to compile registration into the existing behavior executor. */
export interface AnimalRegistrationAsset {
  id: string;
  /** Metre scale used only to size autonomous travel goals; defaults to 1. */
  scale?: number;
  animations: { id: string; speed?: number; playbackRate?: number }[];
}

const enumValue = (value: unknown, values: object) => Object.values(values).includes(value);
const positiveWeight = (value: number) => Number.isFinite(value) && value >= 0;
const slotOf = (s: Pick<AnimalAnimationSemantic, "activity" | "gait" | "posture">): string =>
  s.activity === AnimalActivity.Move ? s.gait! : s.activity === AnimalActivity.Rest ? `rest.${s.posture}` : s.activity;

/**
 * Validate exact enum values, complete model coverage, clip references and species dependencies.
 * @param value Parsed JSON; invalid registrations fail before any scene assets are loaded.
 * @param assets Actual configured asset bindings, rather than inferred filename capabilities.
 * @returns A detached catalog suitable for runtime compilation.
 */
export function readAnimalRegistrations(
  value: unknown,
  assets: readonly AnimalRegistrationAsset[]
): AnimalRegistrationCatalog {
  const catalog = value as AnimalRegistrationCatalog;
  if (catalog?.version !== 1 || !catalog.species || !Array.isArray(catalog.models))
    throw new Error("Invalid animal registrations");
  for (const [id, species] of Object.entries(catalog.species)) {
    if (
      species?.id !== id ||
      !species.provenance ||
      (species.preferredMedium !== undefined && !enumValue(species.preferredMedium, AnimalMedium)) ||
      (species.fleeWeights !== undefined &&
        (!Array.isArray(species.fleeWeights) ||
          !species.fleeWeights.every((entry) => enumValue(entry.gait, AnimalGait) && positiveWeight(entry.weight)))) ||
      !Array.isArray(species.habitats) ||
      !species.habitats.length ||
      !species.habitats.every((h) => enumValue(h.habitat, AnimalHabitat) && positiveWeight(h.weight)) ||
      !species.habitats.some((h) => h.weight > 0) ||
      !Number.isFinite(species.habitats.reduce((sum, h) => sum + h.weight, 0)) ||
      !Array.isArray(species.autonomy) ||
      !species.autonomy.length ||
      !species.autonomy.every(
        (r) =>
          enumValue(r.activity, AnimalActivity) &&
          r.activity !== AnimalActivity.Unclassified &&
          positiveWeight(r.weight) &&
          !("cycles" in r) &&
          (r.gait === undefined || enumValue(r.gait, AnimalGait)) &&
          (r.activity !== AnimalActivity.Move || r.gait !== undefined) &&
          (r.activity === AnimalActivity.Move || r.gait === undefined) &&
          (r.activity !== AnimalActivity.Rest || [AnimalPosture.Sitting, AnimalPosture.Lying].includes(r.posture!)) &&
          (r.posture === undefined || enumValue(r.posture, AnimalPosture))
      ) ||
      ![species.groundGaits, species.fleeGaits].every(
        (g) =>
          Array.isArray(g) && g.length && g.every((v) => [AnimalGait.Walk, AnimalGait.Run, AnimalGait.Hop].includes(v))
      ) ||
      (species.fleeSpeedMultiplier !== undefined &&
        (!Number.isFinite(species.fleeSpeedMultiplier) || species.fleeSpeedMultiplier <= 0))
    )
      throw new Error(`Invalid animal species: ${id}`);
  }
  const seen = new Set<string>();
  for (const model of catalog.models) {
    const asset = assets.find((a) => a.id === model.assetId);
    if (
      !asset ||
      seen.has(model.assetId) ||
      !Object.prototype.hasOwnProperty.call(catalog.species, model.species) ||
      !Number.isFinite(model.spawnRadius) ||
      model.spawnRadius <= 0 ||
      !model.animations
    )
      throw new Error(`Invalid animal model registration: ${model.assetId}`);
    seen.add(model.assetId);
    if (Object.keys(model.animations).length !== asset.animations.length)
      throw new Error(`Incomplete animation registration: ${model.assetId}`);
    for (const [id, semantic] of Object.entries(model.animations)) {
      const clip = asset.animations.find((a) => a.id === id);
      if (
        !clip ||
        !enumValue(semantic.activity, AnimalActivity) ||
        !enumValue(semantic.medium, AnimalMedium) ||
        !enumValue(semantic.evidence, AnimalSemanticEvidence) ||
        (semantic.gait !== undefined && !enumValue(semantic.gait, AnimalGait)) ||
        (semantic.posture !== undefined && !enumValue(semantic.posture, AnimalPosture)) ||
        (semantic.activity === AnimalActivity.Move &&
          (!semantic.gait ||
            (!Number.isFinite(clip.speed) &&
              semantic.medium === AnimalMedium.Ground &&
              semantic.evidence !== AnimalSemanticEvidence.Static))) ||
        (semantic.medium === AnimalMedium.Ground && [AnimalGait.Fly, AnimalGait.Swim].includes(semantic.gait!)) ||
        (semantic.activity === AnimalActivity.Move &&
          semantic.medium === AnimalMedium.Water &&
          semantic.gait !== AnimalGait.Swim) ||
        (semantic.activity === AnimalActivity.Move &&
          semantic.medium === AnimalMedium.Air &&
          semantic.gait !== AnimalGait.Fly) ||
        (semantic.activity !== AnimalActivity.Move && semantic.gait !== undefined) ||
        (semantic.activity === AnimalActivity.Rest &&
          ![AnimalPosture.Sitting, AnimalPosture.Lying].includes(semantic.posture!)) ||
        (semantic.activity === AnimalActivity.Unclassified && semantic.evidence !== AnimalSemanticEvidence.Unknown)
      )
        throw new Error(`Invalid animation semantics: ${model.assetId}/${id}`);
    }
    compileAnimalRegistration(catalog.species[model.species], model, asset);
  }
  if (seen.size !== assets.length) throw new Error("Animal registration must cover every asset exactly once");
  return structuredClone(catalog);
}

/**
 * Compile semantic configuration into shared task recipes; source names are opaque binding IDs.
 * @param species Shared habitat and autonomous preference configuration.
 * @param model Per-model animation semantics and source exceptions.
 * @param asset Available bindings and calibrated movement speeds.
 * @returns A validated profile consumed by AnimalTaskController without changing its public command API.
 */
export function compileAnimalRegistration(
  species: AnimalSpeciesRegistration,
  model: AnimalModelRegistration,
  asset: AnimalRegistrationAsset
): AnimalTaskProfile {
  const slowMovementRatio = model.slowMovementRatio === undefined ? 0.5 : model.slowMovementRatio;
  if (!Number.isFinite(slowMovementRatio) || slowMovementRatio <= 0 || slowMovementRatio >= 1)
    throw new Error(`Invalid slow movement ratio: ${model.assetId}`);
  const slots: Record<string, AnimalAnimationChoice[]> = {};
  const speeds: Record<string, number> = {};
  for (const [id, s] of Object.entries(model.animations)) {
    if ([AnimalSemanticEvidence.Unknown, AnimalSemanticEvidence.Static].includes(s.evidence)) continue;
    const binding = asset.animations.find((a) => a.id === id)!;
    // Older hosts may expose an uncalibrated fly/swim clip for manual preview.
    // It becomes an executable gait only after the host supplies a movement speed.
    if (s.activity === AnimalActivity.Move && s.medium !== AnimalMedium.Ground && binding.speed === undefined) continue;
    const slot = slotOf(s);
    (slots[slot] ??= []).push({
      clip: id,
      weight: 1,
      medium: s.medium,
      ...(s.activity === AnimalActivity.Move ? { speed: binding.speed! * (binding.playbackRate ?? 1) } : {}),
      ...(s.activity === AnimalActivity.Eat ? { when: { query: AnimalQuery.FoodAtMouth } } : {})
    });
    if (s.activity === AnimalActivity.Move) speeds[slot] = binding.speed! * (binding.playbackRate ?? 1);
  }
  // A flight clip is not an idle pose. Flight completes at a supported surface.
  const preferred =
    species.preferredMedium === AnimalMedium.Water
      ? AnimalGait.Swim
      : species.preferredMedium === AnimalMedium.Air
        ? AnimalGait.Fly
        : undefined;
  const ground = preferred && slots[preferred] ? preferred : species.groundGaits.find((g) => slots[g]);
  const preferredMedium = (ground && slots[ground][0].medium) ?? AnimalMedium.Ground;
  const flee = species.fleeGaits.find((g) => slots[g]);
  if (!ground || !flee || !slots.idle)
    throw new Error(`Animal requires idle and valid ground locomotion: ${model.assetId}`);
  const act = (name: string, slot: string, params: Record<string, unknown> = {}): BehaviorNode => ({
    type: "action",
    name,
    params: { slot, ...(name === "move" ? { medium: slots[slot][0].medium } : {}), ...params }
  });
  const sequence = (...children: BehaviorNode[]): BehaviorNode => ({ type: "sequence", children });
  const landingMedium =
    species.preferredMedium === AnimalMedium.Water && slots.swim ? AnimalMedium.Water : AnimalMedium.Ground;
  const surfaceGait = (landingMedium === AnimalMedium.Water ? [AnimalGait.Swim] : species.groundGaits).find(
    (gait) => slots[gait]?.[0].medium === landingMedium
  );
  const travel = (slot: string, params: Record<string, unknown>): BehaviorNode => {
    if (slots[slot][0].medium !== AnimalMedium.Air) return act("move", slot, params);
    const flight = () => act("move", slot, { ...params, arrivalMedium: landingMedium });
    // A resting bird can face an edge that leaves no executable takeoff arc.
    // Reposition using its real surface gait before retrying; never walk in mid-air.
    // Exact caller positions must not cause an unrelated random surface excursion.
    const departure: BehaviorNode =
      surfaceGait && params.target !== "request"
        ? {
            type: "selector",
            children: [
              flight(),
              sequence(
                { type: "condition", name: AnimalCondition.InMedium, params: { medium: landingMedium } },
                act("move", surfaceGait, {
                  target: {
                    query: AnimalQuery.Wander,
                    params: {
                      distance: Math.max(1, Math.min(4, speeds[surfaceGait] * (asset.scale ?? 1) * 4)),
                      headingSpread: Math.PI * 2
                    }
                  },
                  speedMultiplier: params.speedMultiplier ?? 1,
                  timeoutSeconds: 30,
                  blockedReplanSeconds: 3
                }),
                flight()
              )
            ]
          }
        : flight();
    return sequence(departure, act("animate", "idle"));
  };
  // Explicit slow/fast intents keep their physical medium. Prefer the ordinary surface
  // walk/run pair even for species that choose swimming or flying autonomously.
  const executableGaits = Object.keys(speeds).filter((slot) =>
    slots[slot].every((choice) => Number.isFinite(choice.speed) && choice.speed! > 0)
  );
  const commandMedium = executableGaits.some((slot) => slots[slot][0].medium === AnimalMedium.Ground)
    ? AnimalMedium.Ground
    : slots[ground][0].medium;
  const commandGaits = executableGaits
    .filter((slot) => slots[slot][0].medium === commandMedium)
    .sort((a, b) => speeds[a] - speeds[b]);
  if (!commandGaits.length) throw new Error(`Animal requires executable movement: ${model.assetId}`);
  const slowGait = commandGaits.includes(AnimalGait.Walk) ? AnimalGait.Walk : commandGaits[0];
  const fastGait = commandGaits.includes(AnimalGait.Run) ? AnimalGait.Run : commandGaits[commandGaits.length - 1];
  const movementMediumLabel = { ground: "地面", water: "水中", air: "空中" }[commandMedium!];
  const children: { weight: number; when?: { name: string; params: Record<string, unknown> }; node: BehaviorNode }[] =
    [];
  const used = new Set<string>();
  for (const rule of species.autonomy) {
    const slot =
      rule.activity === AnimalActivity.Move
        ? slots[rule.gait!]
          ? rule.gait!
          : rule.gait === AnimalGait.Walk
            ? ground
            : ""
        : slotOf(rule);
    if (!slots[slot] || rule.weight <= 0 || used.has(slot)) continue;
    used.add(slot);
    if (rule.activity === AnimalActivity.Move)
      children.push({
        weight: rule.weight,
        ...(slots[slot][0].medium === AnimalMedium.Ground && preferredMedium === AnimalMedium.Ground
          ? {}
          : {
              when: {
                name: AnimalCondition.TargetAvailable,
                params: {
                  target: { query: AnimalQuery.MediumAvailable, params: { medium: slots[slot][0].medium } }
                }
              }
            }),
        node: travel(slot, {
          target: {
            query: AnimalQuery.Wander,
            params: {
              habitats: species.habitats,
              ...(slots[slot][0].medium === AnimalMedium.Air ? { scope: "world" } : {})
            }
          },
          blockedReplanSeconds: 3
        })
      });
    else if (rule.activity === AnimalActivity.Eat) {
      const foodTarget = { query: AnimalQuery.Food };
      children.push({
        weight: rule.weight,
        when: { name: AnimalCondition.TargetAvailable, params: { target: foodTarget } },
        node: sequence(
          act("move", ground, {
            target: foodTarget,
            guardTarget: true,
            arrivalTarget: { query: AnimalQuery.FoodAtMouth }
          }),
          act("animate", slot, { interaction: true, target: { query: AnimalQuery.FoodAtMouth } })
        )
      });
    } else
      children.push({
        weight: rule.weight,
        ...(rule.activity === AnimalActivity.Display
          ? {
              when: { name: AnimalCondition.InMedium, params: { medium: slots[slot][0].medium } }
            }
          : {}),
        node: act("animate", slot)
      });
  }
  if (!children.length) throw new Error(`No executable autonomous rules: ${model.assetId}`);
  const foodTarget = { query: AnimalQuery.Food };
  const retreat = (): BehaviorNode => ({
    type: "selector",
    children: [AnimalMedium.Ground, AnimalMedium.Water, AnimalMedium.Air].flatMap((medium) => {
      const candidates = [AnimalGait.Walk, ...species.groundGaits, ...Object.keys(speeds)];
      const gait = candidates.find((gait) => slots[gait]?.[0].medium === medium);
      return gait
        ? [
            sequence(
              { type: "condition", name: AnimalCondition.InMedium, params: { medium } },
              travel(gait, {
                target: {
                  query: AnimalQuery.Flee,
                  params: medium === AnimalMedium.Air ? { scope: "world" } : { distance: 4 }
                },
                replanBlockedSeconds: 1.5,
                timeoutSeconds: 30
              })
            )
          ]
        : [];
    })
  });
  const profile: AnimalTaskProfile = {
    defaultSkill: "idle",
    preferredMedium: preferredMedium === AnimalMedium.Air ? AnimalMedium.Ground : preferredMedium,
    ...(slots.fly ? { landingMedium } : {}),
    habitatPreferences: species.habitats,
    skills: {
      idle: { label: "闲置（自主闲逛）", background: true, repeat: true, tree: { type: "weightedRandom", children } },
      ...(slots.eat
        ? {
            eat: {
              label: "寻找食物并进食",
              tree: sequence(
                { type: "condition", name: AnimalCondition.TargetAvailable, params: { target: foodTarget } },
                act("move", ground, {
                  target: foodTarget,
                  guardTarget: true,
                  arrivalTarget: { query: AnimalQuery.FoodAtMouth }
                }),
                act("animate", "eat", { interaction: true, target: { query: AnimalQuery.FoodAtMouth } })
              )
            }
          }
        : {}),
      moveTo: {
        label: "前往目标",
        requiresTarget: true,
        tree: travel(ground, { target: "request", timeoutSeconds: 600 })
      },
      moveSlow: {
        label: `慢速前往目标（${movementMediumLabel}）`,
        requiresTarget: true,
        movementIntent: "slow",
        tree: travel(slowGait, {
          target: "request",
          timeoutSeconds: 600,
          ...(slowGait === fastGait ? { speedMultiplier: slowMovementRatio } : {})
        })
      },
      moveFast: {
        label: `快速前往目标（${movementMediumLabel}）`,
        requiresTarget: true,
        movementIntent: "fast",
        tree: travel(fastGait, { target: "request", timeoutSeconds: 600 })
      },
      _yield: {
        label: "轻度威胁：慢行避让",
        tree: retreat()
      },
      startle: {
        label: "受惊：逃离后平复",
        tree: {
          type: "weightedRandom",
          children: (species.fleeWeights ?? [{ gait: flee, weight: 1 }])
            .filter((rule) => rule.weight > 0 && slots[rule.gait])
            .map((rule) => ({
              weight: rule.weight,
              ...(slots[rule.gait][0].medium === AnimalMedium.Ground && preferredMedium === AnimalMedium.Ground
                ? {}
                : {
                    when: {
                      name: AnimalCondition.TargetAvailable,
                      params: {
                        target: { query: AnimalQuery.MediumAvailable, params: { medium: slots[rule.gait][0].medium } }
                      }
                    }
                  }),
              node: travel(rule.gait, {
                speedMultiplier: species.fleeSpeedMultiplier ?? 1,
                preserveGait: true,
                urgent: true,
                replanBlockedSeconds: 1.5,
                target: {
                  query: AnimalQuery.Flee,
                  // Several running strides, independent of mesh footprint. The world resolver
                  // still chooses a reachable destination inside its movement domain.
                  params:
                    slots[rule.gait][0].medium === AnimalMedium.Air
                      ? { scope: "world" }
                      : { distance: Math.max(8, Math.min(24, speeds[rule.gait] * 5)) }
                },
                ...(slots[rule.gait][0].medium === AnimalMedium.Air ? {} : { timeoutSeconds: 60 })
              })
            }))
        }
      }
    },
    animationSlots: slots,
    movementSpeeds: speeds,
    ...(flee !== ground && speeds[flee] > speeds[ground] && slots[flee][0].medium === slots[ground][0].medium
      ? { movementFallbacks: { [flee]: ground } }
      : {}),
    reactions: {
      thunder: { skillId: "startle", note: "受惊任务按注册步态执行；动画语义不等于事件意义。" },
      approach: { skillId: "_yield" },
      shoo: { skillId: "startle", interruptTask: true }
    }
  };
  validateAnimalTaskProfile(profile, new Set(asset.animations.map((a) => a.id)));
  return profile;
}

/** Human-readable label derived from registered meaning, not a filename translation. */
export function animalSemanticLabel(s: AnimalAnimationSemantic): string {
  if (s.evidence === AnimalSemanticEvidence.Static) return "静态片段";
  if (s.activity === AnimalActivity.Unclassified) return "待标注动作";
  if (s.activity === AnimalActivity.Move)
    return ({ walk: "行走", run: "奔跑", hop: "跳跃移动", fly: "飞行", swim: "游泳" } as const)[s.gait!];
  if (s.activity === AnimalActivity.Rest) return s.posture === AnimalPosture.Sitting ? "坐姿休息" : "卧姿休息";
  if (s.activity === AnimalActivity.Eat) return "进食表现";
  return (
    (
      {
        idle: s.medium === AnimalMedium.Water ? "水中停留" : "停留",
        stretch: "伸展",
        display: "已标注展示"
      } as Partial<Record<AnimalActivity, string>>
    )[s.activity] ?? s.activity
  );
}
