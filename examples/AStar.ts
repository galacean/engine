/**
 * @title AStar
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*8TbMTLiQO0kAAAAAAAAAAAAADiR2AQ/original
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*1ejuTpeuUEwAAAAAAAAAAAAADiR2AQ/original
 */

import {
  BoxColliderShape,
  Camera,
  Color,
  Entity,
  Font,
  MeshRenderer,
  PrimitiveMesh,
  Rect,
  Script,
  StaticCollider,
  TextRenderer,
  UnlitMaterial,
  Vector2,
  WebGLEngine,
} from "@galacean/engine";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import * as dat from "dat.gui";

class GripMap {
  static StraightCost = 10;
  static SlashCost = 14;

  width: number = 0;
  height: number = 0;
  version: number = 0;

  private _grids: Grid[] = [];
  private _pool: Grid[] = [];
  private _subArr: number[][] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];

  reset(width: number, height: number, data?: []) {
    this.width = width;
    this.height = height;
    const { _grids: grids } = this;
    const newLength = width * height;
    const preLength = grids.length;
    if (preLength < newLength) {
      for (let i = preLength; i < newLength; i++) {
        grids.push(this._createGrid());
      }
    } else {
      for (let i = newLength; i < preLength; i++) {
        this._destroyGrid(<Grid>grids.pop());
      }
    }
    // reset
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        grids[i + j * width].reset(i, j);
      }
    }
  }

  random(factor: number) {
    const { width, height } = this;
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const gridData = this.getGrid(i, j);
        if (gridData) {
          gridData.walkAble = Math.random() > factor;
        }
      }
    }
  }

  getGrid(x: number, y: number): Grid | null {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
      return this._grids[x + this.width * y];
    } else {
      return null;
    }
  }

  findPath(start: Vector2, end: Vector2): Grid[] {
    const time = window.Date.now();
    const binaryHeap = new BinaryHeap(this._compareFun);
    const startGrid = <Grid>this.getGrid(start.x, start.y);
    let endGrid = <Grid>this.getGrid(end.x, end.y);
    let minHCost: number = Infinity;
    const version = ++this.version;
    let nearestGrid;
    let currGrid = startGrid;
    currGrid.G = 0;
    currGrid.isClose = true;

    while (currGrid !== endGrid) {
      currGrid.isInit || this._initNeighbors(currGrid);
      const { neighbors } = currGrid;
      for (let i = 0; i < 8; i++) {
        const neighbor = neighbors[i];
        if (!neighbor || !neighbor.walkAble) {
          continue;
        }
        const grid = neighbor.grid;
        if (grid.version !== version) {
          grid.isClose = false;
          grid.isOpen = false;
          grid.version = version;
        } else {
          if (grid.isClose) {
            continue;
          }
        }
        if (grid.isOpen) {
          // update cost
          const newG = currGrid.G + neighbor.cost;
          if (newG < grid.G) {
            grid.G = currGrid.G + neighbor.cost;
            grid.F = grid.G + grid.H;
            grid.parent = currGrid;
          }
        } else {
          grid.G = currGrid.G + neighbor.cost;
          grid.H = this._getH(grid, endGrid);
          grid.F = grid.G + grid.H;
          grid.parent = currGrid;
          grid.isOpen = true;
          binaryHeap.ins(grid);
        }
      }

      if (binaryHeap.isEmpty()) {
        if (nearestGrid) {
          endGrid = nearestGrid;
          break;
        } else {
          return [];
        }
      }

      while (!binaryHeap.isEmpty()) {
        const bestGrid = <Grid>binaryHeap.pop();
        if (!bestGrid.isClose) {
          bestGrid.isOpen = false;
          bestGrid.isClose = true;
          const distance = bestGrid.H;
          if (distance < minHCost) {
            nearestGrid = bestGrid;
            minHCost = distance;
          }
          currGrid = bestGrid;
          break;
        }
      }
    }

    // reverse path
    const resArr = [endGrid];
    currGrid = endGrid;
    while (currGrid != startGrid) {
      currGrid = currGrid.parent;
      resArr.push(currGrid);
    }
    console.log("Spend time:" + (window.Date.now() - time) + " ms");
    return resArr;
  }

  /**
   * Add obstacles.
   * @param rect - starting position and width and height
   */
  addObstacle(rect: Rect): void {
    const { x, y, width, height } = rect;
    const endX = x + width;
    const endY = y + height;
    for (let i = x; i < endX; i++) {
      for (let j = y; j < endY; j++) {
        const grid = this.getGrid(i, j);
        if (grid) {
          grid.walkAble = false;
        }
      }
    }
  }

  private _compareFun(x: Grid, y: Grid): boolean {
    return x.F < y.F;
  }

  /**
   * Manhattan distance
   * @param from - start position
   * @param to - end position
   * @returns estimated cost
   */
  private _getH(from: Grid, to: Grid): number {
    let dx = from.x - to.x;
    let dy = from.y - to.y;
    dx = dx >= 0 ? dx : -dx;
    dy = dy >= 0 ? dy : -dy;
    // straight line distance
    let a = dx > dy ? dx - dy : dy - dx;
    // slash distance
    let b = (dx + dy - a) / 2;
    return a * GripMap.StraightCost + b * GripMap.SlashCost;
  }

  private _initNeighbors(grid: Grid): void {
    const { x, y, neighbors } = grid;
    const { _subArr: subArr } = this;
    for (let i = 0; i < 4; i++) {
      let testNode = this.getGrid(x + subArr[i][0], y + subArr[i][1]);
      if (testNode) {
        const link = new NeighborLink(testNode, GripMap.StraightCost);
        link.walkAble = testNode.walkAble;
        neighbors[i] = link;
      } else {
        neighbors[i] = null;
      }
    }
    for (let i = 4; i < 8; i++) {
      const expectX = x + subArr[i][0];
      const expectY = y + subArr[i][1];
      let testNode = this.getGrid(expectX, expectY);
      if (testNode) {
        const link = new NeighborLink(testNode, GripMap.SlashCost);
        if (testNode.walkAble) {
          const gridDataA = this.getGrid(expectX, y);
          const gridDataB = this.getGrid(x, expectY);
          const walkAbleA = gridDataA ? gridDataA.walkAble : false;
          const walkAbleB = gridDataB ? gridDataB.walkAble : false;
          link.walkAble = walkAbleA || walkAbleB;
        } else {
          link.walkAble = false;
        }
        neighbors[i] = link;
      } else {
        neighbors[i] = null;
      }
    }
    grid.isInit = true;
  }

  private _createGrid(): Grid {
    if (this._pool.length > 0) {
      return <Grid>this._pool.pop();
    } else {
      return new Grid();
    }
  }

  private _destroyGrid(grid: Grid): void {
    this._grids.push(grid);
  }
}

