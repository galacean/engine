"use strict";

import { NodeAbility } from "@alipay/o3-core";
import { vec3 } from "@alipay/o3-math";
import { ALineRenderer } from "./ALineRenderer";
import { APointRenderer } from "./APointRenderer";

export class ALineShape extends NodeAbility {
  public _canvas: any;
  public _samplingNumber: any;
  public _brightness: any;
  public _offset: any;
  public _time: any;
  public _ballRenderer: any;
  public _lineRenderer: any;
  public _balls: any;

  constructor(node, props) {
    super(node);

    this._canvas = props.canvas;
    this._samplingNumber = props.samplingNumber || 1000;
    this._brightness = props.brightness || 100;
    this._offset = props.offset || [-2.5, -1.5, 0];

    this._time = 0;

    this._ballRenderer = this.node.createAbility(APointRenderer, { material: props.ballMaterial });

    this._lineRenderer = this.node.createAbility(ALineRenderer, { material: props.lineMaterial });

    this._balls = [];
  }

  update(deltaTime) {
    if (this._balls.length === 0) {
      this._balls = this.createBalls(this._canvas, this._samplingNumber, this._brightness, this._offset);
    }

    this._time += deltaTime / 1000;
    this._balls.forEach(ball => {
      if (ball) {
        this._ballRenderer.drawPoint(ball.move(this._time));
        this._lineRenderer.drawLines(ball.lineBetween(this._balls));
      }
    });
  }

  /**
   * 通过对canvas采样获取需要显示的点的分布
   */
  createBalls(canvas, num, brightness, offset) {
    let w = canvas.width;
    let h = canvas.height;

    let context = canvas.getContext("2d");
    let imageData = context.getImageData(0, 0, w, h);

    let balls = [];
    let isValid = true;
    let cycle = 0;
    while (balls.length < num && isValid) {
      let x = Math.floor(Math.random() * w);
      let y = Math.floor(Math.random() * h);

      // 取得透明度信息
      let idx = ((h - y) * w + x) * 4 + 2;
      let b = imageData.data[idx];
      if (b >= brightness) {
        let org = vec3.fromValues(x / 100.0, y / 100.0, 0);
        vec3.add(org, org, offset);

        // console.log(validPoint);
        let radius = (5 + Math.random() * 5) / 100.0;
        let loc = vec3.fromValues(org[0] + radius, org[1], 0);
        let off = Math.random() * Math.PI * 2;
        let dir = Math.random() > 0.5 ? 1 : -1;
        let ball = new Ball(org, loc, radius, dir, off);
        balls.push(ball);
      }

      cycle++;
      if (cycle > 200 && balls.length === 0) {
        isValid = false;
      }
    }

    return balls;
  }
}

class Ball {
  public org: any;
  public pos: any;
  public radius: any;
  public dir: any;
  public offset: any;
  public d: any;

  constructor(org, pos, radius, dir, offset) {
    this.org = org;
    this.pos = pos;
    this.radius = radius;
    this.dir = dir;
    this.offset = offset;

    this.d = 0.2;
  }

  move(theta) {
    this.pos[0] = this.org[0] + Math.sin(theta * this.dir + this.offset) * this.radius;
    this.pos[1] = this.org[1] + Math.cos(theta * this.dir + this.offset) * this.radius;
    return this.pos;
  }

  lineBetween(balls) {
    let linePoints = [];
    for (let i = balls.length - 1; i >= 0; i--) {
      let dist = vec3.distance(this.pos, balls[i].pos);
      if (dist > 0 && dist < this.d) {
        linePoints.push(this.pos);
        linePoints.push(balls[i].pos);
      }
      if (linePoints.length >= 8) {
        break;
      }
    }

    return linePoints;
  }
}
