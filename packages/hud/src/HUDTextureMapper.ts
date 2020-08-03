import { Logger } from "@alipay/o3-core";

/**
 * 创建一个三叉树节点
 * ---------------------
 * |         |         |
 * | LEFT_TOP|RIGHT_TOP|
 * |         |         |
 * ---------------------
 * |                   |
 * |      BOTTOM       |
 * |                   |
 * ---------------------
 * @param {number} depth      节点相对于根节点的深度
 * @param {Object} coverRect  覆盖区域
 * @param {Object} parentCell 父节点
 * @param {Object} parentCell 左上节点
 * @param {Object} parentCell 右上节点
 * @param {Object} parentCell 下节点
 * @private
 */
function createQuadCell(depth, coverRect, parentCell?, leftTopSubCell?, rightTopSubCell?, bottomSubCell?) {
  const cell: { depth?; coverRect?; occupied?; parentCell?; childCells?; isLeaf? } = {};
  cell.depth = depth;
  cell.coverRect = coverRect;
  cell.occupied = false;

  cell.parentCell = parentCell;
  cell.childCells = [leftTopSubCell, rightTopSubCell, bottomSubCell];

  cell.isLeaf = true;

  return cell;
}

/**
 * 分配HUD控件在 HUDTexture 上面的绘制区域，采用一个三叉树分配算法
 * @class
 * @private
 */
export class HUDTextureMapper {
  private _width;
  private _height;
  private _maxDepth;
  private _rootCell;
  private _freshWidgets;
  private _sprites;

  /**
   * 构造函数
   * @param {number} width 内部Canvas的宽度
   * @param {number} height 内部Canvas的高度
   */
  constructor(width, height) {
    this._width = width;
    this._height = height;

    //-- 寻找可分配区域的最大深度
    this._maxDepth = 10;

    //-- 分配算法中的根节点
    this._rootCell = createQuadCell(0, { x: 0, y: 0, width: this._width, height: this._height });

    //-- 待分配的HUD控件队列
    this._freshWidgets = [];

    //-- 已分配的Canvas区域列表
    this._sprites = {};
  }

  /**
   * 将未分配过的HUD控件添加到待分配队列中
   * @param {HUDWidget} widget
   */
  needAllocSprite(widget) {
    if (widget && !widget.allotted) {
      this._freshWidgets.push(widget);
    }
  }

  /**
   * 分配HUD控件在 HUDTexture 上面的绘制区域
   */
  allocSprites() {
    if (this._freshWidgets.length <= 0) {
      return;
    }

    // 根据widget占用空间的高度从大到小排序
    this._freshWidgets.sort((wgt1, wgt2) => wgt1.spriteRect.height - wgt2.spriteRect.height);

    for (let i = this._freshWidgets.length - 1; i >= 0; i--) {
      const widget = this._freshWidgets[i];
      // 先查询是否分配过
      const findSpriteData = this._sprites[widget.spriteID];
      if (findSpriteData) {
        widget.setSpriteInfo(findSpriteData);
        findSpriteData.referenceCount++;
        continue;
      }

      const width = widget.spriteRect.width;
      const height = widget.spriteRect.height;

      const cell = this._allocRectangle(width, height);
      const spriteData = this._generateSpriteData(cell);
      this._sprites[widget.spriteID] = spriteData;
      widget.allotted = true;
      widget.setSpriteInfo(spriteData);
    }

    this._freshWidgets = [];
  }

  /**
   * 释放在Canvas上面占用的像素空间
   * @param {string} spriteID 贴图单元的ID，如果ID相同，则引用同一单元
   */
  releaseSprite(spriteID) {
    const findSprite = this._sprites[spriteID];
    if (findSprite) {
      findSprite.referenceCount--;
      if (findSprite.referenceCount === 0) {
        const rect = findSprite.spriteRect;
        this._releaseRectangle(findSprite.cell);
        delete this._sprites[spriteID];
        return rect;
      }
    }

    return false;
  }

  /**
   * 设置需要绘制的控件的个数
   * @param {number} widgetWidth 待分配的空间宽度（像素）
   * @param {number} widgetHeight 待分配的空间高度（像素）
   * @private
   */
  _allocRectangle(widgetWidth, widgetHeight) {
    const availablecell = this._findAvailableRectangle(this._rootCell, widgetWidth, widgetHeight);
    if (availablecell) {
      const allocedcell = this._placeRectangle(availablecell, widgetWidth, widgetHeight);
      return allocedcell;
    }

    Logger.warn("Alloc rectangle fail!");
    return false;
  }

