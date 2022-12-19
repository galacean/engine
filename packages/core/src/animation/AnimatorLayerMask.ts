export class AnimatorLayerMask {
  private _pathMaskActiveMap: Map<string, boolean> = new Map();
  private _recursivePathList: string[] = [];
  private _pathCount: number = 0;

  get pathCount(): Readonly<number> {
    return this._pathCount;
  }

  checkMaskActive(path: string) {
    path = path.startsWith("/") ? path.slice(1) : path;
    const { _recursivePathList: recursivePathList } = this;
    if (this._pathMaskActiveMap.get(path)) {
      return true;
    }

    for (let i = recursivePathList.length - 1, n = recursivePathList.length; i >= 0; --i) {
      const recursivePath = recursivePathList[i];
      if (path.startsWith(recursivePath)) {
        console.log(recursivePath, this._pathMaskActiveMap.get(recursivePath));
        return this._pathMaskActiveMap.get(recursivePath);
      }
    }
    return false;
  }

  setEntityPath(path: string, active: boolean, recursive: boolean = false) {
    path = path.startsWith("/") ? path.slice(1) : path;
    if (!this._pathMaskActiveMap.has(path)) {
      this._pathCount++;
      recursive && this._recursivePathList.push(path);
    }

    this._pathMaskActiveMap.set(path, active);

    if (recursive) {
      this._pathMaskActiveMap.forEach((v: boolean, p: string) => {
        if (p.startsWith(path)) {
          this._pathMaskActiveMap.set(p, active);
        }
      });
    }
  }

  removeEntityPath(path: string) {
    path = path.startsWith("/") ? path.slice(1) : path;
    const deleted = this._pathMaskActiveMap.delete(path);
    if (deleted) {
      this._pathCount--;
      this._recursivePathList = this._recursivePathList.filter((p) => p !== path);
    }
  }
}
