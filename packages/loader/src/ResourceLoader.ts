import { Event, EventDispatcher } from "@alipay/o3-base";
import { Resource } from "./Resource";
import * as defaultRequest from "@alipay/o3-request";
import { Engine, ResType, Handler, Prop, Request, ResCb, ResArrayCb } from "./type";

const noop = function() {};

const handlers: { [key: string]: Handler } = {};

/** 资源加载器类
 * @extends EventDispatcher
 */
export class ResourceLoader extends EventDispatcher {
  public handlers: { [key: string]: Handler };
  public engine: Engine;
  public request: Request;
  private _urls: Prop;
  private _names: Prop;
  private _resources: { [key: string]: Array<Resource> };

  /**
   * @constructor
   * @param {Engine} engine 引擎实例
   * @param request 自定义请求库 默认使用 o3-request
   */
  constructor(engine: Engine, request: Request) {
    super();

    this.handlers = handlers;
    // url cache
    this._urls = {};
    // name cache
    this._names = {};
    // 资源对象
    this._resources = {};

    this.engine = engine;
    // attach default handlers

    this.request = request || defaultRequest;
  }

  /**
   * 实例化前注册资源处理器
   * @param handlerName 处理资源类型
   * @param handler 资源处理器
   */
  static registerHandler(handlerName: ResType, handler: Handler) {
    handlers[handlerName] = handler;
  }

  /**
   * 实例化后注册资源处理器
   * @param handlerName 处理资源类型
   * @param handler 资源处理器
   */
  registerHandler(handlerName: ResType, handler: Handler) {
    this.handlers[handlerName] = handler;
  }

  /**
   * 添加资源
   * @param { Resource } resource 资源对象
   */
  add(resource: Resource) {
    if (!this._resources[resource.type]) {
      this._resources[resource.type] = [];
    }

    this._resources[resource.type].push(resource);

    this.trigger(new Event("added", this, resource));
  }

  /**
   * 添加资源
   * @param { resType } type
   * @param { string } name
   */
  findResource(type: ResType, name: string): Resource | void {
    if (this._resources[type]) {
      return this._resources[type].find(r => {
        return r.name === name;
      });
    }

    return null;
  }

  /**
   * 批量加载资源
   * @param resources 资源列表
   * @param callback 加载完成回调
   */
  batchLoad(resources: Array<Resource>, callback: ResArrayCb = noop) {
    // create load promise
    const promises = [];
    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i];
      const promise = new Promise((resolve, reject) => {
        this.load(resource, (err, res) => {
          if (!err) {
            resolve(res);
          } else {
            reject(err);
          }
        });
      });
      promises.push(promise);
    }

    Promise.all(promises).then(
      res => {
        callback(null, resources);
      },
      err => {
        callback(err);
      }
    );
  }

  /**
   * 加载单个资源
   * @param resource 资源
   * @param callback 加载完成回调
   */
  load(resource: Resource, callback: ResCb = noop) {
    const self = this;

    if (resource.loaded) {
      return;
    }

    // start loading resource
    resource.loading = true;

    const handler = this.handlers[resource.type];
    if (resource.type === "texture") {
      resource.config.handlerType = resource.handlerType || "image";
    }

    if (!handler) {
      callback("No Handler for resource type: " + resource.type);
      return;
    } else {
      // 已有数据，无需请求
      if (resource.data) {
        this._onLoadSuccess(resource, handler, callback);

        resource.trigger(new Event("loaded", resource));
      } else {
        const url = resource.fileUrl;
        const config = resource.config;

        handler.load(this.request, { url, ...config }, function(err, data) {
          if (!err) {
            resource.data = data;
            self._onLoadSuccess(resource, handler, callback);
          } else {
            callback(err);
          }
        });
      }
    }
    // TODO: cache resource
  }

  /**
   * 处理加载回调
   * @param resource
   * @param handler
   * @param callback
   * @private
   */
  private _onLoadSuccess(resource: Resource, handler: Handler, callback: ResCb) {
    resource.loading = false;
    resource.loaded = true;

    // create assets
    if (handler.patch) {
      handler.patch(resource, this._resources);
    }

    handler.open(resource);

    // TODO: manage assets pool
    this.add(resource);

    callback(null, resource);
    resource.trigger(new Event("loaded", resource));
  }
}
