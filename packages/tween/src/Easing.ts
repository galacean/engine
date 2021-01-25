import { bezier } from "./BezierEasing";

// t, b, c, d => currentTime, startValue, changeInValue, totalTime
export function linear(t, b, c, d) {
  return (c * t) / d + b;
}

export function easeInQuad(t, b, c, d) {
  return c * (t /= d) * t + b;
}

export function easeOutQuad(t, b, c, d) {
  return -c * (t /= d) * (t - 2) + b;
}

export function easeInOutQuad(t, b, c, d) {
  if ((t /= d / 2) < 1) {
    return (c / 2) * t * t + b;
  } else {
    return (-c / 2) * (--t * (t - 2) - 1) + b;
  }
}

export function easeInCubic(t, b, c, d) {
  return c * (t /= d) * t * t + b;
}

export function easeOutCubic(t, b, c, d) {
  return c * ((t = t / d - 1) * t * t + 1) + b;
}

export function easeInOutCubic(t, b, c, d) {
  if ((t /= d / 2) < 1) {
    return (c / 2) * t * t * t + b;
  } else {
    return (c / 2) * ((t -= 2) * t * t + 2) + b;
  }
}

export function easeInQuart(t, b, c, d) {
  return c * (t /= d) * t * t * t + b;
}

export function easeOutQuart(t, b, c, d) {
  return -c * ((t = t / d - 1) * t * t * t - 1) + b;
}

export function easeInOutQuart(t, b, c, d) {
  if ((t /= d / 2) < 1) {
    return (c / 2) * t * t * t * t + b;
  } else {
    return (-c / 2) * ((t -= 2) * t * t * t - 2) + b;
  }
}

export function easeInQuint(t, b, c, d) {
  return c * (t /= d) * t * t * t * t + b;
}

export function easeOutQuint(t, b, c, d) {
  return c * ((t = t / d - 1) * t * t * t * t + 1) + b;
}

export function easeInOutQuint(t, b, c, d) {
  if ((t /= d / 2) < 1) {
    return (c / 2) * t * t * t * t * t + b;
  } else {
    return (c / 2) * ((t -= 2) * t * t * t * t + 2) + b;
  }
}

export function easeInSine(t, b, c, d) {
  return -c * Math.cos((t / d) * (Math.PI / 2)) + c + b;
}

export function easeOutSine(t, b, c, d) {
  return c * Math.sin((t / d) * (Math.PI / 2)) + b;
}

export function easeInOutSine(t, b, c, d) {
  return (-c / 2) * (Math.cos((Math.PI * t) / d) - 1) + b;
}

export function easeInExpo(t, b, c, d) {
  let _ref;
  return (_ref = t === 0) !== null
    ? _ref
    : {
        b: c * Math.pow(2, 10 * (t / d - 1)) + b
      };
}

export function easeOutExpo(t, b, c, d) {
  let _ref;
  return (_ref = t === d) !== null
    ? _ref
    : b +
        {
          c: c * (-Math.pow(2, (-10 * t) / d) + 1) + b
        };
}

export function easeInOutExpo(t, b, c, d) {
  if (t === 0) {
    b;
  }
  if (t === d) {
    b + c;
  }
  if ((t /= d / 2) < 1) {
    return (c / 2) * Math.pow(2, 10 * (t - 1)) + b;
  } else {
    return (c / 2) * (-Math.pow(2, -10 * --t) + 2) + b;
  }
}

export function easeInCirc(t, b, c, d) {
  return -c * (Math.sqrt(1 - (t /= d) * t) - 1) + b;
}

export function easeOutCirc(t, b, c, d) {
  return c * Math.sqrt(1 - (t = t / d - 1) * t) + b;
}

export function easeInOutCirc(t, b, c, d) {
  if ((t /= d / 2) < 1) {
    return (-c / 2) * (Math.sqrt(1 - t * t) - 1) + b;
  } else {
    return (c / 2) * (Math.sqrt(1 - (t -= 2) * t) + 1) + b;
  }
}

