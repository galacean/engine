/** Conservative cargo volumes measured inside the static Farmlands props after conversion. */
export const STORAGE_INTERIORS = Object.freeze({
  cart: Object.freeze({ centerZ: 0, width: 0.9, depth: 1.85, floor: 0.635, height: 0.4, labelY: 1.38 }),
  basket: Object.freeze({ centerZ: 0, width: 0.4, depth: 0.4, floor: 0.036, height: 0.26, labelY: 0.54 })
});

function slotGrid(appearance: "cart" | "basket", capacity: number) {
  const inside = STORAGE_INTERIORS[appearance];
  const columns = Math.ceil(
    Math.sqrt((Math.min(capacity, appearance === "cart" ? 20 : 9) * inside.width) / inside.depth)
  );
  const rows = Math.ceil(Math.min(capacity, appearance === "cart" ? 20 : 9) / columns);
  return { columns, rows, layers: Math.ceil(capacity / (columns * rows)) };
}

/** Mixed cargo rests on the actual cargo below it in each column. */
export function storageProduceSlots(
  appearance: "cart" | "basket",
  crops: readonly string[],
  capacity: number,
  dimensions: (cropId: string) => readonly [number, number, number]
): ReturnType<typeof storageProduceSlot>[] {
  if (!crops.length) return [];
  const { columns, rows } = slotGrid(appearance, capacity);
  const tops = Array<number>(columns * rows).fill(STORAGE_INTERIORS[appearance].floor);
  return crops.map((cropId, index) => {
    const size = dimensions(cropId),
      column = index % tops.length;
    const slot = storageProduceSlot(appearance, cropId, capacity, index, size, tops[column]);
    tops[column] += size[1] * slot.scale;
    return slot;
  });
}

/** Capacity fixes horizontal slots and scale; baseY supplies the supporting cargo height. */
export function storageProduceSlot(
  appearance: "cart" | "basket",
  cropId: string,
  capacity: number,
  index: number,
  dimensions?: readonly [number, number, number],
  baseY?: number
): {
  position: readonly [number, number, number];
  scale: number;
  yaw: number;
} {
  const inside = STORAGE_INTERIORS[appearance];
  const { columns, rows, layers } = slotGrid(appearance, capacity);
  const layer = Math.floor(index / (columns * rows)),
    slot = index % (columns * rows);
  // Conservative envelope of the shared procedural unit, including leaves and stems.
  const size =
    dimensions ??
    (cropId === "wheat"
      ? [0.11, 0.04, 0.34]
      : cropId === "rice"
        ? [0.075, 0.16, 0.075]
        : cropId === "carrot" || cropId === "radish" || cropId === "beetroot"
          ? [0.2, 0.2, 0.14]
          : cropId === "watermelon"
            ? [0.2, 0.15, 0.15]
            : cropId === "pumpkin" || cropId === "cabbage"
              ? [0.19, 0.18, 0.19]
              : cropId === "grapevine"
                ? [0.1, 0.13, 0.1]
                : [0.15, 0.15, 0.15]);
  const wheat = cropId === "wheat",
    angle = wheat ? (8 * Math.PI) / 180 : 0;
  // Reserve the rotated envelope before applying the small, deterministic hand-stacked offsets.
  const width = size[0] * Math.cos(angle) + size[2] * Math.sin(angle);
  const depth = size[2] * Math.cos(angle) + size[0] * Math.sin(angle);
  const scale =
    Math.min(inside.width / columns / width, inside.height / layers / size[1], inside.depth / rows / depth) * 0.88;
  const yaw = wheat ? (layer % 2 ? 180 : 0) + Math.sin(index * 2.4) * 8 : 0;
  return {
    position: [
      (((slot % columns) + 0.5) * inside.width) / columns -
        inside.width / 2 +
        (wheat ? ((Math.sin(index * 1.7) * inside.width) / columns) * 0.035 : 0),
      (baseY ?? inside.floor + layer * size[1] * scale) + (size[1] * scale) / 2,
      inside.centerZ +
        ((Math.floor(slot / columns) + 0.5) * inside.depth) / rows -
        inside.depth / 2 +
        (wheat ? ((Math.cos(index * 1.9) * inside.depth) / rows) * 0.035 : 0)
    ],
    scale,
    yaw
  };
}
