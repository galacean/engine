/**
 * Progress interface.
 */
export interface IProgress {
  detail?: {
    [key: string]: {
      loaded: number;
      total: number;
    };
  };

  task: {
    loaded: number;
    total: number;
  };
}
