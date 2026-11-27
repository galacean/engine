import type { PlantInstanceVariation, ProceduralPlantLibraryEntry } from "./ProceduralPlantAsset";
export interface PlantExhibitionVariant {
  readonly id: string;
  readonly label: string;
  readonly scale: readonly [number, number, number];
  readonly appearance?: PlantInstanceVariation;
}
/** Authored exhibition choices, separate from portable plant assets and population ecology. */
export const PLANT_EXHIBITION_SIZE_VARIANTS = [
  { id: "tall-narrow", label: "高瘦", scale: [0.8, 1.2, 0.8] as const },
  { id: "short-wide", label: "矮宽", scale: [1.2, 0.8, 1.2] as const }
] as const;

/** Deliberate art-direction presets, not random geometry regeneration or population defaults. */
export const TREE_EXHIBITION_VARIANTS: readonly PlantExhibitionVariant[] = [
  {
    id: "young-open",
    label: "幼株 · 嫩绿",
    scale: [0.7, 0.65, 0.8],
    appearance: {
      yawDegrees: 38,
      leafSize: 1.15,
      leafDensity: 0.9,
      leafColor: [0.18, 0.38, 0.06],
      barkTint: [0.82, 0.9, 0.76]
    }
  },
  {
    id: "tall-deep",
    label: "高瘦 · 深绿大叶",
    scale: [0.7, 1.4, 0.85],
    appearance: {
      yawDegrees: 112,
      leafSize: 1.25,
      leafDensity: 0.85,
      leafColor: [0.035, 0.19, 0.085],
      barkTint: [0.72, 0.77, 0.8]
    }
  },
  {
    id: "wide-fine",
    label: "矮宽 · 青绿",
    scale: [1.2, 0.9, 1.15],
    appearance: {
      yawDegrees: 221,
      leafSize: 1.1,
      leafDensity: 1,
      leafColor: [0.075, 0.32, 0.23],
      barkTint: [0.9, 0.8, 0.68]
    }
  },
  {
    id: "autumn-open",
    label: "秋色 · 舒展冠",
    scale: [1.1, 1.08, 0.8],
    appearance: {
      yawDegrees: 302,
      leafSize: 1.05,
      leafDensity: 0.9,
      leafColor: [0.62, 0.22, 0.025],
      barkTint: [0.8, 0.68, 0.55]
    }
  }
];

export function plantExhibitionVariants(
  entry: Pick<ProceduralPlantLibraryEntry, "category">
): readonly PlantExhibitionVariant[] {
  return entry.category === "Trees" ? TREE_EXHIBITION_VARIANTS : PLANT_EXHIBITION_SIZE_VARIANTS;
}

/** A row follows asset lineage; display names and morphology never establish identity. */
export function plantExhibitionBaseId(entry: ProceduralPlantLibraryEntry): string {
  return entry.prototypeId ?? entry.sourceAssetId ?? entry.id;
}

export function sizeVariantEntry(
  base: ProceduralPlantLibraryEntry,
  variant: PlantExhibitionVariant,
  order: number
): ProceduralPlantLibraryEntry {
  return {
    ...base,
    id: `${base.id}::${variant.id}`,
    sourceAssetId: base.sourceAssetId ?? base.id,
    exhibitionOrder: order,
    displayName: `${base.displayName ?? base.id} · ${variant.label}`,
    instanceVariation: variant.appearance ?? base.instanceVariation,
    instanceScale: variant.scale.map((v, axis) => v * (base.instanceScale?.[axis] ?? 1)) as [number, number, number]
  };
}

import type { AssetAssemblyStandBounds } from "./AssetAssemblyRenderProfile";

export interface PlantExhibitionMember {
  readonly id: string;
  readonly rowId: string;
  readonly order: number;
  readonly bounds: AssetAssemblyStandBounds;
}

/** Base plants share the left column. Their variants extend right along exactly the same row. */
export function layoutPlantExhibitionRows(members: readonly PlantExhibitionMember[], maximumClearance: number) {
  const groups = new Map<string, PlantExhibitionMember[]>();
  for (const member of members) {
    const group = groups.get(member.rowId) ?? [];
    group.push(member);
    groups.set(member.rowId, group);
  }
  const rows = [...groups].map(([id, group]) => ({
    id,
    members: group.sort((a, b) => Number(b.id === id) - Number(a.id === id) || a.order - b.order)
  }));
  // Only the base plant decides the height order, even when a variant grows taller.
  rows.sort((a, b) => height(a.members[0].bounds) - height(b.members[0].bounds));
  let front = 0;
  return rows.map((row) => {
    const clearance = Math.min(
      maximumClearance,
      Math.max(
        ...row.members.map(({ bounds }) => Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]))
      )
    );
    const halfDepth = Math.max(...row.members.map(({ bounds }) => (bounds.max[2] - bounds.min[2]) / 2));
    const z = front - halfDepth;
    let right = 0;
    const placements = row.members.map((member, index) => {
      const bounds = member.bounds;
      const halfWidth = (bounds.max[0] - bounds.min[0]) / 2;
      const x = index === 0 ? 0 : right + clearance + halfWidth;
      right = x + halfWidth;
      return {
        id: member.id,
        base: index === 0,
        x: x - (bounds.min[0] + bounds.max[0]) / 2,
        z: z - (bounds.min[2] + bounds.max[2]) / 2,
        clearance
      };
    });
    front = z - halfDepth - clearance;
    return { id: row.id, baseId: row.members[0].id, placements };
  });
}

function height(bounds: AssetAssemblyStandBounds): number {
  return bounds.max[1] - bounds.min[1];
}