  /**
   * 释放目标节点占用的Canvas区域
   * @param {Object} cell 占用的三叉树节点信息
   * @private
   */
  _releaseRectangle(cell) {
    if (!cell || !cell.isLeaf) {
      return;
    }

    cell.occupied = false;

    // 检查上层节点是否可以合并
    let parentCell = cell.parentCell;
    while (parentCell) {
      const childCells = parentCell.childCells;
      let hasOccupied = false;
      for (let i = 0, length = childCells.length; i < length; i++) {
        if (!childCells[i].isLeaf || childCells[i].occupied) {
          hasOccupied = true;
          break;
        }
      }

      if (!hasOccupied) {
        parentCell.occupied = false;
        parentCell.isLeaf = true;
        for (let i = 0, length = cell.childCells.length; i < length; i++) {
          cell.childCells[i] = null;
        }

        parentCell = parentCell.parentCell;
      } else {
        break;
      }
    }
  }

  /**
   * 根据cell节点生成Canvas上的占用区域信息
   * @param {Object} cell 三叉树节点信息
   * @private
   */
  _generateSpriteData(cell) {
    // 分配失败
    if (!cell) {
      return {
        valid: false,
        uvRect: {
          u: 0,
          v: 0,
          width: 1,
          height: 1
        }
      };
    }

    const w = this._width;
    const h = this._height;
    const x = cell.coverRect.x;
    const y = cell.coverRect.y;
    const widgetWidth = cell.coverRect.width;
    const widgetHeight = cell.coverRect.height;

    const uvRect = {
      u: x / w,
      v: y / h,
      width: widgetWidth / w,
      height: widgetHeight / h
    };
    const spriteData = {
      valid: true,
      uvRect,
      spriteRect: cell.coverRect,
      referenceCount: 1,
      cell
    };

    return spriteData;
  }

  /**
   * 递归寻找可用的Canvas区域
   * @param {Object} cell 三叉树节点信息
   * @param {number} widgetWidth 待分配的空间宽度（像素）
   * @param {number} widgetHeight 待分配的空间高度（像素）
   * @private
   */
  _findAvailableRectangle(cell, widgetWidth, widgetHeight) {
    if (!cell || cell.occupied || cell.depth > this._maxDepth) {
      return false;
    }

    if (cell.coverRect.width < widgetWidth || cell.coverRect.height < widgetHeight) {
      return false;
    }

    if (cell.isLeaf) {
      return cell;
    } else {
      const childCells = cell.childCells;
      for (let i = 0, len = childCells.length; i < len; i++) {
        const availablecell = this._findAvailableRectangle(childCells[i], widgetWidth, widgetHeight);
        if (availablecell) {
          return availablecell;
        }
      }
    }

    return false;
  }

  /**
   * 拆分被占用的Canvas区域为三块，标记每块的状态
   * @param {Object} cell 三叉树节点信息
   * @param {number} widgetWidth 待分配的空间宽度（像素）
   * @param {number} widgetHeight 待分配的空间高度（像素）
   * @private
   */
  _placeRectangle(cell, widgetWidth, widgetHeight) {
    cell.isLeaf = false;

    const px = cell.coverRect.x;
    const py = cell.coverRect.y;
    const w = cell.coverRect.width;
    const h = cell.coverRect.height;
    const coverRect = { x: px, y: py, width: widgetWidth, height: widgetHeight };
    cell.childCells[0] = createQuadCell(cell.depth + 1, coverRect, cell);
    cell.childCells[0].occupied = true;

    const rightTopRect = {
      x: px + coverRect.width + 1,
      y: py,
      width: w - coverRect.width - 2,
      height: coverRect.height
    };
    cell.childCells[1] = createQuadCell(cell.depth + 1, rightTopRect, cell);

    const bottomRect = { x: px, y: py + coverRect.height + 1, width: w, height: h - coverRect.height - 2 };
    cell.childCells[2] = createQuadCell(cell.depth + 1, bottomRect, cell);

    return cell.childCells[0];
  }
}