class Grid {
  parent: Grid;
  x: number;
  y: number;
  neighbors: (NeighborLink | null)[] = [];
  G: number;
  H: number;
  F: number;

  walkAble: boolean = false;
  isOpen: boolean = false;
  isClose: boolean = false;
  isInit: boolean = false;
  version: number = 0;

  reset(x: number, y: number, walkAble: boolean = true) {
    this.x = x;
    this.y = y;
    this.walkAble = walkAble;
    this.G = this.H = this.F = 0;
    this.isOpen = this.isClose = this.isInit = false;
    this.version = -1;
  }
}

class NeighborLink {
  grid: Grid;
  cost: number;
  walkAble: boolean;
  constructor(grid: Grid, cost: number) {
    this.grid = grid;
    this.cost = cost;
  }
}

/**
 * Min heap
 */
class BinaryHeap {
  arr: Array<any> = [];
  compareFun: Function = function (x: any, y: any): Boolean {
    return x < y;
  };

  ins(value: Object): void {
    const { arr } = this;
    let curI = arr.length;
    arr[curI] = value;
    let curParentI = curI >> 1;
    while (curI > 1 && this.compareFun(this.arr[curI], this.arr[curParentI])) {
      let temp = arr[curI];
      arr[curI] = arr[curParentI];
      arr[curParentI] = temp;
      curI = curParentI;
      curParentI = curI >> 1;
    }
  }

