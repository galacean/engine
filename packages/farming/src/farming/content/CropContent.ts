/** Shared game content; seconds and yields are balance values, not agronomic measurements. */
export interface CropContent {
  readonly id: string;
  readonly name: string;
  readonly assetId: string;
  readonly idealSeconds: number;
  readonly produce: string;
  readonly quantity: number;
  readonly profile: "fruit" | "root" | "leaf" | "grain" | "rice";
}

export const FARM_CROP_CONTENT: readonly CropContent[] = Object.freeze(
  (
    [
      {
        id: "tomato",
        name: "番茄",
        assetId: "tomato-farmlands",
        idealSeconds: 150,
        produce: "番茄",
        quantity: 1,
        profile: "fruit"
      },
      {
        id: "beetroot",
        name: "甜菜",
        assetId: "beetroot-farmlands",
        idealSeconds: 120,
        produce: "甜菜",
        quantity: 1,
        profile: "root"
      },
      {
        id: "cabbage",
        name: "卷心菜",
        assetId: "cabbage-farmlands",
        idealSeconds: 110,
        produce: "卷心菜",
        quantity: 1,
        profile: "leaf"
      },
      {
        id: "canola",
        name: "油菜",
        assetId: "canola-farmlands",
        idealSeconds: 160,
        produce: "油菜籽",
        quantity: 3,
        profile: "grain"
      },
      {
        id: "carrot",
        name: "胡萝卜",
        assetId: "carrot-farmlands",
        idealSeconds: 100,
        produce: "胡萝卜",
        quantity: 1,
        profile: "root"
      },
      {
        id: "grapevine",
        name: "葡萄",
        assetId: "grapevine-farmlands",
        idealSeconds: 210,
        produce: "葡萄",
        quantity: 2,
        profile: "fruit"
      },
      {
        id: "melon",
        name: "甜瓜",
        assetId: "melon-farmlands",
        idealSeconds: 180,
        produce: "甜瓜",
        quantity: 1,
        profile: "fruit"
      },
      {
        id: "potato",
        name: "土豆",
        assetId: "potato-farmlands",
        idealSeconds: 130,
        produce: "土豆",
        quantity: 3,
        profile: "root"
      },
      {
        id: "pumpkin",
        name: "南瓜",
        assetId: "pumpkin-farmlands",
        idealSeconds: 200,
        produce: "南瓜",
        quantity: 1,
        profile: "fruit"
      },
      {
        id: "radish",
        name: "萝卜",
        assetId: "radish-farmlands",
        idealSeconds: 90,
        produce: "萝卜",
        quantity: 1,
        profile: "root"
      },
      {
        id: "sunflower",
        name: "向日葵",
        assetId: "sunflower-farmlands",
        idealSeconds: 170,
        produce: "葵花籽",
        quantity: 3,
        profile: "grain"
      },
      {
        id: "watermelon",
        name: "西瓜",
        assetId: "watermelon-farmlands",
        idealSeconds: 190,
        produce: "西瓜",
        quantity: 1,
        profile: "fruit"
      },
      {
        id: "wheat",
        name: "小麦",
        assetId: "wheat-farmlands",
        idealSeconds: 120,
        produce: "小麦",
        quantity: 3,
        profile: "grain"
      },
      {
        id: "rice",
        name: "水稻",
        assetId: "rice-quaternius",
        idealSeconds: 160,
        produce: "稻谷",
        quantity: 3,
        profile: "rice"
      }
    ] satisfies CropContent[]
  ).map((crop) => Object.freeze(crop))
);

export function getCropContentByAssetId(assetId: string): CropContent | undefined {
  return FARM_CROP_CONTENT.find((crop) => crop.assetId === assetId);
}
