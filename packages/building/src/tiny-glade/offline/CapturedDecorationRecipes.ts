import { DecorationMaterial as M } from "../runtime/ConstructionDecorationMaterial";
export function constructionDecorationModels(type: string, rank: number) {
  let selected: [name: string, suffix: string, material: number, emissionOrigin?: number[]][];
  if (type === "window-cottage" && [1, 2, 3].includes(rank))
    selected = [
      [`window_cottage_${rank}x1`, "frame", M.frame],
      [`window_cottage_${rank}x1_glass`, "glass", M.lattice]
    ];
  else if (type === "dormer-cottage-half" && [1, 2, 3].includes(rank))
    selected = [
      [`window_cottage_${rank}x1`, "frame", M.frame],
      [`window_cottage_${rank}x1_glass`, "glass", M.lattice],
      [`window_cottage_${rank}x1_halfdormer_frame`, "half-frame", M.frame]
    ];
  else if (type === "dormer-cottage" && [1, 2, 3].includes(rank))
    selected = [
      ["window_cottage_1x1_dormer_frame", "frame", M.frame],
      ["window_cottage_1x1_dormer_glass", "glass", M.lattice]
    ];
  else if (type === "dormer-gothic" && [1, 2, 3].includes(rank))
    selected = [
      [`window_gothic_${rank}x1_dormer`, "frame", M.frame],
      // Native full-dormer glass uses the untextured window-glass program;
      // ordinary/half Gothic glass has a different material path.
      [`window_gothic_${rank}x1_dormer_glass`, "glass", M.lattice]
    ];
  else if (type === "window-cottage-corner" && [1, 2, 3].includes(rank))
    selected = [
      [`window_cottage_corner_${rank}x1`, "frame", M.frame],
      [`window_cottage_corner_${rank}x1_glass`, "glass", M.lattice]
    ];
  else if ((type === "window-gothic" || type === "dormer-gothic-half") && [1, 2, 3].includes(rank))
    selected = [
      [`window_gothic_${rank}x1`, "frame", M.frame],
      [`window_gothic_${rank}x1_glass`, "glass", M.texturedLattice]
    ];
  else if (type === "dormer-arrow-slit-half" && [2, 3].includes(rank))
    selected = [
      [`arrow_slit_1x${rank}${rank === 3 ? "_halfdormer" : ""}`, "frame", M.frame],
      [`arrow_slit_1x${rank}_glass`, "glass", M.lattice]
    ];
  else if (type === "window-arrow-slit" && [1, 2, 3].includes(rank))
    selected = [
      [`arrow_slit_1x${rank}`, "frame", M.frame],
      [`arrow_slit_1x${rank}_glass`, "glass", M.lattice]
    ];
  else if (type === "door-cottage" && [1, 2, 3].includes(rank))
    selected = [[`balcony_door_rank${rank}`, "door", M.doorWood]];
  else if (type === "door-gothic" && [1, 2, 3].includes(rank))
    selected = [[`balcony_door_gothic_rank${rank}`, "door", M.doorWood]];
  else if ((type === "hatch-cottage" || type === "hatch-gothic") && rank === 1)
    selected = [[type === "hatch-cottage" ? "trap_door_cottage" : "trap_door_gothic", "hatch", M.doorWood]];
  else if (type === "roof-lantern" && rank === 1)
    selected = [
      ["lantern_flat_roof", "body", M.lanternBody, [0, Math.fround(0.4), 0]],
      ["lantern_flat_roof_inside", "light", M.lanternEmission, [0, Math.fround(0.4), 0]]
    ];
  else return undefined;
  const boundNames = selected.map(([name]) => name);
  if (type === "window-gothic" || type === "door-gothic" || type === "dormer-gothic-half")
    boundNames.push(
      type === "door-gothic" ? `balcony_door_gothic_rank${rank}_hat` : `window_gothic_${rank}x1_hat_full`
    );
  if (type === "dormer-arrow-slit-half") boundNames.push(`arrow_slit_1x${rank}_hat`);
  const defaultScale = type === "roof-lantern" ? 0.8 : 1;
  const frameMaterials: readonly ("wood" | "wall")[] = selected.some(([, suffix]) => suffix === "frame")
    ? ["window-gothic", "window-arrow-slit", "dormer-gothic-half", "dormer-arrow-slit-half", "dormer-gothic"].includes(
        type
      )
      ? ["wood", "wall"]
      : ["wood"]
    : [];
  return { selected, boundNames, defaultScale, frameMaterials };
}