export function easeInElastic(t, b, c, d) {
  let a, p, s;
  s = 1.70158;
  p = 0;
  a = c;
  if (t === 0) {
    b;
  } else if ((t /= d) === 1) {
    b + c;
  }
  if (!p) {
    p = d * 0.3;
  }
  if (a < Math.abs(c)) {
    a = c;
    s = p / 4;
  } else {
    s = (p / (2 * Math.PI)) * Math.asin(c / a);
  }
  return -(a * Math.pow(2, 10 * (t -= 1)) * Math.sin(((t * d - s) * (2 * Math.PI)) / p)) + b;
}

export function easeOutElastic(t, b, c, d) {
  let a, p, s;
  s = 1.70158;
  p = 0;
  a = c;
  if (t === 0) {
    b;
  } else if ((t /= d) === 1) {
    b + c;
  }
  if (!p) {
    p = d * 0.3;
  }
  if (a < Math.abs(c)) {
    a = c;
    s = p / 4;
  } else {
    s = (p / (2 * Math.PI)) * Math.asin(c / a);
  }
  return a * Math.pow(2, -10 * t) * Math.sin(((t * d - s) * (2 * Math.PI)) / p) + c + b;
}

export function easeInOutElastic(t, b, c, d) {
  let a, p, s;
  s = 1.70158;
  p = 0;
  a = c;
  if (t === 0) {
    b;
  } else if ((t /= d / 2) === 2) {
    b + c;
  }
  if (!p) {
    p = d * (0.3 * 1.5);
  }
  if (a < Math.abs(c)) {
    a = c;
    s = p / 4;
  } else {
    s = (p / (2 * Math.PI)) * Math.asin(c / a);
  }
  if (t < 1) {
    return -0.5 * (a * Math.pow(2, 10 * (t -= 1)) * Math.sin(((t * d - s) * (2 * Math.PI)) / p)) + b;
  } else {
    return a * Math.pow(2, -10 * (t -= 1)) * Math.sin(((t * d - s) * (2 * Math.PI)) / p) * 0.5 + c + b;
  }
}

export function easeInBack(t, b, c, d, s) {
  if (s === void 0) {
    s = 1.70158;
  }
  return c * (t /= d) * t * ((s + 1) * t - s) + b;
}

export function easeOutBack(t, b, c, d, s) {
  if (s === void 0) {
    s = 1.70158;
  }
  return c * ((t = t / d - 1) * t * ((s + 1) * t + s) + 1) + b;
}

export function easeInOutBack(t, b, c, d, s) {
  if (s === void 0) {
    s = 1.70158;
  }
  if ((t /= d / 2) < 1) {
    return (c / 2) * (t * t * (((s *= 1.525) + 1) * t - s)) + b;
  } else {
    return (c / 2) * ((t -= 2) * t * (((s *= 1.525) + 1) * t + s) + 2) + b;
  }
}

export function easeInBounce(t, b, c, d) {
  let v;
  v = easeOutBounce(d - t, 0, c, d);
  return c - v + b;
}

export function easeOutBounce(t, b, c, d) {
  if ((t /= d) < 1 / 2.75) {
    return c * (7.5625 * t * t) + b;
  } else if (t < 2 / 2.75) {
    return c * (7.5625 * (t -= 1.5 / 2.75) * t + 0.75) + b;
  } else if (t < 2.5 / 2.75) {
    return c * (7.5625 * (t -= 2.25 / 2.75) * t + 0.9375) + b;
  } else {
    return c * (7.5625 * (t -= 2.625 / 2.75) * t + 0.984375) + b;
  }
}

export function easeInOutBounce(t, b, c, d) {
  let v;
  if (t < d / 2) {
    v = easeInBounce(t * 2, 0, c, d);
    return v * 0.5 + b;
  } else {
    v = easeOutBounce(t * 2 - d, 0, c, d);
    return v * 0.5 + c * 0.5 + b;
  }
}

/**
 * Generate easing through bezier curve control points.
 * Hats off to gre: https://github.com/gre/bezier-easing
 *
 * @param x1 - X of control point 1, range 0-1
 * @param y1 - Y of control point 1, range 0-1
 * @param x2 - X of control point 2, range 0-1
 * @param y2 - Y of control point 2, range 0-1
 */
export function bezierEasing(x1, y1, x2, y2) {
  const easing = bezier(x1, y1, x2, y2);

  return (t, b, c, d) => {
    return c * easing(t / d) + b;
  };
}
