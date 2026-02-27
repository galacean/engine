import { Entity, ignoreClone, PointerEventData, Rect, SafeLoopArray, Script, Vector2, Vector3 } from "@galacean/engine";
import { Utils } from "../../Utils";
import { UITransform } from "../UITransform";

/**
 * Vertical scroll view
 */
export class ScrollView extends Script {
    // 视口
    private _viewportTransform: UITransform;
    // 内容
    private _contentTransform: UITransform;
    // 类型
    private _mode: ScrollViewMode = ScrollViewMode.VerticalAndHorizontal;
    // 滑动类型
    private _movementType: MovementType = MovementType.Clamped;
    // 惯性
    private _inertia: boolean = true;
    // 当前滑动速度
    private _velocity: Vector2 = new Vector2();
    // 惯性速度阈值
    private _threshold = 10;
    // 惯性衰减系数
    private _decelerationRate: number = 0.05;
    // 计算惯性时把每帧分成多个 1 / 240 秒时间片，模拟微积分
    private _inertiaBaseTimeInterval = 1 / 240;

    // 正在拖拽
    private _isDragging: boolean = false;
    // 计算边界
    private _viewportRect: Rect = new Rect();
    private _contentRect: Rect = new Rect();
    @ignoreClone
    private _listeners: SafeLoopArray<IScrollListener> = new SafeLoopArray<IScrollListener>();

    // 拖动行为的起始点（以 viewport 的局部坐标系为参考坐标系）
    private _startPoint: Vector3 = new Vector3();
    // **本帧**移动的起点（以 viewport 的局部坐标系为参考坐标系）
    private _fromPoint: Vector3 = new Vector3();
    // **本帧**移动的终点（以 viewport 的局部坐标系为参考坐标系）
    private _toPoint: Vector3 = new Vector3();

    get mode(): ScrollViewMode {
        return this._mode;
    }

    set mode(value: number) {
        this._mode = value;
    }

    get viewport() {
        return this._viewportTransform?.entity;
    }

    set viewport(entity: Entity) {
        this._viewportTransform = entity.transform as UITransform;
    }

    get content(): Entity {
        return this._contentTransform?.entity;;
    }

    set content(entity: Entity) {
        this._contentTransform = entity.transform as UITransform;
    }

    /**
     * 添加滑动回调
     * @param listener - The listening function
     */
    addOnScroll(listener: (percentH: number, percentV: number) => void): void {
        this._listeners.push({ fn: listener });
    }

    /**
     * 移除滑动回调
     * @param listener - The listening function
     */
    removeOnScroll(listener: (val: number) => void): void {
        this._listeners.findAndRemove((value) => (value.fn === listener ? (value.destroyed = true) : false));
    }

    override onPointerBeginDrag(eventData: PointerEventData): void {
        this._isDragging = true;
        const { _viewportTransform: viewportTransform } = this;
        if (!viewportTransform || !this._contentTransform) return;
        // 初始化拖动的起始点
        Utils.screenToLocalPoint(eventData.pointer.position, viewportTransform, this._startPoint);
        this._fromPoint.copyFrom(this._startPoint);
    }

    override onPointerDrag(eventData: PointerEventData): void {
        const { _viewportTransform: viewportTransform, _contentTransform: contentTransform } = this;
        if (!viewportTransform || !contentTransform) return;
        const { _fromPoint: fromPoint, _toPoint: toPoint } = this;
        // 更新 toPoint
        Utils.screenToLocalPoint(eventData.pointer.position, viewportTransform, toPoint);
        // 从 fromPoint 到 toPoint
        this._updateRect();
        this._computeScrolling(fromPoint, toPoint);
        // 更新 fromPoint
        fromPoint.copyFrom(toPoint)
    }

    private _computeScrolling(from: Vector3, to: Vector3) {
        const { _contentTransform: contentTransform, _mode: mode } = this;
        const contentScale = contentTransform.scale;
        // 根据 mode 计算 delta
        let deltaX = (mode & ScrollViewMode.Horizontal) ? (to.x - from.x) * contentScale.x : 0;
        let deltaY = (mode & ScrollViewMode.Vertical) ? (to.y - from.y) * contentScale.y : 0;
        // 根据滑动类型计算滑块的运动
        switch (this._movementType) {
            case MovementType.Clamped:
                const { _viewportRect: viewportRect, _contentRect: contentRect } = this;
                if (mode & ScrollViewMode.Horizontal) {
                    if (deltaX > 0) {
                        if (contentRect.x + deltaX > viewportRect.x) {
                            deltaX = viewportRect.x - contentRect.x;
                        }
                    } else if (deltaX < 0) {
                        if (contentRect.x + contentRect.width + deltaX < viewportRect.x + viewportRect.width) {
                            deltaX = viewportRect.x + viewportRect.width - contentRect.x - contentRect.width;
                        }
                    }
                }
                if (mode & ScrollViewMode.Vertical) {
                    if (deltaY > 0) {
                        if (contentRect.y + deltaY > viewportRect.y) {
                            deltaY = viewportRect.y - contentRect.y;
                        }
                    } else if (deltaY < 0) {
                        if (contentRect.y + contentRect.height + deltaY < viewportRect.y + viewportRect.height) {
                            deltaY = viewportRect.y + viewportRect.height - contentRect.y - contentRect.height;
                        }
                    }
                }
                break;
            case MovementType.Elastic:
                // 暂未实现
                break;
            default:
                break;
        }
        this._applyScrolling(deltaX, deltaY);
        // 记录此时的速度，可以计算惯性
        const delta = this.engine.time.actualDeltaTime;
        const invDeltaTime = 1 / delta;
        const velocity = this._velocity;
        velocity.set(deltaX * invDeltaTime, deltaY * invDeltaTime);
        velocity.scale(Math.pow(this._decelerationRate, delta))
    }

