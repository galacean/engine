import { Logger, ResourceManager, Sprite, Texture } from "@oasis-engine/core";
import { AssetConfig, LoadAttachedResourceResult } from "../types";
import { getAllGetters, isAsset } from "../utils";
import { SchemaResource } from "./SchemaResource";
import { TextureResource } from "./TextureResource";

export class SpriteResource extends SchemaResource {
  private configProps;

  load(resourceManager: ResourceManager, assetConfig: AssetConfig): Promise<SpriteResource> {
    return new Promise((resolve) => {
      const assetObj = new Sprite(resourceManager.engine);
      this.configProps = assetConfig.props;
      const { configProps } = this;
      const { pivotType, pivot } = configProps;

      if (typeof pivot !== "undefined" && typeof pivotType !== "undefined" && pivotType !== SpritePivotType.Custom) {
        switch (pivotType) {
          case SpritePivotType.Center:
            pivot.x = 0.5;
            pivot.y = 0.5;
            break;
          case SpritePivotType.TopLeft:
            pivot.x = 0;
            pivot.y = 1;
            break;
          case SpritePivotType.Top:
            pivot.x = 0.5;
            pivot.y = 1;
            break;
          case SpritePivotType.TopRight:
            pivot.x = 1;
            pivot.y = 1;
            break;
          case SpritePivotType.Left:
            pivot.x = 0;
            pivot.y = 0.5;
            break;
          case SpritePivotType.Right:
            pivot.x = 1;
            pivot.y = 0.5;
            break;
          case SpritePivotType.BottomLeft:
            pivot.x = 0;
            pivot.y = 0;
            break;
          case SpritePivotType.Bottom:
            pivot.x = 0.5;
            pivot.y = 0;
            break;
          case SpritePivotType.BottomRight:
            pivot.x = 1;
            pivot.y = 0;
            break;
          default:
            break;
        }
      }

      for (let k in configProps) {
        if (!isAsset(configProps[k])) {
          assetObj[k] = configProps[k];
        }
      }

      this._resource = assetObj;
      this.setMeta();
      resolve(this);
    });
  }

  loadWithAttachedResources(
    resourceManager: ResourceManager,
    assetConfig: AssetConfig
  ): Promise<LoadAttachedResourceResult> {
    return new Promise((resolve, reject) => {
      let loadPromise;
      if (assetConfig.resource instanceof SpriteResource) {
        loadPromise = new Promise((resolve) => {
          this._resource = assetConfig.resource;
          this.setMeta();
          resolve(this);
        });
      } else if (assetConfig.props) {
        loadPromise = this.load(resourceManager, assetConfig);
      } else {
        reject("Load Sprite Error");
      }
      if (loadPromise) {
        loadPromise.then(() => {
          const result: any = {
            resources: [this],
            structure: {
              index: 0,
              props: {}
            }
          };

          const sprite = this._resource;
          getAllGetters(this._resource).forEach((attr) => {
            if (!(sprite[attr] instanceof Texture)) return;
            const textureResource = new TextureResource(this.resourceManager, sprite[attr]);
            this.attachedResources.push(textureResource);
            result.resources.push(textureResource);
            result.structure.props[attr] = {
              index: result.resources.length - 1
            };
          });
          resolve(result);
        });
      }
    });
  }

  setMeta() {
    if (this.resource) {
      this.meta.name = this.resource.name;
    }
  }

  getProps() {
    const result = {};
    const props = getAllGetters(this.resource);
    props.forEach((prop) => (result[prop] = this.resource[prop]));
    return result;
  }

  bind() {
    const resource = this._resource;
    Object.keys(this.configProps).forEach((attr) => {
      const value = this.configProps[attr];
      if (isAsset(value)) {
        const textureResource = this.resourceManager.get(value.id);
        if (textureResource && textureResource instanceof TextureResource) {
          resource[attr] = textureResource.resource;
          this._attachedResources.push(textureResource);
        } else {
          resource[attr] = null;
          Logger.warn(`SpriteResource: ${this.meta.name} can't find asset "${attr}", which id is: ${value.id}`);
        }
      } else {
        resource[attr] = value;
      }
    });
  }
}

export enum SpritePivotType {
  Center = 0,
  TopLeft = 1,
  Top = 2,
  TopRight = 3,
  Left = 4,
  Right = 5,
  BottomLeft = 6,
  Bottom = 7,
  BottomRight = 8,
  Custom = 9
}
