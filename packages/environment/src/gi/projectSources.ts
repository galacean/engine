/** Source projects shared by the global-illumination authoring and day/night runtime demos. */
export const globalIlluminationDayProjectUrl =
  "https://mdn.alipayobjects.com/oasis_be/afts/file/A*i5qfTbh8jfkAAAAAQYAAAAgAekp5AQ/project.json";

export const globalIlluminationNightProjectUrl =
  "https://mdn.alipayobjects.com/oasis_be/afts/file/A*yHxDTYCLl4sAAAAAQZAAAAgAekp5AQ/project.json";

export const globalIlluminationBakePresetOrder = ["dawn", "morning", "noon", "afternoon", "dusk", "night"] as const;

export type GlobalIlluminationBakePresetKey = (typeof globalIlluminationBakePresetOrder)[number];

export interface GlobalIlluminationBakePreset {
  label: string;
  scenario: string;
  timeHours: number;
  url: string;
}

/** Authored source projects used to rebuild the six time-of-day probe datasets. */
export const globalIlluminationBakePresets: Record<GlobalIlluminationBakePresetKey, GlobalIlluminationBakePreset> = {
  dawn: {
    label: "Dawn",
    scenario: "Dawn",
    timeHours: 6,
    url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*ahNIQ6w8q7cAAAAAQZAAAAgAekp5AQ/project.json"
  },
  morning: {
    label: "Morning",
    scenario: "Morning",
    timeHours: 9,
    url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*zlq7Rqt9A0UAAAAAQZAAAAgAekp5AQ/project.json"
  },
  noon: {
    label: "Noon",
    scenario: "Noon",
    timeHours: 12,
    url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*o7G7TawNGDwAAAAAQZAAAAgAekp5AQ/project.json"
  },
  afternoon: {
    label: "Afternoon",
    scenario: "Afternoon",
    timeHours: 15,
    url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*8OcTSadCcd0AAAAAQZAAAAgAekp5AQ/project.json"
  },
  dusk: {
    label: "Dusk",
    scenario: "Dusk",
    timeHours: 18,
    url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*OQuSTq5VAiYAAAAAQZAAAAgAekp5AQ/project.json"
  },
  night: {
    label: "Night",
    scenario: "Night",
    timeHours: 0,
    url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*2FIjSa0pCVMAAAAAQZAAAAgAekp5AQ/project.json"
  }
};
