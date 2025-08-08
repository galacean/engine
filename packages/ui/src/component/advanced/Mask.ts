import { assignmentClone, BatchUtils, BoundingBox, Entity, ignoreClone, ISpriteRenderer, RenderElement, RendererUpdateFlags, RenderQueueFlags, ShaderProperty, SimpleSpriteAssembler, Sprite, SpriteMaskLayer, SpriteModifyFlags, SubRenderElement } from "@galacean/engine";
import { UIRenderer, UITransform } from "..";

export class Mask extends UIRenderer implements ISpriteRenderer {
    /** @internal */
    static _maskTextureProperty: ShaderProperty = ShaderProperty.getByName("renderer_MaskTexture");
    /** @internal */
    static _alphaCutoffProperty: ShaderProperty = ShaderProperty.getByName("renderer_MaskAlphaCutoff");

    /** The mask layers the sprite mask influence to. */
    @assignmentClone
    influenceLayers: SpriteMaskLayer = SpriteMaskLayer.Everything;
    /** @internal */
    @ignoreClone
    _renderElement;
    /** @internal */
    @ignoreClone
    _maskIndex: number = -1;

    @ignoreClone
    private _sprite: Sprite = null;
    @assignmentClone
    private _flipX: boolean = false;
    @assignmentClone
    private _flipY: boolean = false;

    @assignmentClone
    private _alphaCutoff: number = 0.5;


    /**
     * @internal
     */
    override _getChunkManager() {
        // @ts-ignore
        return this.engine._batcherManager.primitiveChunkManagerMask;
    }

    /**
     * Flips the sprite on the X axis.
     */
    get flipX(): boolean {
        return this._flipX;
    }

    set flipX(value: boolean) {
        if (this._flipX !== value) {
            this._flipX = value;
            this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
        }
    }

    /**
     * Flips the sprite on the Y axis.
     */
    get flipY(): boolean {
        return this._flipY;
    }

    set flipY(value: boolean) {
        if (this._flipY !== value) {
            this._flipY = value;
            this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
        }
    }

    /**
     * The Sprite to render.
     */
    get sprite(): Sprite {
        return this._sprite;
    }

    set sprite(value: Sprite | null) {
        const lastSprite = this._sprite;
        if (lastSprite !== value) {
            if (lastSprite) {
                this._addResourceReferCount(lastSprite, -1);
                // @ts-ignore
                lastSprite._updateFlagManager.removeListener(this._onSpriteChange);
            }
            this._dirtyUpdateFlag |= MaskUpdateFlags.All;
            if (value) {
                this._addResourceReferCount(value, 1);
                // @ts-ignore
                value._updateFlagManager.addListener(this._onSpriteChange);
                this.shaderData.setTexture(Mask._maskTextureProperty, value.texture);
            } else {
                this.shaderData.setTexture(Mask._maskTextureProperty, null);
            }
            this._sprite = value;
        }
    }

    /**
     * The minimum alpha value used by the mask to select the area of influence defined over the mask's sprite. Value between 0 and 1.
     */
    get alphaCutoff(): number {
        return this._alphaCutoff;
    }

    set alphaCutoff(value: number) {
        if (this._alphaCutoff !== value) {
            this._alphaCutoff = value;
            this.shaderData.setFloat(Mask._alphaCutoffProperty, value);
        }
    }


    /**
     * @internal
     */
    override _canBatch(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
        return BatchUtils.canBatchSpriteMask(elementA, elementB);
    }

    /**
     * @internal
     */
    override _batch(elementA: SubRenderElement, elementB?: SubRenderElement): void {
        BatchUtils.batchFor2D(elementA, elementB);
    }

    /**
     * @internal
     */
    constructor(entity: Entity) {
        super(entity);
        SimpleSpriteAssembler.resetData(this);
        // @ts-ignore
        this.setMaterial(this._engine._basicResources.spriteMaskDefaultMaterial);
        this.shaderData.setFloat(Mask._alphaCutoffProperty, this._alphaCutoff);
        this._renderElement = new RenderElement();
        this._renderElement.addSubRenderElement(new SubRenderElement());
        this._onSpriteChange = this._onSpriteChange.bind(this);
        this.raycastEnabled = false;
    }

    /**
     * @internal
     */
    _cloneTo(target: Mask, srcRoot: Entity, targetRoot: Entity): void {
        // @ts-ignore
        super._cloneTo(target, srcRoot, targetRoot);
        target.sprite = this._sprite;
    }

