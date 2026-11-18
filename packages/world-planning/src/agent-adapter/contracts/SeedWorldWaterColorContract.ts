import * as z from "zod";

export const waterColorRgbSchema = z
  .tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)])
  .describe(
    "水体本色，sRGB 三通道整数 0 到 255；黑色为 [0,0,0]。保留透明度、深度渐变、反射和泡沫，屏幕颜色仍受环境光影响。"
  );
