export interface IProject {
  scene: string;
  files: { virtualPath: string; path: string; type: string; id: string }[];
}