  isEmpty(): boolean {
    return this.arr.length < 2;
  }

  pop(): Object {
    const { arr } = this;
    let min: Object = arr[1];
    arr[1] = arr[arr.length - 1];
    arr.pop();
    const l = arr.length;
    let curI = 1;
    let leftI = curI << 1;
    let rightI = leftI + 1;
    let minI: number;
    while (leftI < l) {
      if (rightI < l) {
        minI = this.compareFun(arr[rightI], arr[leftI]) ? rightI : leftI;
      } else {
        minI = leftI;
      }
      if (this.compareFun(arr[minI], arr[curI])) {
        let temp: Object = arr[curI];
        arr[curI] = arr[minI];
        arr[minI] = temp;
        curI = minI;
        leftI = curI << 1;
        rightI = leftI + 1;
      } else {
        break;
      }
    }
    return min;
  }

  constructor(justMinFun: (a: never, b: never) => boolean) {
    justMinFun && (this.compareFun = justMinFun);
    this.arr.push(-1);
  }
}

enum FindingPathStep {
  SetStart,
  SetEnd,
  Finish,
}

class MapViewControl extends Script {
  map: GripMap;
  private _path: Grid[];
  private _gridEntities: Entity[][] = [];
  private _tempColor: Color = new Color();
  private _tempStartVec: Vector2 = new Vector2();
  private _tempEndVec: Vector2 = new Vector2();
  private _step: FindingPathStep = FindingPathStep.SetStart;

  set path(val: Grid[]) {
    this._path = val;
  }

  reset() {
    this._path && (this._path.length = 0);
    this.map.reset(50, 50);
    this.map.random(0.3);
    this.clearView();
    this._step = FindingPathStep.SetStart;
    this.engine.dispatch("StateChange", this._step);
  }

