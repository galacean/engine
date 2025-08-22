export interface IFile {
  virtualPath: string;
  path: string;
  type: string;
  id: string;
  md5: string;
}

export interface IProject {
  scene: string;
  engineVersion: string;
  files: IFile[];
}
