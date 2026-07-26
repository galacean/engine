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
  url: string;
}

/** Authored source projects used to rebuild the six time-of-day probe datasets. */
export const globalIlluminationBakePresets: Record<GlobalIlluminationBakePresetKey, GlobalIlluminationBakePreset> = {
  dawn: {
    label: "Dawn",
    scenario: "Dawn",
    url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*ahNIQ6w8q7cAAAAAQZAAAAgAekp5AQ/project.json"
  },
  morning: {
    label: "Morning",
    scenario: "Morning",
    url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*zlq7Rqt9A0UAAAAAQZAAAAgAekp5AQ/project.json"
  },
  noon: {
    label: "Noon",
    scenario: "Noon",
    url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*o7G7TawNGDwAAAAAQZAAAAgAekp5AQ/project.json"
  },
  afternoon: {
    label: "Afternoon",
    scenario: "Afternoon",
    url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*8OcTSadCcd0AAAAAQZAAAAgAekp5AQ/project.json"
  },
  dusk: {
    label: "Dusk",
    scenario: "Dusk",
    url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*OQuSTq5VAiYAAAAAQZAAAAgAekp5AQ/project.json"
  },
  night: {
    label: "Night",
    scenario: "Night",
    url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*2FIjSa0pCVMAAAAAQZAAAAgAekp5AQ/project.json"
  }
};

/** Baked night environment resource loaded up front by the runtime demo. */
export const globalIlluminationNightAmbientUrl =
  "https://mdn.alipayobjects.com/oasis_be/afts/file/A*2U74Rb0GE0kAAAAAQyAAAAgAekp5AQ/Internal/Bake/ambient.ambLight";
