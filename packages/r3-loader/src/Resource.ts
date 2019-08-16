import {AssetType, EventDispatcher} from '@alipay/r3-base';
import {HandlerType, Prop, ResType} from './type';

interface Props {
  type: ResType,
  handlerType?: HandlerType,
  config?: Prop,
  data?: Prop,
  assetType?: AssetType,
  url?: string,
  urls?: Array<string>
}

/**
 * 资源管理器加载的资源对象
 */
export class Resource extends EventDispatcher {

  public name: string;
  public type: ResType;
  public handlerType: HandlerType | void;
  public config: Prop;
  public data: any;
  public assets: Array<Prop>;
  public assetType: AssetType;
  public loaded: boolean;
  public loading: boolean;
  private _file: { url: string | void, urls: Array<string> | void };

  /**
   * 资源
   * @param {string} name 资源名
   * @param {Object} props 资源配置
   * @param {string} props.type 资源类型:'image','texture','gltf','glb'
   * @param {string} props.handlerType 资源处理器类型:'image','video'
   * @param {Object} props.config 该资源的配置
   * @param {Object} props.data 该资源关联的数据对象
   * @param {AssetType} props.assetType 关联的资源类型:AssetType.Scene,AssetType.Cache
   * @param {string} props.url 关联的文件地址
   * @param {Object} props.urls 关联的多个文件地址
   */
  constructor(name: string = '', props: Props) {

    super();

    this.name = name;

    this.type = props.type;
    this.handlerType = props.handlerType;

    // 该资源的配置
    this.config = props.config || {};

    // 该资源关联的数据对象
    this.data = props.data;

    // 该资源相关联的资源池对象
    this.assets = [];

    this.assetType = props.assetType || AssetType.Cache;

    // 是否已加载
    this.loaded = false;

    // 加载状态
    this.loading = false;

    // {
    //   name: '',
    //   url: '',
    //   size: 0,
    //   hash: '',
    // }
    this._file = {
      url: props.url,
      urls: props.urls,
    };

  }

  /**
   * 资源加载成功
   * @param callback 回调
   */
  ready(callback: (this: Resource, res: Resource) => any) {

    if (this.assets) {

      callback.call(this, this);

    } else {

      this.once('loaded', function (resource) {

        callback.call(this, resource);

      });

    }

  }

  /**
   * 获取文件地址
   * @returns url 文件地址
   */
  get fileUrl(): string | Array<string> | void {

    return this._file.url || this._file.urls;

  }

  /**
   * 获取资源对象
   * @returns asset 资源对象
   */
  get asset(): Prop | void {

    // return default asset
    if (this.assets && this.assets[0]) {

      return this.assets[0];

    }

  }

  /**
   * 设置资源对象
   * @param asset 资源对象
   */
  set asset(asset: Prop | void) {
    if (!asset) {
      this.assets[0] = undefined;
    } else {
      this.assets[0] = asset;
    }

  }

}

