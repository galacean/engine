import type {
  LakeBoundaryV1,
  LakePointXZ,
  LakeSplinePoint,
  WaterConnectionV1,
  RiverPathControlPoint
} from "@galacean/engine-water/water/index";

export interface IslandLake {
  readonly id: string;
  readonly depth: number;
  readonly boundary: LakeBoundaryV1;
}
export interface IslandRiver {
  readonly id: string;
  readonly points: readonly RiverPathControlPoint[];
}

function lake(
  id: string,
  level: number,
  depth: number,
  points: LakePointXZ[],
  flat: number[] = [],
  hole = false
): IslandLake {
  const ring = points.map((position, i): LakeSplinePoint => {
    const previous = points[(i + points.length - 1) % points.length],
      next = points[(i + 1) % points.length];
    const tangent: LakePointXZ = flat.includes(i)
      ? [0, 0]
      : [(next[0] - previous[0]) * 0.16, (next[1] - previous[1]) * 0.16];
    return {
      position,
      incoming: [position[0] - tangent[0], position[1] - tangent[1]] as LakePointXZ,
      outgoing: [position[0] + tangent[0], position[1] + tangent[1]] as LakePointXZ
    };
  });
  const rings = [ring];
  if (hole)
    rings.push(
      Array.from({ length: 12 }, (_, i): LakeSplinePoint => {
        const a = (-i * Math.PI) / 6;
        return {
          position: [25 + 6 * Math.cos(a), -25 + 6 * Math.sin(a)] as LakePointXZ,
          incoming: [25 + 6 * Math.cos(a) - Math.sin(a), -25 + 6 * Math.sin(a) + Math.cos(a)] as LakePointXZ,
          outgoing: [25 + 6 * Math.cos(a) + Math.sin(a), -25 + 6 * Math.sin(a) - Math.cos(a)] as LakePointXZ
        };
      })
    );
  return {
    id,
    depth,
    boundary: {
      schemaVersion: 1,
      waterLevel: level,
      rings,
      maxChordError: 0.05,
      maxSegmentLength: 2,
      queryCoverage: "boundary"
    }
  };
}
function river(id: string, points: readonly (readonly [number, number, number, number])[]): IslandRiver {
  const anchors: RiverPathControlPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1],
      previous = points[Math.max(0, i - 1)],
      next = points[Math.min(points.length - 1, i + 2)];
    const flat = a[1] === b[1];
    for (let j = 0; j < 3; j++) {
      const t = j / 3;
      const curve = (axis: 0 | 2) =>
        flat
          ? a[axis] + (b[axis] - a[axis]) * t
          : 0.5 *
            (2 * a[axis] +
              (-previous[axis] + b[axis]) * t +
              (2 * previous[axis] - 5 * a[axis] + 4 * b[axis] - next[axis]) * t * t +
              (-previous[axis] + 3 * a[axis] - 3 * b[axis] + next[axis]) * t * t * t);
      anchors.push({
        id: `${id}-${i}-${j}`,
        position: [curve(0), a[1] + (b[1] - a[1]) * t, curve(2)],
        width: a[3] + (b[3] - a[3]) * t,
        depth: 1.25,
        flowSpeed: 0.85
      });
    }
  }
  const last = points[points.length - 1];
  anchors.push({
    id: `${id}-end`,
    position: [last[0], last[1], last[2]],
    width: last[3],
    depth: 1.25,
    flowSpeed: 0.85
  });
  return { id, points: anchors };
}