  clearView() {
    const { map, _gridEntities: gridEntities } = this;
    const { width, height } = map;
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const gridData = map.getGrid(i, j);
        if (!gridData) {
          continue;
        }
        const gridEntity = gridEntities[i][j];
        const gridRenderer = gridEntity.getComponent(MeshRenderer);
        const gridMaterial = gridRenderer.getMaterial() as UnlitMaterial;
        gridMaterial.baseColor = this._getColor(gridData);
      }
    }
  }

  drawPath() {
    const { map, _gridEntities: gridEntities, _path: path } = this;
    const { width, height } = map;
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const gridData = map.getGrid(i, j);
        if (!gridData) {
          continue;
        }
        const gridEntity = gridEntities[i][j];
        const gridRenderer = gridEntity.getComponent(MeshRenderer);
        const gridMaterial = gridRenderer.getMaterial() as UnlitMaterial;
        if (path.includes(gridData)) {
          gridMaterial.baseColor = new Color(0, 1, 0, 1);
        }
      }
    }
  }

  onAwake() {
    this.map = new GripMap();
    const { map, entity, engine, _gridEntities: gridEntities } = this;
    map.reset(50, 50);
    map.random(0.3);
    const { width, height } = map;
    this._getColor = this._getColor.bind(this);
    for (let i = 0; i < width; i++) {
      gridEntities[i] ||= new Array<Entity>(height);
      for (let j = 0; j < height; j++) {
        const gridData = map.getGrid(i, j);
        const gridEntity = (gridEntities[i][j] = entity.createChild(
          i + "_" + j
        ));
        gridEntity.transform.setScale(0.9, 1, 0.9);
        const gridRenderer = gridEntity.addComponent(MeshRenderer);
        gridRenderer.mesh = PrimitiveMesh.createPlane(engine, 1, 1);
        const gridMaterial = new UnlitMaterial(engine);
        gridRenderer.setMaterial(gridMaterial);
        gridEntity.transform.setPosition(i, 0, j);
        if (gridData) {
          if (gridData.walkAble) {
            gridMaterial.baseColor = new Color(1, 1, 1, 1);
          } else {
            gridMaterial.baseColor = new Color(1, 0, 0, 1);
          }
          const collider = gridEntity.addComponent(StaticCollider);
          const colliderShape = new BoxColliderShape();
          colliderShape.size.set(1, 1, 1);
          collider.addShape(colliderShape);
          const gridControl = gridEntity.addComponent(Script);
          gridControl.onPointerEnter = () => {
            gridMaterial.baseColor = new Color(0, 0, 1, 1);
          };
          gridControl.onPointerExit = () => {
            gridMaterial.baseColor = this._getColor(gridData);
          };
          gridControl.onPointerClick = () => {
            const { x, y } = gridData;
            switch (this._step) {
              case FindingPathStep.SetStart:
                this._tempStartVec.set(x, y);
                this._path = [this.map.getGrid(x, y) as Grid];
                this._step = FindingPathStep.SetEnd;
                break;
              case FindingPathStep.SetEnd:
                this._tempEndVec.set(x, y);
                this._path = map.findPath(this._tempStartVec, this._tempEndVec);
                this._step = FindingPathStep.Finish;
                this.drawPath();
                break;
              case FindingPathStep.Finish:
                this._tempStartVec.set(x, y);
                this._path = [this.map.getGrid(x, y) as Grid];
                this._step = FindingPathStep.SetEnd;
                this.clearView();
                break;
              default:
                break;
            }
            engine.dispatch("StateChange", this._step);
          };
        } else {
          gridMaterial.baseColor = new Color(0, 0, 0, 1);
        }
      }
    }
  }

  private _getColor(grid: Grid) {
    if (grid) {
      if (grid.walkAble) {
        if (this._path?.includes(grid)) {
          this._tempColor.set(0, 1, 0, 1);
        } else {
          this._tempColor.set(1, 1, 1, 1);
        }
      } else {
        this._tempColor.set(1, 0, 0, 1);
      }
    } else {
      this._tempColor.set(0, 0, 0, 1);
    }
    return this._tempColor;
  }
}

WebGLEngine.create({ canvas: "canvas", physics: new PhysXPhysics() }).then((engine) => {
  // Create engine object.
  engine.canvas.resizeByClientSize();

  // Create root entity.
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();
  // Create camera.
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 5);
  const camera = cameraEntity.addComponent(Camera);
  camera.isOrthographic = true;
  camera.orthographicSize = 40;

  const textEntity = rootEntity.createChild("text");
  textEntity.transform.setPosition(0, 30, 0);
  textEntity.transform.setScale(5, 5, 5);
  const renderer = textEntity.addComponent(TextRenderer);
  renderer.color = new Color(1, 1, 1, 1);
  renderer.fontSize = 40;
  renderer.font = Font.createFromOS(engine, "Arial");
  renderer.text = "Please select the starting point";
  engine.on("StateChange", (state: FindingPathStep) => {
    switch (state) {
      case FindingPathStep.SetStart:
        renderer.text = "Please select the starting point";
        break;
      case FindingPathStep.SetEnd:
        renderer.text = "Please select the end point";
        break;
      case FindingPathStep.Finish:
        renderer.text = "Please select the starting point again";
        break;
      default:
        break;
    }
  });

  const mapEntity = rootEntity.createChild("map");
  mapEntity.transform.setRotation(90, 0, 0);
  mapEntity.transform.setPosition(-25, 25, 0);
  const mapViewControl = mapEntity.addComponent(MapViewControl);
  engine.run();

  const gui = new dat.GUI();
  const guiData = {
    reset: () => {
      mapViewControl.reset();
    },
  };
  gui.add(guiData, "reset");
});