    /**
     * @internal
     */
    override _onEnableInScene(): void {
        super._onEnableInScene();
        // @ts-ignore
        this.scene._maskManager.addSpriteMask(this);
    }

    /**
     * @internal
     */
    override _onDisableInScene(): void {
        super._onDisableInScene();
        // @ts-ignore
        this.scene._maskManager.removeSpriteMask(this);
    }

    protected override _updateBounds(worldBounds: BoundingBox): void {
        const sprite = this._sprite;
        const rootCanvas = this._getRootCanvas();
        if (sprite && rootCanvas) {
            const transform = <UITransform>this._transformEntity.transform;
            const { size } = transform;
            SimpleSpriteAssembler.updatePositions(
                this,
                transform.worldMatrix,
                size.x,
                size.y,
                transform.pivot,
                false,
                false
            );
        } else {
            const { worldPosition } = this._transformEntity.transform;
            worldBounds.min.copyFrom(worldPosition);
            worldBounds.max.copyFrom(worldPosition);
        }
    }

    /**
     * @inheritdoc
     */
    protected override _render(context): void {
        const { _sprite: sprite } = this;
        const transform = <UITransform>this._transformEntity.transform;
        const { x: width, y: height } = transform.size;
        if (!sprite?.texture || !width || !height) {
            return;
        }

        let material = this.getMaterial();
        if (!material) {
            return;
        }
        const { _engine: engine } = this;
        // @todo: This question needs to be raised rather than hidden.
        if (material.destroyed) {
            // @ts-ignore
            material = engine._basicResources.spriteMaskDefaultMaterial;
        }

        // Update position
        if (this._dirtyUpdateFlag & RendererUpdateFlags.WorldVolume) {
            SimpleSpriteAssembler.updatePositions(
                this,
                transform.worldMatrix,
                width,
                height,
                transform.pivot,
                false,
                false,
            );
            this._dirtyUpdateFlag &= ~RendererUpdateFlags.WorldVolume;
        }

        // Update uv
        if (this._dirtyUpdateFlag & MaskUpdateFlags.UV) {
            SimpleSpriteAssembler.updateUVs(this);
            this._dirtyUpdateFlag &= ~MaskUpdateFlags.UV;
        }

        const renderElement = this._renderElement;
        const subRenderElement = renderElement.subRenderElements[0];
        renderElement.set(this.priority, 0);
        const subChunk = this._subChunk;
        subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, this.sprite.texture, subChunk);
        subRenderElement.shaderPasses = material.shader.subShaders[0].passes;
        subRenderElement.renderQueueFlags = RenderQueueFlags.All;
        renderElement.addSubRenderElement(subRenderElement);
    }

    /**
     * @inheritdoc
     */
    protected override _onDestroy(): void {
        const sprite = this._sprite;
        if (sprite) {
            this._addResourceReferCount(sprite, -1);
            // @ts-ignore
            sprite._updateFlagManager.removeListener(this._onSpriteChange);
            this._sprite = null;
        }

        super._onDestroy();

        if (this._subChunk) {
            this._getChunkManager().freeSubChunk(this._subChunk);
            this._subChunk = null;
        }

        this._renderElement = null;
    }

    @ignoreClone
    private _onSpriteChange(type: SpriteModifyFlags): void {
        switch (type) {
            case SpriteModifyFlags.texture:
                this.shaderData.setTexture(Mask._maskTextureProperty, this.sprite.texture);
                break;
            case SpriteModifyFlags.region:
            case SpriteModifyFlags.atlasRegionOffset:
                this._dirtyUpdateFlag |= MaskUpdateFlags.WorldVolumeAndUV;
                break;
            case SpriteModifyFlags.atlasRegion:
                this._dirtyUpdateFlag |= MaskUpdateFlags.UV;
                break;
            case SpriteModifyFlags.destroy:
                this.sprite = null;
                break;
            default:
                break;
        }
    }
}


/**
 * @remarks Extends `RendererUpdateFlags`.
 */
enum MaskUpdateFlags {
    /** UV. */
    UV = 0x2,
    /** Automatic Size. */
    AutomaticSize = 0x4,
    /** WorldVolume and UV. */
    WorldVolumeAndUV = 0x3,
    /** All. */
    All = 0x7
}