    private _applyScrolling(dx: number, dy: number): void {
        const contentPosition = this._contentTransform.position;
        const { _contentRect: contentRect, _viewportRect: viewportRect } = this;
        // 计算是否碰到边缘
        contentPosition.set(contentPosition.x + dx, contentPosition.y + dy, contentPosition.z);
        const percentH = (viewportRect.x - contentRect.x) / (contentRect.width - viewportRect.width);
        const percentV = (contentRect.y + contentRect.height - viewportRect.y - viewportRect.height) / (contentRect.height - viewportRect.height)
        const listeners = this._listeners.getLoopArray();
        for (let i = 0, n = listeners.length; i < n; i++) {
            const listener = listeners[i];
            !listener.destroyed && listener.fn(percentH, percentV);
        }
    }

    override onPointerEndDrag(eventData: PointerEventData): void {
        this._isDragging = false;
    }

    override onUpdate(deltaTime: number): void {
        if (this._isDragging || !this._inertia) return;
        const velocity = this._velocity;
        if (velocity.lengthSquared() <= this._threshold ** 2) {
            velocity.set(0, 0);
            return;
        }
        let dx = 0;
        let dy = 0;
        const { _inertiaBaseTimeInterval: inertiaBaseTimeInterval, _decelerationRate: decelerationRate } = this;
        while (deltaTime > 0) {
            const timeSlice = deltaTime > inertiaBaseTimeInterval ? inertiaBaseTimeInterval : deltaTime;
            velocity.scale(Math.pow(decelerationRate, timeSlice));
            dx += velocity.x * timeSlice;
            dy += velocity.y * timeSlice;
            deltaTime -= timeSlice;
        }
        this._updateRect();
        if (this._movementType !== MovementType.Unrestricted) {
            const { _contentRect: contentRect, _viewportRect: viewportRect } = this;
            if (dx > 0) {
                if (contentRect.x + dx > viewportRect.x) {
                    dx = viewportRect.x - contentRect.x;
                    velocity.x = 0;
                }
            } else if (dx < 0) {
                if (contentRect.x + contentRect.width + dx < viewportRect.x + viewportRect.width) {
                    dx = viewportRect.x + viewportRect.width - contentRect.x - contentRect.width;
                    velocity.x = 0;
                }
            }
            if (dy > 0) {
                if (contentRect.y + dy > viewportRect.y) {
                    dy = viewportRect.y - contentRect.y;
                    velocity.y = 0;
                }
            } else if (dy < 0) {
                if (contentRect.y + contentRect.height + dy < viewportRect.y + viewportRect.height) {
                    dy = viewportRect.y + viewportRect.height - contentRect.y - contentRect.height;
                    velocity.y = 0;
                }
            }
        }
        this._applyScrolling(dx, dy);

    }

    private _updateRect(): void {
        const { _viewportTransform: viewportTransform, _contentTransform: contentTransform } = this;
        if (viewportTransform && contentTransform) {
            const { _viewportRect: viewportRect, _contentRect: contentRect } = this;
            // viewport 的 localRect
            const viewportPivot = viewportTransform.pivot;
            const viewportSize = viewportTransform.size;
            viewportRect.set(-viewportPivot.x * viewportSize.x, -viewportPivot.y * viewportSize.y, viewportSize.x, viewportSize.y);
            // content 相对于 viewport 的 Rect
            const contentPosition = contentTransform.position;
            const contentScale = contentTransform.scale;
            const contentPivot = contentTransform.pivot;
            const contentSize = contentTransform.size;
            contentRect.set(
                contentPosition.x - contentPivot.x * contentSize.x * contentScale.x,
                contentPosition.y - contentPivot.y * contentSize.y * contentScale.y,
                contentSize.x * contentScale.x,
                contentSize.y * contentScale.y
            );
        }
    }

    override onDestroy(): void {
        super.onDestroy();
        this._listeners.findAndRemove((value) => (value.destroyed = true));
    }
}

export enum MovementType {
    Elastic,
    Clamped,
    Unrestricted
}

export interface IScrollListener {
    fn: (percentH: number, percentV: number) => void;
    destroyed?: boolean;
}

export enum ScrollViewMode {
    Vertical = 0x1,
    Horizontal = 0x2,
    VerticalAndHorizontal = 0x3
}