export const WATER_ISLAND_PRESET = {
  id: "water-island-v1",
  seed: 1729,
  grid: { id: "water-island-terrain", revision: 1, origin: [-256, -256] as const, spacing: 1, columns: 513, rows: 513 },
  coast: [
    [-217, 0],
    [-200, -60],
    [-185, -115],
    [-140, -150],
    [-90, -165],
    [-45, -155],
    [0, -175],
    [55, -145],
    [105, -145],
    [140, -110],
    [188, -88],
    [216, -40],
    [209, 5],
    [182, 33],
    [170, 95],
    [120, 125],
    [74, 160],
    [30, 164],
    [-10, 140],
    [-65, 154],
    [-110, 123],
    [-156, 128],
    [-190, 100],
    [-185, 70],
    [-214, 45]
  ] as readonly LakePointXZ[],
  lakes: [
    lake(
      "main-lake",
      3,
      3.5,
      [
        [7, -65],
        [13, -65],
        [34, -52],
        [50, -33],
        [39, -10],
        [45, 5],
        [23, 22],
        [7, 18],
        [-3, 18],
        [-24, 25],
        [-49, 8],
        [-53, -16],
        [-41, -44],
        [-17, -48]
      ],
      [0, 1, 7, 8],
      true
    ),
    lake(
      "estuary-lake",
      0,
      2.2,
      [
        [132, -47],
        [138, -47],
        [158, -55],
        [178, -40],
        [183, -28],
        [206, -28],
        [206, -10],
        [181, -10],
        [162, 3],
        [135, -2],
        [123, -20]
      ],
      [0, 1, 4, 5, 6, 7]
    ),
    lake("upland-lake", 9, 2.6, [
      [-115, -124],
      [-96, -135],
      [-74, -123],
      [-72, -103],
      [-90, -97],
      [-111, -106],
      [-104, -114]
    ]),
    lake(
      "lagoon",
      0,
      1.5,
      [
        [-206, 97],
        [-206, 79],
        [-172, 78],
        [-169, 61],
        [-145, 58],
        [-129, 70],
        [-112, 74],
        [-116, 91],
        [-132, 98],
        [-150, 110],
        [-171, 102],
        [-174, 96]
      ],
      [0, 1, 2, 11]
    )
  ] as readonly IslandLake[],
  rivers: [
    river("west-river", [
      [-82, 3.5, -66, 4],
      [-103, 3.3, -47, 4.5],
      [-95, 2.8, -20, 4.5],
      [-129, 2.1, 0, 5],
      [-145, 1.3, 25, 5.5],
      [-177, 0.5, 30, 6],
      [-201, 0, 37, 7],
      [-211, 0, 37, 7]
    ]),
    river("east-river", [
      [88, 4, -92, 4],
      [108, 3.3, -78, 4.5],
      [104, 2.4, -62, 4.5],
      [123, 1.1, -56, 5],
      [135, 0, -53, 6],
      [135, 0, -45, 6]
    ]),
    river("upper-river", [
      [15, 6, -125, 4],
      [5, 5.4, -111, 4.5],
      [25, 4.5, -94, 5],
      [18, 3.3, -77, 5.5],
      [10, 3, -71, 6],
      [10, 3, -63, 6]
    ]),
    river("outlet-river", [
      [2, 3, 16, 10],
      [2, 3, 24, 10],
      [-13, 2.7, 43, 9],
      [-19, 2.2, 59, 8],
      [7, 1.6, 84, 9],
      [18, 1, 106, 10],
      [13, 0.5, 132, 11],
      [35, 0, 162, 14],
      [35, 0, 172, 14]
    ])
  ] as readonly IslandRiver[],
  connections: [
    {
      id: "west-mouth",
      bodies: ["west-river", "ocean"],
      section: [
        [-209, 33.5],
        [-209, 40.5]
      ],
      transitionLengths: [6, 6]
    },
    {
      id: "east-inlet",
      bodies: ["east-river", "estuary-lake"],
      section: [
        [132, -47],
        [138, -47]
      ],
      transitionLengths: [5, 5]
    },
    {
      id: "east-mouth",
      bodies: ["estuary-lake", "ocean"],
      section: [
        [206, -10],
        [206, -28]
      ],
      transitionLengths: [8, 8]
    },
    {
      id: "main-inlet",
      bodies: ["upper-river", "main-lake"],
      section: [
        [7, -65],
        [13, -65]
      ],
      transitionLengths: [5, 5]
    },
    {
      id: "main-outlet",
      bodies: ["main-lake", "outlet-river"],
      section: [
        [-3, 18],
        [7, 18]
      ],
      transitionLengths: [6, 6]
    },
    {
      id: "south-mouth",
      bodies: ["outlet-river", "ocean"],
      section: [
        [28, 170],
        [42, 170]
      ],
      transitionLengths: [8, 8]
    },
    {
      id: "lagoon-mouth",
      bodies: ["lagoon", "ocean"],
      section: [
        [-206, 79],
        [-206, 97]
      ],
      transitionLengths: [8, 8]
    }
  ] as readonly WaterConnectionV1[],
  cameras: {
    coast: { label: "西岸涨水观察", position: [-246, 15, 24], target: [-211, 0, 0] },
    hero: { label: "主景", position: [235, 135, 265], target: [0, 2, -20] },
    overview: { label: "全岛总览", position: [0, 430, 35], target: [0, 0, 0] },
    west: { label: "A · 西岸溪谷", position: [-160, 30, 93], target: [-168, 0, 27] },
    east: { label: "B · 东岸河口湖", position: [231, 32, 53], target: [160, 0, -23] },
    main: { label: "C · 中央湖河", position: [55, 42, 82], target: [0, 3, -20] },
    upland: { label: "D · 山间孤湖", position: [-55, 48, -61], target: [-94, 9, -115] },
    lagoon: { label: "E · 西南潟湖", position: [-207, 25, 132], target: [-157, 0, 84] }
  } as const
} as const;
