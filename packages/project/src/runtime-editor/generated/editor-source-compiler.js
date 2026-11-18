// Generated from galacean/editor b1b59de685d4df29a51c3df7eaf3d45a6bc74c1f with the Runtime Editor virtual-path codec. Rebuild with world/scripts/build-runtime-source-compiler.mjs.
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/rng-browser.js
var require_rng_browser = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/rng-browser.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = rng;
    var getRandomValues;
    var rnds8 = new Uint8Array(16);
    function rng() {
      if (!getRandomValues) {
        getRandomValues = typeof crypto !== "undefined" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto) || typeof msCrypto !== "undefined" && typeof msCrypto.getRandomValues === "function" && msCrypto.getRandomValues.bind(msCrypto);
        if (!getRandomValues) {
          throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
        }
      }
      return getRandomValues(rnds8);
    }
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/regex.js
var require_regex = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/regex.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _default = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
    exports.default = _default;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/validate.js
var require_validate = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/validate.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _regex = _interopRequireDefault(require_regex());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function validate(uuid3) {
      return typeof uuid3 === "string" && _regex.default.test(uuid3);
    }
    var _default = validate;
    exports.default = _default;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/stringify.js
var require_stringify = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/stringify.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _validate = _interopRequireDefault(require_validate());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    var byteToHex = [];
    for (let i = 0; i < 256; ++i) {
      byteToHex.push((i + 256).toString(16).substr(1));
    }
    function stringify(arr, offset = 0) {
      const uuid3 = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
      if (!(0, _validate.default)(uuid3)) {
        throw TypeError("Stringified UUID is invalid");
      }
      return uuid3;
    }
    var _default = stringify;
    exports.default = _default;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/v1.js
var require_v1 = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/v1.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _rng = _interopRequireDefault(require_rng_browser());
    var _stringify = _interopRequireDefault(require_stringify());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    var _nodeId;
    var _clockseq;
    var _lastMSecs = 0;
    var _lastNSecs = 0;
    function v1(options, buf, offset) {
      let i = buf && offset || 0;
      const b = buf || new Array(16);
      options = options || {};
      let node = options.node || _nodeId;
      let clockseq = options.clockseq !== void 0 ? options.clockseq : _clockseq;
      if (node == null || clockseq == null) {
        const seedBytes = options.random || (options.rng || _rng.default)();
        if (node == null) {
          node = _nodeId = [seedBytes[0] | 1, seedBytes[1], seedBytes[2], seedBytes[3], seedBytes[4], seedBytes[5]];
        }
        if (clockseq == null) {
          clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 16383;
        }
      }
      let msecs = options.msecs !== void 0 ? options.msecs : Date.now();
      let nsecs = options.nsecs !== void 0 ? options.nsecs : _lastNSecs + 1;
      const dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 1e4;
      if (dt < 0 && options.clockseq === void 0) {
        clockseq = clockseq + 1 & 16383;
      }
      if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === void 0) {
        nsecs = 0;
      }
      if (nsecs >= 1e4) {
        throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
      }
      _lastMSecs = msecs;
      _lastNSecs = nsecs;
      _clockseq = clockseq;
      msecs += 122192928e5;
      const tl = ((msecs & 268435455) * 1e4 + nsecs) % 4294967296;
      b[i++] = tl >>> 24 & 255;
      b[i++] = tl >>> 16 & 255;
      b[i++] = tl >>> 8 & 255;
      b[i++] = tl & 255;
      const tmh = msecs / 4294967296 * 1e4 & 268435455;
      b[i++] = tmh >>> 8 & 255;
      b[i++] = tmh & 255;
      b[i++] = tmh >>> 24 & 15 | 16;
      b[i++] = tmh >>> 16 & 255;
      b[i++] = clockseq >>> 8 | 128;
      b[i++] = clockseq & 255;
      for (let n = 0; n < 6; ++n) {
        b[i + n] = node[n];
      }
      return buf || (0, _stringify.default)(b);
    }
    var _default = v1;
    exports.default = _default;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/parse.js
var require_parse = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/parse.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _validate = _interopRequireDefault(require_validate());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function parse(uuid3) {
      if (!(0, _validate.default)(uuid3)) {
        throw TypeError("Invalid UUID");
      }
      let v;
      const arr = new Uint8Array(16);
      arr[0] = (v = parseInt(uuid3.slice(0, 8), 16)) >>> 24;
      arr[1] = v >>> 16 & 255;
      arr[2] = v >>> 8 & 255;
      arr[3] = v & 255;
      arr[4] = (v = parseInt(uuid3.slice(9, 13), 16)) >>> 8;
      arr[5] = v & 255;
      arr[6] = (v = parseInt(uuid3.slice(14, 18), 16)) >>> 8;
      arr[7] = v & 255;
      arr[8] = (v = parseInt(uuid3.slice(19, 23), 16)) >>> 8;
      arr[9] = v & 255;
      arr[10] = (v = parseInt(uuid3.slice(24, 36), 16)) / 1099511627776 & 255;
      arr[11] = v / 4294967296 & 255;
      arr[12] = v >>> 24 & 255;
      arr[13] = v >>> 16 & 255;
      arr[14] = v >>> 8 & 255;
      arr[15] = v & 255;
      return arr;
    }
    var _default = parse;
    exports.default = _default;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/v35.js
var require_v35 = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/v35.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = _default;
    exports.URL = exports.DNS = void 0;
    var _stringify = _interopRequireDefault(require_stringify());
    var _parse = _interopRequireDefault(require_parse());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function stringToBytes(str) {
      str = unescape(encodeURIComponent(str));
      const bytes = [];
      for (let i = 0; i < str.length; ++i) {
        bytes.push(str.charCodeAt(i));
      }
      return bytes;
    }
    var DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    exports.DNS = DNS;
    var URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
    exports.URL = URL;
    function _default(name, version, hashfunc) {
      function generateUUID(value, namespace, buf, offset) {
        if (typeof value === "string") {
          value = stringToBytes(value);
        }
        if (typeof namespace === "string") {
          namespace = (0, _parse.default)(namespace);
        }
        if (namespace.length !== 16) {
          throw TypeError("Namespace must be array-like (16 iterable integer values, 0-255)");
        }
        let bytes = new Uint8Array(16 + value.length);
        bytes.set(namespace);
        bytes.set(value, namespace.length);
        bytes = hashfunc(bytes);
        bytes[6] = bytes[6] & 15 | version;
        bytes[8] = bytes[8] & 63 | 128;
        if (buf) {
          offset = offset || 0;
          for (let i = 0; i < 16; ++i) {
            buf[offset + i] = bytes[i];
          }
          return buf;
        }
        return (0, _stringify.default)(bytes);
      }
      try {
        generateUUID.name = name;
      } catch (err) {
      }
      generateUUID.DNS = DNS;
      generateUUID.URL = URL;
      return generateUUID;
    }
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/md5-browser.js
var require_md5_browser = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/md5-browser.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    function md5(bytes) {
      if (typeof bytes === "string") {
        const msg = unescape(encodeURIComponent(bytes));
        bytes = new Uint8Array(msg.length);
        for (let i = 0; i < msg.length; ++i) {
          bytes[i] = msg.charCodeAt(i);
        }
      }
      return md5ToHexEncodedArray(wordsToMd5(bytesToWords(bytes), bytes.length * 8));
    }
    function md5ToHexEncodedArray(input) {
      const output = [];
      const length32 = input.length * 32;
      const hexTab = "0123456789abcdef";
      for (let i = 0; i < length32; i += 8) {
        const x = input[i >> 5] >>> i % 32 & 255;
        const hex = parseInt(hexTab.charAt(x >>> 4 & 15) + hexTab.charAt(x & 15), 16);
        output.push(hex);
      }
      return output;
    }
    function getOutputLength(inputLength8) {
      return (inputLength8 + 64 >>> 9 << 4) + 14 + 1;
    }
    function wordsToMd5(x, len) {
      x[len >> 5] |= 128 << len % 32;
      x[getOutputLength(len) - 1] = len;
      let a = 1732584193;
      let b = -271733879;
      let c = -1732584194;
      let d = 271733878;
      for (let i = 0; i < x.length; i += 16) {
        const olda = a;
        const oldb = b;
        const oldc = c;
        const oldd = d;
        a = md5ff(a, b, c, d, x[i], 7, -680876936);
        d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
        c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
        b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
        a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
        d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
        c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
        b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
        a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
        d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
        c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
        b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
        a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
        d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
        c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
        b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
        a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
        d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
        c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
        b = md5gg(b, c, d, a, x[i], 20, -373897302);
        a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
        d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
        c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
        b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
        a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
        d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
        c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
        b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
        a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
        d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
        c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
        b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
        a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
        d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
        c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
        b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
        a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
        d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
        c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
        b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
        a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
        d = md5hh(d, a, b, c, x[i], 11, -358537222);
        c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
        b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
        a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
        d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
        c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
        b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
        a = md5ii(a, b, c, d, x[i], 6, -198630844);
        d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
        c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
        b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
        a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
        d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
        c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
        b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
        a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
        d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
        c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
        b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
        a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
        d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
        c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
        b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
        a = safeAdd(a, olda);
        b = safeAdd(b, oldb);
        c = safeAdd(c, oldc);
        d = safeAdd(d, oldd);
      }
      return [a, b, c, d];
    }
    function bytesToWords(input) {
      if (input.length === 0) {
        return [];
      }
      const length8 = input.length * 8;
      const output = new Uint32Array(getOutputLength(length8));
      for (let i = 0; i < length8; i += 8) {
        output[i >> 5] |= (input[i / 8] & 255) << i % 32;
      }
      return output;
    }
    function safeAdd(x, y) {
      const lsw = (x & 65535) + (y & 65535);
      const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
      return msw << 16 | lsw & 65535;
    }
    function bitRotateLeft(num, cnt) {
      return num << cnt | num >>> 32 - cnt;
    }
    function md5cmn(q, a, b, x, s, t) {
      return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
    }
    function md5ff(a, b, c, d, x, s, t) {
      return md5cmn(b & c | ~b & d, a, b, x, s, t);
    }
    function md5gg(a, b, c, d, x, s, t) {
      return md5cmn(b & d | c & ~d, a, b, x, s, t);
    }
    function md5hh(a, b, c, d, x, s, t) {
      return md5cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function md5ii(a, b, c, d, x, s, t) {
      return md5cmn(c ^ (b | ~d), a, b, x, s, t);
    }
    var _default = md5;
    exports.default = _default;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/v3.js
var require_v3 = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/v3.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _v = _interopRequireDefault(require_v35());
    var _md = _interopRequireDefault(require_md5_browser());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    var v3 = (0, _v.default)("v3", 48, _md.default);
    var _default = v3;
    exports.default = _default;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/v4.js
var require_v4 = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/v4.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _rng = _interopRequireDefault(require_rng_browser());
    var _stringify = _interopRequireDefault(require_stringify());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function v4(options, buf, offset) {
      options = options || {};
      const rnds = options.random || (options.rng || _rng.default)();
      rnds[6] = rnds[6] & 15 | 64;
      rnds[8] = rnds[8] & 63 | 128;
      if (buf) {
        offset = offset || 0;
        for (let i = 0; i < 16; ++i) {
          buf[offset + i] = rnds[i];
        }
        return buf;
      }
      return (0, _stringify.default)(rnds);
    }
    var _default = v4;
    exports.default = _default;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/sha1-browser.js
var require_sha1_browser = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/sha1-browser.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    function f(s, x, y, z) {
      switch (s) {
        case 0:
          return x & y ^ ~x & z;
        case 1:
          return x ^ y ^ z;
        case 2:
          return x & y ^ x & z ^ y & z;
        case 3:
          return x ^ y ^ z;
      }
    }
    function ROTL(x, n) {
      return x << n | x >>> 32 - n;
    }
    function sha1(bytes) {
      const K = [1518500249, 1859775393, 2400959708, 3395469782];
      const H = [1732584193, 4023233417, 2562383102, 271733878, 3285377520];
      if (typeof bytes === "string") {
        const msg = unescape(encodeURIComponent(bytes));
        bytes = [];
        for (let i = 0; i < msg.length; ++i) {
          bytes.push(msg.charCodeAt(i));
        }
      } else if (!Array.isArray(bytes)) {
        bytes = Array.prototype.slice.call(bytes);
      }
      bytes.push(128);
      const l = bytes.length / 4 + 2;
      const N = Math.ceil(l / 16);
      const M = new Array(N);
      for (let i = 0; i < N; ++i) {
        const arr = new Uint32Array(16);
        for (let j = 0; j < 16; ++j) {
          arr[j] = bytes[i * 64 + j * 4] << 24 | bytes[i * 64 + j * 4 + 1] << 16 | bytes[i * 64 + j * 4 + 2] << 8 | bytes[i * 64 + j * 4 + 3];
        }
        M[i] = arr;
      }
      M[N - 1][14] = (bytes.length - 1) * 8 / Math.pow(2, 32);
      M[N - 1][14] = Math.floor(M[N - 1][14]);
      M[N - 1][15] = (bytes.length - 1) * 8 & 4294967295;
      for (let i = 0; i < N; ++i) {
        const W = new Uint32Array(80);
        for (let t = 0; t < 16; ++t) {
          W[t] = M[i][t];
        }
        for (let t = 16; t < 80; ++t) {
          W[t] = ROTL(W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16], 1);
        }
        let a = H[0];
        let b = H[1];
        let c = H[2];
        let d = H[3];
        let e = H[4];
        for (let t = 0; t < 80; ++t) {
          const s = Math.floor(t / 20);
          const T = ROTL(a, 5) + f(s, b, c, d) + e + K[s] + W[t] >>> 0;
          e = d;
          d = c;
          c = ROTL(b, 30) >>> 0;
          b = a;
          a = T;
        }
        H[0] = H[0] + a >>> 0;
        H[1] = H[1] + b >>> 0;
        H[2] = H[2] + c >>> 0;
        H[3] = H[3] + d >>> 0;
        H[4] = H[4] + e >>> 0;
      }
      return [H[0] >> 24 & 255, H[0] >> 16 & 255, H[0] >> 8 & 255, H[0] & 255, H[1] >> 24 & 255, H[1] >> 16 & 255, H[1] >> 8 & 255, H[1] & 255, H[2] >> 24 & 255, H[2] >> 16 & 255, H[2] >> 8 & 255, H[2] & 255, H[3] >> 24 & 255, H[3] >> 16 & 255, H[3] >> 8 & 255, H[3] & 255, H[4] >> 24 & 255, H[4] >> 16 & 255, H[4] >> 8 & 255, H[4] & 255];
    }
    var _default = sha1;
    exports.default = _default;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/v5.js
var require_v5 = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/v5.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _v = _interopRequireDefault(require_v35());
    var _sha = _interopRequireDefault(require_sha1_browser());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    var v5 = (0, _v.default)("v5", 80, _sha.default);
    var _default = v5;
    exports.default = _default;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/nil.js
var require_nil = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/nil.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _default = "00000000-0000-0000-0000-000000000000";
    exports.default = _default;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/version.js
var require_version = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/version.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _validate = _interopRequireDefault(require_validate());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function version(uuid3) {
      if (!(0, _validate.default)(uuid3)) {
        throw TypeError("Invalid UUID");
      }
      return parseInt(uuid3.substr(14, 1), 16);
    }
    var _default = version;
    exports.default = _default;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/index.js
var require_dist = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/uuid/dist/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    Object.defineProperty(exports, "v1", {
      enumerable: true,
      get: function() {
        return _v.default;
      }
    });
    Object.defineProperty(exports, "v3", {
      enumerable: true,
      get: function() {
        return _v2.default;
      }
    });
    Object.defineProperty(exports, "v4", {
      enumerable: true,
      get: function() {
        return _v3.default;
      }
    });
    Object.defineProperty(exports, "v5", {
      enumerable: true,
      get: function() {
        return _v4.default;
      }
    });
    Object.defineProperty(exports, "NIL", {
      enumerable: true,
      get: function() {
        return _nil.default;
      }
    });
    Object.defineProperty(exports, "version", {
      enumerable: true,
      get: function() {
        return _version.default;
      }
    });
    Object.defineProperty(exports, "validate", {
      enumerable: true,
      get: function() {
        return _validate.default;
      }
    });
    Object.defineProperty(exports, "stringify", {
      enumerable: true,
      get: function() {
        return _stringify.default;
      }
    });
    Object.defineProperty(exports, "parse", {
      enumerable: true,
      get: function() {
        return _parse.default;
      }
    });
    var _v = _interopRequireDefault(require_v1());
    var _v2 = _interopRequireDefault(require_v3());
    var _v3 = _interopRequireDefault(require_v4());
    var _v4 = _interopRequireDefault(require_v5());
    var _nil = _interopRequireDefault(require_nil());
    var _version = _interopRequireDefault(require_version());
    var _validate = _interopRequireDefault(require_validate());
    var _stringify = _interopRequireDefault(require_stringify());
    var _parse = _interopRequireDefault(require_parse());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/randomInt-CF7bZK.js
var require_randomInt_CF7bZK = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/randomInt-CF7bZK.js"(exports) {
    "use strict";
    function random(minimum, maximum) {
      if (maximum == null) {
        maximum = minimum;
        minimum = 0;
      }
      if (minimum >= maximum) {
        throw new Error("Invalid input: The maximum value must be greater than the minimum value.");
      }
      return Math.random() * (maximum - minimum) + minimum;
    }
    function randomInt(minimum, maximum) {
      return Math.floor(random(minimum, maximum));
    }
    exports.random = random;
    exports.randomInt = randomInt;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/zipWith-Bdyzuy.js
var require_zipWith_Bdyzuy = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/zipWith-Bdyzuy.js"(exports) {
    "use strict";
    var randomInt = require_randomInt_CF7bZK();
    function at(arr, indices) {
      const result = new Array(indices.length);
      const length = arr.length;
      for (let i = 0; i < indices.length; i++) {
        let index = indices[i];
        index = Number.isInteger(index) ? index : Math.trunc(index) || 0;
        if (index < 0) {
          index += length;
        }
        result[i] = arr[index];
      }
      return result;
    }
    function chunk(arr, size) {
      if (!Number.isInteger(size) || size <= 0) {
        throw new Error("Size must be an integer greater than zero.");
      }
      const chunkLength = Math.ceil(arr.length / size);
      const result = Array(chunkLength);
      for (let index = 0; index < chunkLength; index++) {
        const start = index * size;
        const end = start + size;
        result[index] = arr.slice(start, end);
      }
      return result;
    }
    function compact(arr) {
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (item) {
          result.push(item);
        }
      }
      return result;
    }
    function countBy(arr, mapper) {
      const result = {};
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        const key = mapper(item);
        result[key] = (result[key] ?? 0) + 1;
      }
      return result;
    }
    function difference(firstArr, secondArr) {
      const secondSet = new Set(secondArr);
      return firstArr.filter((item) => !secondSet.has(item));
    }
    function differenceBy(firstArr, secondArr, mapper) {
      const mappedSecondSet = new Set(secondArr.map((item) => mapper(item)));
      return firstArr.filter((item) => {
        return !mappedSecondSet.has(mapper(item));
      });
    }
    function differenceWith(firstArr, secondArr, areItemsEqual) {
      return firstArr.filter((firstItem) => {
        return secondArr.every((secondItem) => {
          return !areItemsEqual(firstItem, secondItem);
        });
      });
    }
    function drop(arr, itemsCount) {
      itemsCount = Math.max(itemsCount, 0);
      return arr.slice(itemsCount);
    }
    function dropRight(arr, itemsCount) {
      itemsCount = Math.min(-itemsCount, 0);
      if (itemsCount === 0) {
        return arr.slice();
      }
      return arr.slice(0, itemsCount);
    }
    function dropRightWhile(arr, canContinueDropping) {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (!canContinueDropping(arr[i], i, arr)) {
          return arr.slice(0, i + 1);
        }
      }
      return [];
    }
    function dropWhile(arr, canContinueDropping) {
      const dropEndIndex = arr.findIndex((item, index, arr2) => !canContinueDropping(item, index, arr2));
      if (dropEndIndex === -1) {
        return [];
      }
      return arr.slice(dropEndIndex);
    }
    function fill(array, value, start = 0, end = array.length) {
      const length = array.length;
      const finalStart = Math.max(start >= 0 ? start : length + start, 0);
      const finalEnd = Math.min(end >= 0 ? end : length + end, length);
      for (let i = finalStart; i < finalEnd; i++) {
        array[i] = value;
      }
      return array;
    }
    function flatten(arr, depth = 1) {
      const result = [];
      const flooredDepth = Math.floor(depth);
      const recursive = (arr2, currentDepth) => {
        for (let i = 0; i < arr2.length; i++) {
          const item = arr2[i];
          if (Array.isArray(item) && currentDepth < flooredDepth) {
            recursive(item, currentDepth + 1);
          } else {
            result.push(item);
          }
        }
      };
      recursive(arr, 0);
      return result;
    }
    function flatMap(arr, iteratee, depth = 1) {
      return flatten(arr.map((item) => iteratee(item)), depth);
    }
    function flattenDeep(arr) {
      return flatten(arr, Infinity);
    }
    function flatMapDeep(arr, iteratee) {
      return flattenDeep(arr.map((item) => iteratee(item)));
    }
    function forEachRight(arr, callback) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const element = arr[i];
        callback(element, i, arr);
      }
    }
    function groupBy(arr, getKeyFromItem) {
      const result = {};
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        const key = getKeyFromItem(item);
        if (!Object.hasOwn(result, key)) {
          result[key] = [];
        }
        result[key].push(item);
      }
      return result;
    }
    function head(arr) {
      return arr[0];
    }
    function initial(arr) {
      return arr.slice(0, -1);
    }
    function intersection(firstArr, secondArr) {
      const secondSet = new Set(secondArr);
      return firstArr.filter((item) => {
        return secondSet.has(item);
      });
    }
    function intersectionBy(firstArr, secondArr, mapper) {
      const mappedSecondSet = new Set(secondArr.map(mapper));
      return firstArr.filter((item) => mappedSecondSet.has(mapper(item)));
    }
    function intersectionWith(firstArr, secondArr, areItemsEqual) {
      return firstArr.filter((firstItem) => {
        return secondArr.some((secondItem) => {
          return areItemsEqual(firstItem, secondItem);
        });
      });
    }
    function isSubset(superset, subset) {
      return difference(subset, superset).length === 0;
    }
    function isSubsetWith(superset, subset, areItemsEqual) {
      return differenceWith(subset, superset, areItemsEqual).length === 0;
    }
    function keyBy(arr, getKeyFromItem) {
      const result = {};
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        const key = getKeyFromItem(item);
        result[key] = item;
      }
      return result;
    }
    function last(arr) {
      return arr[arr.length - 1];
    }
    function maxBy(items, getValue) {
      let maxElement = items[0];
      let max = -Infinity;
      for (let i = 0; i < items.length; i++) {
        const element = items[i];
        const value = getValue(element);
        if (value > max) {
          max = value;
          maxElement = element;
        }
      }
      return maxElement;
    }
    function minBy(items, getValue) {
      let minElement = items[0];
      let min = Infinity;
      for (let i = 0; i < items.length; i++) {
        const element = items[i];
        const value = getValue(element);
        if (value < min) {
          min = value;
          minElement = element;
        }
      }
      return minElement;
    }
    function partition(arr, isInTruthy) {
      const truthy = [];
      const falsy = [];
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (isInTruthy(item)) {
          truthy.push(item);
        } else {
          falsy.push(item);
        }
      }
      return [truthy, falsy];
    }
    function pull(arr, valuesToRemove) {
      const valuesSet = new Set(valuesToRemove);
      let resultIndex = 0;
      for (let i = 0; i < arr.length; i++) {
        if (valuesSet.has(arr[i])) {
          continue;
        }
        if (!Object.hasOwn(arr, i)) {
          delete arr[resultIndex++];
          continue;
        }
        arr[resultIndex++] = arr[i];
      }
      arr.length = resultIndex;
      return arr;
    }
    function pullAt(arr, indicesToRemove) {
      const removed = at(arr, indicesToRemove);
      const indices = new Set(indicesToRemove.slice().sort((x, y) => y - x));
      for (const index of indices) {
        arr.splice(index, 1);
      }
      return removed;
    }
    function remove(arr, shouldRemoveElement) {
      const originalArr = arr.slice();
      const removed = [];
      let resultIndex = 0;
      for (let i = 0; i < arr.length; i++) {
        if (shouldRemoveElement(arr[i], i, originalArr)) {
          removed.push(arr[i]);
          continue;
        }
        if (!Object.hasOwn(arr, i)) {
          delete arr[resultIndex++];
          continue;
        }
        arr[resultIndex++] = arr[i];
      }
      arr.length = resultIndex;
      return removed;
    }
    function sample(arr) {
      const randomIndex = Math.floor(Math.random() * arr.length);
      return arr[randomIndex];
    }
    function sampleSize(array, size) {
      if (size > array.length) {
        throw new Error("Size must be less than or equal to the length of array.");
      }
      const result = new Array(size);
      const selected = /* @__PURE__ */ new Set();
      for (let step = array.length - size, resultIndex = 0; step < array.length; step++, resultIndex++) {
        let index = randomInt.randomInt(0, step + 1);
        if (selected.has(index)) {
          index = step;
        }
        selected.add(index);
        result[resultIndex] = array[index];
      }
      return result;
    }
    function shuffle(arr) {
      const result = arr.slice();
      for (let i = result.length - 1; i >= 1; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    }
    function tail(arr) {
      return arr.slice(1);
    }
    function take(arr, count) {
      return arr.slice(0, count);
    }
    function takeRight(arr, count = 1) {
      if (count <= 0) {
        return [];
      }
      return arr.slice(-count);
    }
    function takeWhile(arr, shouldContinueTaking) {
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (!shouldContinueTaking(item)) {
          break;
        }
        result.push(item);
      }
      return result;
    }
    function toFilled(arr, value, start = 0, end = arr.length) {
      const length = arr.length;
      const finalStart = Math.max(start >= 0 ? start : length + start, 0);
      const finalEnd = Math.min(end >= 0 ? end : length + end, length);
      const newArr = arr.slice();
      for (let i = finalStart; i < finalEnd; i++) {
        newArr[i] = value;
      }
      return newArr;
    }
    function uniq(arr) {
      return Array.from(new Set(arr));
    }
    function union(arr1, arr2) {
      return uniq(arr1.concat(arr2));
    }
    function uniqBy(arr, mapper) {
      const map = /* @__PURE__ */ new Map();
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        const key = mapper(item);
        if (!map.has(key)) {
          map.set(key, item);
        }
      }
      return Array.from(map.values());
    }
    function unionBy(arr1, arr2, mapper) {
      return uniqBy(arr1.concat(arr2), mapper);
    }
    function uniqWith(arr, areItemsEqual) {
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        const isUniq = result.every((v) => !areItemsEqual(v, item));
        if (isUniq) {
          result.push(item);
        }
      }
      return result;
    }
    function unionWith(arr1, arr2, areItemsEqual) {
      return uniqWith(arr1.concat(arr2), areItemsEqual);
    }
    function unzip(zipped) {
      let maxLen = 0;
      for (let i = 0; i < zipped.length; i++) {
        if (zipped[i].length > maxLen) {
          maxLen = zipped[i].length;
        }
      }
      const result = new Array(maxLen);
      for (let i = 0; i < maxLen; i++) {
        result[i] = new Array(zipped.length);
        for (let j = 0; j < zipped.length; j++) {
          result[i][j] = zipped[j][i];
        }
      }
      return result;
    }
    function unzipWith(target, iteratee) {
      const maxLength = Math.max(...target.map((innerArray) => innerArray.length));
      const result = new Array(maxLength);
      for (let i = 0; i < maxLength; i++) {
        const group = new Array(target.length);
        for (let j = 0; j < target.length; j++) {
          group[j] = target[j][i];
        }
        result[i] = iteratee(...group);
      }
      return result;
    }
    function windowed(arr, size, step = 1, { partialWindows = false } = {}) {
      if (size <= 0 || !Number.isInteger(size)) {
        throw new Error("Size must be a positive integer.");
      }
      if (step <= 0 || !Number.isInteger(step)) {
        throw new Error("Step must be a positive integer.");
      }
      const result = [];
      const end = partialWindows ? arr.length : arr.length - size + 1;
      for (let i = 0; i < end; i += step) {
        result.push(arr.slice(i, i + size));
      }
      return result;
    }
    function without(array, ...values) {
      return difference(array, values);
    }
    function xor(arr1, arr2) {
      return difference(union(arr1, arr2), intersection(arr1, arr2));
    }
    function xorBy(arr1, arr2, mapper) {
      const union2 = unionBy(arr1, arr2, mapper);
      const intersection2 = intersectionBy(arr1, arr2, mapper);
      return differenceBy(union2, intersection2, mapper);
    }
    function xorWith(arr1, arr2, areElementsEqual) {
      const union2 = unionWith(arr1, arr2, areElementsEqual);
      const intersection2 = intersectionWith(arr1, arr2, areElementsEqual);
      return differenceWith(union2, intersection2, areElementsEqual);
    }
    function zip(...arrs) {
      let rowCount = 0;
      for (let i = 0; i < arrs.length; i++) {
        if (arrs[i].length > rowCount) {
          rowCount = arrs[i].length;
        }
      }
      const columnCount = arrs.length;
      const result = Array(rowCount);
      for (let i = 0; i < rowCount; ++i) {
        const row = Array(columnCount);
        for (let j = 0; j < columnCount; ++j) {
          row[j] = arrs[j][i];
        }
        result[i] = row;
      }
      return result;
    }
    function zipObject(keys, values) {
      const result = {};
      for (let i = 0; i < keys.length; i++) {
        result[keys[i]] = values[i];
      }
      return result;
    }
    function zipWith(arr1, ...rest) {
      const arrs = [arr1, ...rest.slice(0, -1)];
      const combine = rest[rest.length - 1];
      const maxIndex = Math.max(...arrs.map((arr) => arr.length));
      const result = Array(maxIndex);
      for (let i = 0; i < maxIndex; i++) {
        const elements = arrs.map((arr) => arr[i]);
        result[i] = combine(...elements);
      }
      return result;
    }
    exports.at = at;
    exports.chunk = chunk;
    exports.compact = compact;
    exports.countBy = countBy;
    exports.difference = difference;
    exports.differenceBy = differenceBy;
    exports.differenceWith = differenceWith;
    exports.drop = drop;
    exports.dropRight = dropRight;
    exports.dropRightWhile = dropRightWhile;
    exports.dropWhile = dropWhile;
    exports.fill = fill;
    exports.flatMap = flatMap;
    exports.flatMapDeep = flatMapDeep;
    exports.flatten = flatten;
    exports.flattenDeep = flattenDeep;
    exports.forEachRight = forEachRight;
    exports.groupBy = groupBy;
    exports.head = head;
    exports.initial = initial;
    exports.intersection = intersection;
    exports.intersectionBy = intersectionBy;
    exports.intersectionWith = intersectionWith;
    exports.isSubset = isSubset;
    exports.isSubsetWith = isSubsetWith;
    exports.keyBy = keyBy;
    exports.last = last;
    exports.maxBy = maxBy;
    exports.minBy = minBy;
    exports.partition = partition;
    exports.pull = pull;
    exports.pullAt = pullAt;
    exports.remove = remove;
    exports.sample = sample;
    exports.sampleSize = sampleSize;
    exports.shuffle = shuffle;
    exports.tail = tail;
    exports.take = take;
    exports.takeRight = takeRight;
    exports.takeWhile = takeWhile;
    exports.toFilled = toFilled;
    exports.union = union;
    exports.unionBy = unionBy;
    exports.unionWith = unionWith;
    exports.uniq = uniq;
    exports.uniqBy = uniqBy;
    exports.uniqWith = uniqWith;
    exports.unzip = unzip;
    exports.unzipWith = unzipWith;
    exports.windowed = windowed;
    exports.without = without;
    exports.xor = xor;
    exports.xorBy = xorBy;
    exports.xorWith = xorWith;
    exports.zip = zip;
    exports.zipObject = zipObject;
    exports.zipWith = zipWith;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/array/index.js
var require_array = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/array/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var zipWith = require_zipWith_Bdyzuy();
    function compareValues(a, b, order) {
      if (a < b) {
        return order === "asc" ? -1 : 1;
      }
      if (a > b) {
        return order === "asc" ? 1 : -1;
      }
      return 0;
    }
    function orderBy(arr, criteria, orders) {
      return arr.slice().sort((a, b) => {
        const ordersLength = orders.length;
        for (let i = 0; i < criteria.length; i++) {
          const order = ordersLength > i ? orders[i] : orders[ordersLength - 1];
          const criterion = criteria[i];
          const criterionIsFunction = typeof criterion === "function";
          const valueA = criterionIsFunction ? criterion(a) : a[criterion];
          const valueB = criterionIsFunction ? criterion(b) : b[criterion];
          const result = compareValues(valueA, valueB, order);
          if (result !== 0) {
            return result;
          }
        }
        return 0;
      });
    }
    function sortBy(arr, criteria) {
      return orderBy(arr, criteria, ["asc"]);
    }
    function takeRightWhile(arr, shouldContinueTaking) {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (!shouldContinueTaking(arr[i])) {
          return arr.slice(i + 1);
        }
      }
      return arr.slice();
    }
    exports.at = zipWith.at;
    exports.chunk = zipWith.chunk;
    exports.compact = zipWith.compact;
    exports.countBy = zipWith.countBy;
    exports.difference = zipWith.difference;
    exports.differenceBy = zipWith.differenceBy;
    exports.differenceWith = zipWith.differenceWith;
    exports.drop = zipWith.drop;
    exports.dropRight = zipWith.dropRight;
    exports.dropRightWhile = zipWith.dropRightWhile;
    exports.dropWhile = zipWith.dropWhile;
    exports.fill = zipWith.fill;
    exports.flatMap = zipWith.flatMap;
    exports.flatMapDeep = zipWith.flatMapDeep;
    exports.flatten = zipWith.flatten;
    exports.flattenDeep = zipWith.flattenDeep;
    exports.forEachRight = zipWith.forEachRight;
    exports.groupBy = zipWith.groupBy;
    exports.head = zipWith.head;
    exports.initial = zipWith.initial;
    exports.intersection = zipWith.intersection;
    exports.intersectionBy = zipWith.intersectionBy;
    exports.intersectionWith = zipWith.intersectionWith;
    exports.isSubset = zipWith.isSubset;
    exports.isSubsetWith = zipWith.isSubsetWith;
    exports.keyBy = zipWith.keyBy;
    exports.last = zipWith.last;
    exports.maxBy = zipWith.maxBy;
    exports.minBy = zipWith.minBy;
    exports.partition = zipWith.partition;
    exports.pull = zipWith.pull;
    exports.pullAt = zipWith.pullAt;
    exports.remove = zipWith.remove;
    exports.sample = zipWith.sample;
    exports.sampleSize = zipWith.sampleSize;
    exports.shuffle = zipWith.shuffle;
    exports.tail = zipWith.tail;
    exports.take = zipWith.take;
    exports.takeRight = zipWith.takeRight;
    exports.takeWhile = zipWith.takeWhile;
    exports.toFilled = zipWith.toFilled;
    exports.union = zipWith.union;
    exports.unionBy = zipWith.unionBy;
    exports.unionWith = zipWith.unionWith;
    exports.uniq = zipWith.uniq;
    exports.uniqBy = zipWith.uniqBy;
    exports.uniqWith = zipWith.uniqWith;
    exports.unzip = zipWith.unzip;
    exports.unzipWith = zipWith.unzipWith;
    exports.windowed = zipWith.windowed;
    exports.without = zipWith.without;
    exports.xor = zipWith.xor;
    exports.xorBy = zipWith.xorBy;
    exports.xorWith = zipWith.xorWith;
    exports.zip = zipWith.zip;
    exports.zipObject = zipWith.zipObject;
    exports.zipWith = zipWith.zipWith;
    exports.orderBy = orderBy;
    exports.sortBy = sortBy;
    exports.takeRightWhile = takeRightWhile;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/index-BGZDR9.js
var require_index_BGZDR9 = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/index-BGZDR9.js"(exports) {
    "use strict";
    var AbortError = class extends Error {
      constructor(message = "The operation was aborted") {
        super(message);
        this.name = "AbortError";
      }
    };
    var TimeoutError = class extends Error {
      constructor(message = "The operation was timed out") {
        super(message);
        this.name = "TimeoutError";
      }
    };
    function delay(ms, { signal } = {}) {
      return new Promise((resolve, reject) => {
        const abortError = () => {
          reject(new AbortError());
        };
        const abortHandler = () => {
          clearTimeout(timeoutId);
          abortError();
        };
        if (signal?.aborted) {
          return abortError();
        }
        const timeoutId = setTimeout(() => {
          signal?.removeEventListener("abort", abortHandler);
          resolve();
        }, ms);
        signal?.addEventListener("abort", abortHandler, { once: true });
      });
    }
    async function timeout(ms) {
      await delay(ms);
      throw new TimeoutError();
    }
    async function withTimeout(run, ms) {
      return Promise.race([run(), timeout(ms)]);
    }
    exports.AbortError = AbortError;
    exports.TimeoutError = TimeoutError;
    exports.delay = delay;
    exports.timeout = timeout;
    exports.withTimeout = withTimeout;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/unary-B6qG7C.js
var require_unary_B6qG7C = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/unary-B6qG7C.js"(exports) {
    "use strict";
    function after(n, func) {
      if (!Number.isInteger(n) || n < 0) {
        throw new Error(`n must be a non-negative integer.`);
      }
      let counter = 0;
      return (...args) => {
        if (++counter >= n) {
          return func(...args);
        }
        return void 0;
      };
    }
    function ary(func, n) {
      return function(...args) {
        return func.apply(this, args.slice(0, n));
      };
    }
    async function asyncNoop() {
    }
    function debounce(func, debounceMs, { signal, edges } = {}) {
      let pendingThis = void 0;
      let pendingArgs = null;
      const leading = edges != null && edges.includes("leading");
      const trailing = edges == null || edges.includes("trailing");
      const invoke = () => {
        if (pendingArgs !== null) {
          func.apply(pendingThis, pendingArgs);
          pendingThis = void 0;
          pendingArgs = null;
        }
      };
      const onTimerEnd = () => {
        if (trailing) {
          invoke();
        }
        cancel();
      };
      let timeoutId = null;
      const schedule = () => {
        if (timeoutId != null) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
          timeoutId = null;
          onTimerEnd();
        }, debounceMs);
      };
      const cancelTimer = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };
      const cancel = () => {
        cancelTimer();
        pendingThis = void 0;
        pendingArgs = null;
      };
      const flush = () => {
        cancelTimer();
        invoke();
      };
      const debounced = function(...args) {
        if (signal?.aborted) {
          return;
        }
        pendingThis = this;
        pendingArgs = args;
        const isFirstCall = timeoutId == null;
        schedule();
        if (leading && isFirstCall) {
          invoke();
        }
      };
      debounced.schedule = schedule;
      debounced.cancel = cancel;
      debounced.flush = flush;
      signal?.addEventListener("abort", cancel, { once: true });
      return debounced;
    }
    function flow(...funcs) {
      return function(...args) {
        let result = funcs.length ? funcs[0].apply(this, args) : args[0];
        for (let i = 1; i < funcs.length; i++) {
          result = funcs[i].call(this, result);
        }
        return result;
      };
    }
    function flowRight(...funcs) {
      return flow(...funcs.reverse());
    }
    function identity(x) {
      return x;
    }
    function memoize(fn, options = {}) {
      const { cache = /* @__PURE__ */ new Map(), getCacheKey } = options;
      const memoizedFn = function(arg) {
        const key = getCacheKey ? getCacheKey(arg) : arg;
        if (cache.has(key)) {
          return cache.get(key);
        }
        const result = fn.call(this, arg);
        cache.set(key, result);
        return result;
      };
      memoizedFn.cache = cache;
      return memoizedFn;
    }
    function negate(func) {
      return (...args) => !func(...args);
    }
    function once(func) {
      let called = false;
      let cache;
      return function(...args) {
        if (!called) {
          called = true;
          cache = func(...args);
        }
        return cache;
      };
    }
    function partial(func, ...partialArgs) {
      return function(...providedArgs) {
        const args = [];
        let startIndex = 0;
        for (let i = 0; i < partialArgs.length; i++) {
          const arg = partialArgs[i];
          if (arg === partial.placeholder) {
            args.push(providedArgs[startIndex++]);
          } else {
            args.push(arg);
          }
        }
        for (let i = startIndex; i < providedArgs.length; i++) {
          args.push(providedArgs[i]);
        }
        return func.apply(this, args);
      };
    }
    var partialPlaceholder = Symbol("partial.placeholder");
    partial.placeholder = partialPlaceholder;
    function partialRight(func, ...partialArgs) {
      return function(...providedArgs) {
        const placeholderLength = partialArgs.filter((arg) => arg === partialRightPlaceholder).length;
        const rangeLength = Math.max(providedArgs.length - placeholderLength, 0);
        const args = [];
        let providedIndex = 0;
        for (let i = 0; i < rangeLength; i++) {
          args.push(providedArgs[providedIndex++]);
        }
        for (let i = 0; i < partialArgs.length; i++) {
          const arg = partialArgs[i];
          if (arg === partialRight.placeholder) {
            args.push(providedArgs[providedIndex++]);
          } else {
            args.push(arg);
          }
        }
        return func.apply(this, args);
      };
    }
    var partialRightPlaceholder = Symbol("partialRight.placeholder");
    partialRight.placeholder = partialRightPlaceholder;
    function rest(func, startIndex = func.length - 1) {
      return function(...args) {
        const rest2 = args.slice(startIndex);
        const params = args.slice(0, startIndex);
        while (params.length < startIndex) {
          params.push(void 0);
        }
        return func.apply(this, [...params, rest2]);
      };
    }
    function unary(func) {
      return ary(func, 1);
    }
    exports.after = after;
    exports.ary = ary;
    exports.asyncNoop = asyncNoop;
    exports.debounce = debounce;
    exports.flow = flow;
    exports.flowRight = flowRight;
    exports.identity = identity;
    exports.memoize = memoize;
    exports.negate = negate;
    exports.once = once;
    exports.partial = partial;
    exports.partialRight = partialRight;
    exports.rest = rest;
    exports.unary = unary;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/noop-2IwLUk.js
var require_noop_2IwLUk = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/noop-2IwLUk.js"(exports) {
    "use strict";
    function noop() {
    }
    exports.noop = noop;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/function/index.js
var require_function = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/function/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var unary = require_unary_B6qG7C();
    var noop = require_noop_2IwLUk();
    function before(n, func) {
      if (!Number.isInteger(n) || n < 0) {
        throw new Error("n must be a non-negative integer.");
      }
      let counter = 0;
      return (...args) => {
        if (++counter < n) {
          return func(...args);
        }
        return void 0;
      };
    }
    function curry(func) {
      if (func.length === 0 || func.length === 1) {
        return func;
      }
      return function(arg) {
        return makeCurry(func, func.length, [arg]);
      };
    }
    function makeCurry(origin, argsLength, args) {
      if (args.length === argsLength) {
        return origin(...args);
      } else {
        const next = function(arg) {
          return makeCurry(origin, argsLength, [...args, arg]);
        };
        return next;
      }
    }
    function curryRight(func) {
      if (func.length === 0 || func.length === 1) {
        return func;
      }
      return function(arg) {
        return makeCurryRight(func, func.length, [arg]);
      };
    }
    function makeCurryRight(origin, argsLength, args) {
      if (args.length === argsLength) {
        return origin(...args);
      } else {
        const next = function(arg) {
          return makeCurryRight(origin, argsLength, [arg, ...args]);
        };
        return next;
      }
    }
    function spread(func) {
      return function(argsArr) {
        return func.apply(this, argsArr);
      };
    }
    function throttle(func, throttleMs, { signal, edges = ["leading", "trailing"] } = {}) {
      let pendingAt = null;
      const debounced = unary.debounce(func, throttleMs, { signal, edges });
      const throttled = function(...args) {
        if (pendingAt == null) {
          pendingAt = Date.now();
        } else {
          if (Date.now() - pendingAt >= throttleMs) {
            pendingAt = Date.now();
            debounced.cancel();
            debounced(...args);
          }
        }
        debounced(...args);
      };
      throttled.cancel = debounced.cancel;
      throttled.flush = debounced.flush;
      return throttled;
    }
    exports.after = unary.after;
    exports.ary = unary.ary;
    exports.asyncNoop = unary.asyncNoop;
    exports.debounce = unary.debounce;
    exports.flow = unary.flow;
    exports.flowRight = unary.flowRight;
    exports.identity = unary.identity;
    exports.memoize = unary.memoize;
    exports.negate = unary.negate;
    exports.once = unary.once;
    exports.partial = unary.partial;
    exports.partialRight = unary.partialRight;
    exports.rest = unary.rest;
    exports.unary = unary.unary;
    exports.noop = noop.noop;
    exports.before = before;
    exports.curry = curry;
    exports.curryRight = curryRight;
    exports.spread = spread;
    exports.throttle = throttle;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/range-HnEIT7.js
var require_range_HnEIT7 = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/range-HnEIT7.js"(exports) {
    "use strict";
    function clamp(value, bound1, bound2) {
      if (bound2 == null) {
        return Math.min(value, bound1);
      }
      return Math.min(Math.max(value, bound1), bound2);
    }
    function inRange(value, minimum, maximum) {
      if (maximum == null) {
        maximum = minimum;
        minimum = 0;
      }
      if (minimum >= maximum) {
        throw new Error("The maximum value must be greater than the minimum value.");
      }
      return minimum <= value && value < maximum;
    }
    function sum(nums) {
      let result = 0;
      for (let i = 0; i < nums.length; i++) {
        result += nums[i];
      }
      return result;
    }
    function mean(nums) {
      return sum(nums) / nums.length;
    }
    function meanBy(items, getValue) {
      const nums = items.map((x) => getValue(x));
      return mean(nums);
    }
    function median(nums) {
      if (nums.length === 0) {
        return NaN;
      }
      const sorted = nums.slice().sort((a, b) => a - b);
      const middleIndex = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        return (sorted[middleIndex - 1] + sorted[middleIndex]) / 2;
      } else {
        return sorted[middleIndex];
      }
    }
    function medianBy(items, getValue) {
      const nums = items.map((x) => getValue(x));
      return median(nums);
    }
    function range(start, end, step = 1) {
      if (end == null) {
        end = start;
        start = 0;
      }
      if (!Number.isInteger(step) || step === 0) {
        throw new Error(`The step value must be a non-zero integer.`);
      }
      const length = Math.max(Math.ceil((end - start) / step), 0);
      const result = new Array(length);
      for (let i = 0; i < length; i++) {
        result[i] = start + i * step;
      }
      return result;
    }
    exports.clamp = clamp;
    exports.inRange = inRange;
    exports.mean = mean;
    exports.meanBy = meanBy;
    exports.median = median;
    exports.medianBy = medianBy;
    exports.range = range;
    exports.sum = sum;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/math/index.js
var require_math = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/math/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var range = require_range_HnEIT7();
    var randomInt = require_randomInt_CF7bZK();
    function rangeRight(start, end, step = 1) {
      if (end == null) {
        end = start;
        start = 0;
      }
      if (!Number.isInteger(step) || step === 0) {
        throw new Error(`The step value must be a non-zero integer.`);
      }
      const length = Math.max(Math.ceil((end - start) / step), 0);
      const result = new Array(length);
      for (let i = 0; i < length; i++) {
        result[i] = start + (length - i - 1) * step;
      }
      return result;
    }
    function round(value, precision = 0) {
      if (!Number.isInteger(precision)) {
        throw new Error("Precision must be an integer.");
      }
      const multiplier = Math.pow(10, precision);
      return Math.round(value * multiplier) / multiplier;
    }
    function sumBy(items, getValue) {
      let result = 0;
      for (let i = 0; i < items.length; i++) {
        result += getValue(items[i]);
      }
      return result;
    }
    exports.clamp = range.clamp;
    exports.inRange = range.inRange;
    exports.mean = range.mean;
    exports.meanBy = range.meanBy;
    exports.median = range.median;
    exports.medianBy = range.medianBy;
    exports.range = range.range;
    exports.sum = range.sum;
    exports.random = randomInt.random;
    exports.randomInt = randomInt.randomInt;
    exports.rangeRight = rangeRight;
    exports.round = round;
    exports.sumBy = sumBy;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/isPlainObject-octpoD.js
var require_isPlainObject_octpoD = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/isPlainObject-octpoD.js"(exports) {
    "use strict";
    function isPrimitive(value) {
      return value == null || typeof value !== "object" && typeof value !== "function";
    }
    function isTypedArray(x) {
      return ArrayBuffer.isView(x) && !(x instanceof DataView);
    }
    function getSymbols(object) {
      return Object.getOwnPropertySymbols(object).filter((symbol) => Object.prototype.propertyIsEnumerable.call(object, symbol));
    }
    function isPlainObject2(value) {
      if (!value || typeof value !== "object") {
        return false;
      }
      const proto = Object.getPrototypeOf(value);
      const hasObjectPrototype = proto === null || proto === Object.prototype || Object.getPrototypeOf(proto) === null;
      if (!hasObjectPrototype) {
        return false;
      }
      return Object.prototype.toString.call(value) === "[object Object]";
    }
    exports.getSymbols = getSymbols;
    exports.isPlainObject = isPlainObject2;
    exports.isPrimitive = isPrimitive;
    exports.isTypedArray = isTypedArray;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/toMerged-DGFrN7.js
var require_toMerged_DGFrN7 = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/toMerged-DGFrN7.js"(exports) {
    "use strict";
    var isPlainObject2 = require_isPlainObject_octpoD();
    function clone2(obj) {
      if (isPlainObject2.isPrimitive(obj)) {
        return obj;
      }
      if (Array.isArray(obj) || isPlainObject2.isTypedArray(obj) || obj instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && obj instanceof SharedArrayBuffer) {
        return obj.slice(0);
      }
      const prototype = Object.getPrototypeOf(obj);
      const Constructor = prototype.constructor;
      if (obj instanceof Date || obj instanceof Map || obj instanceof Set) {
        return new Constructor(obj);
      }
      if (obj instanceof RegExp) {
        const newRegExp = new Constructor(obj);
        newRegExp.lastIndex = obj.lastIndex;
        return newRegExp;
      }
      if (obj instanceof DataView) {
        return new Constructor(obj.buffer.slice(0));
      }
      if (obj instanceof Error) {
        const newError = new Constructor(obj.message);
        newError.stack = obj.stack;
        newError.name = obj.name;
        newError.cause = obj.cause;
        return newError;
      }
      if (typeof File !== "undefined" && obj instanceof File) {
        const newFile = new Constructor([obj], obj.name, { type: obj.type, lastModified: obj.lastModified });
        return newFile;
      }
      if (typeof obj === "object") {
        const newObject = Object.create(prototype);
        return Object.assign(newObject, obj);
      }
      return obj;
    }
    function cloneDeepWith(obj, cloneValue) {
      return cloneDeepWithImpl(obj, void 0, obj, /* @__PURE__ */ new Map(), cloneValue);
    }
    function cloneDeepWithImpl(valueToClone, keyToClone, objectToClone, stack = /* @__PURE__ */ new Map(), cloneValue = void 0) {
      const cloned = cloneValue?.(valueToClone, keyToClone, objectToClone, stack);
      if (cloned != null) {
        return cloned;
      }
      if (isPlainObject2.isPrimitive(valueToClone)) {
        return valueToClone;
      }
      if (stack.has(valueToClone)) {
        return stack.get(valueToClone);
      }
      if (Array.isArray(valueToClone)) {
        const result = new Array(valueToClone.length);
        stack.set(valueToClone, result);
        for (let i = 0; i < valueToClone.length; i++) {
          result[i] = cloneDeepWithImpl(valueToClone[i], i, objectToClone, stack, cloneValue);
        }
        if (Object.hasOwn(valueToClone, "index")) {
          result.index = valueToClone.index;
        }
        if (Object.hasOwn(valueToClone, "input")) {
          result.input = valueToClone.input;
        }
        return result;
      }
      if (valueToClone instanceof Date) {
        return new Date(valueToClone.getTime());
      }
      if (valueToClone instanceof RegExp) {
        const result = new RegExp(valueToClone.source, valueToClone.flags);
        result.lastIndex = valueToClone.lastIndex;
        return result;
      }
      if (valueToClone instanceof Map) {
        const result = /* @__PURE__ */ new Map();
        stack.set(valueToClone, result);
        for (const [key, value] of valueToClone) {
          result.set(key, cloneDeepWithImpl(value, key, objectToClone, stack, cloneValue));
        }
        return result;
      }
      if (valueToClone instanceof Set) {
        const result = /* @__PURE__ */ new Set();
        stack.set(valueToClone, result);
        for (const value of valueToClone) {
          result.add(cloneDeepWithImpl(value, void 0, objectToClone, stack, cloneValue));
        }
        return result;
      }
      if (typeof Buffer !== "undefined" && Buffer.isBuffer(valueToClone)) {
        return valueToClone.subarray();
      }
      if (isPlainObject2.isTypedArray(valueToClone)) {
        const result = new (Object.getPrototypeOf(valueToClone)).constructor(valueToClone.length);
        stack.set(valueToClone, result);
        for (let i = 0; i < valueToClone.length; i++) {
          result[i] = cloneDeepWithImpl(valueToClone[i], i, objectToClone, stack, cloneValue);
        }
        return result;
      }
      if (valueToClone instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && valueToClone instanceof SharedArrayBuffer) {
        return valueToClone.slice(0);
      }
      if (valueToClone instanceof DataView) {
        const result = new DataView(valueToClone.buffer.slice(0), valueToClone.byteOffset, valueToClone.byteLength);
        stack.set(valueToClone, result);
        copyProperties(result, valueToClone, objectToClone, stack, cloneValue);
        return result;
      }
      if (typeof File !== "undefined" && valueToClone instanceof File) {
        const result = new File([valueToClone], valueToClone.name, {
          type: valueToClone.type
        });
        stack.set(valueToClone, result);
        copyProperties(result, valueToClone, objectToClone, stack, cloneValue);
        return result;
      }
      if (valueToClone instanceof Blob) {
        const result = new Blob([valueToClone], { type: valueToClone.type });
        stack.set(valueToClone, result);
        copyProperties(result, valueToClone, objectToClone, stack, cloneValue);
        return result;
      }
      if (valueToClone instanceof Error) {
        const result = new valueToClone.constructor();
        stack.set(valueToClone, result);
        result.message = valueToClone.message;
        result.name = valueToClone.name;
        result.stack = valueToClone.stack;
        result.cause = valueToClone.cause;
        copyProperties(result, valueToClone, objectToClone, stack, cloneValue);
        return result;
      }
      if (typeof valueToClone === "object" && valueToClone !== null) {
        const result = Object.create(Object.getPrototypeOf(valueToClone));
        stack.set(valueToClone, result);
        copyProperties(result, valueToClone, objectToClone, stack, cloneValue);
        return result;
      }
      return valueToClone;
    }
    function copyProperties(target, source, objectToClone = target, stack, cloneValue) {
      const keys = [...Object.keys(source), ...isPlainObject2.getSymbols(source)];
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const descriptor = Object.getOwnPropertyDescriptor(target, key);
        if (descriptor == null || descriptor.writable) {
          target[key] = cloneDeepWithImpl(source[key], key, objectToClone, stack, cloneValue);
        }
      }
    }
    function cloneDeep(obj) {
      return cloneDeepWithImpl(obj, void 0, obj, /* @__PURE__ */ new Map(), void 0);
    }
    function findKey(obj, predicate) {
      const keys = Object.keys(obj);
      return keys.find((key) => predicate(obj[key], key, obj));
    }
    function flattenObject(object) {
      return flattenObjectImpl(object);
    }
    function flattenObjectImpl(object, prefix = "") {
      const result = {};
      const keys = Object.keys(object);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = object[key];
        const prefixedKey = prefix ? `${prefix}.${key}` : key;
        if (isPlainObject2.isPlainObject(value) && Object.keys(value).length > 0) {
          Object.assign(result, flattenObjectImpl(value, prefixedKey));
          continue;
        }
        if (Array.isArray(value)) {
          Object.assign(result, flattenObjectImpl(value, prefixedKey));
          continue;
        }
        result[prefixedKey] = value;
      }
      return result;
    }
    function invert(obj) {
      const result = {};
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = obj[key];
        result[value] = key;
      }
      return result;
    }
    function mapKeys(object, getNewKey) {
      const result = {};
      const keys = Object.keys(object);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = object[key];
        result[getNewKey(value, key, object)] = value;
      }
      return result;
    }
    function mapValues(object, getNewValue) {
      const result = {};
      const keys = Object.keys(object);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = object[key];
        result[key] = getNewValue(value, key, object);
      }
      return result;
    }
    function merge(target, source) {
      const sourceKeys = Object.keys(source);
      for (let i = 0; i < sourceKeys.length; i++) {
        const key = sourceKeys[i];
        const sourceValue = source[key];
        const targetValue = target[key];
        if (Array.isArray(sourceValue)) {
          if (Array.isArray(targetValue)) {
            target[key] = merge(targetValue, sourceValue);
          } else {
            target[key] = merge([], sourceValue);
          }
        } else if (isPlainObject2.isPlainObject(sourceValue)) {
          if (isPlainObject2.isPlainObject(targetValue)) {
            target[key] = merge(targetValue, sourceValue);
          } else {
            target[key] = merge({}, sourceValue);
          }
        } else if (targetValue === void 0 || sourceValue !== void 0) {
          target[key] = sourceValue;
        }
      }
      return target;
    }
    function isObjectLike(value) {
      return typeof value === "object" && value !== null;
    }
    function omitBy(obj, shouldOmit) {
      const result = {};
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = obj[key];
        if (!shouldOmit(value, key)) {
          result[key] = value;
        }
      }
      return result;
    }
    function pickBy(obj, shouldPick) {
      const result = {};
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = obj[key];
        if (shouldPick(value, key)) {
          result[key] = value;
        }
      }
      return result;
    }
    function toMerged(target, source) {
      return merge(cloneDeep(target), source);
    }
    exports.clone = clone2;
    exports.cloneDeep = cloneDeep;
    exports.cloneDeepWith = cloneDeepWith;
    exports.copyProperties = copyProperties;
    exports.findKey = findKey;
    exports.flattenObject = flattenObject;
    exports.invert = invert;
    exports.isObjectLike = isObjectLike;
    exports.mapKeys = mapKeys;
    exports.mapValues = mapValues;
    exports.merge = merge;
    exports.omitBy = omitBy;
    exports.pickBy = pickBy;
    exports.toMerged = toMerged;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/object/index.js
var require_object = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/object/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var toMerged = require_toMerged_DGFrN7();
    function mergeWith(target, source, merge) {
      const sourceKeys = Object.keys(source);
      for (let i = 0; i < sourceKeys.length; i++) {
        const key = sourceKeys[i];
        const sourceValue = source[key];
        const targetValue = target[key];
        const merged = merge(targetValue, sourceValue, key, target, source);
        if (merged != null) {
          target[key] = merged;
        } else if (Array.isArray(sourceValue)) {
          target[key] = mergeWith(targetValue ?? [], sourceValue, merge);
        } else if (toMerged.isObjectLike(targetValue) && toMerged.isObjectLike(sourceValue)) {
          target[key] = mergeWith(targetValue ?? {}, sourceValue, merge);
        } else if (targetValue === void 0 || sourceValue !== void 0) {
          target[key] = sourceValue;
        }
      }
      return target;
    }
    function omit(obj, keys) {
      const result = { ...obj };
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        delete result[key];
      }
      return result;
    }
    function pick(obj, keys) {
      const result = {};
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (Object.hasOwn(obj, key)) {
          result[key] = obj[key];
        }
      }
      return result;
    }
    exports.clone = toMerged.clone;
    exports.cloneDeep = toMerged.cloneDeep;
    exports.cloneDeepWith = toMerged.cloneDeepWith;
    exports.findKey = toMerged.findKey;
    exports.flattenObject = toMerged.flattenObject;
    exports.invert = toMerged.invert;
    exports.mapKeys = toMerged.mapKeys;
    exports.mapValues = toMerged.mapValues;
    exports.merge = toMerged.merge;
    exports.omitBy = toMerged.omitBy;
    exports.pickBy = toMerged.pickBy;
    exports.toMerged = toMerged.toMerged;
    exports.mergeWith = mergeWith;
    exports.omit = omit;
    exports.pick = pick;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/isWeakSet-CvIdTA.js
var require_isWeakSet_CvIdTA = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/isWeakSet-CvIdTA.js"(exports) {
    "use strict";
    var isPlainObject2 = require_isPlainObject_octpoD();
    var noop = require_noop_2IwLUk();
    function isArrayBuffer(value) {
      return value instanceof ArrayBuffer;
    }
    function isBlob(x) {
      if (typeof Blob === "undefined") {
        return false;
      }
      return x instanceof Blob;
    }
    function isBuffer(x) {
      return typeof Buffer !== "undefined" && Buffer.isBuffer(x);
    }
    function isDate(value) {
      return value instanceof Date;
    }
    function getTag(value) {
      if (value == null) {
        return value === void 0 ? "[object Undefined]" : "[object Null]";
      }
      return Object.prototype.toString.call(value);
    }
    var regexpTag = "[object RegExp]";
    var stringTag = "[object String]";
    var numberTag = "[object Number]";
    var booleanTag = "[object Boolean]";
    var argumentsTag = "[object Arguments]";
    var symbolTag = "[object Symbol]";
    var dateTag = "[object Date]";
    var mapTag = "[object Map]";
    var setTag = "[object Set]";
    var arrayTag = "[object Array]";
    var functionTag = "[object Function]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var objectTag = "[object Object]";
    var errorTag = "[object Error]";
    var dataViewTag = "[object DataView]";
    var uint8ArrayTag = "[object Uint8Array]";
    var uint8ClampedArrayTag = "[object Uint8ClampedArray]";
    var uint16ArrayTag = "[object Uint16Array]";
    var uint32ArrayTag = "[object Uint32Array]";
    var bigUint64ArrayTag = "[object BigUint64Array]";
    var int8ArrayTag = "[object Int8Array]";
    var int16ArrayTag = "[object Int16Array]";
    var int32ArrayTag = "[object Int32Array]";
    var bigInt64ArrayTag = "[object BigInt64Array]";
    var float32ArrayTag = "[object Float32Array]";
    var float64ArrayTag = "[object Float64Array]";
    function eq(value, other) {
      return value === other || Number.isNaN(value) && Number.isNaN(other);
    }
    function isEqualWith(a, b, areValuesEqual) {
      return isEqualWithImpl(a, b, void 0, void 0, void 0, void 0, areValuesEqual);
    }
    function isEqualWithImpl(a, b, property, aParent, bParent, stack, areValuesEqual) {
      const result = areValuesEqual(a, b, property, aParent, bParent, stack);
      if (result !== void 0) {
        return result;
      }
      if (typeof a === typeof b) {
        switch (typeof a) {
          case "bigint":
          case "string":
          case "boolean":
          case "symbol":
          case "undefined": {
            return a === b;
          }
          case "number": {
            return a === b || Object.is(a, b);
          }
          case "function": {
            return a === b;
          }
          case "object": {
            return areObjectsEqual(a, b, stack, areValuesEqual);
          }
        }
      }
      return areObjectsEqual(a, b, stack, areValuesEqual);
    }
    function areObjectsEqual(a, b, stack, areValuesEqual) {
      if (Object.is(a, b)) {
        return true;
      }
      let aTag = getTag(a);
      let bTag = getTag(b);
      if (aTag === argumentsTag) {
        aTag = objectTag;
      }
      if (bTag === argumentsTag) {
        bTag = objectTag;
      }
      if (aTag !== bTag) {
        return false;
      }
      switch (aTag) {
        case stringTag:
          return a.toString() === b.toString();
        case numberTag: {
          const x = a.valueOf();
          const y = b.valueOf();
          return eq(x, y);
        }
        case booleanTag:
        case dateTag:
        case symbolTag:
          return Object.is(a.valueOf(), b.valueOf());
        case regexpTag: {
          return a.source === b.source && a.flags === b.flags;
        }
        case functionTag: {
          return a === b;
        }
      }
      stack = stack ?? /* @__PURE__ */ new Map();
      const aStack = stack.get(a);
      const bStack = stack.get(b);
      if (aStack != null && bStack != null) {
        return aStack === b;
      }
      stack.set(a, b);
      stack.set(b, a);
      try {
        switch (aTag) {
          case mapTag: {
            if (a.size !== b.size) {
              return false;
            }
            for (const [key, value] of a.entries()) {
              if (!b.has(key) || !isEqualWithImpl(value, b.get(key), key, a, b, stack, areValuesEqual)) {
                return false;
              }
            }
            return true;
          }
          case setTag: {
            if (a.size !== b.size) {
              return false;
            }
            const aValues = Array.from(a.values());
            const bValues = Array.from(b.values());
            for (let i = 0; i < aValues.length; i++) {
              const aValue = aValues[i];
              const index = bValues.findIndex((bValue) => {
                return isEqualWithImpl(aValue, bValue, void 0, a, b, stack, areValuesEqual);
              });
              if (index === -1) {
                return false;
              }
              bValues.splice(index, 1);
            }
            return true;
          }
          case arrayTag:
          case uint8ArrayTag:
          case uint8ClampedArrayTag:
          case uint16ArrayTag:
          case uint32ArrayTag:
          case bigUint64ArrayTag:
          case int8ArrayTag:
          case int16ArrayTag:
          case int32ArrayTag:
          case bigInt64ArrayTag:
          case float32ArrayTag:
          case float64ArrayTag: {
            if (typeof Buffer !== "undefined" && Buffer.isBuffer(a) !== Buffer.isBuffer(b)) {
              return false;
            }
            if (a.length !== b.length) {
              return false;
            }
            for (let i = 0; i < a.length; i++) {
              if (!isEqualWithImpl(a[i], b[i], i, a, b, stack, areValuesEqual)) {
                return false;
              }
            }
            return true;
          }
          case arrayBufferTag: {
            if (a.byteLength !== b.byteLength) {
              return false;
            }
            return areObjectsEqual(new Uint8Array(a), new Uint8Array(b), stack, areValuesEqual);
          }
          case dataViewTag: {
            if (a.byteLength !== b.byteLength || a.byteOffset !== b.byteOffset) {
              return false;
            }
            return areObjectsEqual(new Uint8Array(a), new Uint8Array(b), stack, areValuesEqual);
          }
          case errorTag: {
            return a.name === b.name && a.message === b.message;
          }
          case objectTag: {
            const areEqualInstances = areObjectsEqual(a.constructor, b.constructor, stack, areValuesEqual) || isPlainObject2.isPlainObject(a) && isPlainObject2.isPlainObject(b);
            if (!areEqualInstances) {
              return false;
            }
            const aKeys = [...Object.keys(a), ...isPlainObject2.getSymbols(a)];
            const bKeys = [...Object.keys(b), ...isPlainObject2.getSymbols(b)];
            if (aKeys.length !== bKeys.length) {
              return false;
            }
            for (let i = 0; i < aKeys.length; i++) {
              const propKey = aKeys[i];
              const aProp = a[propKey];
              if (!Object.hasOwn(b, propKey)) {
                return false;
              }
              const bProp = b[propKey];
              if (!isEqualWithImpl(aProp, bProp, propKey, a, b, stack, areValuesEqual)) {
                return false;
              }
            }
            return true;
          }
          default: {
            return false;
          }
        }
      } finally {
        stack.delete(a);
        stack.delete(b);
      }
    }
    function isEqual5(a, b) {
      return isEqualWith(a, b, noop.noop);
    }
    function isFile(x) {
      if (typeof File === "undefined") {
        return false;
      }
      return isBlob(x) && x instanceof File;
    }
    function isFunction(value) {
      return typeof value === "function";
    }
    function isJSONValue(value) {
      switch (typeof value) {
        case "object": {
          return value === null || isJSONArray(value) || isJSONObject(value);
        }
        case "string":
        case "number":
        case "boolean": {
          return true;
        }
        default: {
          return false;
        }
      }
    }
    function isJSONArray(value) {
      if (!Array.isArray(value)) {
        return false;
      }
      return value.every((item) => isJSONValue(item));
    }
    function isJSONObject(obj) {
      if (!isPlainObject2.isPlainObject(obj)) {
        return false;
      }
      const keys = Reflect.ownKeys(obj);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = obj[key];
        if (typeof key !== "string") {
          return false;
        }
        if (!isJSONValue(value)) {
          return false;
        }
      }
      return true;
    }
    function isLength(value) {
      return Number.isSafeInteger(value) && value >= 0;
    }
    function isMap(value) {
      return value instanceof Map;
    }
    function isNil(x) {
      return x == null;
    }
    function isNotNil(x) {
      return x != null;
    }
    function isNull(x) {
      return x === null;
    }
    function isRegExp(value) {
      return value instanceof RegExp;
    }
    function isSet(value) {
      return value instanceof Set;
    }
    function isUndefined(x) {
      return x === void 0;
    }
    function isWeakMap(value) {
      return value instanceof WeakMap;
    }
    function isWeakSet(value) {
      return value instanceof WeakSet;
    }
    exports.argumentsTag = argumentsTag;
    exports.booleanTag = booleanTag;
    exports.eq = eq;
    exports.getTag = getTag;
    exports.isArrayBuffer = isArrayBuffer;
    exports.isBlob = isBlob;
    exports.isBuffer = isBuffer;
    exports.isDate = isDate;
    exports.isEqual = isEqual5;
    exports.isEqualWith = isEqualWith;
    exports.isFile = isFile;
    exports.isFunction = isFunction;
    exports.isJSONArray = isJSONArray;
    exports.isJSONObject = isJSONObject;
    exports.isJSONValue = isJSONValue;
    exports.isLength = isLength;
    exports.isMap = isMap;
    exports.isNil = isNil;
    exports.isNotNil = isNotNil;
    exports.isNull = isNull;
    exports.isRegExp = isRegExp;
    exports.isSet = isSet;
    exports.isUndefined = isUndefined;
    exports.isWeakMap = isWeakMap;
    exports.isWeakSet = isWeakSet;
    exports.numberTag = numberTag;
    exports.stringTag = stringTag;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/predicate/index.js
var require_predicate = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/predicate/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var isWeakSet = require_isWeakSet_CvIdTA();
    var isPlainObject2 = require_isPlainObject_octpoD();
    function isBoolean(x) {
      return typeof x === "boolean";
    }
    function isError(value) {
      return value instanceof Error;
    }
    function isString(value) {
      return typeof value === "string";
    }
    function isSymbol(value) {
      return typeof value === "symbol";
    }
    exports.isArrayBuffer = isWeakSet.isArrayBuffer;
    exports.isBlob = isWeakSet.isBlob;
    exports.isBuffer = isWeakSet.isBuffer;
    exports.isDate = isWeakSet.isDate;
    exports.isEqual = isWeakSet.isEqual;
    exports.isEqualWith = isWeakSet.isEqualWith;
    exports.isFile = isWeakSet.isFile;
    exports.isFunction = isWeakSet.isFunction;
    exports.isJSONArray = isWeakSet.isJSONArray;
    exports.isJSONObject = isWeakSet.isJSONObject;
    exports.isJSONValue = isWeakSet.isJSONValue;
    exports.isLength = isWeakSet.isLength;
    exports.isMap = isWeakSet.isMap;
    exports.isNil = isWeakSet.isNil;
    exports.isNotNil = isWeakSet.isNotNil;
    exports.isNull = isWeakSet.isNull;
    exports.isRegExp = isWeakSet.isRegExp;
    exports.isSet = isWeakSet.isSet;
    exports.isUndefined = isWeakSet.isUndefined;
    exports.isWeakMap = isWeakSet.isWeakMap;
    exports.isWeakSet = isWeakSet.isWeakSet;
    exports.isPlainObject = isPlainObject2.isPlainObject;
    exports.isPrimitive = isPlainObject2.isPrimitive;
    exports.isTypedArray = isPlainObject2.isTypedArray;
    exports.isBoolean = isBoolean;
    exports.isError = isError;
    exports.isString = isString;
    exports.isSymbol = isSymbol;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/upperFirst-CorAVn.js
var require_upperFirst_CorAVn = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/_chunk/upperFirst-CorAVn.js"(exports) {
    "use strict";
    function capitalize(str) {
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }
    var CASE_SPLIT_PATTERN = /\p{Lu}?\p{Ll}+|[0-9]+|\p{Lu}+(?!\p{Ll})|\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{L}+/gu;
    function words(str) {
      return Array.from(str.match(CASE_SPLIT_PATTERN) ?? []);
    }
    function camelCase(str) {
      const words$1 = words(str);
      if (words$1.length === 0) {
        return "";
      }
      const [first, ...rest] = words$1;
      return `${first.toLowerCase()}${rest.map((word) => capitalize(word)).join("")}`;
    }
    function constantCase(str) {
      const words$1 = words(str);
      return words$1.map((word) => word.toUpperCase()).join("_");
    }
    var deburrMap = new Map(Object.entries({
      \u00C6: "Ae",
      \u00D0: "D",
      \u00D8: "O",
      \u00DE: "Th",
      \u00DF: "ss",
      \u00E6: "ae",
      \u00F0: "d",
      \u00F8: "o",
      \u00FE: "th",
      \u0110: "D",
      \u0111: "d",
      \u0126: "H",
      \u0127: "h",
      \u0131: "i",
      \u0132: "IJ",
      \u0133: "ij",
      \u0138: "k",
      \u013F: "L",
      \u0140: "l",
      \u0141: "L",
      \u0142: "l",
      \u0149: "'n",
      \u014A: "N",
      \u014B: "n",
      \u0152: "Oe",
      \u0153: "oe",
      \u0166: "T",
      \u0167: "t",
      \u017F: "s"
    }));
    function deburr(str) {
      str = str.normalize("NFD");
      let result = "";
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char >= "\u0300" && char <= "\u036F" || char >= "\uFE20" && char <= "\uFE23") {
          continue;
        }
        result += deburrMap.get(char) ?? char;
      }
      return result;
    }
    var htmlEscapes = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    function escape(str) {
      return str.replace(/[&<>"']/g, (match) => htmlEscapes[match]);
    }
    function escapeRegExp(str) {
      return str.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
    function kebabCase(str) {
      const words$1 = words(str);
      return words$1.map((word) => word.toLowerCase()).join("-");
    }
    function lowerCase(str) {
      const words$1 = words(str);
      return words$1.map((word) => word.toLowerCase()).join(" ");
    }
    function lowerFirst(str) {
      return str.substring(0, 1).toLowerCase() + str.substring(1);
    }
    function pad(str, length, chars = " ") {
      return str.padStart(Math.floor((length - str.length) / 2) + str.length, chars).padEnd(length, chars);
    }
    function pascalCase(str) {
      const words$1 = words(str);
      return words$1.map((word) => capitalize(word)).join("");
    }
    function snakeCase(str) {
      const words$1 = words(str);
      return words$1.map((word) => word.toLowerCase()).join("_");
    }
    function trimEnd(str, chars) {
      if (chars === void 0) {
        return str.trimEnd();
      }
      let endIndex = str.length;
      switch (typeof chars) {
        case "string": {
          while (endIndex > 0 && str[endIndex - 1] === chars) {
            endIndex--;
          }
          break;
        }
        case "object": {
          while (endIndex > 0 && chars.includes(str[endIndex - 1])) {
            endIndex--;
          }
        }
      }
      return str.substring(0, endIndex);
    }
    function trimStart(str, chars) {
      if (chars === void 0) {
        return str.trimStart();
      }
      let startIndex = 0;
      switch (typeof chars) {
        case "string": {
          while (startIndex < str.length && str[startIndex] === chars) {
            startIndex++;
          }
          break;
        }
        case "object": {
          while (startIndex < str.length && chars.includes(str[startIndex])) {
            startIndex++;
          }
        }
      }
      return str.substring(startIndex);
    }
    function trim(str, chars) {
      if (chars === void 0) {
        return str.trim();
      }
      return trimStart(trimEnd(str, chars), chars);
    }
    var htmlUnescapes = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&#39;": "'"
    };
    function unescape2(str) {
      return str.replace(/&(?:amp|lt|gt|quot|#(0+)?39);/g, (match) => htmlUnescapes[match] || "'");
    }
    function upperCase(str) {
      const words$1 = words(str);
      let result = "";
      for (let i = 0; i < words$1.length; i++) {
        result += words$1[i].toUpperCase();
        if (i < words$1.length - 1) {
          result += " ";
        }
      }
      return result;
    }
    function upperFirst(str) {
      return str.substring(0, 1).toUpperCase() + str.substring(1);
    }
    exports.CASE_SPLIT_PATTERN = CASE_SPLIT_PATTERN;
    exports.camelCase = camelCase;
    exports.capitalize = capitalize;
    exports.constantCase = constantCase;
    exports.deburr = deburr;
    exports.escape = escape;
    exports.escapeRegExp = escapeRegExp;
    exports.kebabCase = kebabCase;
    exports.lowerCase = lowerCase;
    exports.lowerFirst = lowerFirst;
    exports.pad = pad;
    exports.pascalCase = pascalCase;
    exports.snakeCase = snakeCase;
    exports.trim = trim;
    exports.trimEnd = trimEnd;
    exports.trimStart = trimStart;
    exports.unescape = unescape2;
    exports.upperCase = upperCase;
    exports.upperFirst = upperFirst;
    exports.words = words;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/string/index.js
var require_string = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/string/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var upperFirst = require_upperFirst_CorAVn();
    function startCase(str) {
      const words = upperFirst.words(str.trim());
      let result = "";
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (result) {
          result += " ";
        }
        result += word[0].toUpperCase() + word.slice(1).toLowerCase();
      }
      return result;
    }
    exports.camelCase = upperFirst.camelCase;
    exports.capitalize = upperFirst.capitalize;
    exports.constantCase = upperFirst.constantCase;
    exports.deburr = upperFirst.deburr;
    exports.escape = upperFirst.escape;
    exports.escapeRegExp = upperFirst.escapeRegExp;
    exports.kebabCase = upperFirst.kebabCase;
    exports.lowerCase = upperFirst.lowerCase;
    exports.lowerFirst = upperFirst.lowerFirst;
    exports.pad = upperFirst.pad;
    exports.pascalCase = upperFirst.pascalCase;
    exports.snakeCase = upperFirst.snakeCase;
    exports.trim = upperFirst.trim;
    exports.trimEnd = upperFirst.trimEnd;
    exports.trimStart = upperFirst.trimStart;
    exports.unescape = upperFirst.unescape;
    exports.upperCase = upperFirst.upperCase;
    exports.upperFirst = upperFirst.upperFirst;
    exports.words = upperFirst.words;
    exports.startCase = startCase;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/util/index.js
var require_util = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/util/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    function invariant(condition, message) {
      if (condition) {
        return;
      }
      throw new Error(message);
    }
    exports.invariant = invariant;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/index.js
var require_dist2 = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/es-toolkit/dist/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var zipWith = require_zipWith_Bdyzuy();
    var array_index = require_array();
    var promise_index = require_index_BGZDR9();
    var unary = require_unary_B6qG7C();
    var function_index = require_function();
    var noop = require_noop_2IwLUk();
    var range = require_range_HnEIT7();
    var randomInt = require_randomInt_CF7bZK();
    var math_index = require_math();
    var toMerged = require_toMerged_DGFrN7();
    var object_index = require_object();
    var isWeakSet = require_isWeakSet_CvIdTA();
    var predicate_index = require_predicate();
    var isPlainObject2 = require_isPlainObject_octpoD();
    var upperFirst = require_upperFirst_CorAVn();
    var string_index = require_string();
    var util_index = require_util();
    exports.at = zipWith.at;
    exports.chunk = zipWith.chunk;
    exports.compact = zipWith.compact;
    exports.countBy = zipWith.countBy;
    exports.difference = zipWith.difference;
    exports.differenceBy = zipWith.differenceBy;
    exports.differenceWith = zipWith.differenceWith;
    exports.drop = zipWith.drop;
    exports.dropRight = zipWith.dropRight;
    exports.dropRightWhile = zipWith.dropRightWhile;
    exports.dropWhile = zipWith.dropWhile;
    exports.fill = zipWith.fill;
    exports.flatMap = zipWith.flatMap;
    exports.flatMapDeep = zipWith.flatMapDeep;
    exports.flatten = zipWith.flatten;
    exports.flattenDeep = zipWith.flattenDeep;
    exports.forEachRight = zipWith.forEachRight;
    exports.groupBy = zipWith.groupBy;
    exports.head = zipWith.head;
    exports.initial = zipWith.initial;
    exports.intersection = zipWith.intersection;
    exports.intersectionBy = zipWith.intersectionBy;
    exports.intersectionWith = zipWith.intersectionWith;
    exports.isSubset = zipWith.isSubset;
    exports.isSubsetWith = zipWith.isSubsetWith;
    exports.keyBy = zipWith.keyBy;
    exports.last = zipWith.last;
    exports.maxBy = zipWith.maxBy;
    exports.minBy = zipWith.minBy;
    exports.partition = zipWith.partition;
    exports.pull = zipWith.pull;
    exports.pullAt = zipWith.pullAt;
    exports.remove = zipWith.remove;
    exports.sample = zipWith.sample;
    exports.sampleSize = zipWith.sampleSize;
    exports.shuffle = zipWith.shuffle;
    exports.tail = zipWith.tail;
    exports.take = zipWith.take;
    exports.takeRight = zipWith.takeRight;
    exports.takeWhile = zipWith.takeWhile;
    exports.toFilled = zipWith.toFilled;
    exports.union = zipWith.union;
    exports.unionBy = zipWith.unionBy;
    exports.unionWith = zipWith.unionWith;
    exports.uniq = zipWith.uniq;
    exports.uniqBy = zipWith.uniqBy;
    exports.uniqWith = zipWith.uniqWith;
    exports.unzip = zipWith.unzip;
    exports.unzipWith = zipWith.unzipWith;
    exports.windowed = zipWith.windowed;
    exports.without = zipWith.without;
    exports.xor = zipWith.xor;
    exports.xorBy = zipWith.xorBy;
    exports.xorWith = zipWith.xorWith;
    exports.zip = zipWith.zip;
    exports.zipObject = zipWith.zipObject;
    exports.zipWith = zipWith.zipWith;
    exports.orderBy = array_index.orderBy;
    exports.sortBy = array_index.sortBy;
    exports.takeRightWhile = array_index.takeRightWhile;
    exports.AbortError = promise_index.AbortError;
    exports.TimeoutError = promise_index.TimeoutError;
    exports.delay = promise_index.delay;
    exports.timeout = promise_index.timeout;
    exports.withTimeout = promise_index.withTimeout;
    exports.after = unary.after;
    exports.ary = unary.ary;
    exports.asyncNoop = unary.asyncNoop;
    exports.debounce = unary.debounce;
    exports.flow = unary.flow;
    exports.flowRight = unary.flowRight;
    exports.identity = unary.identity;
    exports.memoize = unary.memoize;
    exports.negate = unary.negate;
    exports.once = unary.once;
    exports.partial = unary.partial;
    exports.partialRight = unary.partialRight;
    exports.rest = unary.rest;
    exports.unary = unary.unary;
    exports.before = function_index.before;
    exports.curry = function_index.curry;
    exports.curryRight = function_index.curryRight;
    exports.spread = function_index.spread;
    exports.throttle = function_index.throttle;
    exports.noop = noop.noop;
    exports.clamp = range.clamp;
    exports.inRange = range.inRange;
    exports.mean = range.mean;
    exports.meanBy = range.meanBy;
    exports.median = range.median;
    exports.medianBy = range.medianBy;
    exports.range = range.range;
    exports.sum = range.sum;
    exports.random = randomInt.random;
    exports.randomInt = randomInt.randomInt;
    exports.rangeRight = math_index.rangeRight;
    exports.round = math_index.round;
    exports.sumBy = math_index.sumBy;
    exports.clone = toMerged.clone;
    exports.cloneDeep = toMerged.cloneDeep;
    exports.cloneDeepWith = toMerged.cloneDeepWith;
    exports.findKey = toMerged.findKey;
    exports.flattenObject = toMerged.flattenObject;
    exports.invert = toMerged.invert;
    exports.mapKeys = toMerged.mapKeys;
    exports.mapValues = toMerged.mapValues;
    exports.merge = toMerged.merge;
    exports.omitBy = toMerged.omitBy;
    exports.pickBy = toMerged.pickBy;
    exports.toMerged = toMerged.toMerged;
    exports.mergeWith = object_index.mergeWith;
    exports.omit = object_index.omit;
    exports.pick = object_index.pick;
    exports.isArrayBuffer = isWeakSet.isArrayBuffer;
    exports.isBlob = isWeakSet.isBlob;
    exports.isBuffer = isWeakSet.isBuffer;
    exports.isDate = isWeakSet.isDate;
    exports.isEqual = isWeakSet.isEqual;
    exports.isEqualWith = isWeakSet.isEqualWith;
    exports.isFile = isWeakSet.isFile;
    exports.isFunction = isWeakSet.isFunction;
    exports.isJSONArray = isWeakSet.isJSONArray;
    exports.isJSONObject = isWeakSet.isJSONObject;
    exports.isJSONValue = isWeakSet.isJSONValue;
    exports.isLength = isWeakSet.isLength;
    exports.isMap = isWeakSet.isMap;
    exports.isNil = isWeakSet.isNil;
    exports.isNotNil = isWeakSet.isNotNil;
    exports.isNull = isWeakSet.isNull;
    exports.isRegExp = isWeakSet.isRegExp;
    exports.isSet = isWeakSet.isSet;
    exports.isUndefined = isWeakSet.isUndefined;
    exports.isWeakMap = isWeakSet.isWeakMap;
    exports.isWeakSet = isWeakSet.isWeakSet;
    exports.isBoolean = predicate_index.isBoolean;
    exports.isError = predicate_index.isError;
    exports.isString = predicate_index.isString;
    exports.isSymbol = predicate_index.isSymbol;
    exports.isPlainObject = isPlainObject2.isPlainObject;
    exports.isPrimitive = isPlainObject2.isPrimitive;
    exports.isTypedArray = isPlainObject2.isTypedArray;
    exports.camelCase = upperFirst.camelCase;
    exports.capitalize = upperFirst.capitalize;
    exports.constantCase = upperFirst.constantCase;
    exports.deburr = upperFirst.deburr;
    exports.escape = upperFirst.escape;
    exports.escapeRegExp = upperFirst.escapeRegExp;
    exports.kebabCase = upperFirst.kebabCase;
    exports.lowerCase = upperFirst.lowerCase;
    exports.lowerFirst = upperFirst.lowerFirst;
    exports.pad = upperFirst.pad;
    exports.pascalCase = upperFirst.pascalCase;
    exports.snakeCase = upperFirst.snakeCase;
    exports.trim = upperFirst.trim;
    exports.trimEnd = upperFirst.trimEnd;
    exports.trimStart = upperFirst.trimStart;
    exports.unescape = upperFirst.unescape;
    exports.upperCase = upperFirst.upperCase;
    exports.upperFirst = upperFirst.upperFirst;
    exports.words = upperFirst.words;
    exports.startCase = string_index.startCase;
    exports.invariant = util_index.invariant;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/eventemitter3/index.js
var require_eventemitter3 = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/eventemitter3/index.js"(exports, module) {
    "use strict";
    var has = Object.prototype.hasOwnProperty;
    var prefix = "~";
    function Events() {
    }
    if (Object.create) {
      Events.prototype = /* @__PURE__ */ Object.create(null);
      if (!new Events().__proto__)
        prefix = false;
    }
    function EE(fn, context, once) {
      this.fn = fn;
      this.context = context;
      this.once = once || false;
    }
    function addListener(emitter, event, fn, context, once) {
      if (typeof fn !== "function") {
        throw new TypeError("The listener must be a function");
      }
      var listener = new EE(fn, context || emitter, once), evt = prefix ? prefix + event : event;
      if (!emitter._events[evt])
        emitter._events[evt] = listener, emitter._eventsCount++;
      else if (!emitter._events[evt].fn)
        emitter._events[evt].push(listener);
      else
        emitter._events[evt] = [emitter._events[evt], listener];
      return emitter;
    }
    function clearEvent(emitter, evt) {
      if (--emitter._eventsCount === 0)
        emitter._events = new Events();
      else
        delete emitter._events[evt];
    }
    function EventEmitter2() {
      this._events = new Events();
      this._eventsCount = 0;
    }
    EventEmitter2.prototype.eventNames = function eventNames() {
      var names = [], events, name;
      if (this._eventsCount === 0)
        return names;
      for (name in events = this._events) {
        if (has.call(events, name))
          names.push(prefix ? name.slice(1) : name);
      }
      if (Object.getOwnPropertySymbols) {
        return names.concat(Object.getOwnPropertySymbols(events));
      }
      return names;
    };
    EventEmitter2.prototype.listeners = function listeners(event) {
      var evt = prefix ? prefix + event : event, handlers = this._events[evt];
      if (!handlers)
        return [];
      if (handlers.fn)
        return [handlers.fn];
      for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++) {
        ee[i] = handlers[i].fn;
      }
      return ee;
    };
    EventEmitter2.prototype.listenerCount = function listenerCount(event) {
      var evt = prefix ? prefix + event : event, listeners = this._events[evt];
      if (!listeners)
        return 0;
      if (listeners.fn)
        return 1;
      return listeners.length;
    };
    EventEmitter2.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
      var evt = prefix ? prefix + event : event;
      if (!this._events[evt])
        return false;
      var listeners = this._events[evt], len = arguments.length, args, i;
      if (listeners.fn) {
        if (listeners.once)
          this.removeListener(event, listeners.fn, void 0, true);
        switch (len) {
          case 1:
            return listeners.fn.call(listeners.context), true;
          case 2:
            return listeners.fn.call(listeners.context, a1), true;
          case 3:
            return listeners.fn.call(listeners.context, a1, a2), true;
          case 4:
            return listeners.fn.call(listeners.context, a1, a2, a3), true;
          case 5:
            return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
          case 6:
            return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
        }
        for (i = 1, args = new Array(len - 1); i < len; i++) {
          args[i - 1] = arguments[i];
        }
        listeners.fn.apply(listeners.context, args);
      } else {
        var length = listeners.length, j;
        for (i = 0; i < length; i++) {
          if (listeners[i].once)
            this.removeListener(event, listeners[i].fn, void 0, true);
          switch (len) {
            case 1:
              listeners[i].fn.call(listeners[i].context);
              break;
            case 2:
              listeners[i].fn.call(listeners[i].context, a1);
              break;
            case 3:
              listeners[i].fn.call(listeners[i].context, a1, a2);
              break;
            case 4:
              listeners[i].fn.call(listeners[i].context, a1, a2, a3);
              break;
            default:
              if (!args)
                for (j = 1, args = new Array(len - 1); j < len; j++) {
                  args[j - 1] = arguments[j];
                }
              listeners[i].fn.apply(listeners[i].context, args);
          }
        }
      }
      return true;
    };
    EventEmitter2.prototype.on = function on(event, fn, context) {
      return addListener(this, event, fn, context, false);
    };
    EventEmitter2.prototype.once = function once(event, fn, context) {
      return addListener(this, event, fn, context, true);
    };
    EventEmitter2.prototype.removeListener = function removeListener(event, fn, context, once) {
      var evt = prefix ? prefix + event : event;
      if (!this._events[evt])
        return this;
      if (!fn) {
        clearEvent(this, evt);
        return this;
      }
      var listeners = this._events[evt];
      if (listeners.fn) {
        if (listeners.fn === fn && (!once || listeners.once) && (!context || listeners.context === context)) {
          clearEvent(this, evt);
        }
      } else {
        for (var i = 0, events = [], length = listeners.length; i < length; i++) {
          if (listeners[i].fn !== fn || once && !listeners[i].once || context && listeners[i].context !== context) {
            events.push(listeners[i]);
          }
        }
        if (events.length)
          this._events[evt] = events.length === 1 ? events[0] : events;
        else
          clearEvent(this, evt);
      }
      return this;
    };
    EventEmitter2.prototype.removeAllListeners = function removeAllListeners(event) {
      var evt;
      if (event) {
        evt = prefix ? prefix + event : event;
        if (this._events[evt])
          clearEvent(this, evt);
      } else {
        this._events = new Events();
        this._eventsCount = 0;
      }
      return this;
    };
    EventEmitter2.prototype.off = EventEmitter2.prototype.removeListener;
    EventEmitter2.prototype.addListener = EventEmitter2.prototype.on;
    EventEmitter2.prefixed = prefix;
    EventEmitter2.EventEmitter = EventEmitter2;
    if ("undefined" !== typeof module) {
      module.exports = EventEmitter2;
    }
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/fast-json-patch/commonjs/helpers.js
var require_helpers = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/fast-json-patch/commonjs/helpers.js"(exports) {
    var __extends = exports && exports.__extends || function() {
      var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
          d2.__proto__ = b2;
        } || function(d2, b2) {
          for (var p in b2)
            if (b2.hasOwnProperty(p))
              d2[p] = b2[p];
        };
        return extendStatics(d, b);
      };
      return function(d, b) {
        extendStatics(d, b);
        function __() {
          this.constructor = d;
        }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
      };
    }();
    Object.defineProperty(exports, "__esModule", { value: true });
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    function hasOwnProperty(obj, key) {
      return _hasOwnProperty.call(obj, key);
    }
    exports.hasOwnProperty = hasOwnProperty;
    function _objectKeys(obj) {
      if (Array.isArray(obj)) {
        var keys_1 = new Array(obj.length);
        for (var k = 0; k < keys_1.length; k++) {
          keys_1[k] = "" + k;
        }
        return keys_1;
      }
      if (Object.keys) {
        return Object.keys(obj);
      }
      var keys = [];
      for (var i in obj) {
        if (hasOwnProperty(obj, i)) {
          keys.push(i);
        }
      }
      return keys;
    }
    exports._objectKeys = _objectKeys;
    function _deepClone(obj) {
      switch (typeof obj) {
        case "object":
          return JSON.parse(JSON.stringify(obj));
        case "undefined":
          return null;
        default:
          return obj;
      }
    }
    exports._deepClone = _deepClone;
    function isInteger(str) {
      var i = 0;
      var len = str.length;
      var charCode;
      while (i < len) {
        charCode = str.charCodeAt(i);
        if (charCode >= 48 && charCode <= 57) {
          i++;
          continue;
        }
        return false;
      }
      return true;
    }
    exports.isInteger = isInteger;
    function escapePathComponent(path) {
      if (path.indexOf("/") === -1 && path.indexOf("~") === -1)
        return path;
      return path.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports.escapePathComponent = escapePathComponent;
    function unescapePathComponent(path) {
      return path.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports.unescapePathComponent = unescapePathComponent;
    function _getPathRecursive(root, obj) {
      var found;
      for (var key in root) {
        if (hasOwnProperty(root, key)) {
          if (root[key] === obj) {
            return escapePathComponent(key) + "/";
          } else if (typeof root[key] === "object") {
            found = _getPathRecursive(root[key], obj);
            if (found != "") {
              return escapePathComponent(key) + "/" + found;
            }
          }
        }
      }
      return "";
    }
    exports._getPathRecursive = _getPathRecursive;
    function getPath(root, obj) {
      if (root === obj) {
        return "/";
      }
      var path = _getPathRecursive(root, obj);
      if (path === "") {
        throw new Error("Object not found in root");
      }
      return "/" + path;
    }
    exports.getPath = getPath;
    function hasUndefined(obj) {
      if (obj === void 0) {
        return true;
      }
      if (obj) {
        if (Array.isArray(obj)) {
          for (var i_1 = 0, len = obj.length; i_1 < len; i_1++) {
            if (hasUndefined(obj[i_1])) {
              return true;
            }
          }
        } else if (typeof obj === "object") {
          var objKeys = _objectKeys(obj);
          var objKeysLength = objKeys.length;
          for (var i = 0; i < objKeysLength; i++) {
            if (hasUndefined(obj[objKeys[i]])) {
              return true;
            }
          }
        }
      }
      return false;
    }
    exports.hasUndefined = hasUndefined;
    function patchErrorMessageFormatter(message, args) {
      var messageParts = [message];
      for (var key in args) {
        var value = typeof args[key] === "object" ? JSON.stringify(args[key], null, 2) : args[key];
        if (typeof value !== "undefined") {
          messageParts.push(key + ": " + value);
        }
      }
      return messageParts.join("\n");
    }
    var PatchError = (
      /** @class */
      function(_super) {
        __extends(PatchError2, _super);
        function PatchError2(message, name, index, operation, tree) {
          var _newTarget = this.constructor;
          var _this = _super.call(this, patchErrorMessageFormatter(message, { name, index, operation, tree })) || this;
          _this.name = name;
          _this.index = index;
          _this.operation = operation;
          _this.tree = tree;
          Object.setPrototypeOf(_this, _newTarget.prototype);
          _this.message = patchErrorMessageFormatter(message, { name, index, operation, tree });
          return _this;
        }
        return PatchError2;
      }(Error)
    );
    exports.PatchError = PatchError;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/fast-json-patch/commonjs/core.js
var require_core = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/fast-json-patch/commonjs/core.js"(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    var helpers_js_1 = require_helpers();
    exports.JsonPatchError = helpers_js_1.PatchError;
    exports.deepClone = helpers_js_1._deepClone;
    var objOps = {
      add: function(obj, key, document) {
        obj[key] = this.value;
        return { newDocument: document };
      },
      remove: function(obj, key, document) {
        var removed = obj[key];
        delete obj[key];
        return { newDocument: document, removed };
      },
      replace: function(obj, key, document) {
        var removed = obj[key];
        obj[key] = this.value;
        return { newDocument: document, removed };
      },
      move: function(obj, key, document) {
        var removed = getValueByPointer(document, this.path);
        if (removed) {
          removed = helpers_js_1._deepClone(removed);
        }
        var originalValue = applyOperation(document, { op: "remove", path: this.from }).removed;
        applyOperation(document, { op: "add", path: this.path, value: originalValue });
        return { newDocument: document, removed };
      },
      copy: function(obj, key, document) {
        var valueToCopy = getValueByPointer(document, this.from);
        applyOperation(document, { op: "add", path: this.path, value: helpers_js_1._deepClone(valueToCopy) });
        return { newDocument: document };
      },
      test: function(obj, key, document) {
        return { newDocument: document, test: _areEquals(obj[key], this.value) };
      },
      _get: function(obj, key, document) {
        this.value = obj[key];
        return { newDocument: document };
      }
    };
    var arrOps = {
      add: function(arr, i, document) {
        if (helpers_js_1.isInteger(i)) {
          arr.splice(i, 0, this.value);
        } else {
          arr[i] = this.value;
        }
        return { newDocument: document, index: i };
      },
      remove: function(arr, i, document) {
        var removedList = arr.splice(i, 1);
        return { newDocument: document, removed: removedList[0] };
      },
      replace: function(arr, i, document) {
        var removed = arr[i];
        arr[i] = this.value;
        return { newDocument: document, removed };
      },
      move: objOps.move,
      copy: objOps.copy,
      test: objOps.test,
      _get: objOps._get
    };
    function getValueByPointer(document, pointer) {
      if (pointer == "") {
        return document;
      }
      var getOriginalDestination = { op: "_get", path: pointer };
      applyOperation(document, getOriginalDestination);
      return getOriginalDestination.value;
    }
    exports.getValueByPointer = getValueByPointer;
    function applyOperation(document, operation, validateOperation, mutateDocument, banPrototypeModifications, index) {
      if (validateOperation === void 0) {
        validateOperation = false;
      }
      if (mutateDocument === void 0) {
        mutateDocument = true;
      }
      if (banPrototypeModifications === void 0) {
        banPrototypeModifications = true;
      }
      if (index === void 0) {
        index = 0;
      }
      if (validateOperation) {
        if (typeof validateOperation == "function") {
          validateOperation(operation, 0, document, operation.path);
        } else {
          validator(operation, 0);
        }
      }
      if (operation.path === "") {
        var returnValue = { newDocument: document };
        if (operation.op === "add") {
          returnValue.newDocument = operation.value;
          return returnValue;
        } else if (operation.op === "replace") {
          returnValue.newDocument = operation.value;
          returnValue.removed = document;
          return returnValue;
        } else if (operation.op === "move" || operation.op === "copy") {
          returnValue.newDocument = getValueByPointer(document, operation.from);
          if (operation.op === "move") {
            returnValue.removed = document;
          }
          return returnValue;
        } else if (operation.op === "test") {
          returnValue.test = _areEquals(document, operation.value);
          if (returnValue.test === false) {
            throw new exports.JsonPatchError("Test operation failed", "TEST_OPERATION_FAILED", index, operation, document);
          }
          returnValue.newDocument = document;
          return returnValue;
        } else if (operation.op === "remove") {
          returnValue.removed = document;
          returnValue.newDocument = null;
          return returnValue;
        } else if (operation.op === "_get") {
          operation.value = document;
          return returnValue;
        } else {
          if (validateOperation) {
            throw new exports.JsonPatchError("Operation `op` property is not one of operations defined in RFC-6902", "OPERATION_OP_INVALID", index, operation, document);
          } else {
            return returnValue;
          }
        }
      } else {
        if (!mutateDocument) {
          document = helpers_js_1._deepClone(document);
        }
        var path = operation.path || "";
        var keys = path.split("/");
        var obj = document;
        var t = 1;
        var len = keys.length;
        var existingPathFragment = void 0;
        var key = void 0;
        var validateFunction = void 0;
        if (typeof validateOperation == "function") {
          validateFunction = validateOperation;
        } else {
          validateFunction = validator;
        }
        while (true) {
          key = keys[t];
          if (key && key.indexOf("~") != -1) {
            key = helpers_js_1.unescapePathComponent(key);
          }
          if (banPrototypeModifications && (key == "__proto__" || key == "prototype" && t > 0 && keys[t - 1] == "constructor")) {
            throw new TypeError("JSON-Patch: modifying `__proto__` or `constructor/prototype` prop is banned for security reasons, if this was on purpose, please set `banPrototypeModifications` flag false and pass it to this function. More info in fast-json-patch README");
          }
          if (validateOperation) {
            if (existingPathFragment === void 0) {
              if (obj[key] === void 0) {
                existingPathFragment = keys.slice(0, t).join("/");
              } else if (t == len - 1) {
                existingPathFragment = operation.path;
              }
              if (existingPathFragment !== void 0) {
                validateFunction(operation, 0, document, existingPathFragment);
              }
            }
          }
          t++;
          if (Array.isArray(obj)) {
            if (key === "-") {
              key = obj.length;
            } else {
              if (validateOperation && !helpers_js_1.isInteger(key)) {
                throw new exports.JsonPatchError("Expected an unsigned base-10 integer value, making the new referenced value the array element with the zero-based index", "OPERATION_PATH_ILLEGAL_ARRAY_INDEX", index, operation, document);
              } else if (helpers_js_1.isInteger(key)) {
                key = ~~key;
              }
            }
            if (t >= len) {
              if (validateOperation && operation.op === "add" && key > obj.length) {
                throw new exports.JsonPatchError("The specified index MUST NOT be greater than the number of elements in the array", "OPERATION_VALUE_OUT_OF_BOUNDS", index, operation, document);
              }
              var returnValue = arrOps[operation.op].call(operation, obj, key, document);
              if (returnValue.test === false) {
                throw new exports.JsonPatchError("Test operation failed", "TEST_OPERATION_FAILED", index, operation, document);
              }
              return returnValue;
            }
          } else {
            if (t >= len) {
              var returnValue = objOps[operation.op].call(operation, obj, key, document);
              if (returnValue.test === false) {
                throw new exports.JsonPatchError("Test operation failed", "TEST_OPERATION_FAILED", index, operation, document);
              }
              return returnValue;
            }
          }
          obj = obj[key];
          if (validateOperation && t < len && (!obj || typeof obj !== "object")) {
            throw new exports.JsonPatchError("Cannot perform operation at the desired path", "OPERATION_PATH_UNRESOLVABLE", index, operation, document);
          }
        }
      }
    }
    exports.applyOperation = applyOperation;
    function applyPatch2(document, patch, validateOperation, mutateDocument, banPrototypeModifications) {
      if (mutateDocument === void 0) {
        mutateDocument = true;
      }
      if (banPrototypeModifications === void 0) {
        banPrototypeModifications = true;
      }
      if (validateOperation) {
        if (!Array.isArray(patch)) {
          throw new exports.JsonPatchError("Patch sequence must be an array", "SEQUENCE_NOT_AN_ARRAY");
        }
      }
      if (!mutateDocument) {
        document = helpers_js_1._deepClone(document);
      }
      var results = new Array(patch.length);
      for (var i = 0, length_1 = patch.length; i < length_1; i++) {
        results[i] = applyOperation(document, patch[i], validateOperation, true, banPrototypeModifications, i);
        document = results[i].newDocument;
      }
      results.newDocument = document;
      return results;
    }
    exports.applyPatch = applyPatch2;
    function applyReducer(document, operation, index) {
      var operationResult = applyOperation(document, operation);
      if (operationResult.test === false) {
        throw new exports.JsonPatchError("Test operation failed", "TEST_OPERATION_FAILED", index, operation, document);
      }
      return operationResult.newDocument;
    }
    exports.applyReducer = applyReducer;
    function validator(operation, index, document, existingPathFragment) {
      if (typeof operation !== "object" || operation === null || Array.isArray(operation)) {
        throw new exports.JsonPatchError("Operation is not an object", "OPERATION_NOT_AN_OBJECT", index, operation, document);
      } else if (!objOps[operation.op]) {
        throw new exports.JsonPatchError("Operation `op` property is not one of operations defined in RFC-6902", "OPERATION_OP_INVALID", index, operation, document);
      } else if (typeof operation.path !== "string") {
        throw new exports.JsonPatchError("Operation `path` property is not a string", "OPERATION_PATH_INVALID", index, operation, document);
      } else if (operation.path.indexOf("/") !== 0 && operation.path.length > 0) {
        throw new exports.JsonPatchError('Operation `path` property must start with "/"', "OPERATION_PATH_INVALID", index, operation, document);
      } else if ((operation.op === "move" || operation.op === "copy") && typeof operation.from !== "string") {
        throw new exports.JsonPatchError("Operation `from` property is not present (applicable in `move` and `copy` operations)", "OPERATION_FROM_REQUIRED", index, operation, document);
      } else if ((operation.op === "add" || operation.op === "replace" || operation.op === "test") && operation.value === void 0) {
        throw new exports.JsonPatchError("Operation `value` property is not present (applicable in `add`, `replace` and `test` operations)", "OPERATION_VALUE_REQUIRED", index, operation, document);
      } else if ((operation.op === "add" || operation.op === "replace" || operation.op === "test") && helpers_js_1.hasUndefined(operation.value)) {
        throw new exports.JsonPatchError("Operation `value` property is not present (applicable in `add`, `replace` and `test` operations)", "OPERATION_VALUE_CANNOT_CONTAIN_UNDEFINED", index, operation, document);
      } else if (document) {
        if (operation.op == "add") {
          var pathLen = operation.path.split("/").length;
          var existingPathLen = existingPathFragment.split("/").length;
          if (pathLen !== existingPathLen + 1 && pathLen !== existingPathLen) {
            throw new exports.JsonPatchError("Cannot perform an `add` operation at the desired path", "OPERATION_PATH_CANNOT_ADD", index, operation, document);
          }
        } else if (operation.op === "replace" || operation.op === "remove" || operation.op === "_get") {
          if (operation.path !== existingPathFragment) {
            throw new exports.JsonPatchError("Cannot perform the operation at a path that does not exist", "OPERATION_PATH_UNRESOLVABLE", index, operation, document);
          }
        } else if (operation.op === "move" || operation.op === "copy") {
          var existingValue = { op: "_get", path: operation.from, value: void 0 };
          var error = validate([existingValue], document);
          if (error && error.name === "OPERATION_PATH_UNRESOLVABLE") {
            throw new exports.JsonPatchError("Cannot perform the operation from a path that does not exist", "OPERATION_FROM_UNRESOLVABLE", index, operation, document);
          }
        }
      }
    }
    exports.validator = validator;
    function validate(sequence, document, externalValidator) {
      try {
        if (!Array.isArray(sequence)) {
          throw new exports.JsonPatchError("Patch sequence must be an array", "SEQUENCE_NOT_AN_ARRAY");
        }
        if (document) {
          applyPatch2(helpers_js_1._deepClone(document), helpers_js_1._deepClone(sequence), externalValidator || true);
        } else {
          externalValidator = externalValidator || validator;
          for (var i = 0; i < sequence.length; i++) {
            externalValidator(sequence[i], i, document, void 0);
          }
        }
      } catch (e) {
        if (e instanceof exports.JsonPatchError) {
          return e;
        } else {
          throw e;
        }
      }
    }
    exports.validate = validate;
    function _areEquals(a, b) {
      if (a === b)
        return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        var arrA = Array.isArray(a), arrB = Array.isArray(b), i, length, key;
        if (arrA && arrB) {
          length = a.length;
          if (length != b.length)
            return false;
          for (i = length; i-- !== 0; )
            if (!_areEquals(a[i], b[i]))
              return false;
          return true;
        }
        if (arrA != arrB)
          return false;
        var keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length)
          return false;
        for (i = length; i-- !== 0; )
          if (!b.hasOwnProperty(keys[i]))
            return false;
        for (i = length; i-- !== 0; ) {
          key = keys[i];
          if (!_areEquals(a[key], b[key]))
            return false;
        }
        return true;
      }
      return a !== a && b !== b;
    }
    exports._areEquals = _areEquals;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/fast-json-patch/commonjs/duplex.js
var require_duplex = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/fast-json-patch/commonjs/duplex.js"(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    var helpers_js_1 = require_helpers();
    var core_js_1 = require_core();
    var beforeDict = /* @__PURE__ */ new WeakMap();
    var Mirror = (
      /** @class */
      function() {
        function Mirror2(obj) {
          this.observers = /* @__PURE__ */ new Map();
          this.obj = obj;
        }
        return Mirror2;
      }()
    );
    var ObserverInfo = (
      /** @class */
      function() {
        function ObserverInfo2(callback, observer) {
          this.callback = callback;
          this.observer = observer;
        }
        return ObserverInfo2;
      }()
    );
    function getMirror(obj) {
      return beforeDict.get(obj);
    }
    function getObserverFromMirror(mirror, callback) {
      return mirror.observers.get(callback);
    }
    function removeObserverFromMirror(mirror, observer) {
      mirror.observers.delete(observer.callback);
    }
    function unobserve(root, observer) {
      observer.unobserve();
    }
    exports.unobserve = unobserve;
    function observe(obj, callback) {
      var patches = [];
      var observer;
      var mirror = getMirror(obj);
      if (!mirror) {
        mirror = new Mirror(obj);
        beforeDict.set(obj, mirror);
      } else {
        var observerInfo = getObserverFromMirror(mirror, callback);
        observer = observerInfo && observerInfo.observer;
      }
      if (observer) {
        return observer;
      }
      observer = {};
      mirror.value = helpers_js_1._deepClone(obj);
      if (callback) {
        observer.callback = callback;
        observer.next = null;
        var dirtyCheck = function() {
          generate(observer);
        };
        var fastCheck = function() {
          clearTimeout(observer.next);
          observer.next = setTimeout(dirtyCheck);
        };
        if (typeof window !== "undefined") {
          window.addEventListener("mouseup", fastCheck);
          window.addEventListener("keyup", fastCheck);
          window.addEventListener("mousedown", fastCheck);
          window.addEventListener("keydown", fastCheck);
          window.addEventListener("change", fastCheck);
        }
      }
      observer.patches = patches;
      observer.object = obj;
      observer.unobserve = function() {
        generate(observer);
        clearTimeout(observer.next);
        removeObserverFromMirror(mirror, observer);
        if (typeof window !== "undefined") {
          window.removeEventListener("mouseup", fastCheck);
          window.removeEventListener("keyup", fastCheck);
          window.removeEventListener("mousedown", fastCheck);
          window.removeEventListener("keydown", fastCheck);
          window.removeEventListener("change", fastCheck);
        }
      };
      mirror.observers.set(callback, new ObserverInfo(callback, observer));
      return observer;
    }
    exports.observe = observe;
    function generate(observer, invertible) {
      if (invertible === void 0) {
        invertible = false;
      }
      var mirror = beforeDict.get(observer.object);
      _generate(mirror.value, observer.object, observer.patches, "", invertible);
      if (observer.patches.length) {
        core_js_1.applyPatch(mirror.value, observer.patches);
      }
      var temp = observer.patches;
      if (temp.length > 0) {
        observer.patches = [];
        if (observer.callback) {
          observer.callback(temp);
        }
      }
      return temp;
    }
    exports.generate = generate;
    function _generate(mirror, obj, patches, path, invertible) {
      if (obj === mirror) {
        return;
      }
      if (typeof obj.toJSON === "function") {
        obj = obj.toJSON();
      }
      var newKeys = helpers_js_1._objectKeys(obj);
      var oldKeys = helpers_js_1._objectKeys(mirror);
      var changed = false;
      var deleted = false;
      for (var t = oldKeys.length - 1; t >= 0; t--) {
        var key = oldKeys[t];
        var oldVal = mirror[key];
        if (helpers_js_1.hasOwnProperty(obj, key) && !(obj[key] === void 0 && oldVal !== void 0 && Array.isArray(obj) === false)) {
          var newVal = obj[key];
          if (typeof oldVal == "object" && oldVal != null && typeof newVal == "object" && newVal != null && Array.isArray(oldVal) === Array.isArray(newVal)) {
            _generate(oldVal, newVal, patches, path + "/" + helpers_js_1.escapePathComponent(key), invertible);
          } else {
            if (oldVal !== newVal) {
              changed = true;
              if (invertible) {
                patches.push({ op: "test", path: path + "/" + helpers_js_1.escapePathComponent(key), value: helpers_js_1._deepClone(oldVal) });
              }
              patches.push({ op: "replace", path: path + "/" + helpers_js_1.escapePathComponent(key), value: helpers_js_1._deepClone(newVal) });
            }
          }
        } else if (Array.isArray(mirror) === Array.isArray(obj)) {
          if (invertible) {
            patches.push({ op: "test", path: path + "/" + helpers_js_1.escapePathComponent(key), value: helpers_js_1._deepClone(oldVal) });
          }
          patches.push({ op: "remove", path: path + "/" + helpers_js_1.escapePathComponent(key) });
          deleted = true;
        } else {
          if (invertible) {
            patches.push({ op: "test", path, value: mirror });
          }
          patches.push({ op: "replace", path, value: obj });
          changed = true;
        }
      }
      if (!deleted && newKeys.length == oldKeys.length) {
        return;
      }
      for (var t = 0; t < newKeys.length; t++) {
        var key = newKeys[t];
        if (!helpers_js_1.hasOwnProperty(mirror, key) && obj[key] !== void 0) {
          patches.push({ op: "add", path: path + "/" + helpers_js_1.escapePathComponent(key), value: helpers_js_1._deepClone(obj[key]) });
        }
      }
    }
    function compare(tree1, tree2, invertible) {
      if (invertible === void 0) {
        invertible = false;
      }
      var patches = [];
      _generate(tree1, tree2, patches, "", invertible);
      return patches;
    }
    exports.compare = compare;
  }
});

// ../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/fast-json-patch/index.js
var require_fast_json_patch = __commonJS({
  "../../../../../../../Users/zhanyingwei/.codex/worktrees/runtime-editor-core/engine-next/world/scripts/runtime-source-compiler/node_modules/fast-json-patch/index.js"(exports) {
    var core = require_core();
    Object.assign(exports, core);
    var duplex = require_duplex();
    Object.assign(exports, duplex);
    var helpers = require_helpers();
    exports.JsonPatchError = helpers.PatchError;
    exports.deepClone = helpers._deepClone;
    exports.escapePathComponent = helpers.escapePathComponent;
    exports.unescapePathComponent = helpers.unescapePathComponent;
  }
});

// packages/model/src/scene-file-v2/source-ref-codec.ts
function isUrlLikeSourceRef(value) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
}
function isValidSourceAssetRef(value) {
  return typeof value === "string" && value.length > 0 && !isUrlLikeSourceRef(value) && !value.includes("\\") && !value.includes("?") && !value.includes("#") && !value.split("/").some((part) => !part || part === "." || part === "..");
}
function assertSourceAssetRef(value, context) {
  if (!isValidSourceAssetRef(value))
    throw new Error(`Invalid project asset path '${value}'${context ? ` in ${context}` : ""}`);
}
function assertAndReturnSourceAssetRef(value, context) {
  assertSourceAssetRef(value, context);
  return value;
}

// packages/model/src/scene-file-v2/prefab-override-utils.ts
function deriveAddedEntityIndex(entities, added) {
  const parentId = entities[added.entityId]?.parentId;
  const index = parentId ? entities[parentId]?.children.indexOf(added.entityId) ?? -1 : -1;
  if (index < 0) {
    throw new Error(
      `Prefab added entity "${added.entityId}" is not a child of its parent "${parentId ?? "null"}": addedEntities record contradicts the entity tree`
    );
  }
  return index;
}
function collectAddedEntityOverridesInSourceOrder(binding, entities, resolveParentSourceEntityId, indexOf = (added) => deriveAddedEntityIndex(entities, added)) {
  return Object.values(binding.overrides.addedEntities ?? {}).map((added) => {
    const parent = resolveParentSourceEntityId(added.parentSourceEntityId);
    return parent ? { added, parent } : null;
  }).filter((entry) => Boolean(entry)).sort((left, right) => {
    const parentOrder = left.parent.localeCompare(right.parent);
    if (parentOrder !== 0)
      return parentOrder;
    const indexOrder = indexOf(left.added) - indexOf(right.added);
    if (indexOrder !== 0)
      return indexOrder;
    return left.added.entityId.localeCompare(right.added.entityId);
  });
}

// packages/model/src/utils/isPlainRecord.ts
function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// packages/model/src/scene-file-v2/source-value.ts
var SOURCE_SENTINEL_KEYS = ["$ref", "$entity", "$component", "$signal", "$type", "$class", "$number"];
var SOURCE_ASSET_REF_ALLOWED_KEYS = ["$ref", "key"];
function cloneSourceValue(value) {
  if (Array.isArray(value))
    return value.map((item) => cloneSourceValue(item));
  if (value === null || typeof value !== "object")
    return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = cloneSourceValue(child);
  }
  return result;
}
function convertSignalListenerAssetArgs(value, options) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return cloneSourceValue(value);
  }
  const record = value;
  const result = {};
  for (const [key, child] of Object.entries(record)) {
    result[key] = key === "args" && Array.isArray(child) ? child.map((item) => convertAssetRefsToDomainRefs(item, options)) : cloneSourceValue(child);
  }
  return result;
}
function resolveRequiredSourceRef(ref) {
  return assertAndReturnSourceAssetRef(ref);
}
function convertAssetRefsToDomainRefs(obj, options = {}) {
  if (obj === null || obj === void 0 || typeof obj !== "object")
    return obj;
  if (Array.isArray(obj))
    return obj.map((value) => convertAssetRefsToDomainRefs(value, options));
  const record = obj;
  if ("$ref" in record && typeof record.$ref === "string") {
    const refId = resolveRequiredSourceRef(record.$ref);
    const result2 = { refId };
    if (record.key !== void 0)
      result2.key = record.key;
    return result2;
  }
  if ("$component" in record) {
    if (typeof record.$component === "string") {
      const ownerId = options.resolveComponentOwner?.(record.$component);
      if (ownerId)
        return { ownerId, componentId: record.$component };
    }
    return cloneSourceValue(record);
  }
  if ("$entity" in record) {
    return cloneSourceValue(record);
  }
  if ("$signal" in record) {
    return {
      ...cloneSourceValue(record),
      $signal: Array.isArray(record.$signal) ? record.$signal.map((item) => convertSignalListenerAssetArgs(item, options)) : cloneSourceValue(record.$signal)
    };
  }
  if ("$type" in record) {
    const result2 = { $type: record.$type };
    for (const [key, value] of Object.entries(record)) {
      if (key === "$type")
        continue;
      result2[key] = convertAssetRefsToDomainRefs(value, options);
    }
    return result2;
  }
  const result = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = convertAssetRefsToDomainRefs(value, options);
  }
  return result;
}
function isSourcePrimitive(value) {
  return value === null || typeof value === "string" || typeof value === "number" && Number.isFinite(value) || typeof value === "boolean";
}
function isSourceId(value) {
  return typeof value === "string" && value.length > 0;
}
function normalizeSourceComponentTarget(value) {
  if (isSourceId(value))
    return value;
  throw new Error("Source sentinel $component.target must be a non-empty component target string");
}
function resolveInternalAssetRef(ref, options) {
  const assetId = assertAndReturnSourceAssetRef(ref, options.context);
  options.validateAssetRef?.(assetId, options.context);
  return assetId;
}
function getSourceSentinelKeys(record) {
  return SOURCE_SENTINEL_KEYS.filter((key) => key in record);
}
function isPlainSourceRecord(value) {
  return isPlainRecord(value);
}
function isSourceSentinelRecord(value) {
  return isPlainSourceRecord(value) && getSourceSentinelKeys(value).length > 0;
}
function mergeSourceValue(base, override) {
  if (override === void 0)
    return cloneSourceValue(base);
  if (!isPlainSourceRecord(base) || !isPlainSourceRecord(override))
    return cloneSourceValue(override);
  if (isSourceSentinelRecord(base) || isSourceSentinelRecord(override))
    return cloneSourceValue(override);
  const next = cloneSourceValue(base);
  for (const [key, value] of Object.entries(override)) {
    next[key] = mergeSourceValue(base[key], value);
  }
  return next;
}
function mergeSourceValueRecords(base, override) {
  return mergeSourceValue(base, override ?? {});
}
function assertAllowedSourceSentinelKeys(record, allowedKeys, sentinelLabel = allowedKeys[0]) {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Source sentinel ${sentinelLabel} cannot include extra key "${key}"`);
    }
  }
}
function normalizeInternalAssetRefRecord(record, options) {
  if (typeof record.refId !== "string")
    return null;
  assertAllowedSourceSentinelKeys(record, ["refId", "key", "isClone"], "refId");
  const result = { $ref: resolveInternalAssetRef(record.refId, options) };
  if (record.key !== void 0) {
    if (typeof record.key !== "string") {
      throw new Error("Source sentinel refId.key must be a string");
    }
    result.key = record.key;
  }
  return result;
}
function normalizeInternalComponentRefRecord(record, options) {
  if (typeof record.ownerId !== "string" || typeof record.componentId !== "string")
    return null;
  assertAllowedSourceSentinelKeys(record, ["ownerId", "componentId"], "componentId");
  return {
    $component: options.resolveInternalComponentRef?.({
      ownerId: record.ownerId,
      componentId: record.componentId
    }) ?? record.componentId
  };
}
function normalizeSourceAssetRefRecord(record) {
  assertAllowedSourceSentinelKeys(record, SOURCE_ASSET_REF_ALLOWED_KEYS);
  if (typeof record.$ref !== "string") {
    throw new Error("Source sentinel $ref must be a string");
  }
  if (record.$ref.length === 0) {
    throw new Error("Source sentinel $ref must not be empty");
  }
  assertSourceAssetRef(record.$ref);
  const result = { $ref: record.$ref };
  if (record.key !== void 0) {
    if (typeof record.key !== "string") {
      throw new Error("Source sentinel $ref.key must be a string");
    }
    result.key = record.key;
  }
  return result;
}
function normalizeSourceEntityId(value, label = "$entity") {
  if (isSourceId(value))
    return value;
  throw new Error(`Source sentinel ${label} must be a non-empty source entity id string`);
}
function normalizeSourceComponentRefValue(value, _options = {}) {
  if (isSourceId(value))
    return value;
  if (isPlainSourceRecord(value)) {
    assertAllowedSourceSentinelKeys(value, ["instance", "target"], "$component");
    return {
      instance: normalizeSourceEntityId(value.instance, "$component.instance"),
      target: normalizeSourceComponentTarget(value.target)
    };
  }
  throw new Error("Source sentinel $component must be a source component id or instance target");
}
function normalizeSourceSignalListener(value, options) {
  if (!isPlainSourceRecord(value)) {
    throw new Error("Source sentinel $signal listener must be an object");
  }
  assertAllowedSourceSentinelKeys(value, ["target", "methodName", "args"], "$signal listener");
  if (!isPlainSourceRecord(value.target)) {
    throw new Error("Source sentinel $signal listener.target must be a $component reference");
  }
  const internalTarget = options.allowInternalComponentRef ? normalizeInternalComponentRefRecord(value.target, options) : null;
  let target;
  if (internalTarget) {
    target = internalTarget;
  } else {
    assertAllowedSourceSentinelKeys(value.target, ["$component"], "$signal listener.target");
    if (!("$component" in value.target)) {
      throw new Error("Source sentinel $signal listener.target must be a $component reference");
    }
    target = {
      $component: normalizeSourceComponentRefValue(value.target.$component, options)
    };
  }
  if (typeof value.methodName !== "string" || value.methodName.length === 0) {
    throw new Error("Source sentinel $signal listener.methodName must be a non-empty string");
  }
  const args = value.args;
  let normalizedArgs;
  if (args !== void 0) {
    if (!Array.isArray(args)) {
      throw new Error("Source sentinel $signal listener.args must be an array");
    }
    normalizedArgs = args.map((item) => normalizeSourceValue(item, options, true) ?? null);
  }
  return {
    target,
    methodName: value.methodName,
    ...normalizedArgs === void 0 ? {} : { args: normalizedArgs }
  };
}
function normalizeSourceValue(value, options = {}, inArray = false) {
  if (value === void 0) {
    return inArray ? null : void 0;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error('Source numbers must be finite; use { $number: "Infinity" } for positive infinity');
  }
  if (isSourcePrimitive(value))
    return value;
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSourceValue(item, options, true) ?? null);
  }
  if (typeof value !== "object") {
    throw new Error(`Unsupported source value type: ${typeof value}`);
  }
  const record = value;
  const internalAssetRef = options.allowInternalAssetRef ? normalizeInternalAssetRefRecord(record, options) : null;
  if (internalAssetRef)
    return internalAssetRef;
  const internalComponentRef = options.allowInternalComponentRef ? normalizeInternalComponentRefRecord(record, options) : null;
  if (internalComponentRef)
    return internalComponentRef;
  if (typeof record.refId === "string") {
    throw new Error("Source value must use v2 $ref; legacy refId is not accepted");
  }
  const sentinelKeys = getSourceSentinelKeys(record);
  if (sentinelKeys.length > 1) {
    throw new Error(`Source sentinel object cannot mix ${sentinelKeys.join(", ")}`);
  }
  switch (sentinelKeys[0]) {
    case "$ref":
      return normalizeSourceAssetRefRecord(record);
    case "$entity":
      assertAllowedSourceSentinelKeys(record, ["$entity"]);
      return { $entity: normalizeSourceEntityId(record.$entity) };
    case "$component":
      assertAllowedSourceSentinelKeys(record, ["$component"]);
      return { $component: normalizeSourceComponentRefValue(record.$component, options) };
    case "$signal":
      assertAllowedSourceSentinelKeys(record, ["$signal"]);
      if (!Array.isArray(record.$signal)) {
        throw new Error("Source sentinel $signal must be an array");
      }
      return {
        $signal: record.$signal.map((item) => normalizeSourceSignalListener(item, options))
      };
    case "$class":
      assertAllowedSourceSentinelKeys(record, ["$class"]);
      if (typeof record.$class !== "string" || record.$class.length === 0) {
        throw new Error("Source sentinel $class must be a non-empty string");
      }
      return { $class: record.$class };
    case "$number":
      assertAllowedSourceSentinelKeys(record, ["$number"]);
      if (record.$number !== "Infinity") {
        throw new Error('Source sentinel $number must be exactly "Infinity"');
      }
      return { $number: "Infinity" };
    case "$type": {
      if (typeof record.$type !== "string" || record.$type.length === 0) {
        throw new Error("Source sentinel $type must be a non-empty string");
      }
      const result = { $type: record.$type };
      for (const [key, child] of Object.entries(record)) {
        if (key === "$type")
          continue;
        if (key === "$args" && !Array.isArray(child)) {
          throw new Error("Source sentinel $type.$args must be an array");
        }
        if (key.startsWith("$") && key !== "$args") {
          throw new Error(`Source value property "${key}" uses reserved "$" prefix`);
        }
        const normalized = normalizeSourceValue(child, options);
        if (normalized !== void 0) {
          result[key] = normalized;
        }
      }
      return result;
    }
  }
  return normalizeSourceValueRecord(record, options);
}
function normalizeSourceValueRecord(record, options = {}) {
  const result = {};
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("$")) {
      throw new Error(`Source value property "${key}" uses reserved "$" prefix`);
    }
    const normalized = normalizeSourceValue(value, options);
    if (normalized !== void 0) {
      result[key] = normalized;
    }
  }
  return result;
}
function normalizeInternalSourceValue(value, options = {}, inArray = false) {
  return normalizeSourceValue(
    value,
    {
      ...options,
      allowInternalAssetRef: true,
      allowInternalComponentRef: true,
      allowScalarEntityPath: true
    },
    inArray
  );
}
function convertInternalRefsToSourceValue(value, contextOrOptions) {
  const options = typeof contextOrOptions === "string" ? { context: contextOrOptions } : contextOrOptions ?? {};
  return normalizeInternalSourceValue(value, options) ?? null;
}

// packages/model/src/scene-file-v2/applyPrefabSourceOverrides.ts
function clonePrefabFile(prefabFile) {
  return structuredClone(prefabFile);
}
function findEntityIndex(prefabFile, entityId) {
  const index = prefabFile.entities.findIndex((entity) => entity.id === entityId);
  if (index < 0) {
    throw new Error(`Prefab source entity "${entityId}" not found`);
  }
  return index;
}
function findComponentIndex(prefabFile, componentId) {
  const index = prefabFile.components.findIndex((component) => component.id === componentId);
  if (index < 0) {
    throw new Error(`Prefab source component "${componentId}" not found`);
  }
  return index;
}
function setVector3(target, field, value) {
  if (!value)
    return;
  const fallback = field === "scale" ? [1, 1, 1] : [0, 0, 0];
  const existing = target[field] ?? fallback;
  target[field] = [value.x ?? existing[0], value.y ?? existing[1], value.z ?? existing[2]];
}
function hasEntityPropPatch(props) {
  return props.name !== void 0 || props.isActive !== void 0 || props.layer !== void 0 || props.isLocked !== void 0 || props.transform?.position !== void 0 || props.transform?.rotation !== void 0 || props.transform?.scale !== void 0;
}
function applyEntityPropPatch(target, props, omitSourceDefaults) {
  if (props.name !== void 0)
    target.name = props.name;
  if (props.isActive !== void 0) {
    if (omitSourceDefaults && props.isActive)
      delete target.isActive;
    else
      target.isActive = props.isActive;
  }
  if (props.layer !== void 0) {
    if (omitSourceDefaults && props.layer === 0)
      delete target.layer;
    else
      target.layer = props.layer;
  }
  if (props.isLocked !== void 0) {
    if (omitSourceDefaults && !props.isLocked)
      delete target.isLocked;
    else
      target.isLocked = props.isLocked;
  }
  setVector3(target, "position", props.transform?.position);
  setVector3(target, "rotation", props.transform?.rotation);
  setVector3(target, "scale", props.transform?.scale);
}
function removeShadowedInstanceRootProps(entity, props) {
  if (props.name !== void 0)
    delete entity.name;
  if (props.isActive !== void 0)
    delete entity.isActive;
  if (props.layer !== void 0)
    delete entity.layer;
  if (props.isLocked !== void 0)
    delete entity.isLocked;
  if (props.transform?.position !== void 0)
    delete entity.position;
  if (props.transform?.rotation !== void 0)
    delete entity.rotation;
  if (props.transform?.scale !== void 0)
    delete entity.scale;
}
function assertNoDuplicateSourceIds(kind, existingIds, inputIds) {
  const existing = new Set(existingIds);
  const seen = /* @__PURE__ */ new Set();
  for (const id of inputIds) {
    if (seen.has(id)) {
      throw new Error(`Prefab source ${kind} id "${id}" is duplicated in the added source tree`);
    }
    if (existing.has(id)) {
      throw new Error(`Prefab source ${kind} id "${id}" already exists`);
    }
    seen.add(id);
  }
}
function sourceEntityIds(prefabFile) {
  return prefabFile.entities.map((entity) => entity.id);
}
function sourceComponentIds(prefabFile) {
  return prefabFile.components.map((component) => component.id);
}
function normalizeAddedSourceEntities(input) {
  const localEntityIds = new Set(input.entityIds);
  const localComponentIds = new Set(input.componentIds);
  return input.entities.map((entity, entityIndex) => {
    const id = input.entityIds[entityIndex];
    const cloned = structuredClone(entity);
    cloned.id = id;
    if (cloned.children?.length) {
      cloned.children = cloned.children.map((childRef) => {
        const childId = typeof childRef === "number" ? input.entityIds[childRef] : childRef;
        if (!localEntityIds.has(childId)) {
          throw new Error(`Prefab added source entity "${id}" child "${String(childRef)}" is outside added entity tree`);
        }
        return childId;
      });
    }
    if (cloned.components?.length) {
      cloned.components = cloned.components.map((componentRef) => {
        const componentId = typeof componentRef === "number" ? input.componentIds[componentRef] : componentRef;
        if (!localComponentIds.has(componentId)) {
          throw new Error(
            `Prefab added source entity "${id}" component "${String(componentRef)}" is outside added component list`
          );
        }
        return componentId;
      });
    }
    return cloned;
  });
}
function normalizeAddedSourceComponents(input) {
  return input.components.map((component, componentIndex) => ({
    ...structuredClone(component),
    id: input.componentIds[componentIndex]
  }));
}
function collectSourceEntitySubtreeIds(prefabFile, rootEntityId) {
  const entityById = new Map(prefabFile.entities.map((entity) => [entity.id, entity]));
  const removed = /* @__PURE__ */ new Set();
  const visit = (entityId) => {
    if (removed.has(entityId))
      return;
    removed.add(entityId);
    const entity = entityById.get(entityId);
    for (const childId of entity?.children ?? []) {
      visit(childId);
    }
  };
  visit(rootEntityId);
  return removed;
}
function applyPrefabSourceEntityProps(prefabFile, sourceEntityId, props, options = {}) {
  if (!props)
    return clonePrefabFile(prefabFile);
  const next = clonePrefabFile(prefabFile);
  const entity = next.entities[findEntityIndex(next, sourceEntityId)];
  if (options.rootOverrideTarget !== void 0) {
    if (!entity.instance) {
      throw new Error(`Prefab source entity "${sourceEntityId}" is not an instance entity`);
    }
    if (!hasEntityPropPatch(props))
      return next;
    const overrides = entity.instance.overrides ??= {};
    const entityProps = [...overrides.entityProps ?? []];
    const existingIndex = entityProps.findIndex((override) => override.target === options.rootOverrideTarget);
    const rootOverride = existingIndex >= 0 ? { ...entityProps[existingIndex] } : { target: options.rootOverrideTarget };
    applyEntityPropPatch(rootOverride, props, false);
    if (existingIndex >= 0)
      entityProps[existingIndex] = rootOverride;
    else
      entityProps.unshift(rootOverride);
    overrides.entityProps = entityProps;
    removeShadowedInstanceRootProps(entity, props);
    return next;
  }
  applyEntityPropPatch(entity, props, true);
  return next;
}
function applyPrefabSourceComponentMutation(prefabFile, sourceComponentId, mutation) {
  const next = clonePrefabFile(prefabFile);
  const component = next.components[findComponentIndex(next, sourceComponentId)];
  if (mutation.props && Object.keys(mutation.props).length) {
    component.props = mergeSourceValueRecords(component.props ?? {}, mutation.props);
  }
  if (mutation.calls?.length) {
    component.calls = [...component.calls ?? [], ...structuredClone(mutation.calls)];
  }
  return next;
}
function addPrefabSourceEntityTree(prefabFile, input) {
  if (input.entities.length === 0 || input.entities.length !== input.entityIds.length) {
    throw new Error("Prefab added entity tree must include matching entities and entityIds");
  }
  if (input.components.length !== input.componentIds.length) {
    throw new Error("Prefab added entity tree must include matching components and componentIds");
  }
  assertNoDuplicateSourceIds("entity", sourceEntityIds(prefabFile), input.entityIds);
  assertNoDuplicateSourceIds("component", sourceComponentIds(prefabFile), input.componentIds);
  const next = clonePrefabFile(prefabFile);
  const parent = next.entities[findEntityIndex(next, input.parentSourceEntityId)];
  const appendedEntities = normalizeAddedSourceEntities(input);
  const appendedComponents = normalizeAddedSourceComponents(input);
  const rootEntityId = input.entityIds[0];
  next.entities.push(...appendedEntities);
  next.components.push(...appendedComponents);
  const children = [...parent.children ?? []];
  const targetIndex = Math.min(Math.max(input.index, 0), children.length);
  children.splice(targetIndex, 0, rootEntityId);
  parent.children = children;
  return next;
}
function removePrefabSourceEntityTree(prefabFile, sourceEntityId) {
  if (prefabFile.root === sourceEntityId) {
    throw new Error("Cannot remove prefab root entity from source");
  }
  findEntityIndex(prefabFile, sourceEntityId);
  const entityIdsToRemove = collectSourceEntitySubtreeIds(prefabFile, sourceEntityId);
  const componentIdsToRemove = /* @__PURE__ */ new Set();
  for (const entity of prefabFile.entities) {
    if (!entityIdsToRemove.has(entity.id))
      continue;
    for (const componentId of entity.components ?? []) {
      componentIdsToRemove.add(componentId);
    }
  }
  const next = clonePrefabFile(prefabFile);
  next.entities = next.entities.filter((entity) => !entityIdsToRemove.has(entity.id)).map((entity) => {
    const cloned = structuredClone(entity);
    const children = (cloned.children ?? []).filter((childId) => !entityIdsToRemove.has(childId));
    const components = (cloned.components ?? []).filter((componentId) => !componentIdsToRemove.has(componentId));
    if (children.length)
      cloned.children = children;
    else
      delete cloned.children;
    if (components.length)
      cloned.components = components;
    else
      delete cloned.components;
    return cloned;
  });
  next.components = next.components.filter((component) => !componentIdsToRemove.has(component.id));
  return next;
}
function addPrefabSourceComponent(prefabFile, sourceEntityId, sourceComponentId, component) {
  if (sourceComponentIds(prefabFile).includes(sourceComponentId)) {
    throw new Error(`Prefab source component id "${sourceComponentId}" already exists`);
  }
  const next = clonePrefabFile(prefabFile);
  const entity = next.entities[findEntityIndex(next, sourceEntityId)];
  next.components.push({ ...structuredClone(component), id: sourceComponentId });
  entity.components = [...entity.components ?? [], sourceComponentId];
  return next;
}
function removePrefabSourceComponent(prefabFile, sourceComponentId) {
  findComponentIndex(prefabFile, sourceComponentId);
  const next = clonePrefabFile(prefabFile);
  next.components = next.components.filter((component) => component.id !== sourceComponentId);
  next.entities = next.entities.map((entity) => {
    const cloned = structuredClone(entity);
    const components = (cloned.components ?? []).filter((componentId) => componentId !== sourceComponentId);
    if (components.length)
      cloned.components = components;
    else
      delete cloned.components;
    return cloned;
  });
  return next;
}

// packages/model/src/modules/scene/sceneSettingDefinitions.ts
var SCENE_SETTING_DEFINITIONS = {
  ambient: {
    ambientLight: { sceneKey: "ambientLight", valueKind: "assetRef", runtimeTarget: null },
    customAmbientLight: { sceneKey: "customAmbientLight", valueKind: "assetRef", runtimeTarget: null },
    diffuseMode: {
      sceneKey: "diffuseMode",
      sourceValueType: "number",
      runtimeTarget: { scope: "ambientLight", key: "diffuseMode", valueKind: "direct" }
    },
    diffuseSolidColor: {
      sceneKey: "diffuseSolidColor",
      sourceValueType: "color",
      runtimeTarget: { scope: "ambientLight", key: "diffuseSolidColor", valueKind: "structured" }
    },
    diffuseIntensity: {
      sceneKey: "diffuseIntensity",
      sourceValueType: "number",
      runtimeTarget: { scope: "ambientLight", key: "diffuseIntensity", valueKind: "direct" }
    },
    specularMode: {
      sceneKey: "specularMode",
      sourceValueType: "number",
      editorValueAliases: { Sky: 0, Custom: 1 },
      runtimeTarget: { scope: "ambientLight", key: "specularMode", valueKind: "direct" }
    },
    customSpecularTexture: { sceneKey: "customSpecularTexture", valueKind: "assetRef", runtimeTarget: null },
    specularIntensity: {
      sceneKey: "specularIntensity",
      sourceValueType: "number",
      runtimeTarget: { scope: "ambientLight", key: "specularIntensity", valueKind: "direct" }
    },
    bakerResolution: { sceneKey: "bakerResolution", sourceValueType: "number", runtimeTarget: null }
  },
  background: {
    mode: {
      sceneKey: "backgroundMode",
      sourceValueType: "number",
      runtimeTarget: { scope: "background", key: "mode", valueKind: "direct" }
    },
    color: {
      sceneKey: "backgroundColor",
      sourceValueType: "color",
      runtimeTarget: { scope: "background", key: "solidColor", valueKind: "structured" }
    },
    texture: {
      sceneKey: "backgroundTexture",
      runtimeTarget: { scope: "background", key: "texture", valueKind: "assetRef" }
    },
    textureFillMode: {
      sceneKey: "textureFillMode",
      sourceValueType: "number",
      runtimeTarget: { scope: "background", key: "textureFillMode", valueKind: "direct" }
    },
    skyMaterial: {
      sceneKey: "skyMaterial",
      runtimeTarget: { scope: "background.sky", key: "material", valueKind: "assetRef" }
    },
    skyMesh: {
      sceneKey: "skyMesh",
      runtimeTarget: { scope: "background.sky", key: "mesh", valueKind: "assetRef" }
    }
  },
  shadow: {
    castShadows: {
      sceneKey: "castShadows",
      sourceValueType: "boolean",
      runtimeTarget: { scope: "scene", key: "castShadows", valueKind: "direct" }
    },
    enableTransparentShadow: {
      sceneKey: "enableTransparentShadow",
      sourceValueType: "boolean",
      runtimeTarget: { scope: "scene", key: "enableTransparentShadow", valueKind: "direct" }
    },
    shadowResolution: {
      sceneKey: "shadowResolution",
      sourceValueType: "number",
      runtimeTarget: { scope: "scene", key: "shadowResolution", valueKind: "direct" }
    },
    shadowCascades: {
      sceneKey: "shadowCascades",
      sourceValueType: "number",
      runtimeTarget: { scope: "scene", key: "shadowCascades", valueKind: "direct" }
    },
    shadowTwoCascadeSplits: {
      sceneKey: "shadowTwoCascadeSplits",
      sourceValueType: "number",
      runtimeTarget: { scope: "scene", key: "shadowTwoCascadeSplits", valueKind: "direct" }
    },
    shadowFourCascadeSplits: {
      sceneKey: "shadowFourCascadeSplits",
      sourceValueType: "vector3",
      runtimeTarget: { scope: "scene", key: "shadowFourCascadeSplits", valueKind: "structured" }
    },
    shadowDistance: {
      sceneKey: "shadowDistance",
      sourceValueType: "number",
      runtimeTarget: { scope: "scene", key: "shadowDistance", valueKind: "direct" }
    },
    shadowFadeBorder: {
      sceneKey: "shadowFadeBorder",
      sourceValueType: "number",
      runtimeTarget: { scope: "scene", key: "shadowFadeBorder", valueKind: "direct" }
    }
  },
  fog: {
    mode: {
      sceneKey: "fogMode",
      sourceValueType: "number",
      runtimeTarget: { scope: "scene", key: "fogMode", valueKind: "direct" }
    },
    color: {
      sceneKey: "fogColor",
      sourceValueType: "color",
      runtimeTarget: { scope: "scene", key: "fogColor", valueKind: "structured" }
    },
    start: {
      sceneKey: "fogStart",
      sourceValueType: "number",
      runtimeTarget: { scope: "scene", key: "fogStart", valueKind: "direct" }
    },
    end: {
      sceneKey: "fogEnd",
      sourceValueType: "number",
      runtimeTarget: { scope: "scene", key: "fogEnd", valueKind: "direct" }
    },
    density: {
      sceneKey: "fogDensity",
      sourceValueType: "number",
      runtimeTarget: { scope: "scene", key: "fogDensity", valueKind: "direct" }
    }
  },
  ambientOcclusion: {
    enabled: {
      sceneKey: "enabledAmbientOcclusion",
      sourceValueType: "boolean",
      runtimeTarget: { scope: "ambientOcclusion", key: "enabled", valueKind: "direct" }
    },
    quality: {
      sceneKey: "quality",
      sourceValueType: "number",
      runtimeTarget: { scope: "ambientOcclusion", key: "quality", valueKind: "direct" }
    },
    intensity: {
      sceneKey: "intensity",
      sourceValueType: "number",
      runtimeTarget: { scope: "ambientOcclusion", key: "intensity", valueKind: "direct" }
    },
    power: {
      sceneKey: "power",
      sourceValueType: "number",
      runtimeTarget: { scope: "ambientOcclusion", key: "power", valueKind: "direct" }
    },
    radius: {
      sceneKey: "radius",
      sourceValueType: "number",
      runtimeTarget: { scope: "ambientOcclusion", key: "radius", valueKind: "direct" }
    },
    bilateralThreshold: {
      sceneKey: "bilateralThreshold",
      sourceValueType: "number",
      runtimeTarget: { scope: "ambientOcclusion", key: "bilateralThreshold", valueKind: "direct" }
    },
    bias: {
      sceneKey: "bias",
      sourceValueType: "number",
      runtimeTarget: { scope: "ambientOcclusion", key: "bias", valueKind: "direct" }
    },
    minHorizonAngle: {
      sceneKey: "minHorizonAngle",
      sourceValueType: "number",
      runtimeTarget: { scope: "ambientOcclusion", key: "minHorizonAngle", valueKind: "direct" }
    }
  }
};
var TOP_LEVEL_SCENE_SETTING_DEFINITIONS = {
  autoBake: { sceneKey: "autoBake", sourceValueType: "boolean", runtimeTarget: null }
};

// packages/model/src/modules/scene/sceneSettingValueNormalization.ts
function normalizeNumber(value, label) {
  if (value === null || value === void 0)
    return value;
  if (typeof value === "number" && Number.isFinite(value))
    return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue))
      return numericValue;
  }
  throw new Error(`${label} must be a number`);
}
function normalizeBoolean(value, label) {
  if (value === null || value === void 0)
    return value;
  if (typeof value === "boolean")
    return value;
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  throw new Error(`${label} must be a boolean`);
}
function readNumericRecordValue(record, key, label) {
  return normalizeNumber(record[key], `${label}.${key}`);
}
function normalizeColor(value, label) {
  if (value === null || value === void 0)
    return value;
  let result;
  if (Array.isArray(value)) {
    result = {
      r: value[0],
      g: value[1],
      b: value[2],
      a: value[3]
    };
  } else if (typeof value === "object") {
    const record = value;
    if ("r" in record || "g" in record || "b" in record || "a" in record) {
      result = {
        r: record.r,
        g: record.g,
        b: record.b,
        a: record.a
      };
    } else if ("_r" in record || "_g" in record || "_b" in record || "_a" in record) {
      result = {
        r: record._r,
        g: record._g,
        b: record._b,
        a: record._a
      };
    } else {
      result = {
        r: record.x,
        g: record.y,
        b: record.z,
        a: record.w
      };
    }
    if (record._metaSourceColor !== void 0) {
      if (!record._metaSourceColor || typeof record._metaSourceColor !== "object" || Array.isArray(record._metaSourceColor)) {
        throw new Error(`${label}._metaSourceColor must be an RGB color`);
      }
      const original = record._metaSourceColor;
      result._metaSourceColor = Object.fromEntries(
        ["r", "g", "b"].map((channel) => [
          channel,
          readNumericRecordValue(original, channel, `${label}._metaSourceColor`)
        ])
      );
    }
    if (record._metaIntensity !== void 0) {
      result._metaIntensity = normalizeNumber(record._metaIntensity, `${label}._metaIntensity`);
    }
  } else {
    throw new Error(`${label} must be a color`);
  }
  return {
    r: readNumericRecordValue(result, "r", label),
    g: readNumericRecordValue(result, "g", label),
    b: readNumericRecordValue(result, "b", label),
    a: readNumericRecordValue(result, "a", label),
    ...result._metaIntensity !== void 0 ? { _metaIntensity: result._metaIntensity } : {},
    ...result._metaSourceColor !== void 0 ? { _metaSourceColor: result._metaSourceColor } : {}
  };
}
function normalizeVector3(value, label) {
  if (value === null || value === void 0)
    return value;
  let result;
  if (Array.isArray(value)) {
    result = {
      x: value[0],
      y: value[1],
      z: value[2]
    };
  } else if (typeof value === "object") {
    const record = value;
    if ("x" in record || "y" in record || "z" in record) {
      result = {
        x: record.x,
        y: record.y,
        z: record.z
      };
    } else {
      result = {
        x: record._x,
        y: record._y,
        z: record._z
      };
    }
  } else {
    throw new Error(`${label} must be a vector3`);
  }
  return [
    readNumericRecordValue(result, "x", label),
    readNumericRecordValue(result, "y", label),
    readNumericRecordValue(result, "z", label)
  ];
}
function normalizeSceneSettingValue(definition, value, label) {
  switch (definition.sourceValueType) {
    case "number":
      return normalizeNumber(value, label);
    case "boolean":
      return normalizeBoolean(value, label);
    case "color":
      return normalizeColor(value, label);
    case "vector3":
      return normalizeVector3(value, label);
    default:
      return value;
  }
}

// packages/model/src/modules/scene/sceneSettingRefs.ts
function isPlainObject(value) {
  if (Object.prototype.toString.call(value) !== "[object Object]")
    return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function isAssetRefSetting(definition) {
  return (definition.valueKind ?? definition.runtimeTarget?.valueKind) === "assetRef";
}
function sourceAssetRefSettingAllowsNull(category, property) {
  return category === "ambient" && (property === "ambientLight" || property === "customAmbientLight");
}
function assertNoExtraKeys(record, allowedKeys, label) {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`${label} cannot include extra key "${key}"`);
    }
  }
}
function editorAssetRefToSourceRef(value) {
  if (value === null || value === void 0)
    return value;
  if (!isPlainObject(value) || typeof value.refId !== "string") {
    throw new Error("Editor scene setting asset ref must use internal refId");
  }
  assertNoExtraKeys(value, ["refId", "key"], "Editor scene setting asset ref");
  if (value.key !== void 0 && typeof value.key !== "string") {
    throw new Error("Editor scene setting asset ref key must be a string");
  }
  assertSourceAssetRef(value.refId, " in scene setting");
  return {
    $ref: value.refId,
    ...typeof value.key === "string" ? { key: value.key } : {}
  };
}
function editorAssetRefToSourceRefWithValidation(value, validateAssetRef) {
  const result = editorAssetRefToSourceRef(value);
  if (isPlainObject(result) && typeof result.$ref === "string") {
    validateAssetRef?.(result.$ref, " in scene setting");
  }
  return result;
}
function mapSceneSettingAssetRefs(settings, convert) {
  const result = { ...settings };
  for (const [category, definitions] of Object.entries(SCENE_SETTING_DEFINITIONS)) {
    const categorySettings = settings[category];
    if (!isPlainObject(categorySettings))
      continue;
    let nextCategory;
    for (const [property, definition] of Object.entries(definitions)) {
      if (!(property in categorySettings))
        continue;
      nextCategory ??= { ...categorySettings };
      const label = `scene.${category}.${property}`;
      const normalizedValue = normalizeSceneSettingValue(definition, categorySettings[property], label);
      const nextValue = isAssetRefSetting(definition) ? convert(normalizedValue, { category, property, definition }) : normalizedValue;
      if (nextValue === void 0) {
        delete nextCategory[property];
      } else {
        nextCategory[property] = nextValue;
      }
    }
    if (nextCategory) {
      result[category] = nextCategory;
    }
  }
  for (const [property, definition] of Object.entries(TOP_LEVEL_SCENE_SETTING_DEFINITIONS)) {
    if (!(property in settings))
      continue;
    result[property] = normalizeSceneSettingValue(definition, settings[property], `scene.${property}`);
  }
  return result;
}
function editorSceneSettingsToSourceSettings(settings, options = {}) {
  return mapSceneSettingAssetRefs(settings, (value, { category, property }) => {
    if (value === null && !sourceAssetRefSettingAllowsNull(category, property))
      return void 0;
    return editorAssetRefToSourceRefWithValidation(value, options.validateAssetRef);
  });
}

// packages/model/src/scene-file-v2/source-file-error.ts
var SourceFileValidationError = class extends Error {
  name = "SourceFileValidationError";
};

// packages/model/src/domain/prefabOverrideSemantics.ts
function splitEntityOverrideProps(override, isInstanceRoot) {
  if (!override)
    return { placement: void 0, modification: void 0 };
  if (!isInstanceRoot)
    return { placement: void 0, modification: override };
  const { transform, ...modification } = override;
  return {
    placement: transform === void 0 ? void 0 : { transform },
    modification: Object.keys(modification).length > 0 ? modification : void 0
  };
}

// packages/model/src/domain/instanceOwnership.ts
function resolveSourceEntityIdForBinding(state, binding, entityId) {
  const entity = state.entities[entityId];
  const fallbackSourceEntityId = entity?.instance?.bindingId === binding.id ? entity.instance.sourceEntityId : void 0;
  return getSourceEntityIdForPrefabScene(binding, entityId, fallbackSourceEntityId);
}
function resolveEntityInstanceOwnership(state, entityId) {
  const entity = state.entities[entityId];
  const primaryBinding = entity?.instance?.bindingId ? state.prefab.bindings[entity.instance.bindingId] ?? null : null;
  const candidates = [];
  const instanceRootBindings = [];
  for (const binding of Object.values(state.prefab.bindings)) {
    if (binding.assetKind !== "Prefab" && binding.assetKind !== "glTF")
      continue;
    if (binding.instanceRootEntityId === entityId) {
      instanceRootBindings.push(binding);
    }
    const sourceEntityId = resolveSourceEntityIdForBinding(state, binding, entityId);
    if (sourceEntityId) {
      candidates.push({ binding, sourceEntityId });
    }
  }
  const gltfInstanceRootBinding = instanceRootBindings.find((binding) => binding.assetKind === "glTF") ?? null;
  const effectiveCandidate = candidates.find((candidate) => candidate.binding.assetKind === "glTF") ?? (primaryBinding ? candidates.find((candidate) => candidate.binding.id === primaryBinding.id) : void 0) ?? candidates[0];
  const effectiveBinding = effectiveCandidate?.binding ?? primaryBinding;
  const effectiveSourceEntityId = effectiveCandidate?.sourceEntityId ?? (effectiveBinding ? resolveSourceEntityIdForBinding(state, effectiveBinding, entityId) : null);
  return {
    primaryBinding,
    effectiveBinding: effectiveBinding ?? null,
    effectiveSourceEntityId: effectiveSourceEntityId ?? null,
    effectiveAssetKind: effectiveBinding?.assetKind ?? null,
    instanceRootBindings,
    gltfInstanceRootBinding
  };
}
function isAncestorOrSelf(state, ancestorId, entityId) {
  const visited = /* @__PURE__ */ new Set();
  let currentId = entityId;
  while (currentId && !visited.has(currentId)) {
    if (currentId === ancestorId)
      return true;
    visited.add(currentId);
    currentId = state.entities[currentId]?.parentId ?? null;
  }
  return false;
}
function getHierarchyDepth(state, entityId) {
  const visited = /* @__PURE__ */ new Set();
  let depth = 0;
  let currentId = entityId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const parentId = state.entities[currentId]?.parentId ?? null;
    if (!parentId)
      break;
    depth += 1;
    currentId = parentId;
  }
  return depth;
}
function resolveContainingPrefabBindingForInstance(state, instanceBinding) {
  let best = null;
  const addedOnlyOwnerIds = [];
  for (const binding of Object.values(state.prefab.bindings)) {
    if (binding.id === instanceBinding.id || binding.assetKind !== "Prefab")
      continue;
    const sourceEntityId = getSourceEntityIdForPrefabScene(binding, instanceBinding.instanceRootEntityId);
    const ownsInstanceRootAsAdded = Boolean(binding.overrides.addedEntities[instanceBinding.instanceRootEntityId]);
    if (!sourceEntityId && !ownsInstanceRootAsAdded)
      continue;
    const isHierarchyOwner = isAncestorOrSelf(state, binding.instanceRootEntityId, instanceBinding.instanceRootEntityId);
    const depth = isHierarchyOwner ? getHierarchyDepth(state, binding.instanceRootEntityId) : -1;
    if (ownsInstanceRootAsAdded && !sourceEntityId && !isHierarchyOwner) {
      addedOnlyOwnerIds.push(binding.id);
    }
    if (best && best.depth >= depth)
      continue;
    best = {
      binding,
      sourceEntityId,
      ownsInstanceRootAsAdded,
      depth
    };
  }
  if (best?.depth === -1 && addedOnlyOwnerIds.length > 1) {
    throw new Error(
      `Ambiguous containing Prefab bindings for instance root "${instanceBinding.instanceRootEntityId}": ${addedOnlyOwnerIds.join(
        ", "
      )}`
    );
  }
  return best;
}
function resolveContainingPrefabOverrideParent(state, parentId, instanceBinding, parentSourceEntityId) {
  const containing = resolveContainingPrefabBindingForInstance(state, instanceBinding);
  if (!containing)
    return null;
  return {
    bindingId: containing.binding.id,
    parentSourceEntityId: parentId === instanceBinding.instanceRootEntityId && containing.sourceEntityId ? containing.sourceEntityId : parentSourceEntityId,
    assetKind: "Prefab",
    parentInstanceAssetKind: instanceBinding.assetKind
  };
}
function resolveInstanceRootPropsOwner(state, entityId) {
  const entity = state.entities[entityId];
  const binding = entity?.instance?.bindingId ? state.prefab.bindings[entity.instance.bindingId] ?? null : null;
  if (!entity || !binding)
    return null;
  const sourceEntityId = resolveSourceEntityIdForBinding(state, binding, entityId);
  if (!sourceEntityId)
    return null;
  if (binding.instanceRootEntityId === entityId) {
    const containing = resolveContainingPrefabBindingForInstance(state, binding);
    if (containing?.sourceEntityId) {
      return { binding: containing.binding, sourceEntityId: containing.sourceEntityId };
    }
  }
  return { binding, sourceEntityId };
}
function resolveInstanceOverrideParent(state, parentId) {
  if (!parentId)
    return null;
  const ownership = resolveEntityInstanceOwnership(state, parentId);
  const binding = ownership.effectiveBinding;
  if (!binding)
    return null;
  if (binding.assetKind !== "Prefab" && binding.assetKind !== "glTF")
    return null;
  const parentSourceEntityId = ownership.effectiveSourceEntityId;
  if (!parentSourceEntityId)
    return null;
  if (binding.assetKind === "glTF") {
    const containingPrefabTarget = resolveContainingPrefabOverrideParent(state, parentId, binding, parentSourceEntityId);
    if (containingPrefabTarget)
      return containingPrefabTarget;
  }
  return {
    bindingId: binding.id,
    parentSourceEntityId,
    assetKind: binding.assetKind,
    parentInstanceAssetKind: binding.assetKind
  };
}
function isMappedAsSourceContent(state, entityId) {
  for (const binding of Object.values(state.prefab.bindings)) {
    if (binding.instanceRootEntityId !== entityId && getSourceEntityIdForPrefabScene(binding, entityId))
      return true;
  }
  return false;
}
function resolveRequiredInstanceClaim(state, parentId, entity) {
  if (!parentId || !state.entities[parentId]?.instance)
    return null;
  if (entity.instance?.role === "linked")
    return null;
  if (entity.id && isMappedAsSourceContent(state, entity.id))
    return null;
  return resolveInstanceOverrideParent(state, parentId);
}
function isInstanceRootEntity(state, entityId) {
  return resolveEntityInstanceOwnership(state, entityId).instanceRootBindings.length > 0;
}

// packages/model/src/domain/normalizedDomainQueries.ts
function getNormalizedComponent(normalizedState, entityId, componentId) {
  if (normalizedState.relations.componentOwner[componentId] !== entityId)
    return void 0;
  return normalizedState.components[componentId];
}
function getSceneEntityIdForPrefabSource(binding, sourceEntityId) {
  return binding.sourceToSceneEntity?.[sourceEntityId] ?? binding.sourceEntitySnapshots?.[sourceEntityId]?.sceneEntityId ?? (sourceEntityId === binding.sourceRootEntityId ? binding.instanceRootEntityId : null);
}
function getSceneEntityIdsForPrefabBinding(binding) {
  const ids = [
    binding.instanceRootEntityId,
    ...Object.values(binding.sourceToSceneEntity ?? {}),
    ...Object.values(binding.sourceEntitySnapshots ?? {}).map((snapshot) => snapshot.sceneEntityId)
  ];
  return Array.from(new Set(ids.filter((id) => !!id)));
}
function getSourceEntityIdForPrefabScene(binding, entityId, fallbackSourceEntityId) {
  const removedEntities = binding.overrides?.removedEntities ?? {};
  for (const sourceEntityId in binding.sourceToSceneEntity ?? {}) {
    if (!removedEntities[sourceEntityId] && binding.sourceToSceneEntity[sourceEntityId] === entityId) {
      return sourceEntityId;
    }
  }
  for (const [sourceEntityId, snapshot] of Object.entries(binding.sourceEntitySnapshots ?? {})) {
    if (!removedEntities[sourceEntityId] && snapshot.sceneEntityId === entityId) {
      return sourceEntityId;
    }
  }
  const fallback = fallbackSourceEntityId ?? (entityId === binding.instanceRootEntityId ? binding.sourceRootEntityId : null);
  return fallback && !removedEntities[fallback] ? fallback : null;
}

// packages/model/src/scene-file-v2/nested-instance-address.ts
function readNestedOverridesSidecar(sceneFile) {
  return sceneFile.prefab?.nestedOverrides ?? [];
}
function getContainingSourceInstance(prefab, binding) {
  const owners = Object.values(prefab.bindings).flatMap(
    (candidate) => candidate.id === binding.id ? [] : Object.entries(candidate.sourceEntitySnapshots ?? {}).filter(
      ([, snapshot]) => snapshot.instanceAssetKind && snapshot.sceneEntityId === binding.instanceRootEntityId
    ).map(([sourceId]) => ({ binding: candidate, sourceId }))
  );
  if (owners.length > 1)
    throw new Error(`Ambiguous nested instance ownership: ${binding.instanceRootEntityId}`);
  return owners[0];
}
function getNestedInstanceAddress(prefab, binding, sceneInstanceIds) {
  const path = [];
  const visited = /* @__PURE__ */ new Set();
  let current = binding;
  while (!sceneInstanceIds.has(current.instanceRootEntityId)) {
    if (visited.has(current.id))
      throw new Error(`Cyclic nested instance ownership: ${current.id}`);
    visited.add(current.id);
    const owner = getContainingSourceInstance(prefab, current);
    if (!owner)
      return void 0;
    path.unshift(owner.sourceId);
    current = owner.binding;
  }
  return { rootSceneEntityId: current.instanceRootEntityId, sourceEntityPath: path };
}
function isRemovedSourceEntity(binding, sourceEntityId) {
  if (binding.overrides.removedEntities?.[sourceEntityId])
    return true;
  let parentSourceEntityId = binding.sourceEntitySnapshots?.[sourceEntityId]?.parentSourceEntityId;
  while (parentSourceEntityId) {
    if (binding.overrides.removedEntities?.[parentSourceEntityId])
      return true;
    parentSourceEntityId = binding.sourceEntitySnapshots?.[parentSourceEntityId]?.parentSourceEntityId ?? null;
  }
  return false;
}
function resolveNestedInstanceAddress(prefab, address) {
  const bindings = Object.values(prefab.bindings);
  let current = bindings.find((binding) => binding.instanceRootEntityId === address.rootSceneEntityId);
  if (!current)
    return { status: "unavailable" };
  const chain = [current];
  for (const sourceId of address.sourceEntityPath) {
    const snapshot = current.sourceEntitySnapshots?.[sourceId];
    if (isRemovedSourceEntity(current, sourceId) || !snapshot)
      return { status: "removed" };
    if (snapshot.unresolvedSource)
      return { status: "unavailable" };
    const rootId = getSceneEntityIdForPrefabSource(current, sourceId);
    const parentId = current.id;
    current = bindings.find((binding) => binding.instanceRootEntityId === rootId && binding.id !== parentId);
    if (!current)
      return { status: "unavailable" };
    chain.push(current);
  }
  return { status: "resolved", chain };
}

// packages/model/src/scene-file-v2/source-instance-boundary.ts
function isSourceInstanceBoundary(sourceEntity) {
  return Boolean(sourceEntity?.instance?.asset?.$ref);
}
function collectReachableSourceEntityIds(entities, rootEntityIds) {
  const entityById = /* @__PURE__ */ new Map();
  for (const entity of entities) {
    entityById.set(entity.id, entity);
  }
  const result = [];
  const visited = /* @__PURE__ */ new Set();
  const visit = (id) => {
    if (visited.has(id))
      return;
    visited.add(id);
    result.push(id);
    const entity = entityById.get(id);
    if (isSourceInstanceBoundary(entity))
      return;
    for (const childId of entity?.children ?? []) {
      visit(childId);
    }
  };
  for (const rootId of rootEntityIds) {
    visit(rootId);
  }
  return result;
}

// packages/model/src/modules/entity/virtualTransform.ts
var VIRTUAL_TRANSFORM_COMPONENT_SUFFIX = ":Transform";
function createVirtualTransformComponentId(entityId) {
  return `${entityId}${VIRTUAL_TRANSFORM_COMPONENT_SUFFIX}`;
}
function findTransformSlotComponent(components) {
  return components.find((component) => component.type === "UITransform") ?? components.find((component) => component.type === "Transform");
}

// packages/model/src/scene-file-v2/source-id-index.ts
function isSceneFile(file) {
  return "scene" in file;
}
function sourceFileKind(file) {
  return isSceneFile(file) ? "scene" : "prefab";
}
function requireSourceId(value, path, kind) {
  if (typeof value !== "string" || value.length === 0) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be a non-empty string id`);
  }
  return value;
}
function addUniqueId(map, id, value, duplicateLabel, kind) {
  if (map.has(id)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: duplicate ${duplicateLabel} id "${id}"`);
  }
  map.set(id, value);
}
function getSourceRootEntityIds(file) {
  return isSceneFile(file) ? [...file.scene.rootEntities] : [requireSourceId(file.root, "root", "prefab")];
}
function buildSourceIdIndex(file, options = {}) {
  const instanceComponentIds = /* @__PURE__ */ new Set();
  if (options.includeInstanceAdditions || options.includeNestedInstanceAdditions) {
    const entities = [...file.entities];
    const components = [...file.components];
    const visitInstance = (instance) => {
      for (const added of instance.overrides?.addedEntities ?? [])
        visitEntity(added.id, added.entity);
      for (const added of instance.overrides?.addedComponents ?? []) {
        components.push({ ...added.component, id: added.id });
        instanceComponentIds.add(added.id);
      }
    };
    const visitEntity = (id, entity) => {
      const { components: inlineComponents, children, ...props } = entity;
      entities.push({
        ...props,
        id,
        components: inlineComponents?.map((component) => component.id),
        children: children?.map((child) => child.id)
      });
      components.push(...inlineComponents ?? []);
      if (entity.instance)
        visitInstance(entity.instance);
      for (const child of children ?? [])
        visitEntity(child.id, child);
    };
    for (const entity of file.entities)
      if (entity.instance)
        visitInstance(entity.instance);
    if (options.includeNestedInstanceAdditions && isSceneFile(file)) {
      for (const entry of readNestedOverridesSidecar(file)) {
        for (const added of entry.addedEntities ?? [])
          visitEntity(added.id, added.entity);
        for (const bucket of Object.values(entry.overrides.addedComponents ?? {})) {
          for (const added of Object.values(bucket)) {
            components.push({ id: added.componentId, type: added.type });
            instanceComponentIds.add(added.componentId);
          }
        }
      }
    }
    file = { ...file, entities, components };
  }
  const kind = sourceFileKind(file);
  const entityById = /* @__PURE__ */ new Map();
  const componentById = /* @__PURE__ */ new Map();
  const entityIndexById = /* @__PURE__ */ new Map();
  const componentIndexById = /* @__PURE__ */ new Map();
  const componentOwnerEntityIdById = /* @__PURE__ */ new Map();
  const entityReferenceTargetById = /* @__PURE__ */ new Map();
  const componentReferenceTargetById = /* @__PURE__ */ new Map();
  const componentOverrideTargetById = /* @__PURE__ */ new Map();
  const entityPathById = /* @__PURE__ */ new Map();
  file.entities.forEach((entity, index) => {
    const id = requireSourceId(entity.id, `entities[${index}].id`, kind);
    addUniqueId(entityById, id, entity, "entity", kind);
    entityIndexById.set(id, index);
    entityReferenceTargetById.set(id, [index]);
  });
  file.components.forEach((component, index) => {
    const id = requireSourceId(component.id, `components[${index}].id`, kind);
    addUniqueId(componentById, id, component, "component", kind);
    componentIndexById.set(id, index);
  });
  const rootEntityIds = getSourceRootEntityIds(file);
  rootEntityIds.forEach((rootId, index) => {
    requireSourceId(rootId, isSceneFile(file) ? `scene.rootEntities[${index}]` : "root", kind);
    if (!entityById.has(rootId)) {
      throw new SourceFileValidationError(`Invalid source v2 ${kind} file: root entity id "${rootId}" does not exist`);
    }
  });
  file.entities.forEach((entity, entityIndex) => {
    const entityId = requireSourceId(entity.id, `entities[${entityIndex}].id`, kind);
    if (isSourceInstanceBoundary(entity))
      return;
    entity.children?.forEach((childId, childIndex) => {
      requireSourceId(childId, `entity "${entityId}".children[${childIndex}]`, kind);
      if (!entityById.has(childId)) {
        throw new SourceFileValidationError(
          `Invalid source v2 ${kind} file: entity "${entityId}".children[${childIndex}] references missing entity "${childId}"`
        );
      }
    });
    entity.components?.forEach((componentId, componentOffset) => {
      requireSourceId(componentId, `entity "${entityId}".components[${componentOffset}]`, kind);
      if (!componentById.has(componentId)) {
        throw new SourceFileValidationError(
          `Invalid source v2 ${kind} file: entity "${entityId}".components[${componentOffset}] references missing component "${componentId}"`
        );
      }
      const existingOwner = componentOwnerEntityIdById.get(componentId);
      if (existingOwner !== void 0) {
        throw new SourceFileValidationError(
          `Invalid source v2 ${kind} file: component "${componentId}" has multiple owners ("${existingOwner}", "${entityId}")`
        );
      }
      componentOwnerEntityIdById.set(componentId, entityId);
    });
  });
  for (const componentId of componentById.keys()) {
    if (!componentOwnerEntityIdById.has(componentId) && !instanceComponentIds.has(componentId)) {
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: component "${componentId}" has no owner entity`
      );
    }
  }
  const visitPath = (entityId, path) => {
    if (entityPathById.has(entityId))
      return;
    entityPathById.set(entityId, path);
    const entity = entityById.get(entityId);
    if (!entity || isSourceInstanceBoundary(entity))
      return;
    entity.children?.forEach((childId, childIndex) => {
      visitPath(childId, [...path, childIndex]);
    });
  };
  rootEntityIds.forEach((rootId) => visitPath(rootId, []));
  for (const [entityId, entity] of entityById) {
    const path = entityPathById.get(entityId);
    const entityIndex = entityIndexById.get(entityId);
    const typeCounts = /* @__PURE__ */ new Map();
    for (const componentId of entity.components ?? []) {
      if (typeof componentId !== "string")
        continue;
      const component = componentById.get(componentId);
      if (!component)
        continue;
      const typeIndex = typeCounts.get(component.type) ?? 0;
      typeCounts.set(component.type, typeIndex + 1);
      if (entityIndex !== void 0) {
        componentReferenceTargetById.set(componentId, {
          entity: [entityIndex],
          type: component.type,
          index: typeIndex
        });
      }
      if (path) {
        componentOverrideTargetById.set(componentId, {
          path: [...path],
          selector: { type: component.type, index: typeIndex }
        });
      }
    }
    const intrinsicId = createVirtualTransformComponentId(entityId);
    if (!componentById.has(intrinsicId)) {
      const slot = findTransformSlotComponent((entity.components ?? []).flatMap((id) => componentById.get(id) ?? []));
      componentOwnerEntityIdById.set(intrinsicId, entityId);
      const referenceTarget = slot ? componentReferenceTargetById.get(slot.id) : { entity: [entityIndex], type: "Transform", index: 0 };
      if (referenceTarget)
        componentReferenceTargetById.set(intrinsicId, referenceTarget);
      const overrideTarget = slot ? componentOverrideTargetById.get(slot.id) : path && { path: [...path], selector: { type: "Transform", index: 0 } };
      if (overrideTarget)
        componentOverrideTargetById.set(intrinsicId, overrideTarget);
    }
  }
  return {
    componentTopology: "complete",
    entityIndexById,
    componentIndexById,
    entityById,
    componentById,
    componentOwnerEntityIdById,
    entityReferenceTargetById,
    componentReferenceTargetById,
    componentOverrideTargetById,
    entityPathById,
    rootEntityIds
  };
}
function runtimeComponentSelectorType(component, index, options) {
  const resolvedType = options?.resolveRuntimeComponentType?.(component, index);
  if (resolvedType)
    return resolvedType;
  return component.type;
}
function runtimeComponentSelector(sourceComponentId, index, options) {
  const component = index.componentById.get(sourceComponentId);
  if (!component || index.componentTopology === "sparse" || component.type !== "Script" && !options?.matchesRuntimeComponent)
    return void 0;
  const ownerEntityId = index.componentOwnerEntityIdById.get(sourceComponentId);
  const ownerEntity = ownerEntityId ? index.entityById.get(ownerEntityId) : void 0;
  if (!ownerEntity)
    return void 0;
  const type = runtimeComponentSelectorType(component, index, options);
  let typeIndex = 0;
  for (const candidateId of ownerEntity.components ?? []) {
    if (candidateId === sourceComponentId)
      return { type, index: typeIndex };
    const candidate = index.componentById.get(candidateId);
    if (candidate && (options?.matchesRuntimeComponent ? options.matchesRuntimeComponent(candidate, component, index) : runtimeComponentSelectorType(candidate, index, options) === type))
      typeIndex += 1;
  }
  return void 0;
}
function lowerSourceEntityOverridePath(sourceEntityId, index) {
  const path = index.entityPathById.get(sourceEntityId);
  if (!path) {
    throw new Error(`Source entity override target "${sourceEntityId}" does not exist in the indexed source graph`);
  }
  return [...path];
}
function lowerSourceComponentOverrideTarget(sourceComponentId, index, options) {
  const target = index.componentOverrideTargetById.get(sourceComponentId);
  if (!target) {
    throw new Error(
      `Source component override target "${sourceComponentId}" does not exist in the indexed source graph`
    );
  }
  const selector = runtimeComponentSelector(sourceComponentId, index, options);
  return {
    path: [...target.path],
    selector: selector ?? { ...target.selector }
  };
}
function lowerSourceEntityRef(ref, index) {
  if (typeof ref.$entity !== "string")
    throw new Error("Source entity ref must be a source entity id string");
  const target = index.entityReferenceTargetById.get(ref.$entity);
  if (!target) {
    throw new Error(`Source entity ref "${ref.$entity}" does not exist`);
  }
  return { $entity: [...target] };
}
function lowerSourceComponentRef(ref, index, options) {
  if (typeof ref.$component !== "string")
    throw new Error("Source component ref must be a source component id string");
  const target = index.componentReferenceTargetById.get(ref.$component);
  if (!target) {
    throw new Error(`Source component ref "${ref.$component}" does not exist`);
  }
  const selector = runtimeComponentSelector(ref.$component, index, options);
  return {
    $component: {
      entity: [...target.entity],
      ...selector ?? { type: target.type, index: target.index }
    }
  };
}

// packages/model/src/domain/gltf-content-revision.ts
var GLTF_CONTENT_REVISION_PATTERN = /^[0-9a-f]{64}$/;
var GlTFOverrideRevisionConflictError = class extends Error {
  /** Asset id owning the glTF source. */
  assetId;
  /** Optional binding id within the asset's override topology. */
  bindingId;
  /** Specific stale-current failure category. */
  reason;
  /** Authored revision persisted on the binding, if known. */
  authoredRevision;
  /** Current revision of the source content, if known. */
  currentRevision;
  /**
   * @param input - Asset and binding identifiers, conflict reason, and known revisions
   */
  constructor(input) {
    const reasonText = input.reason === "mismatch" ? `authored ${input.authoredRevision} !== current ${input.currentRevision}` : input.reason === "missing-authored" ? "authored revision is missing" : "current revision is missing";
    super(
      input.message ?? `glTF override revision conflict on asset "${input.assetId}"${input.bindingId ? ` (binding "${input.bindingId}")` : ""}: ${reasonText}`
    );
    this.name = "GlTFOverrideRevisionConflictError";
    this.assetId = input.assetId;
    this.bindingId = input.bindingId;
    this.reason = input.reason;
    this.authoredRevision = input.authoredRevision;
    this.currentRevision = input.currentRevision;
  }
};
function isCanonicalGlTFContentRevision(value) {
  return typeof value === "string" && GLTF_CONTENT_REVISION_PATTERN.test(value);
}
function prefabBindingRequiresGlTFContentRevision(overrides) {
  if (!overrides)
    return false;
  if (Object.keys(overrides.entityProps ?? {}).some((target) => target !== "root"))
    return true;
  return [
    overrides.componentProps,
    overrides.removedEntities,
    overrides.removedComponents,
    overrides.addedEntities,
    overrides.addedComponents
  ].some((record) => record !== void 0 && Object.keys(record).length > 0);
}
function sourceInstanceRequiresGlTFContentRevision(overrides) {
  if (!overrides)
    return false;
  if (overrides.entityProps?.some((override) => override.target !== "root"))
    return true;
  return [
    overrides.componentProps,
    overrides.removedEntities,
    overrides.removedComponents,
    overrides.addedEntities,
    overrides.addedComponents
  ].some((list) => Array.isArray(list) && list.length > 0);
}
function presentRevision(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function getGlTFOverrideRevisionStatus(input) {
  if (!input.requiresRevision)
    return { kind: "empty" };
  const authored = presentRevision(input.authoredRevision);
  const current = presentRevision(input.currentRevision);
  if (!authored || !current) {
    return {
      kind: "unresolved",
      ...authored ? { authored } : {},
      ...current ? { current } : {}
    };
  }
  if (authored === current)
    return { kind: "current", revision: authored };
  return { kind: "stale", authored, current };
}
function conflictFromGlTFOverrideRevisionStatus(status, context) {
  if (status.kind === "empty" || status.kind === "current")
    return void 0;
  if (status.kind === "stale") {
    return new GlTFOverrideRevisionConflictError({
      ...context,
      reason: "mismatch",
      authoredRevision: status.authored,
      currentRevision: status.current
    });
  }
  return new GlTFOverrideRevisionConflictError({
    ...context,
    reason: status.authored ? "missing-current" : "missing-authored",
    authoredRevision: status.authored,
    currentRevision: status.current
  });
}
function assertGlTFOverrideRevisionCurrent(input) {
  const status = getGlTFOverrideRevisionStatus(input);
  const conflict = conflictFromGlTFOverrideRevisionStatus(status, input);
  if (conflict)
    throw conflict;
  return status;
}

// packages/model/src/particle-burst.ts
var import_uuid = __toESM(require_dist());
var PARTICLE_BURST_DEFAULT_CYCLES = 1;
var PARTICLE_BURST_DEFAULT_REPEAT_INTERVAL = 0.01;
var PARTICLE_BURST_CONSTRUCT_PARAM_COUNT = 4;
var PARTICLE_BURST_COUNT_MODE_CONSTANT = 0;
var PARTICLE_BURST_COUNT_MODE_TWO_CONSTANTS = 1;
var PARTICLE_BURST_PROP_KEYS = /* @__PURE__ */ new Set(["module", "time", "count", "cycles", "repeatInterval"]);
var PARTICLE_BURST_COUNT_PROP_KEYS = /* @__PURE__ */ new Set(["module", "mode", "constantMin", "constantMax"]);
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function ownValue(record, key, fallback) {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : fallback;
}
function hasOnlyKeys(record, keys) {
  return Object.keys(record).every((key) => keys.has(key));
}
function isParticleBurstSourceShape(value) {
  return isRecord(value) && value.class === "Burst" && Array.isArray(value.constructParams) && value.constructParams.length === PARTICLE_BURST_CONSTRUCT_PARAM_COUNT && (value.props === void 0 || isRecord(value.props));
}
function assertParticleBurstSourceShape(value, path) {
  if (!isRecord(value) || value.class !== "Burst" || !Array.isArray(value.constructParams)) {
    throw new SourceFileValidationError(`${path} must be canonical Burst constructor data`);
  }
  if (value.constructParams.length !== PARTICLE_BURST_CONSTRUCT_PARAM_COUNT) {
    throw new SourceFileValidationError(
      `${path}.constructParams must contain exactly time, count, cycles, and repeatInterval`
    );
  }
  if (value.props !== void 0 && !isRecord(value.props)) {
    throw new SourceFileValidationError(`${path}.props must be an object`);
  }
}
function decodeParticleBurstCountSource(value) {
  if (!isRecord(value) || value.class !== "ParticleCompositeCurve" || !Array.isArray(value.constructParams)) {
    return void 0;
  }
  const params = value.constructParams;
  if (params.length !== 1 && params.length !== 2)
    return void 0;
  if (value.props !== void 0 && !isRecord(value.props))
    return void 0;
  const constructorMin = params.length === 2 ? finiteNumber(params[0]) : 0;
  const constructorMax = finiteNumber(params[params.length - 1]);
  if (constructorMin === void 0 || constructorMax === void 0)
    return void 0;
  const props = isRecord(value.props) ? value.props : {};
  if (!hasOnlyKeys(props, PARTICLE_BURST_COUNT_PROP_KEYS))
    return void 0;
  const mode = ownValue(
    props,
    "mode",
    params.length === 1 ? PARTICLE_BURST_COUNT_MODE_CONSTANT : PARTICLE_BURST_COUNT_MODE_TWO_CONSTANTS
  );
  if (mode !== PARTICLE_BURST_COUNT_MODE_CONSTANT && mode !== PARTICLE_BURST_COUNT_MODE_TWO_CONSTANTS) {
    return void 0;
  }
  const constantMin = finiteNumber(ownValue(props, "constantMin", constructorMin));
  const constantMax = finiteNumber(ownValue(props, "constantMax", constructorMax));
  if (constantMin === void 0 || constantMax === void 0 || constantMin < 0 || constantMax < 0) {
    return void 0;
  }
  return { mode, constantMin, constantMax };
}
function decodeParticleBurstSource(value) {
  if (!isParticleBurstSourceShape(value))
    return void 0;
  const props = value.props ?? {};
  if (!hasOnlyKeys(props, PARTICLE_BURST_PROP_KEYS))
    return void 0;
  const time = finiteNumber(ownValue(props, "time", value.constructParams[0]));
  const count = decodeParticleBurstCountSource(ownValue(props, "count", value.constructParams[1]));
  const cycles = deserializeParticleBurstCycles(ownValue(props, "cycles", value.constructParams[2]));
  const repeatInterval = finiteNumber(ownValue(props, "repeatInterval", value.constructParams[3]));
  if (time === void 0 || time < 0 || count === void 0 || cycles === void 0 || repeatInterval === void 0 || repeatInterval < PARTICLE_BURST_DEFAULT_REPEAT_INTERVAL) {
    return void 0;
  }
  return {
    time,
    count,
    cycles,
    repeatInterval
  };
}
function parseParticleBurstSource(value, path = "Particle Burst") {
  assertParticleBurstSourceShape(value, path);
  const burst = decodeParticleBurstSource(value);
  if (!burst) {
    throw new SourceFileValidationError(
      `${path} must use non-negative time and Constant or TwoConstants count, integer cycles >= 1 or Infinity, and repeatInterval >= ${PARTICLE_BURST_DEFAULT_REPEAT_INTERVAL}`
    );
  }
  return burst;
}
function deserializeParticleBurstCycles(value) {
  if (value === null || value === Infinity)
    return Infinity;
  return typeof value === "number" && Number.isInteger(value) && value >= PARTICLE_BURST_DEFAULT_CYCLES ? value : void 0;
}

// packages/model/src/utils/is-record.ts
function isRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// packages/model/src/scene-file-v2/source-validator.ts
function sourceV2Error(kind, path, error) {
  const message = error instanceof Error ? error.message : String(error);
  return new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path}: ${message}`);
}
var SOURCE_V2_SCENE_FILE_KEYS = ["asset", "scene", "entities", "components", "prefab"];
var SOURCE_V2_PREFAB_FILE_KEYS = ["asset", "root", "entities", "components"];
var SOURCE_V2_SCENE_ASSET_KEYS = ["version", "generator"];
var SOURCE_V2_PREFAB_ASSET_KEYS = ["version"];
var SOURCE_V2_SCENE_KEYS = [
  "name",
  "rootEntities",
  "background",
  "ambient",
  "shadow",
  "fog",
  "ambientOcclusion",
  "autoBake"
];
var SOURCE_V2_BACKGROUND_KEYS = ["mode", "color", "texture", "skyMaterial", "skyMesh", "textureFillMode"];
var SOURCE_V2_AMBIENT_KEYS = [
  "ambientLight",
  "customAmbientLight",
  "diffuseMode",
  "diffuseSolidColor",
  "diffuseIntensity",
  "specularMode",
  "customSpecularTexture",
  "bakerResolution",
  "specularIntensity"
];
var SOURCE_V2_SHADOW_KEYS = [
  "castShadows",
  "enableTransparentShadow",
  "shadowResolution",
  "shadowDistance",
  "shadowCascades",
  "shadowTwoCascadeSplits",
  "shadowFourCascadeSplits",
  "shadowFadeBorder"
];
var SOURCE_V2_FOG_KEYS = ["mode", "color", "density", "start", "end"];
var SOURCE_V2_AMBIENT_OCCLUSION_KEYS = [
  "enabled",
  "quality",
  "intensity",
  "radius",
  "bias",
  "power",
  "bilateralThreshold",
  "minHorizonAngle"
];
var SOURCE_V2_COLOR_KEYS = ["r", "g", "b", "a"];
var SOURCE_V2_HDR_COLOR_KEYS = ["r", "g", "b", "a", "_metaIntensity", "_metaSourceColor"];
var SOURCE_V2_COMPONENT_KEYS = ["id", "type", "script", "props", "calls"];
var SOURCE_V2_ENTITY_KEYS = [
  "id",
  "name",
  "children",
  "position",
  "rotation",
  "scale",
  "components",
  "isActive",
  "layer",
  "isLocked",
  "instance"
];
var SOURCE_V2_INLINE_ENTITY_KEYS = [
  "id",
  "name",
  "position",
  "rotation",
  "scale",
  "isActive",
  "layer",
  "isLocked",
  "components",
  "children",
  "instance"
];
var SOURCE_V2_INSTANCE_KEYS = ["asset", "overrides", "sourceContentRevision"];
var SOURCE_V2_INSTANCE_OVERRIDE_KEYS = [
  "entityProps",
  "componentProps",
  "removedEntities",
  "removedComponents",
  "addedEntities",
  "addedComponents"
];
var SOURCE_V2_ENTITY_PROP_OVERRIDE_KEYS = [
  "target",
  "name",
  "isActive",
  "layer",
  "isLocked",
  "position",
  "rotation",
  "scale"
];
var SOURCE_V2_COMPONENT_PROP_OVERRIDE_KEYS = ["target", "props", "calls"];
var SOURCE_V2_ADDED_COMPONENT_OVERRIDE_KEYS = ["id", "owner", "component"];
var SOURCE_V2_ADDED_ENTITY_OVERRIDE_KEYS = ["id", "parent", "index", "entity"];
function assertAllowedObjectKeys(value, allowedKeys, kind, path) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} cannot include extra key "${key}"`);
    }
  }
}
function assertSourceValueRecord(value, kind, path) {
  if (value === void 0)
    return;
  if (!isRecord2(value)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be an object`);
  }
  try {
    normalizeSourceValueRecord(value);
  } catch (error) {
    throw sourceV2Error(kind, path, error);
  }
}
function assertSourceCallResult(value, kind, path) {
  if (!isRecord2(value)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (key !== "props" && key !== "calls") {
      throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} cannot include extra key "${key}"`);
    }
  }
  assertSourceValueRecord(value.props, kind, `${path}.props`);
  assertSourceCalls(value.calls, kind, `${path}.calls`);
}
function assertSourceAssetRef2(value, kind, path) {
  if (!isRecord2(value)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be a v2 $ref object`);
  }
  try {
    normalizeSourceAssetRefRecord(value);
  } catch (error) {
    throw sourceV2Error(kind, path, error);
  }
}
function assertSourceCalls(value, kind, path) {
  if (value === void 0)
    return;
  if (!Array.isArray(value)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be an array`);
  }
  value.forEach((call, index) => {
    const callPath = `${path}[${index}]`;
    if (!isRecord2(call)) {
      throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${callPath} must be an object`);
    }
    if (typeof call.method !== "string" || call.method.length === 0) {
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: ${callPath}.method must be a non-empty string`
      );
    }
    for (const key of Object.keys(call)) {
      if (key !== "target" && key !== "method" && key !== "args" && key !== "result") {
        throw new SourceFileValidationError(
          `Invalid source v2 ${kind} file: ${callPath} cannot include extra key "${key}"`
        );
      }
    }
    if (call.target !== void 0 && (!Array.isArray(call.target) || call.target.some((key) => typeof key !== "string" || key.length === 0))) {
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: ${callPath}.target must be an array of non-empty strings`
      );
    }
    if (call.args !== void 0) {
      if (!Array.isArray(call.args)) {
        throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${callPath}.args must be an array`);
      }
      try {
        normalizeSourceValue(call.args);
      } catch (error) {
        throw sourceV2Error(kind, `${callPath}.args`, error);
      }
    }
    if (call.result !== void 0) {
      assertSourceCallResult(call.result, kind, `${callPath}.result`);
    }
  });
}
function assertCanonicalPostProcessProps(componentType, props, label) {
  if (componentType !== "PostProcess" || props?.effects === void 0)
    return;
  if (!Array.isArray(props.effects)) {
    throw new SourceFileValidationError(`${label}.effects must be an array`);
  }
  props.effects.forEach((effect, index) => {
    const path = `${label}.effects[${index}]`;
    if (!isRecord2(effect) || typeof effect.$type !== "string") {
      throw new SourceFileValidationError(`${path} must be a canonical source v2 effect object with $type`);
    }
    if ("class" in effect || "classType" in effect || "props" in effect) {
      throw new SourceFileValidationError(
        `${path} must use canonical $type shape, not legacy class/classType/props wrappers`
      );
    }
  });
}
function assertCanonicalParticleRendererProps(componentType, props, label) {
  if (componentType !== "ParticleRenderer")
    return;
  const generator = props?.generator;
  if (!isRecord2(generator))
    return;
  const emission = generator.emission;
  if (!isRecord2(emission) || emission.bursts === void 0)
    return;
  if (!Array.isArray(emission.bursts)) {
    throw new SourceFileValidationError(`${label}.generator.emission.bursts must be an array`);
  }
  emission.bursts.forEach(
    (burst, index) => parseParticleBurstSource(burst, `${label}.generator.emission.bursts[${index}]`)
  );
}
function assertCanonicalPostProcessCalls(componentType, calls, label) {
  if (componentType !== "PostProcess" || !Array.isArray(calls))
    return;
  if (calls.some((call) => isRecord2(call) && call.method === "addEffect")) {
    throw new SourceFileValidationError(
      `${label} must express PostProcess effects through props.effects with canonical $type objects`
    );
  }
}
function assertSourceComponentSchema(component, kind, path) {
  if (!isRecord2(component)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be an object`);
  }
  assertAllowedObjectKeys(component, SOURCE_V2_COMPONENT_KEYS, kind, path);
  if (typeof component.id !== "string" || component.id.length === 0) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path}.id must be a non-empty string`);
  }
  if (typeof component.type !== "string" || component.type.length === 0) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path}.type must be a non-empty string`);
  }
  if (component.script !== void 0)
    assertSourceAssetRef2(component.script, kind, `${path}.script`);
  assertSourceValueRecord(component.props, kind, `${path}.props`);
  assertCanonicalPostProcessProps(
    component.type,
    component.props,
    `source v2 ${kind} file ${path}.${component.type}.props`
  );
  assertCanonicalParticleRendererProps(
    component.type,
    component.props,
    `source v2 ${kind} file ${path}.props`
  );
  assertSourceCalls(component.calls, kind, `${path}.calls`);
  assertCanonicalPostProcessCalls(component.type, component.calls, `source v2 ${kind} file ${path}.PostProcess`);
}
function assertInlineComponentSchema(component, kind, path, overrideId) {
  if (!isRecord2(component)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be an object`);
  }
  assertAllowedObjectKeys(component, SOURCE_V2_COMPONENT_KEYS, kind, path);
  assertInlineIdentity(component.id, overrideId, kind, path);
  if (typeof component.type !== "string" || component.type.length === 0) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path}.type must be a non-empty string`);
  }
  if (component.script !== void 0)
    assertSourceAssetRef2(component.script, kind, `${path}.script`);
  assertSourceValueRecord(component.props, kind, `${path}.props`);
  assertCanonicalPostProcessProps(
    component.type,
    component.props,
    `source v2 ${kind} file ${path}.${component.type}.props`
  );
  assertCanonicalParticleRendererProps(
    component.type,
    component.props,
    `source v2 ${kind} file ${path}.props`
  );
  assertSourceCalls(component.calls, kind, `${path}.calls`);
  assertCanonicalPostProcessCalls(component.type, component.calls, `source v2 ${kind} file ${path}.PostProcess`);
}
function assertStringId(value, kind, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be a non-empty string id`);
  }
}
function assertInlineIdentity(id, overrideId, kind, path) {
  assertStringId(id ?? overrideId, kind, `${path}.id`);
  if (id !== void 0 && overrideId !== void 0 && id !== overrideId) {
    throw new Error(`Invalid source v2 ${kind} file: ${path}.id must match override id "${overrideId}"`);
  }
}
function assertInlineEntitySchema(entity, kind, path, overrideId) {
  if (!isRecord2(entity)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be an object`);
  }
  assertAllowedObjectKeys(entity, SOURCE_V2_INLINE_ENTITY_KEYS, kind, path);
  assertInlineIdentity(entity.id, overrideId, kind, path);
  if (entity.instance !== void 0) {
    const leaked = SOURCE_V2_INLINE_ENTITY_KEYS.filter(
      (key) => key !== "id" && key !== "instance" && entity[key] !== void 0
    );
    if (leaked.length > 0) {
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: ${path} instance entity cannot include normal entity fields (${leaked.join(
          ", "
        )})`
      );
    }
    if (!isRecord2(entity.instance)) {
      throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path}.instance must be an object`);
    }
    assertAllowedObjectKeys(entity.instance, SOURCE_V2_INSTANCE_KEYS, kind, `${path}.instance`);
    assertSourceAssetRef2(entity.instance.asset, kind, `${path}.instance.asset`);
    assertInstanceSourceContentRevision(entity.instance, kind, `${path}.instance`);
    assertInstanceOverrides(entity.instance.overrides, kind, `${path}.instance.overrides`);
    return;
  }
  if (entity.components !== void 0) {
    if (!Array.isArray(entity.components)) {
      throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path}.components must be an array`);
    }
    entity.components.forEach(
      (component, index) => assertInlineComponentSchema(component, kind, `${path}.components[${index}]`)
    );
  }
  if (entity.children !== void 0) {
    if (!Array.isArray(entity.children)) {
      throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path}.children must be an array`);
    }
    entity.children.forEach((child, index) => assertInlineEntitySchema(child, kind, `${path}.children[${index}]`));
  }
}
function assertInstanceSourceContentRevision(instance, kind, path) {
  if (instance.sourceContentRevision === void 0)
    return;
  if (!isCanonicalGlTFContentRevision(instance.sourceContentRevision)) {
    throw new SourceFileValidationError(
      `Invalid source v2 ${kind} file: ${path}.sourceContentRevision must be a 64-digit lowercase SHA-256 hex digest`
    );
  }
}
function assertInstanceOverrides(value, kind, path) {
  if (value === void 0)
    return;
  if (!isRecord2(value)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be an object`);
  }
  assertAllowedObjectKeys(value, SOURCE_V2_INSTANCE_OVERRIDE_KEYS, kind, path);
  const overrides = value;
  overrides.entityProps?.forEach((item, index) => {
    if (!isRecord2(item))
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: ${path}.entityProps[${index}] must be an object`
      );
    assertAllowedObjectKeys(item, SOURCE_V2_ENTITY_PROP_OVERRIDE_KEYS, kind, `${path}.entityProps[${index}]`);
    assertStringId(item.target, kind, `${path}.entityProps[${index}].target`);
  });
  overrides.componentProps?.forEach((item, index) => {
    if (!isRecord2(item)) {
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: ${path}.componentProps[${index}] must be an object`
      );
    }
    assertAllowedObjectKeys(item, SOURCE_V2_COMPONENT_PROP_OVERRIDE_KEYS, kind, `${path}.componentProps[${index}]`);
    assertStringId(item.target, kind, `${path}.componentProps[${index}].target`);
    assertSourceValueRecord(item.props, kind, `${path}.componentProps[${index}].props`);
    assertSourceCalls(item.calls, kind, `${path}.componentProps[${index}].calls`);
  });
  overrides.removedEntities?.forEach((item, index) => assertStringId(item, kind, `${path}.removedEntities[${index}]`));
  overrides.removedComponents?.forEach(
    (item, index) => assertStringId(item, kind, `${path}.removedComponents[${index}]`)
  );
  overrides.addedComponents?.forEach((item, index) => {
    if (!isRecord2(item)) {
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: ${path}.addedComponents[${index}] must be an object`
      );
    }
    assertAllowedObjectKeys(item, SOURCE_V2_ADDED_COMPONENT_OVERRIDE_KEYS, kind, `${path}.addedComponents[${index}]`);
    assertStringId(item.id, kind, `${path}.addedComponents[${index}].id`);
    assertStringId(item.owner, kind, `${path}.addedComponents[${index}].owner`);
    assertInlineComponentSchema(item.component, kind, `${path}.addedComponents[${index}].component`, item.id);
  });
  overrides.addedEntities?.forEach((item, index) => {
    if (!isRecord2(item)) {
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: ${path}.addedEntities[${index}] must be an object`
      );
    }
    assertAllowedObjectKeys(item, SOURCE_V2_ADDED_ENTITY_OVERRIDE_KEYS, kind, `${path}.addedEntities[${index}]`);
    assertStringId(item.id, kind, `${path}.addedEntities[${index}].id`);
    assertStringId(item.parent, kind, `${path}.addedEntities[${index}].parent`);
    if (item.index !== void 0 && (!Number.isInteger(item.index) || item.index < 0)) {
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: ${path}.addedEntities[${index}].index must be a non-negative integer`
      );
    }
    assertInlineEntitySchema(item.entity, kind, `${path}.addedEntities[${index}].entity`, item.id);
  });
}
function assertSourceV2Asset(value, kind) {
  if (!isRecord2(value) || !isRecord2(value.asset) || value.asset.version !== "2.0") {
    throw new SourceFileValidationError(
      `Invalid source v2 ${kind} file: expected source v2 ${kind} file with asset.version "2.0"`
    );
  }
  assertAllowedObjectKeys(
    value.asset,
    kind === "scene" ? SOURCE_V2_SCENE_ASSET_KEYS : SOURCE_V2_PREFAB_ASSET_KEYS,
    kind,
    "asset"
  );
}
function assertSourceV2ComponentArray(components, kind) {
  if (!Array.isArray(components)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: components must be an array`);
  }
  components.forEach((component, index) => {
    assertSourceComponentSchema(component, kind, `components[${index}]`);
  });
}
function assertSourceV2EntityArray(entities, kind) {
  if (!Array.isArray(entities)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: entities must be an array`);
  }
  entities.forEach((entity, entityIndex) => {
    if (!isRecord2(entity)) {
      throw new SourceFileValidationError(`Invalid source v2 ${kind} file: entities[${entityIndex}] must be an object`);
    }
    assertAllowedObjectKeys(entity, SOURCE_V2_ENTITY_KEYS, kind, `entities[${entityIndex}]`);
    if (typeof entity.id !== "string" || entity.id.length === 0) {
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: entities[${entityIndex}].id must be a non-empty string`
      );
    }
    if (entity.components !== void 0) {
      if (!Array.isArray(entity.components)) {
        throw new SourceFileValidationError(
          `Invalid source v2 ${kind} file: entities[${entityIndex}].components must be an array`
        );
      }
      entity.components.forEach(
        (componentId, localIndex) => assertStringId(componentId, kind, `entities[${entityIndex}].components[${localIndex}]`)
      );
    }
    if (entity.children !== void 0) {
      if (!Array.isArray(entity.children)) {
        throw new SourceFileValidationError(
          `Invalid source v2 ${kind} file: entities[${entityIndex}].children must be an array`
        );
      }
      entity.children.forEach(
        (childId, localIndex) => assertStringId(childId, kind, `entities[${entityIndex}].children[${localIndex}]`)
      );
    }
    if (entity.instance !== void 0) {
      if (!isRecord2(entity.instance)) {
        throw new SourceFileValidationError(
          `Invalid source v2 ${kind} file: entities[${entityIndex}].instance must be an object`
        );
      }
      assertAllowedObjectKeys(entity.instance, SOURCE_V2_INSTANCE_KEYS, kind, `entities[${entityIndex}].instance`);
      assertSourceAssetRef2(entity.instance.asset, kind, `entities[${entityIndex}].instance.asset`);
      assertInstanceSourceContentRevision(entity.instance, kind, `entities[${entityIndex}].instance`);
      assertInstanceOverrides(entity.instance.overrides, kind, `entities[${entityIndex}].instance.overrides`);
      const leakedBoundaryFields = ["children", "components"].filter((key) => entity[key] !== void 0);
      if (leakedBoundaryFields.length > 0) {
        throw new SourceFileValidationError(
          `Invalid source v2 ${kind} file: entities[${entityIndex}] instance entity cannot include ${leakedBoundaryFields.join(
            ", "
          )}`
        );
      }
    }
  });
}
function assertSourceEntityForest(entities, roots, kind) {
  const entityById = /* @__PURE__ */ new Map();
  entities.forEach((entity, index) => {
    assertStringId(entity.id, kind, `entities[${index}].id`);
    entityById.set(entity.id, entity);
  });
  const rootSet = /* @__PURE__ */ new Set();
  for (const root of roots) {
    if (rootSet.has(root)) {
      throw new SourceFileValidationError(`Invalid source v2 ${kind} file: duplicate root entity id "${root}"`);
    }
    rootSet.add(root);
  }
  const parentByChild = /* @__PURE__ */ new Map();
  entities.forEach((entity) => {
    const entityId = entity.id;
    for (const childId of entity.children ?? []) {
      assertStringId(childId, kind, `entity "${entityId}".children`);
      if (childId === entityId) {
        throw new SourceFileValidationError(
          `Invalid source v2 ${kind} file: entity forest cannot contain self child "${childId}"`
        );
      }
      const existingParent = parentByChild.get(childId);
      if (existingParent !== void 0) {
        throw new SourceFileValidationError(
          `Invalid source v2 ${kind} file: entity "${childId}" has multiple parents ("${existingParent}", "${entityId}")`
        );
      }
      parentByChild.set(childId, entityId);
    }
  });
  for (const root of roots) {
    if (parentByChild.has(root)) {
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: root entity "${root}" is also referenced as a child`
      );
    }
  }
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const visit = (id) => {
    if (visiting.has(id)) {
      throw new SourceFileValidationError(`Invalid source v2 ${kind} file: entity forest contains a cycle at "${id}"`);
    }
    if (visited.has(id))
      return;
    const entity = entityById.get(id);
    if (!entity) {
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: entity forest references missing entity "${id}"`
      );
    }
    visiting.add(id);
    for (const childId of entity.children ?? []) {
      assertStringId(childId, kind, `entity "${id}".children`);
      visit(childId);
    }
    visiting.delete(id);
    visited.add(id);
  };
  roots.forEach(visit);
  if (visited.size !== entities.length) {
    const orphan = entities.find((entity) => !visited.has(entity.id));
    throw new SourceFileValidationError(
      `Invalid source v2 ${kind} file: entity forest contains orphan entity "${orphan?.id}"; all entities must be reachable from declared roots`
    );
  }
}
function assertSourceComponentsHaveSingleOwner(entities, kind) {
  const ownerByComponent = /* @__PURE__ */ new Map();
  entities.forEach((entity) => {
    const entityId = entity.id;
    for (const componentId of entity.components ?? []) {
      assertStringId(componentId, kind, `entity "${entityId}".components`);
      const existingOwner = ownerByComponent.get(componentId);
      if (existingOwner !== void 0) {
        throw new SourceFileValidationError(
          `Invalid source v2 ${kind} file: component "${componentId}" has multiple owners ("${existingOwner}", "${entityId}")`
        );
      }
      ownerByComponent.set(componentId, entityId);
    }
  });
}
var SOURCE_V2_RUNTIME_AMBIENT_INPUT_KEYS = [
  "diffuseMode",
  "ambientLight",
  "diffuseSolidColor",
  "diffuseIntensity",
  "specularMode",
  "customAmbientLight",
  "specularIntensity"
];
var SOURCE_V2_REQUIRED_RUNTIME_AMBIENT_KEYS = [
  "diffuseMode",
  "diffuseIntensity",
  "specularMode",
  "specularIntensity"
];
function assertSourceV2AmbientRuntimeGroup(scene) {
  const ambient = scene.ambient;
  if (ambient === void 0)
    return;
  if (!isRecord2(ambient)) {
    throw new SourceFileValidationError("Invalid source v2 scene file: scene.ambient must be an object");
  }
  const hasRuntimeAmbient = SOURCE_V2_RUNTIME_AMBIENT_INPUT_KEYS.some(
    (key) => ambient[key] !== void 0 && ambient[key] !== null
  );
  if (!hasRuntimeAmbient)
    return;
  const missing = SOURCE_V2_REQUIRED_RUNTIME_AMBIENT_KEYS.filter((key) => typeof ambient[key] !== "number");
  if (missing.length > 0) {
    throw new SourceFileValidationError(
      `Invalid source v2 scene file: scene.ambient runtime group requires numeric diffuseMode, diffuseIntensity, specularMode, and specularIntensity; missing or invalid ${missing.join(
        ", "
      )}`
    );
  }
}
function assertOptionalSourceAssetRef(value, kind, path, options = {}) {
  if (value === void 0)
    return;
  if (value === null && options.allowNull)
    return;
  assertSourceAssetRef2(value, kind, path);
}
function assertOptionalNumber(value, kind, path) {
  if (value === void 0)
    return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be a finite number`);
  }
}
function assertRequiredNumber(value, kind, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be a finite number`);
  }
}
function assertOptionalBoolean(value, kind, path) {
  if (value === void 0)
    return;
  if (typeof value !== "boolean") {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be a boolean`);
  }
}
function assertOptionalString(value, kind, path) {
  if (value === void 0)
    return;
  if (typeof value !== "string") {
    throw new SourceFileValidationError(`Invalid source v2 ${kind} file: ${path} must be a string`);
  }
}
function assertRequiredSourceColor(value, path, keys = SOURCE_V2_COLOR_KEYS) {
  if (!isRecord2(value)) {
    throw new SourceFileValidationError(`Invalid source v2 scene file: ${path} must be a color object`);
  }
  assertAllowedObjectKeys(value, keys, "scene", path);
  assertRequiredNumber(value.r, "scene", `${path}.r`);
  assertRequiredNumber(value.g, "scene", `${path}.g`);
  assertRequiredNumber(value.b, "scene", `${path}.b`);
  assertRequiredNumber(value.a, "scene", `${path}.a`);
  if ("_metaIntensity" in value)
    assertRequiredNumber(value._metaIntensity, "scene", `${path}._metaIntensity`);
  if (value._metaSourceColor !== void 0) {
    const source = value._metaSourceColor;
    if (!isRecord2(source))
      throw new Error(`Invalid source v2 scene file: ${path}._metaSourceColor must be an object`);
    assertAllowedObjectKeys(source, ["r", "g", "b"], "scene", `${path}._metaSourceColor`);
    for (const channel of ["r", "g", "b"])
      assertRequiredNumber(source[channel], "scene", `${path}._metaSourceColor.${channel}`);
  }
}
function assertOptionalSourceColor(value, path, keys = SOURCE_V2_COLOR_KEYS) {
  if (value === void 0)
    return;
  assertRequiredSourceColor(value, path, keys);
}
function assertOptionalSourceVec3Tuple(value, path) {
  if (value === void 0)
    return;
  if (!Array.isArray(value) || value.length !== 3) {
    throw new SourceFileValidationError(`Invalid source v2 scene file: ${path} must be a [x, y, z] tuple`);
  }
  value.forEach((item, index) => assertRequiredNumber(item, "scene", `${path}[${index}]`));
}
function assertSourceV2SceneSettingsSchema(scene) {
  const background = scene.background;
  if (background !== void 0) {
    if (!isRecord2(background)) {
      throw new SourceFileValidationError("Invalid source v2 scene file: scene.background must be an object");
    }
    assertAllowedObjectKeys(background, SOURCE_V2_BACKGROUND_KEYS, "scene", "scene.background");
    assertRequiredNumber(background.mode, "scene", "scene.background.mode");
    assertOptionalSourceColor(background.color, "scene.background.color");
    assertOptionalSourceAssetRef(background.texture, "scene", "scene.background.texture");
    assertOptionalSourceAssetRef(background.skyMaterial, "scene", "scene.background.skyMaterial");
    assertOptionalSourceAssetRef(background.skyMesh, "scene", "scene.background.skyMesh");
    assertOptionalNumber(background.textureFillMode, "scene", "scene.background.textureFillMode");
  }
  const ambient = scene.ambient;
  if (ambient !== void 0) {
    if (!isRecord2(ambient)) {
      throw new SourceFileValidationError("Invalid source v2 scene file: scene.ambient must be an object");
    }
    assertAllowedObjectKeys(ambient, SOURCE_V2_AMBIENT_KEYS, "scene", "scene.ambient");
    assertOptionalSourceAssetRef(ambient.ambientLight, "scene", "scene.ambient.ambientLight", { allowNull: true });
    assertOptionalSourceAssetRef(ambient.customAmbientLight, "scene", "scene.ambient.customAmbientLight", {
      allowNull: true
    });
    assertOptionalSourceAssetRef(ambient.customSpecularTexture, "scene", "scene.ambient.customSpecularTexture");
    assertOptionalSourceColor(ambient.diffuseSolidColor, "scene.ambient.diffuseSolidColor", SOURCE_V2_HDR_COLOR_KEYS);
    assertOptionalNumber(ambient.bakerResolution, "scene", "scene.ambient.bakerResolution");
  }
  const shadow = scene.shadow;
  if (shadow !== void 0) {
    if (!isRecord2(shadow)) {
      throw new SourceFileValidationError("Invalid source v2 scene file: scene.shadow must be an object");
    }
    assertAllowedObjectKeys(shadow, SOURCE_V2_SHADOW_KEYS, "scene", "scene.shadow");
    assertOptionalBoolean(shadow.castShadows, "scene", "scene.shadow.castShadows");
    assertOptionalBoolean(shadow.enableTransparentShadow, "scene", "scene.shadow.enableTransparentShadow");
    assertOptionalNumber(shadow.shadowResolution, "scene", "scene.shadow.shadowResolution");
    assertOptionalNumber(shadow.shadowDistance, "scene", "scene.shadow.shadowDistance");
    assertOptionalNumber(shadow.shadowCascades, "scene", "scene.shadow.shadowCascades");
    assertOptionalNumber(shadow.shadowTwoCascadeSplits, "scene", "scene.shadow.shadowTwoCascadeSplits");
    assertOptionalSourceVec3Tuple(shadow.shadowFourCascadeSplits, "scene.shadow.shadowFourCascadeSplits");
    assertOptionalNumber(shadow.shadowFadeBorder, "scene", "scene.shadow.shadowFadeBorder");
  }
  const fog = scene.fog;
  if (fog !== void 0) {
    if (!isRecord2(fog)) {
      throw new SourceFileValidationError("Invalid source v2 scene file: scene.fog must be an object");
    }
    assertAllowedObjectKeys(fog, SOURCE_V2_FOG_KEYS, "scene", "scene.fog");
    assertOptionalNumber(fog.mode, "scene", "scene.fog.mode");
    assertOptionalSourceColor(fog.color, "scene.fog.color");
    assertOptionalNumber(fog.density, "scene", "scene.fog.density");
    assertOptionalNumber(fog.start, "scene", "scene.fog.start");
    assertOptionalNumber(fog.end, "scene", "scene.fog.end");
  }
  const ambientOcclusion = scene.ambientOcclusion;
  if (ambientOcclusion !== void 0) {
    if (!isRecord2(ambientOcclusion)) {
      throw new SourceFileValidationError("Invalid source v2 scene file: scene.ambientOcclusion must be an object");
    }
    assertAllowedObjectKeys(ambientOcclusion, SOURCE_V2_AMBIENT_OCCLUSION_KEYS, "scene", "scene.ambientOcclusion");
    assertOptionalBoolean(ambientOcclusion.enabled, "scene", "scene.ambientOcclusion.enabled");
    assertOptionalNumber(ambientOcclusion.quality, "scene", "scene.ambientOcclusion.quality");
    assertOptionalNumber(ambientOcclusion.intensity, "scene", "scene.ambientOcclusion.intensity");
    assertOptionalNumber(ambientOcclusion.radius, "scene", "scene.ambientOcclusion.radius");
    assertOptionalNumber(ambientOcclusion.bias, "scene", "scene.ambientOcclusion.bias");
    assertOptionalNumber(ambientOcclusion.power, "scene", "scene.ambientOcclusion.power");
    assertOptionalNumber(ambientOcclusion.bilateralThreshold, "scene", "scene.ambientOcclusion.bilateralThreshold");
    assertOptionalNumber(ambientOcclusion.minHorizonAngle, "scene", "scene.ambientOcclusion.minHorizonAngle");
  }
}
function assertSourceValueRefs(value, index, kind, path) {
  if (value === void 0 || value === null)
    return;
  if (Array.isArray(value)) {
    value.forEach((item, itemIndex) => assertSourceValueRefs(item, index, kind, `${path}[${itemIndex}]`));
    return;
  }
  if (!isRecord2(value))
    return;
  if ("$entity" in value) {
    if (typeof value.$entity !== "string" || !index.entityById.has(value.$entity)) {
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: ${path} $entity references missing entity "${String(value.$entity)}"`
      );
    }
    return;
  }
  if ("$component" in value) {
    const componentRef = value.$component;
    if (typeof componentRef === "string") {
      if (index.componentById.has(componentRef) || index.componentOwnerEntityIdById.has(componentRef))
        return;
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: ${path} $component references missing component "${componentRef}"`
      );
    }
    if (isRecord2(componentRef)) {
      const instanceId = componentRef.instance;
      const target = componentRef.target;
      const instanceEntity = typeof instanceId === "string" ? index.entityById.get(instanceId) : void 0;
      if (instanceEntity?.instance && typeof target === "string" && target.length > 0)
        return;
      throw new SourceFileValidationError(
        `Invalid source v2 ${kind} file: ${path} $component instance "${String(instanceId)}" does not reference an instance entity`
      );
    }
    throw new SourceFileValidationError(
      `Invalid source v2 ${kind} file: ${path} contains an invalid $component reference`
    );
  }
  for (const [key, child] of Object.entries(value)) {
    assertSourceValueRefs(child, index, kind, `${path}.${key}`);
  }
}
function assertSourceCallRefs(calls, index, kind, path) {
  calls?.forEach((call, callIndex) => assertSourceValueRefs(call, index, kind, `${path}[${callIndex}]`));
}
function assertSourceIdReferences(file, index) {
  const kind = "scene" in file ? "scene" : "prefab";
  file.components.forEach((component, componentIndex) => {
    assertSourceValueRefs(component.props, index, kind, `components[${componentIndex}].props`);
    assertSourceCallRefs(component.calls, index, kind, `components[${componentIndex}].calls`);
  });
}
function assertSourceV2SceneFileStructure(value) {
  assertSourceV2Asset(value, "scene");
  const record = value;
  assertAllowedObjectKeys(record, SOURCE_V2_SCENE_FILE_KEYS, "scene", "root");
  const components = record.components;
  const entities = record.entities;
  assertSourceV2ComponentArray(components, "scene");
  assertSourceV2EntityArray(entities, "scene");
  if (!isRecord2(record.scene) || !Array.isArray(record.scene.rootEntities)) {
    throw new SourceFileValidationError("Invalid source v2 scene file: scene.rootEntities must be an array");
  }
  assertAllowedObjectKeys(record.scene, SOURCE_V2_SCENE_KEYS, "scene", "scene");
  assertOptionalString(record.scene.name, "scene", "scene.name");
  assertOptionalBoolean(record.scene.autoBake, "scene", "scene.autoBake");
  assertSourceV2AmbientRuntimeGroup(record.scene);
  assertSourceV2SceneSettingsSchema(record.scene);
  record.scene.rootEntities.forEach((rootId, index) => assertStringId(rootId, "scene", `scene.rootEntities[${index}]`));
  if (record.prefab !== void 0)
    assertScenePrefabSidecar(record.prefab);
  const sourceIndex = buildSourceIdIndex(record, {
    includeInstanceAdditions: true,
    includeNestedInstanceAdditions: true
  });
  assertSourceEntityForest(entities, record.scene.rootEntities, "scene");
  assertSourceComponentsHaveSingleOwner(entities, "scene");
  assertSourceIdReferences(record, sourceIndex);
}
var SCENE_PREFAB_SIDECAR_KEYS = ["nestedOverrides"];
var SCENE_PREFAB_NESTED_OVERRIDE_BUCKET_KEYS = [
  "entityProps",
  "componentProps",
  "removedEntities",
  "removedComponents",
  "addedEntities",
  "addedComponents"
];
var SCENE_PREFAB_NESTED_OVERRIDE_KEYS = [
  "assetId",
  "rootSceneEntityId",
  "sourceEntityPath",
  "overrides",
  "addedEntities"
];
function assertScenePrefabSidecar(value) {
  if (!isRecord2(value)) {
    throw new Error("Invalid source v2 scene file: root.prefab must be an object");
  }
  assertAllowedObjectKeys(value, SCENE_PREFAB_SIDECAR_KEYS, "scene", "prefab");
  const nestedOverrides = value.nestedOverrides;
  if (nestedOverrides === void 0)
    return;
  if (!Array.isArray(nestedOverrides)) {
    throw new Error("Invalid source v2 scene file: prefab.nestedOverrides must be an array");
  }
  nestedOverrides.forEach((entry, index) => {
    const path = `prefab.nestedOverrides[${index}]`;
    if (!isRecord2(entry)) {
      throw new Error(`Invalid source v2 scene file: ${path} must be an object`);
    }
    assertAllowedObjectKeys(entry, SCENE_PREFAB_NESTED_OVERRIDE_KEYS, "scene", path);
    assertStringId(entry.assetId, "scene", `${path}.assetId`);
    assertStringId(entry.rootSceneEntityId, "scene", `${path}.rootSceneEntityId`);
    if (!Array.isArray(entry.sourceEntityPath) || entry.sourceEntityPath.length === 0) {
      throw new Error(`Invalid source v2 scene file: ${path}.sourceEntityPath must be a non-empty array`);
    }
    entry.sourceEntityPath.forEach((id, index2) => assertStringId(id, "scene", `${path}.sourceEntityPath[${index2}]`));
    if (!isRecord2(entry.overrides)) {
      throw new Error(`Invalid source v2 scene file: ${path}.overrides must be an object`);
    }
    for (const bucketKey of SCENE_PREFAB_NESTED_OVERRIDE_BUCKET_KEYS) {
      const bucket = entry.overrides[bucketKey];
      if (bucket === void 0)
        continue;
      if (!isRecord2(bucket)) {
        throw new Error(`Invalid source v2 scene file: ${path}.overrides.${bucketKey} must be an object`);
      }
    }
    if (entry.addedEntities === void 0)
      return;
    if (!Array.isArray(entry.addedEntities)) {
      throw new Error(`Invalid source v2 scene file: ${path}.addedEntities must be an array`);
    }
    entry.addedEntities.forEach((added, addedIndex) => {
      const addedPath = `${path}.addedEntities[${addedIndex}]`;
      if (!isRecord2(added)) {
        throw new Error(`Invalid source v2 scene file: ${addedPath} must be an object`);
      }
      assertAllowedObjectKeys(added, SOURCE_V2_ADDED_ENTITY_OVERRIDE_KEYS, "scene", addedPath);
      assertStringId(added.id, "scene", `${addedPath}.id`);
      assertStringId(added.parent, "scene", `${addedPath}.parent`);
      if (added.index !== void 0 && (!Number.isInteger(added.index) || added.index < 0)) {
        throw new Error(`Invalid source v2 scene file: ${addedPath}.index must be a non-negative integer`);
      }
      assertInlineEntitySchema(added.entity, "scene", `${addedPath}.entity`, added.id);
    });
  });
}
function validateSourceV2PrefabFile(value) {
  assertSourceV2Asset(value, "prefab");
  const record = value;
  assertAllowedObjectKeys(record, SOURCE_V2_PREFAB_FILE_KEYS, "prefab", "root");
  const components = record.components;
  const entities = record.entities;
  assertSourceV2ComponentArray(components, "prefab");
  assertSourceV2EntityArray(entities, "prefab");
  assertStringId(record.root, "prefab", "root");
  const sourceIndex = buildSourceIdIndex(record, { includeInstanceAdditions: true });
  assertSourceEntityForest(entities, [record.root], "prefab");
  assertSourceComponentsHaveSingleOwner(entities, "prefab");
  assertSourceIdReferences(record, sourceIndex);
  return { source: record, index: sourceIndex };
}
function assertSourceV2PrefabFileStructure(value) {
  validateSourceV2PrefabFile(value);
}

// packages/model/src/scene-file-v2/scene-settings.ts
function completeSourceSceneAmbient(settings) {
  const ambient = settings?.ambient;
  if (isRecord2(ambient) && SOURCE_V2_RUNTIME_AMBIENT_INPUT_KEYS.some((key) => ambient[key] != null)) {
    const defaults = { diffuseMode: 0, diffuseIntensity: 1, specularMode: 0, specularIntensity: 1 };
    for (const key of SOURCE_V2_REQUIRED_RUNTIME_AMBIENT_KEYS) {
      if (typeof ambient[key] !== "number")
        ambient[key] = defaults[key];
    }
  }
}
function extractSceneSettings(scene) {
  if (!scene || typeof scene !== "object")
    return void 0;
  const settings = { ...scene };
  delete settings.rootEntities;
  if (Object.keys(settings).length === 0)
    return void 0;
  return convertAssetRefsToDomainRefs(settings);
}

// packages/model/src/domain/cloneState.ts
function cloneState(value) {
  return structuredClone(value);
}

// packages/model/src/domain/referenceValueShape.ts
function getDomainComponentReference(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return null;
  const record = value;
  if (Object.keys(record).length !== 2)
    return null;
  if (typeof record.ownerId !== "string" || typeof record.componentId !== "string")
    return null;
  return record;
}
function getComponentReferenceSentinelId(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return null;
  const record = value;
  return Object.keys(record).length === 1 && typeof record.$component === "string" ? record.$component : null;
}
function getEntityReferenceSentinelId(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return null;
  const record = value;
  return Object.keys(record).length === 1 && typeof record.$entity === "string" ? record.$entity : null;
}
function isInstanceComponentTarget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return false;
  const record = value;
  return Object.keys(record).length === 2 && typeof record.instance === "string" && typeof record.target === "string";
}
function getInstanceComponentReference(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return null;
  const record = value;
  return Object.keys(record).length === 1 && isInstanceComponentTarget(record.$component) ? record.$component : null;
}
function isReferenceValue(value) {
  return getDomainComponentReference(value) !== null || getComponentReferenceSentinelId(value) !== null || getEntityReferenceSentinelId(value) !== null || getInstanceComponentReference(value) !== null;
}

// packages/model/src/scene-file-v2/gltf-override-target-codec.ts
function parseNonNegativeIndex(text) {
  if (!text)
    throw new Error("empty index");
  const index = Number(text);
  if (!Number.isSafeInteger(index) || index < 0 || String(index) !== text) {
    throw new Error("invalid index");
  }
  return index;
}
function parseGLTFEntityOverrideTarget(sourceEntityId) {
  if (sourceEntityId === "root")
    return [];
  try {
    return sourceEntityId.split("/").map(parseNonNegativeIndex);
  } catch {
    throw new Error(
      `glTF source override target "${sourceEntityId}" must be "root" or a slash-separated child index path`
    );
  }
}
function parseGLTFComponentKey(sourceComponentId, sourceComponentKey) {
  const indexSeparator = sourceComponentKey.indexOf("/");
  const componentType = sourceComponentKey.slice(0, indexSeparator);
  const indexText = sourceComponentKey.slice(indexSeparator + 1);
  try {
    if (indexSeparator <= 0 || indexSeparator !== sourceComponentKey.lastIndexOf("/")) {
      throw new Error("component key must contain exactly one separator");
    }
    if (componentType.includes(":"))
      throw new Error("component type contains a reserved separator");
    const componentIndex = parseNonNegativeIndex(indexText);
    return { componentType, componentIndex };
  } catch {
    throw new Error(`glTF source component override target "${sourceComponentId}" must be "<entity>:<type>/<index>"`);
  }
}
function parseGLTFComponentOverrideTarget(sourceComponentId) {
  const separatorIndex = sourceComponentId.indexOf(":");
  try {
    if (separatorIndex <= 0 || separatorIndex !== sourceComponentId.lastIndexOf(":")) {
      throw new Error("component target must contain exactly one owner separator");
    }
    const sourceEntityId = sourceComponentId.slice(0, separatorIndex);
    const sourceComponentKey = sourceComponentId.slice(separatorIndex + 1);
    const sourceEntityPath = parseGLTFEntityOverrideTarget(sourceEntityId);
    const { componentType, componentIndex } = parseGLTFComponentKey(sourceComponentId, sourceComponentKey);
    return { sourceEntityId, sourceEntityPath, sourceComponentKey, componentType, componentIndex };
  } catch {
    throw new Error(`glTF source component override target "${sourceComponentId}" must be "<entity>:<type>/<index>"`);
  }
}
function formatGLTFComponentOverrideTarget(sourceEntityId, sourceComponentKey) {
  const target = `${sourceEntityId}:${sourceComponentKey}`;
  parseGLTFComponentOverrideTarget(target);
  return target;
}

// packages/model/src/scene-file-v2/instance-component-ref-codec.ts
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sourceSnapshotComponentIds(sourceEntityId, snapshot, assetKind = "Prefab") {
  const components = Object.entries(snapshot.components ?? {});
  const ids = components.map(([key, component]) => [key, component.sceneComponentId]);
  const slotKey = assetKind === "glTF" ? "Transform/0" : createVirtualTransformComponentId(sourceEntityId);
  const sceneSlotId = createVirtualTransformComponentId(snapshot.sceneEntityId);
  if (!ids.some(([key, componentId]) => key === slotKey || componentId === sceneSlotId)) {
    ids.push([slotKey, sceneSlotId]);
  }
  return ids;
}
function findPrefabTarget(binding, target) {
  let resolved;
  for (const [sourceEntityId, snapshot] of Object.entries(binding.sourceEntitySnapshots ?? {})) {
    const componentId = sourceSnapshotComponentIds(sourceEntityId, snapshot).find(([key]) => key === target)?.[1];
    if (!componentId)
      continue;
    if (resolved) {
      throw new Error(
        `Ambiguous Prefab instance component target "${target}" in instance "${binding.instanceRootEntityId}"`
      );
    }
    resolved = {
      ownerId: snapshot.sceneEntityId,
      componentId
    };
  }
  return resolved;
}
function findGLTFTarget(binding, target) {
  const { sourceEntityId, sourceComponentKey } = parseGLTFComponentOverrideTarget(target);
  const snapshot = binding.sourceEntitySnapshots?.[sourceEntityId];
  if (!snapshot)
    return void 0;
  const componentId = sourceSnapshotComponentIds(sourceEntityId, snapshot, "glTF").find(
    ([key]) => key === sourceComponentKey
  )?.[1];
  if (!componentId)
    return void 0;
  return {
    ownerId: snapshot.sceneEntityId,
    componentId
  };
}
function resolveInstanceComponentTarget(prefab, reference) {
  const bindings = Object.values(prefab.bindings ?? {}).filter(
    (binding2) => binding2.instanceRootEntityId === reference.instance
  );
  if (bindings.length !== 1) {
    throw new Error(
      bindings.length === 0 ? `Unknown instance component reference anchor "${reference.instance}"` : `Ambiguous instance component reference anchor "${reference.instance}"`
    );
  }
  const binding = bindings[0];
  const resolved = binding.assetKind === "glTF" ? findGLTFTarget(binding, reference.target) : findPrefabTarget(binding, reference.target);
  if (!resolved) {
    throw new Error(
      `Unknown ${binding.assetKind} component target "${reference.target}" in instance "${reference.instance}"`
    );
  }
  return resolved;
}
function createInstanceComponentTargetEncoder(prefab, sourceEntityIds2) {
  const sourceEntities = new Set(sourceEntityIds2);
  const targetsByOwner = /* @__PURE__ */ new Map();
  const instanceComponentsByOwner = /* @__PURE__ */ new Map();
  for (const binding of Object.values(prefab.bindings ?? {})) {
    for (const [sourceEntityId, snapshot] of Object.entries(binding.sourceEntitySnapshots ?? {})) {
      for (const [sourceComponentKey, componentId] of sourceSnapshotComponentIds(
        sourceEntityId,
        snapshot,
        binding.assetKind
      )) {
        let instanceComponents = instanceComponentsByOwner.get(snapshot.sceneEntityId);
        if (!instanceComponents) {
          instanceComponents = /* @__PURE__ */ new Set();
          instanceComponentsByOwner.set(snapshot.sceneEntityId, instanceComponents);
        }
        instanceComponents.add(componentId);
        if (!sourceEntities.has(binding.instanceRootEntityId))
          continue;
        const target = binding.assetKind === "glTF" ? `${sourceEntityId}:${sourceComponentKey}` : sourceComponentKey;
        const encoded = { instance: binding.instanceRootEntityId, target, assetKind: binding.assetKind };
        let targetsByComponent = targetsByOwner.get(snapshot.sceneEntityId);
        if (!targetsByComponent) {
          targetsByComponent = /* @__PURE__ */ new Map();
          targetsByOwner.set(snapshot.sceneEntityId, targetsByComponent);
        }
        const existing = targetsByComponent.get(componentId) ?? [];
        if (!existing.some(
          (target2) => target2.instance === encoded.instance && target2.target === encoded.target && target2.assetKind === encoded.assetKind
        )) {
          existing.push(encoded);
        }
        targetsByComponent.set(componentId, existing);
      }
    }
  }
  return ({ ownerId, componentId }) => {
    const candidates = targetsByOwner.get(ownerId)?.get(componentId);
    if (candidates && candidates.length > 1) {
      throw new Error(`Ambiguous source encoding for domain component "${ownerId}/${componentId}"`);
    }
    const target = candidates?.[0];
    if (target) {
      if (target.assetKind === "glTF")
        parseGLTFComponentOverrideTarget(target.target);
      return { instance: target.instance, target: target.target };
    }
    if (instanceComponentsByOwner.get(ownerId)?.has(componentId)) {
      throw new Error(`Cannot encode instance component "${ownerId}/${componentId}" outside the current source scope`);
    }
    return void 0;
  };
}
function materializeSourceScopedInstanceReferences(value, binding) {
  const materialized = structuredClone(value);
  materializeSourceScopedInstanceReferencesInPlace(materialized, binding);
  return materialized;
}
function materializeBindingSnapshotReferences(binding) {
  for (const snapshot of Object.values(binding.sourceEntitySnapshots ?? {})) {
    for (const component of Object.values(snapshot.components ?? {})) {
      component.props = materializeSourceScopedInstanceReferences(component.props ?? {}, binding);
      if (component.calls?.length) {
        component.calls = materializeSourceScopedInstanceReferences(component.calls, binding);
      }
    }
  }
}
function materializeSourceScopedInstanceReferencesInPlace(value, binding) {
  const snapshots = binding.sourceEntitySnapshots ?? {};
  let sceneComponentIdBySourceComponentId;
  const resolveComponentSentinel = (sourceComponentId) => {
    if (!sceneComponentIdBySourceComponentId) {
      sceneComponentIdBySourceComponentId = /* @__PURE__ */ new Map();
      for (const [sourceEntityId, snapshot] of Object.entries(snapshots)) {
        for (const [sourceComponentKey, componentId] of sourceSnapshotComponentIds(sourceEntityId, snapshot)) {
          sceneComponentIdBySourceComponentId.set(sourceComponentKey, componentId);
        }
      }
    }
    return sceneComponentIdBySourceComponentId.get(sourceComponentId);
  };
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node)
        visit(item);
      return;
    }
    if (!isRecord3(node))
      return;
    const sourceEntityId = getEntityReferenceSentinelId(node);
    if (sourceEntityId) {
      const sceneEntityId = snapshots[sourceEntityId]?.sceneEntityId;
      if (sceneEntityId)
        node.$entity = sceneEntityId;
    }
    if (Object.keys(node).length === 1 && isInstanceComponentTarget(node.$component)) {
      const snapshot = snapshots[node.$component.instance];
      if (snapshot)
        node.$component.instance = snapshot.sceneEntityId;
    }
    const sourceReference = getDomainComponentReference(node);
    if (sourceReference) {
      const snapshot = snapshots[sourceReference.ownerId];
      const componentId = snapshot && sourceSnapshotComponentIds(sourceReference.ownerId, snapshot).find(
        ([key]) => key === sourceReference.componentId
      )?.[1];
      if (snapshot && componentId) {
        node.ownerId = snapshot.sceneEntityId;
        node.componentId = componentId;
      }
    }
    const sourceComponentId = getComponentReferenceSentinelId(node);
    if (sourceComponentId) {
      const sceneComponentId = resolveComponentSentinel(sourceComponentId);
      if (sceneComponentId)
        node.$component = sceneComponentId;
    }
    for (const child of Object.values(node))
      visit(child);
  };
  visit(value);
}
function resolveInstanceComponentTargetsInPlace(value, prefab, missingInstances = {
  ids: /* @__PURE__ */ new Set(),
  payloads: /* @__PURE__ */ new Set()
}) {
  const resolveValue = (node) => {
    if (missingInstances.payloads.has(node))
      return node;
    if (Array.isArray(node))
      return node.map(resolveValue);
    if (!isRecord3(node))
      return node;
    if (Object.keys(node).length === 1 && isInstanceComponentTarget(node.$component)) {
      if (missingInstances.ids.has(node.$component.instance))
        return node;
      return resolveInstanceComponentTarget(prefab, node.$component);
    }
    for (const key of Object.keys(node))
      node[key] = resolveValue(node[key]);
    return node;
  };
  resolveValue(value);
}
function createBindingSourceCoordinateIndex(binding) {
  const sourceEntityIdBySceneEntityId = /* @__PURE__ */ new Map();
  const sourceComponentKeyBySceneComponentId = /* @__PURE__ */ new Map();
  for (const [sourceEntityId, snapshot] of Object.entries(binding.sourceEntitySnapshots ?? {})) {
    sourceEntityIdBySceneEntityId.set(snapshot.sceneEntityId, sourceEntityId);
    for (const [sourceComponentKey, componentId] of sourceSnapshotComponentIds(sourceEntityId, snapshot)) {
      sourceComponentKeyBySceneComponentId.set(componentId, sourceComponentKey);
    }
  }
  return {
    sourceEntityId: (sceneEntityId) => sourceEntityIdBySceneEntityId.get(sceneEntityId),
    sourceComponentKey: (sceneComponentId) => sourceComponentKeyBySceneComponentId.get(sceneComponentId)
  };
}
function encodeSourceScopedInstanceReferences(value, coordinate) {
  const encoded = structuredClone(value);
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node)
        visit(item);
      return;
    }
    if (!isRecord3(node))
      return;
    const sceneEntityId = getEntityReferenceSentinelId(node);
    if (sceneEntityId) {
      const sourceEntityId = coordinate.sourceEntityId(sceneEntityId);
      if (sourceEntityId)
        node.$entity = sourceEntityId;
    }
    if (Object.keys(node).length === 1 && isInstanceComponentTarget(node.$component)) {
      const sourceInstanceId = coordinate.sourceEntityId(node.$component.instance);
      if (sourceInstanceId)
        node.$component.instance = sourceInstanceId;
    }
    const reference = getDomainComponentReference(node);
    if (reference) {
      const sourceOwnerId = coordinate.sourceEntityId(reference.ownerId);
      const sourceComponentKey = coordinate.sourceComponentKey(reference.componentId);
      if (sourceOwnerId && sourceComponentKey) {
        node.ownerId = sourceOwnerId;
        node.componentId = sourceComponentKey;
      }
    }
    const sceneComponentId = getComponentReferenceSentinelId(node);
    if (sceneComponentId) {
      const sourceComponentKey = coordinate.sourceComponentKey(sceneComponentId);
      if (sourceComponentKey)
        node.$component = sourceComponentKey;
    }
    for (const child of Object.values(node))
      visit(child);
  };
  visit(encoded);
  return encoded;
}

// packages/model/src/scene-file-v2/source-vec3.ts
function tupleToVec3(tuple, fallback) {
  const value = tuple ?? fallback;
  return { x: value[0], y: value[1], z: value[2] };
}
function sourceTupleMatchesVec3(value, vec3) {
  return Boolean(value && value[0] === vec3.x && value[1] === vec3.y && value[2] === vec3.z);
}

// packages/model/src/scene-file-v2/source-entity-state.ts
function rootEntityPropsOverride(sourceEntity, rootOverrideTarget) {
  const targetSourceEntityId = rootOverrideTarget ?? sourceEntity.id;
  return sourceEntity.instance?.overrides?.entityProps?.find((override) => override.target === targetSourceEntityId);
}
function displayNameBasename(name) {
  if (!name)
    return void 0;
  const basename = name.split(/[\\/]/).filter(Boolean).pop();
  if (!basename)
    return void 0;
  const extensionIndex = basename.lastIndexOf(".");
  return extensionIndex > 0 ? basename.slice(0, extensionIndex) : basename;
}
function instanceAssetDisplayName(sourceEntity, resolveInstanceAssetDisplayName) {
  const ref = sourceEntity.instance?.asset?.$ref;
  if (!ref)
    return void 0;
  return displayNameBasename(resolveInstanceAssetDisplayName?.(ref));
}
function resolveSourceInstanceRootOverrideTarget(input) {
  if (!input.sourceEntity.instance)
    return void 0;
  if (input.bindingSourceRootEntityId)
    return input.bindingSourceRootEntityId;
  if (input.instanceAssetKind === "glTF")
    return "root";
  if (input.instanceAssetKind === "Prefab" && input.assetId) {
    return input.resolvePrefabSourceFile?.(input.assetId)?.root;
  }
  return void 0;
}
function readSourceEntityResolvedState(sourceEntity, fallbackSourceEntityId, options = {}) {
  const rootOverride = rootEntityPropsOverride(sourceEntity, options.rootOverrideTarget);
  return {
    name: rootOverride?.name ?? sourceEntity.name ?? instanceAssetDisplayName(sourceEntity, options.resolveInstanceAssetDisplayName) ?? fallbackSourceEntityId,
    isActive: rootOverride?.isActive ?? sourceEntity.isActive ?? true,
    layer: rootOverride?.layer ?? sourceEntity.layer,
    isLocked: rootOverride?.isLocked ?? sourceEntity.isLocked,
    transform: {
      position: tupleToVec3(rootOverride?.position ?? sourceEntity.position, [0, 0, 0]),
      rotation: tupleToVec3(rootOverride?.rotation ?? sourceEntity.rotation, [0, 0, 0]),
      scale: tupleToVec3(rootOverride?.scale ?? sourceEntity.scale, [1, 1, 1])
    }
  };
}

// packages/model/src/scene-file-v2/unresolved-source.ts
function createUnresolvedSourceEntity(entity) {
  const { id: _id, children: _children, components: _components, ...authored } = entity;
  return structuredClone(authored);
}
function withSourceAssetAvailability(options) {
  const { assetExists, assetUnreadable, resolveAssetKind } = options;
  if (!assetExists && !assetUnreadable)
    return options;
  const available = (assetId) => assetExists?.(assetId) !== false && !assetUnreadable?.(assetId);
  return {
    ...options,
    assetExists: available,
    ...resolveAssetKind ? { resolveAssetKind: (assetId) => available(assetId) ? resolveAssetKind(assetId) : void 0 } : {}
  };
}

// packages/model/src/scene-file-v2/prefab-overrides.ts
function vec3TupleFromPartial(value, source, field) {
  if (!isRecord2(value))
    return void 0;
  const resolveAxis = (axis) => {
    const axisValue = value[axis];
    if (typeof axisValue === "number")
      return axisValue;
    if (source)
      return source[axis];
    throw new Error(`Cannot serialize partial prefab ${field} override without source snapshot transform`);
  };
  return [resolveAxis("x"), resolveAxis("y"), resolveAxis("z")];
}
function cloneSourceTuple(value) {
  if (!Array.isArray(value) || value.length < 3)
    return void 0;
  const tuple = [Number(value[0]), Number(value[1]), Number(value[2])];
  return tuple.every(Number.isFinite) ? tuple : void 0;
}
function entityOverridePropsToSource(props, options = {}, sourceTransform) {
  const normalized = convertInternalRefsToSourceValue(props, options);
  const result = {};
  if (typeof normalized.name === "string")
    result.name = normalized.name;
  if (typeof normalized.isActive === "boolean")
    result.isActive = normalized.isActive;
  if (typeof normalized.layer === "number")
    result.layer = normalized.layer;
  if (typeof normalized.isLocked === "boolean")
    result.isLocked = normalized.isLocked;
  const position = cloneSourceTuple(normalized.position);
  const rotation = cloneSourceTuple(normalized.rotation);
  const scale = cloneSourceTuple(normalized.scale);
  if (position)
    result.position = position;
  if (rotation)
    result.rotation = rotation;
  if (scale)
    result.scale = scale;
  if (isRecord2(normalized.transform)) {
    const transformPosition = vec3TupleFromPartial(normalized.transform.position, sourceTransform?.position, "position");
    const transformRotation = vec3TupleFromPartial(normalized.transform.rotation, sourceTransform?.rotation, "rotation");
    const transformScale = vec3TupleFromPartial(normalized.transform.scale, sourceTransform?.scale, "scale");
    if (transformPosition)
      result.position = transformPosition;
    if (transformRotation)
      result.rotation = transformRotation;
    if (transformScale)
      result.scale = transformScale;
  }
  return result;
}
function hasNonEmptyInstanceOverrides(overrides) {
  if (!overrides)
    return false;
  return Boolean(
    overrides.entityProps?.length || overrides.componentProps?.length || overrides.removedEntities?.length || overrides.removedComponents?.length || overrides.addedEntities?.length || overrides.addedComponents?.length
  );
}
function sourcePrefabBindingMatches(binding, expected) {
  if (!expected)
    return true;
  if (expected.assetId && binding.assetId !== expected.assetId)
    return false;
  if (expected.assetKind && binding.assetKind !== expected.assetKind)
    return false;
  return true;
}
function findPrefabBindingForSourceEntity(prefabBindings, entityId, expected) {
  const candidates = [];
  for (const binding of Object.values(prefabBindings?.bindings ?? {})) {
    if (isRecord2(binding) && binding.instanceRootEntityId === entityId) {
      candidates.push(binding);
    }
  }
  if (!expected)
    return candidates[0] ?? null;
  return candidates.find((binding) => sourcePrefabBindingMatches(binding, expected)) ?? null;
}

// packages/model/src/scene-file-v2/domain-codec.ts
function vec3Matches(value, baseline) {
  return value.x === baseline.x && value.y === baseline.y && value.z === baseline.z;
}
function instanceRootEntityOverridePropsFromState(entity, binding) {
  const snapshot = binding?.sourceEntitySnapshots?.[binding.sourceRootEntityId];
  const props = {};
  if (snapshot ? entity.name !== snapshot.name : Boolean(entity.name))
    props.name = entity.name;
  if (snapshot ? entity.isActive !== snapshot.isActive : !entity.isActive)
    props.isActive = entity.isActive;
  const layer = entity.layer ?? 0;
  const snapshotLayer = snapshot?.layer ?? 0;
  if (snapshot ? layer !== snapshotLayer : layer !== 0)
    props.layer = layer;
  const isLocked = entity.isLocked ?? false;
  const snapshotIsLocked = snapshot?.isLocked ?? false;
  if (snapshot ? isLocked !== snapshotIsLocked : isLocked)
    props.isLocked = isLocked;
  const fallbackTransform = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  };
  const baselineTransform = snapshot?.transform ?? fallbackTransform;
  if (!vec3Matches(entity.transform.position, baselineTransform.position)) {
    props.position = [entity.transform.position.x, entity.transform.position.y, entity.transform.position.z];
  }
  if (!vec3Matches(entity.transform.rotation, baselineTransform.rotation)) {
    props.rotation = [entity.transform.rotation.x, entity.transform.rotation.y, entity.transform.rotation.z];
  }
  if (!vec3Matches(entity.transform.scale, baselineTransform.scale)) {
    props.scale = [entity.transform.scale.x, entity.transform.scale.y, entity.transform.scale.z];
  }
  return Object.keys(props).length > 0 ? props : void 0;
}
function mergeRootEntityPropsIntoOverrides(overrides, rootProps, targetEntityId) {
  if (!rootProps || Object.keys(rootProps).length === 0)
    return overrides;
  const result = { ...overrides ?? {} };
  const entityProps = [...result.entityProps ?? []];
  const rootIndex = entityProps.findIndex((override) => override.target === targetEntityId);
  if (rootIndex >= 0) {
    entityProps[rootIndex] = {
      ...entityProps[rootIndex],
      ...rootProps,
      target: targetEntityId
    };
  } else {
    entityProps.unshift({ target: targetEntityId, ...rootProps });
  }
  result.entityProps = entityProps;
  return result;
}
function resolveSerializableInstanceRootOverrideTarget(entity, binding) {
  return binding?.sourceRootEntityId ?? entity.instance?.sourceEntityId ?? (entity.instance?.assetKind === "glTF" ? "root" : void 0);
}
function requireSerializableInstanceRootOverrideTarget(entity, binding) {
  const target = resolveSerializableInstanceRootOverrideTarget(entity, binding);
  if (target)
    return target;
  throw new Error(
    `Cannot serialize instance root override for entity "${entity.id}": missing source root entity id for asset "${entity.instance?.assetId ?? "<unknown>"}"`
  );
}
function prefabBindingToV2Overrides(state, binding, resolveRef, refOptions, resolveAssetContentRevision, addedEntityIndex) {
  if (!binding)
    return void 0;
  const overrides = {};
  let hasData = false;
  const entityProps = [];
  for (const [sourceEntityId, props] of Object.entries(binding.overrides.entityProps ?? {})) {
    const sourceSnapshot = binding.sourceEntitySnapshots?.[sourceEntityId];
    entityProps.push({
      target: sourceEntityId,
      ...entityOverridePropsToSource(props, refOptions, sourceSnapshot?.transform)
    });
  }
  if (entityProps.length) {
    overrides.entityProps = entityProps;
    hasData = true;
  }
  const componentProps = [];
  for (const [sourceEntityId, compOverrides] of Object.entries(binding.overrides.componentProps ?? {})) {
    for (const [sourceComponentKey, entry] of Object.entries(compOverrides)) {
      if (binding.overrides.removedComponents?.[sourceEntityId]?.[sourceComponentKey])
        continue;
      const props = entry.props;
      const calls = entry.calls;
      if (!Object.keys(props ?? {}).length && !calls?.length)
        continue;
      componentProps.push({
        target: sourceComponentOverrideTarget(binding, sourceEntityId, sourceComponentKey),
        ...props && Object.keys(props).length ? { props: convertInternalRefsToSourceValue(props, refOptions) } : {},
        ...calls?.length ? { calls: convertInternalRefsToSourceValue(calls, refOptions) } : {}
      });
    }
  }
  if (componentProps.length) {
    overrides.componentProps = componentProps;
    hasData = true;
  }
  const removedEntities = Object.keys(binding.overrides.removedEntities ?? {});
  if (removedEntities.length) {
    overrides.removedEntities = removedEntities;
    hasData = true;
  }
  const removedComponents = [];
  for (const [sourceEntityId, components] of Object.entries(binding.overrides.removedComponents ?? {})) {
    removedComponents.push(
      ...Object.keys(components).map(
        (sourceComponentKey) => sourceComponentOverrideTarget(binding, sourceEntityId, sourceComponentKey)
      )
    );
  }
  if (removedComponents.length) {
    overrides.removedComponents = removedComponents;
    hasData = true;
  }
  const addedEntities = [];
  const indexOf = addedEntityIndex ?? ((record) => deriveAddedEntityIndex(state.entities, record));
  for (const { added, parent } of collectAddedEntityOverridesInSourceOrder(
    binding,
    state.entities,
    (sourceEntityId) => sourceEntityId,
    indexOf
  )) {
    addedEntities.push({
      id: added.entityId,
      parent,
      index: indexOf(added),
      entity: entityStateToInlineEntity(
        state,
        added.entityId,
        resolveRef,
        refOptions,
        resolveAssetContentRevision,
        addedEntityIndex
      )
    });
  }
  if (addedEntities.length) {
    overrides.addedEntities = addedEntities;
    hasData = true;
  }
  const addedComponents = [];
  for (const [sourceEntityId, components] of Object.entries(binding.overrides.addedComponents ?? {})) {
    const sceneEntityId = binding.sourceToSceneEntity[sourceEntityId];
    const sceneEntity = sceneEntityId ? state.entities[sceneEntityId] : void 0;
    for (const component of Object.values(components)) {
      const liveComponent = sceneEntity?.components?.[component.componentId];
      if (!liveComponent) {
        throw new Error(
          `Prefab binding "${binding.id}" added component "${component.componentId}" is missing from DomainState`
        );
      }
      addedComponents.push({
        id: component.componentId,
        owner: sourceEntityId,
        component: componentStateToSourceComponent(component.componentId, liveComponent, resolveRef, refOptions)
      });
    }
  }
  if (addedComponents.length) {
    overrides.addedComponents = addedComponents;
    hasData = true;
  }
  if (hasData && binding.assetKind === "glTF") {
    assertGlTFOverrideRevisionCurrent({
      requiresRevision: prefabBindingRequiresGlTFContentRevision(binding.overrides),
      authoredRevision: binding.sourceContentRevision,
      currentRevision: resolveAssetContentRevision?.(binding.assetId),
      assetId: binding.assetId,
      bindingId: binding.id
    });
  }
  return hasData ? overrides : void 0;
}
function sourceComponentOverrideTarget(binding, sourceEntityId, sourceComponentKey) {
  if (binding.assetKind !== "glTF")
    return sourceComponentKey;
  return formatGLTFComponentOverrideTarget(sourceEntityId, sourceComponentKey);
}
function prefabBindingsToV2OverridesForEntity(state, binding, resolveRef, refOptions, resolveAssetContentRevision, addedEntityIndex) {
  return prefabBindingToV2Overrides(
    state,
    binding,
    resolveRef,
    refOptions,
    resolveAssetContentRevision,
    addedEntityIndex
  );
}
function glTFSourceContentRevisionField(binding, hasOverrides) {
  if (!hasOverrides || binding?.assetKind !== "glTF" || !binding.sourceContentRevision)
    return {};
  return { sourceContentRevision: binding.sourceContentRevision };
}
function parseSceneFileV2(sceneFile, entities, rootEntityIds, inputOptions = {}) {
  const options = withSourceAssetAvailability(inputOptions);
  assertSourceV2SceneFileStructure(sceneFile);
  const v2Entities = sceneFile.entities;
  const v2Components = sceneFile.components;
  const sourceIndex = buildSourceIdIndex(sceneFile);
  const entityById = sourceIndex.entityById;
  const componentById = sourceIndex.componentById;
  rootEntityIds.push(...sceneFile.scene.rootEntities);
  const reachableEntityIds = collectReachableSourceEntityIds(v2Entities, sceneFile.scene.rootEntities);
  const reachableEntityIdSet = new Set(reachableEntityIds);
  const parentById = /* @__PURE__ */ new Map();
  reachableEntityIds.forEach((parentId) => {
    const entity = entityById.get(parentId);
    if (isSourceInstanceBoundary(entity))
      return;
    entity?.children?.forEach((childId) => parentById.set(childId, parentId));
  });
  for (const entityId of reachableEntityIds) {
    const sourceEntity = entityById.get(entityId);
    if (!sourceEntity)
      throw new Error(`source v2 entity "${entityId}" is missing`);
    const isInstanceBoundary = isSourceInstanceBoundary(sourceEntity);
    const components = {};
    for (const componentId of isInstanceBoundary ? [] : sourceEntity.components ?? []) {
      if (typeof componentId !== "string") {
        throw new Error(`Invalid source v2 scene file: entity "${entityId}" contains a non-id component reference`);
      }
      const sourceComponent = componentById.get(componentId);
      if (!sourceComponent) {
        throw new Error(`Invalid source v2 scene file: component "${componentId}" must exist`);
      }
      components[componentId] = sourceComponentToComponentState(sourceComponent, sourceIndex);
    }
    const parentId = parentById.get(entityId);
    const instanceAssetRef = sourceEntity.instance?.asset?.$ref;
    const instanceAssetId = instanceAssetRef ? resolveRequiredSourceRef(instanceAssetRef) : null;
    const missingInstance = instanceAssetId && options.assetExists?.(instanceAssetId) === false;
    const instanceAssetKind = instanceAssetId && !missingInstance ? options.resolveAssetKind?.(instanceAssetId) : void 0;
    const initialBinding = instanceAssetId ? findPrefabBindingForSourceEntity(options.initialPrefabState, entityId, {
      assetId: instanceAssetId,
      assetKind: instanceAssetKind
    }) : null;
    const rootOverrideTarget = resolveSourceInstanceRootOverrideTarget({
      sourceEntity,
      assetId: instanceAssetId,
      instanceAssetKind,
      bindingSourceRootEntityId: initialBinding?.sourceRootEntityId,
      resolvePrefabSourceFile: options.resolvePrefabSourceFile
    });
    if (!missingInstance && !options.deferPrefabInlineOverrideMaterialization && !initialBinding) {
      assertInstanceOverridesDoNotRequireBinding(sourceEntity, entityId, rootOverrideTarget);
    }
    const resolved = readSourceEntityResolvedState(sourceEntity, "", {
      ...typeof rootOverrideTarget === "string" ? { rootOverrideTarget } : {},
      resolveInstanceAssetDisplayName: options.resolveInstanceAssetDisplayName
    });
    const entityState = {
      id: entityId,
      name: resolved.name,
      isActive: resolved.isActive,
      parentId: parentId ?? null,
      children: (isInstanceBoundary ? [] : sourceEntity.children ?? []).filter(
        (childId) => reachableEntityIdSet.has(childId)
      ),
      transform: resolved.transform,
      components,
      layer: resolved.layer,
      ...resolved.isLocked ? { isLocked: true } : {}
    };
    if (missingInstance) {
      entityState.name ||= instanceAssetId;
      entityState.unresolvedSource = createUnresolvedSourceEntity(sourceEntity);
    } else if (instanceAssetId) {
      entityState.instance = {
        assetId: instanceAssetId,
        ...sourceEntity.instance?.asset?.key ? { assetKey: sourceEntity.instance.asset.key } : {},
        ...instanceAssetKind ? { assetKind: instanceAssetKind } : {},
        bindingId: initialBinding?.id ?? `binding-${instanceAssetId}-${entityId}`,
        role: "root",
        ...initialBinding?.sourceRootEntityId ? { sourceEntityId: initialBinding.sourceRootEntityId } : {}
      };
    }
    entities[entityId] = entityState;
  }
  if (!options.deferPrefabInlineOverrideMaterialization) {
    materializeAddedOverridesFromSource(
      sceneFile,
      entities,
      options.resolveAssetKind,
      options.initialPrefabState,
      void 0,
      options.assetExists
    );
  }
}
function assertInstanceOverridesDoNotRequireBinding(sourceEntity, sourceEntityId, rootOverrideTarget) {
  const overrides = sourceEntity.instance?.overrides;
  if (!overrides)
    return;
  const effectiveRootTarget = rootOverrideTarget ?? sourceEntityId;
  const hasSidecarOnlyPayload = Boolean(overrides.componentProps?.length) || Boolean(overrides.removedEntities?.length) || Boolean(overrides.removedComponents?.length) || Boolean(overrides.addedEntities?.length) || Boolean(overrides.addedComponents?.length) || Boolean(overrides.entityProps?.some((override) => override.target !== effectiveRootTarget));
  if (!hasSidecarOnlyPayload)
    return;
  throw new Error(
    `Cannot parse source v2 instance entity "${sourceEntityId}" with sidecar-owned overrides without prefab binding state. Use hydrateSourceV2SceneToDomain, pass initialPrefabState, or defer prefab inline override materialization.`
  );
}
function sourceComponentToComponentState(component, sourceIndex) {
  assertCanonicalPostProcessProps(component.type, component.props, `source component ${component.type}.props`);
  const convertOptions = {
    resolveComponentOwner: (componentId) => sourceIndex?.componentOwnerEntityIdById.get(componentId)
  };
  return {
    type: component.type,
    ...component.script?.$ref ? { refId: resolveRequiredSourceRef(component.script.$ref) } : {},
    ...component.script?.key ? { scriptKey: component.script.key } : {},
    props: convertAssetRefsToDomainRefs(component.props ?? {}, convertOptions),
    ...component.calls?.length ? { calls: convertAssetRefsToDomainRefs(component.calls, convertOptions) } : {}
  };
}
function tupleToTransform(entity) {
  return {
    position: tupleToVec3(entity.position, [0, 0, 0]),
    rotation: tupleToVec3(entity.rotation, [0, 0, 0]),
    scale: tupleToVec3(entity.scale, [1, 1, 1])
  };
}
function applyInlineInstanceRootOverrides(entity, overrides, rootSourceEntityId) {
  if (!overrides?.entityProps?.length)
    return;
  for (const override of overrides.entityProps) {
    if (override.target !== rootSourceEntityId)
      continue;
    if (override.name !== void 0)
      entity.name = override.name;
    if (override.isActive !== void 0)
      entity.isActive = override.isActive;
    if (override.layer !== void 0)
      entity.layer = override.layer;
    if (override.isLocked !== void 0)
      entity.isLocked = override.isLocked;
    if (override.position)
      entity.transform.position = tupleToVec3(override.position, [0, 0, 0]);
    if (override.rotation)
      entity.transform.rotation = tupleToVec3(override.rotation, [0, 0, 0]);
    if (override.scale)
      entity.transform.scale = tupleToVec3(override.scale, [1, 1, 1]);
  }
}
function insertChildAt(entities, parentId, childId, index) {
  const parent = entities[parentId];
  if (!parent)
    return;
  const existingIndex = parent.children.indexOf(childId);
  if (existingIndex >= 0) {
    parent.children.splice(existingIndex, 1);
  }
  const targetIndex = index === void 0 ? parent.children.length : Math.min(Math.max(index, 0), parent.children.length);
  parent.children.splice(targetIndex, 0, childId);
}
function createAddedOverrideMaterializationReport() {
  return {
    addedEntityKeys: /* @__PURE__ */ new Set(),
    addedComponentKeys: /* @__PURE__ */ new Set()
  };
}
function addedEntityMaterializationKey(bindingId, entityId) {
  return `${bindingId}\0${entityId}`;
}
function addedComponentMaterializationKey(bindingId, sourceEntityId, componentId) {
  return `${bindingId}\0${sourceEntityId}\0${componentId}`;
}
function recordMaterializedAddedEntity(report, bindingId, entityId) {
  report?.addedEntityKeys.add(addedEntityMaterializationKey(bindingId, entityId));
}
function recordMaterializedAddedComponent(report, bindingId, sourceEntityId, componentId) {
  report?.addedComponentKeys.add(addedComponentMaterializationKey(bindingId, sourceEntityId, componentId));
}
function hasMaterializedAddedEntity(report, bindingId, entityId) {
  return report.addedEntityKeys.has(addedEntityMaterializationKey(bindingId, entityId));
}
function hasMaterializedAddedComponent(report, bindingId, sourceEntityId, componentId) {
  return report.addedComponentKeys.has(addedComponentMaterializationKey(bindingId, sourceEntityId, componentId));
}
function assertCanMaterializeAddedEntity(entities, entityId, bindingId) {
  const existing = entities[entityId];
  if (!existing)
    return;
  const instance = existing.instance;
  if (instance?.bindingId === bindingId && instance.role === "added")
    return;
  throw new Error(`Prefab binding "${bindingId}" added entity "${entityId}" collides with an existing scene entity`);
}
function assertCanMaterializeAddedComponent(sceneEntity, componentId, bindingId) {
  const existing = sceneEntity.components[componentId];
  if (!existing)
    return;
  const instance = existing.instance;
  if (instance?.bindingId === bindingId && instance.role === "added")
    return;
  throw new Error(
    `Prefab binding "${bindingId}" added component "${componentId}" collides with an existing scene component`
  );
}
function canMergeMaterializedNestedInstanceRoot(existing, sidecarBinding, instanceAssetId, instanceAssetKind) {
  if (!existing || !sidecarBinding)
    return false;
  const instance = existing.instance;
  if (!instance || instance.bindingId !== sidecarBinding.id || instance.role !== "root")
    return false;
  if (instance.assetId !== instanceAssetId)
    return false;
  if (instanceAssetKind && instance.assetKind && instance.assetKind !== instanceAssetKind)
    return false;
  return sidecarBinding.instanceRootEntityId === existing.id;
}
function materializeInlineAddedEntity(entities, binding, entityId, parentId, inlineEntity, prefabBindings, resolveAssetKind, report, siblingIndex, assetExists) {
  const instanceAssetRef = inlineEntity.instance?.asset?.$ref;
  if (instanceAssetRef) {
    const instanceAssetId = resolveRequiredSourceRef(instanceAssetRef);
    if (assetExists?.(instanceAssetId) === false) {
      entities[entityId] = {
        id: entityId,
        name: instanceAssetId,
        isActive: true,
        parentId,
        children: [],
        transform: tupleToTransform({}),
        components: {},
        instance: { assetId: binding.assetId, assetKind: binding.assetKind, bindingId: binding.id, role: "added" },
        unresolvedSource: createUnresolvedSourceEntity(inlineEntity)
      };
      recordMaterializedAddedEntity(report, binding.id, entityId);
      insertChildAt(entities, parentId, entityId, siblingIndex);
      return;
    }
    const instanceAssetKind = resolveAssetKind?.(instanceAssetId);
    const sidecarBinding = findPrefabBindingForSourceEntity(prefabBindings, entityId, {
      assetId: instanceAssetId,
      assetKind: instanceAssetKind
    });
    if (hasNonEmptyInstanceOverrides(inlineEntity.instance?.overrides) && !sidecarBinding) {
      throw new Error(
        `Invalid source v2 scene file: inline added instance "${entityId}" contains instance.overrides but no matching prefab binding`
      );
    }
    const resolvedInstanceAssetKind = sidecarBinding?.assetKind ?? instanceAssetKind;
    const rootSourceEntityId = sidecarBinding?.sourceRootEntityId ?? entityId;
    const entityState2 = {
      id: entityId,
      name: "",
      isActive: true,
      parentId,
      children: [],
      transform: tupleToTransform(inlineEntity),
      components: {},
      instance: {
        assetId: instanceAssetId,
        ...inlineEntity.instance?.asset.key ? { assetKey: inlineEntity.instance.asset.key } : {},
        ...resolvedInstanceAssetKind ? { assetKind: resolvedInstanceAssetKind } : {},
        bindingId: sidecarBinding?.id ?? `binding-${instanceAssetId}-${entityId}`,
        role: "root"
      }
    };
    applyInlineInstanceRootOverrides(entityState2, inlineEntity.instance?.overrides, rootSourceEntityId);
    const existing = entities[entityId];
    if (canMergeMaterializedNestedInstanceRoot(existing, sidecarBinding, instanceAssetId, resolvedInstanceAssetKind)) {
      entities[entityId] = {
        ...existing,
        parentId,
        transform: entityState2.transform,
        instance: entityState2.instance
      };
      applyInlineInstanceRootOverrides(entities[entityId], inlineEntity.instance?.overrides, rootSourceEntityId);
      recordMaterializedAddedEntity(report, binding.id, entityId);
      insertChildAt(entities, parentId, entityId, siblingIndex);
      if (sidecarBinding && inlineEntity.instance?.overrides) {
        materializeAddedOverridesForBinding(
          inlineEntity.instance.overrides,
          sidecarBinding,
          entities,
          prefabBindings,
          resolveAssetKind,
          report,
          assetExists
        );
      }
      return;
    }
    assertCanMaterializeAddedEntity(entities, entityId, binding.id);
    entities[entityId] = entityState2;
    recordMaterializedAddedEntity(report, binding.id, entityId);
    insertChildAt(entities, parentId, entityId, siblingIndex);
    if (sidecarBinding && inlineEntity.instance?.overrides) {
      materializeAddedOverridesForBinding(
        inlineEntity.instance.overrides,
        sidecarBinding,
        entities,
        prefabBindings,
        resolveAssetKind,
        report,
        assetExists
      );
    }
    return;
  }
  const componentEntries = inlineEntity.components ?? [];
  const components = {};
  componentEntries.forEach((component) => {
    const componentId = component.id;
    components[componentId] = {
      ...sourceComponentToComponentState(component),
      instance: { bindingId: binding.id, role: "added" }
    };
  });
  const children = [];
  const entityState = {
    id: entityId,
    name: inlineEntity.name ?? "",
    isActive: inlineEntity.isActive ?? true,
    parentId,
    children,
    transform: tupleToTransform(inlineEntity),
    components,
    layer: inlineEntity.layer,
    instance: {
      assetId: binding.assetId,
      assetKind: binding.assetKind,
      bindingId: binding.id,
      role: "added"
    }
  };
  assertCanMaterializeAddedEntity(entities, entityId, binding.id);
  entities[entityId] = entityState;
  recordMaterializedAddedEntity(report, binding.id, entityId);
  insertChildAt(entities, parentId, entityId, siblingIndex);
  inlineEntity.children?.forEach((child, index) => {
    const childId = child.id;
    materializeInlineAddedEntity(
      entities,
      binding,
      childId,
      entityId,
      child,
      prefabBindings,
      resolveAssetKind,
      report,
      index,
      assetExists
    );
  });
}
function materializeAddedOverridesForBinding(overrides, binding, entities, prefabBindings, resolveAssetKind, report, assetExists) {
  overrides.addedEntities?.forEach((override) => {
    const added = binding.overrides.addedEntities[override.id];
    const parentSceneEntityId = added ? binding.sourceToSceneEntity[added.parentSourceEntityId] : void 0;
    if (!parentSceneEntityId || !added)
      return;
    materializeInlineAddedEntity(
      entities,
      binding,
      added.entityId,
      parentSceneEntityId,
      override.entity,
      prefabBindings,
      resolveAssetKind,
      report,
      override.index,
      assetExists
    );
  });
  overrides.addedComponents?.forEach((override) => {
    const ownerSourceEntityId = override.owner;
    const added = binding.overrides.addedComponents[ownerSourceEntityId]?.[override.id];
    const component = sourceComponentToComponentState(override.component);
    if (!added)
      return;
    const sceneEntityId = binding.sourceToSceneEntity[added.ownerSourceEntityId];
    const sceneEntity = sceneEntityId ? entities[sceneEntityId] : void 0;
    if (!sceneEntity)
      return;
    assertCanMaterializeAddedComponent(sceneEntity, added.componentId, binding.id);
    sceneEntity.components[added.componentId] = {
      ...component,
      instance: { bindingId: binding.id, role: "added" }
    };
    recordMaterializedAddedComponent(report, binding.id, added.ownerSourceEntityId, added.componentId);
  });
}
function materializeNestedInstanceAddedEntities(binding, payloads, entities, prefabBindings, resolveAssetKind, report, assetExists) {
  for (const payload of payloads) {
    const added = binding.overrides.addedEntities?.[payload.id];
    if (!added)
      continue;
    if (hasMaterializedAddedEntity(report, binding.id, added.entityId))
      continue;
    const parentSceneEntityId = binding.sourceToSceneEntity[added.parentSourceEntityId];
    if (!parentSceneEntityId)
      continue;
    materializeInlineAddedEntity(
      entities,
      binding,
      added.entityId,
      parentSceneEntityId,
      // The saved payload lives in this instance's source scope (see the encoder in
      // domainStateToSceneFileV2); map its references onto the entities of this reload.
      materializeSourceScopedInstanceReferences(payload.entity, binding),
      prefabBindings,
      resolveAssetKind,
      report,
      payload.index,
      assetExists
    );
  }
}
function materializeAddedOverridesFromSource(sceneFile, entities, resolveAssetKind, prefabBindings, report, assetExists) {
  sceneFile.entities.forEach((sourceEntity) => {
    const overrides = sourceEntity.instance?.overrides;
    if (!overrides || entities[sourceEntity.id]?.unresolvedSource)
      return;
    const rootEntityId = sourceEntity.id;
    const instanceAssetRef = sourceEntity.instance?.asset?.$ref;
    const instanceAssetId = instanceAssetRef ? resolveRequiredSourceRef(instanceAssetRef) : void 0;
    const instanceAssetKind = instanceAssetId ? resolveAssetKind?.(instanceAssetId) : void 0;
    const binding = rootEntityId ? findPrefabBindingForSourceEntity(prefabBindings, rootEntityId, {
      assetId: instanceAssetId,
      assetKind: instanceAssetKind
    }) : null;
    if (!binding) {
      if (overrides.addedEntities?.length || overrides.addedComponents?.length) {
        throw new Error(
          `Cannot materialize source v2 instance entity "${rootEntityId ?? "<missing>"}" added overrides without prefab binding state.`
        );
      }
      return;
    }
    materializeAddedOverridesForBinding(
      overrides,
      binding,
      entities,
      prefabBindings,
      resolveAssetKind,
      report,
      assetExists
    );
  });
}
function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}
function assertNoLegacyPerEntityPrefabOverrideState(entity) {
  const legacy = entity;
  const legacyKeys = [
    "modifications",
    "removedEntities",
    "removedComponents",
    "addedEntities",
    "addedComponents"
  ].filter((key) => hasNonEmptyArray(legacy[key]));
  if (legacyKeys.length) {
    throw new Error(
      `Invalid schema v2 domain state: entity "${entity.id}" contains legacy per-entity prefab override state (${legacyKeys.join(
        ", "
      )}); use PrefabBindingState.overrides as the only prefab override source of truth`
    );
  }
}
function findBindingForSerializableInstance(state, entity) {
  const instance = entity.instance;
  if (!instance?.assetId || instance.role === "added")
    return void 0;
  const expected = { assetId: instance.assetId, assetKind: instance.assetKind };
  const direct = instance.bindingId ? state.prefab?.bindings?.[instance.bindingId] : void 0;
  if (direct && direct.instanceRootEntityId === entity.id && direct.assetId === instance.assetId && (!instance.assetKind || !direct.assetKind || direct.assetKind === instance.assetKind)) {
    return direct;
  }
  return findPrefabBindingForSourceEntity(state.prefab, entity.id, expected) ?? void 0;
}
function createSerializeAssetRefResolver(options) {
  return (assetId) => {
    const sourceRef = assertAndReturnSourceAssetRef(assetId);
    if (options.assetExists && !options.assetExists(sourceRef)) {
      throw new SceneV2DanglingAssetRefError(sourceRef);
    }
    return sourceRef;
  };
}
function createInternalAssetRefSerializeOptions(resolveRef, resolveInternalComponentRef) {
  return {
    validateAssetRef: (assetId) => {
      resolveRef(assetId);
    },
    ...resolveInternalComponentRef ? { resolveInternalComponentRef } : {}
  };
}
function domainStateToSceneFileV2(state, _options = {}) {
  const resolveRef = createSerializeAssetRefResolver(_options);
  const ordered = orderSceneEntities(state);
  const candidateEntityIds = ordered.map((entity) => entity.id);
  const encodeInstanceComponentRef = state.prefab ? createInstanceComponentTargetEncoder(state.prefab, candidateEntityIds) : void 0;
  const refOptions = createInternalAssetRefSerializeOptions(resolveRef, encodeInstanceComponentRef);
  const sceneSettings = state.scene.settings ? editorSceneSettingsToSourceSettings(state.scene.settings, refOptions) : void 0;
  completeSourceSceneAmbient(sceneSettings);
  const components = [];
  const entities = ordered.map((entity) => {
    const entityComponentsBuffer = [];
    const result2 = serializeOneEntity(entity, entityComponentsBuffer, candidateEntityIds);
    components.push(...entityComponentsBuffer);
    return result2;
  });
  const validEntityIds = new Set(entities.map((e) => e.id));
  for (const entity of entities) {
    if (!entity.children)
      continue;
    const pruned = entity.children.filter((id) => validEntityIds.has(id));
    if (pruned.length !== entity.children.length) {
      if (pruned.length) {
        entity.children = pruned;
      } else {
        delete entity.children;
      }
    }
  }
  function serializeOneEntity(entity, componentsBuffer, candidateIds) {
    if (entity.unresolvedSource) {
      return { id: entity.id, ...structuredClone(entity.unresolvedSource) };
    }
    const entityBinding = findBindingForSerializableInstance(state, entity);
    const bindingOverrides = entity.instance?.assetId && entity.instance.role !== "added" ? prefabBindingsToV2OverridesForEntity(
      state,
      entityBinding,
      resolveRef,
      refOptions,
      _options.resolveAssetContentRevision,
      _options.addedEntityIndex
    ) : void 0;
    const rootOverrideTarget = resolveSerializableInstanceRootOverrideTarget(entity, entityBinding);
    const rootOverrideProps = rootOverrideTarget ? bindingOverrides?.entityProps?.find((item) => item.target === rootOverrideTarget) : void 0;
    const result2 = { id: entity.id };
    if (entity.name && rootOverrideProps?.name !== entity.name)
      result2.name = entity.name;
    if (!entity.isActive && rootOverrideProps?.isActive !== entity.isActive)
      result2.isActive = false;
    if (entity.layer !== void 0 && entity.layer !== 0 && rootOverrideProps?.layer !== entity.layer) {
      result2.layer = entity.layer;
    }
    if (entity.isLocked && rootOverrideProps?.isLocked !== entity.isLocked)
      result2.isLocked = true;
    const { position, rotation, scale } = entity.transform;
    if (!sourceTupleMatchesVec3(rootOverrideProps?.position, position) && (position.x !== 0 || position.y !== 0 || position.z !== 0)) {
      result2.position = [position.x, position.y, position.z];
    }
    if (!sourceTupleMatchesVec3(rootOverrideProps?.rotation, rotation) && (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0)) {
      result2.rotation = [rotation.x, rotation.y, rotation.z];
    }
    if (!sourceTupleMatchesVec3(rootOverrideProps?.scale, scale) && (scale.x !== 1 || scale.y !== 1 || scale.z !== 1)) {
      result2.scale = [scale.x, scale.y, scale.z];
    }
    if (entity.instance?.assetId && entity.instance.role !== "added") {
      assertNoLegacyPerEntityPrefabOverrideState(entity);
      const instanceResult = {
        id: entity.id,
        instance: {
          asset: {
            $ref: resolveRef(entity.instance.assetId),
            ...entity.instance.assetKey ? { key: entity.instance.assetKey } : {}
          }
        }
      };
      const rootProps = entityBinding ? void 0 : instanceRootEntityOverridePropsFromState(entity, void 0);
      const inlineOverrides = mergeRootEntityPropsIntoOverrides(
        bindingOverrides,
        rootProps,
        rootProps ? requireSerializableInstanceRootOverrideTarget(entity, entityBinding) : rootOverrideTarget ?? entity.id
      );
      if (inlineOverrides)
        instanceResult.instance.overrides = inlineOverrides;
      Object.assign(instanceResult.instance, glTFSourceContentRevisionField(entityBinding, Boolean(inlineOverrides)));
      return instanceResult;
    }
    const childIds = entity.children.filter((id) => candidateIds.includes(id));
    if (childIds.length)
      result2.children = childIds;
    const componentEntries = Object.entries(entity.components);
    const sourceComponentIds2 = [];
    for (const [componentId, component] of componentEntries) {
      if (component.type === "Transform")
        continue;
      if (component.instance?.role === "added")
        continue;
      sourceComponentIds2.push(componentId);
      componentsBuffer.push(componentStateToSourceComponent(componentId, component, resolveRef, refOptions));
    }
    if (sourceComponentIds2.length)
      result2.components = sourceComponentIds2;
    return result2;
  }
  const rootEntityIds = state.scene.rootEntityIds.filter((id) => validEntityIds.has(id));
  const result = {
    asset: { version: "2.0", generator: "Galacean Editor" },
    scene: {
      ...sceneSettings ?? {},
      rootEntities: rootEntityIds
    },
    entities,
    components
  };
  const serializedEntityIds = new Set(entities.map((entity) => entity.id));
  const bindings = Object.values(state.prefab?.bindings ?? {});
  const nestedOverrides = structuredClone(
    (state.prefab?.unresolvedNestedOverrides ?? []).filter((entry) => serializedEntityIds.has(entry.rootSceneEntityId))
  );
  for (const binding of bindings) {
    if (serializedEntityIds.has(binding.instanceRootEntityId))
      continue;
    if (Object.values(binding.overrides).every((bucket) => Object.keys(bucket).length === 0))
      continue;
    const address = getNestedInstanceAddress({ bindings: state.prefab?.bindings ?? {} }, binding, serializedEntityIds);
    if (!address)
      continue;
    const coordinate = createBindingSourceCoordinateIndex(binding);
    const nestedRefOptions = createNestedInstanceSerializeRefOptions(refOptions, coordinate);
    const addedEntities = [];
    for (const { added, parent } of collectAddedEntityOverridesInSourceOrder(
      binding,
      state.entities,
      (sourceEntityId) => sourceEntityId
    )) {
      addedEntities.push({
        id: added.entityId,
        parent,
        index: deriveAddedEntityIndex(state.entities, added),
        entity: encodeSourceScopedInstanceReferences(
          entityStateToInlineEntity(
            state,
            added.entityId,
            resolveRef,
            nestedRefOptions,
            _options.resolveAssetContentRevision
          ),
          coordinate
        )
      });
    }
    nestedOverrides.push({
      assetId: binding.assetId,
      ...address,
      overrides: encodeNestedInstanceOverrides(binding, coordinate),
      ...addedEntities.length ? { addedEntities } : {}
    });
  }
  if (nestedOverrides.length) {
    result.prefab = { nestedOverrides };
  }
  return result;
}
var SceneV2DanglingAssetRefError = class extends Error {
  constructor(assetId) {
    super(`[SceneV2] dangling asset ref "${assetId}"`);
    this.assetId = assetId;
    this.name = "SceneV2DanglingAssetRefError";
  }
  code = "SCENE_ASSET_REFERENCE_MISSING";
};
function entityStateToInlineEntity(state, entityId, resolveRef, refOptions, resolveAssetContentRevision, addedEntityIndex) {
  const entity = state.entities[entityId];
  if (!entity)
    throw new Error(`Inline prefab override entity "${entityId}" not found`);
  if (entity.unresolvedSource) {
    return { id: entityId, ...structuredClone(entity.unresolvedSource) };
  }
  if (entity.instance?.assetId && entity.instance.role !== "added") {
    const binding = findBindingForSerializableInstance(state, entity);
    const result2 = {
      id: entityId,
      instance: {
        asset: {
          $ref: resolveRef(entity.instance.assetId),
          ...entity.instance.assetKey ? { key: entity.instance.assetKey } : {}
        }
      }
    };
    const bindingOverrides = prefabBindingToV2Overrides(
      state,
      binding,
      resolveRef,
      refOptions,
      resolveAssetContentRevision,
      addedEntityIndex
    );
    const rootProps = binding ? void 0 : instanceRootEntityOverridePropsFromState(entity, void 0);
    const rootOverrideTarget = resolveSerializableInstanceRootOverrideTarget(entity, binding);
    const inlineOverrides = mergeRootEntityPropsIntoOverrides(
      bindingOverrides,
      rootProps,
      rootProps ? requireSerializableInstanceRootOverrideTarget(entity, binding) : rootOverrideTarget ?? entityId
    );
    if (inlineOverrides)
      result2.instance.overrides = inlineOverrides;
    Object.assign(result2.instance, glTFSourceContentRevisionField(binding, Boolean(inlineOverrides)));
    return result2;
  }
  const result = { id: entityId };
  if (entity.name)
    result.name = entity.name;
  if (!entity.isActive)
    result.isActive = false;
  if (entity.isLocked)
    result.isLocked = true;
  if (entity.layer !== void 0 && entity.layer !== 0)
    result.layer = entity.layer;
  const { position, rotation, scale } = entity.transform;
  if (position.x !== 0 || position.y !== 0 || position.z !== 0)
    result.position = [position.x, position.y, position.z];
  if (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0)
    result.rotation = [rotation.x, rotation.y, rotation.z];
  if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1)
    result.scale = [scale.x, scale.y, scale.z];
  const components = Object.entries(entity.components).filter(([, component]) => component.type !== "Transform").map(([componentId, component]) => componentStateToSourceComponent(componentId, component, resolveRef, refOptions));
  if (components.length)
    result.components = components;
  const children = entity.children.filter((childId) => !state.entities[childId]?.isStripped).map(
    (childId) => entityStateToInlineEntity(state, childId, resolveRef, refOptions, resolveAssetContentRevision, addedEntityIndex)
  );
  if (children.length)
    result.children = children;
  return result;
}
function componentStateToSourceComponent(componentId, component, resolveRef, refOptions) {
  const props = convertInternalRefsToSourceValue(component.props ?? {}, refOptions);
  assertCanonicalPostProcessProps(component.type, props, `domain component ${component.type}.props`);
  return {
    id: componentId,
    type: component.type,
    ...component.refId ? {
      script: {
        $ref: resolveRef(component.refId),
        ...component.scriptKey ? { key: component.scriptKey } : {}
      }
    } : {},
    props,
    ...component.calls?.length ? {
      calls: convertInternalRefsToSourceValue(component.calls, refOptions)
    } : {}
  };
}
function isMaterializedInstanceLinkedEntity(state, entity) {
  const instance = entity.instance;
  if (instance?.role !== "linked" || !instance.bindingId)
    return false;
  const binding = state.prefab?.bindings?.[instance.bindingId];
  return Boolean(binding && binding.instanceRootEntityId !== entity.id);
}
function isPrefabAddedOverrideEntity(state, entityId) {
  for (const binding of Object.values(state.prefab?.bindings ?? {})) {
    if (binding.overrides.addedEntities[entityId])
      return true;
  }
  return false;
}
function orderSceneEntities(state) {
  const ordered = [];
  const visited = /* @__PURE__ */ new Set();
  function visit(entityId) {
    if (visited.has(entityId))
      return;
    const entity = state.entities[entityId];
    if (!entity)
      return;
    if (entity.instance?.role === "added" || isPrefabAddedOverrideEntity(state, entityId) || isMaterializedInstanceLinkedEntity(state, entity)) {
      return;
    }
    visited.add(entityId);
    ordered.push(entity);
    if (entity.instance?.assetId)
      return;
    for (const childId of entity.children) {
      visit(childId);
    }
  }
  for (const rootEntityId of state.scene.rootEntityIds) {
    visit(rootEntityId);
  }
  return ordered;
}
function createNestedInstanceSerializeRefOptions(refOptions, coordinate) {
  return {
    ...refOptions,
    // Only references whose owner and component both live in this binding are this
    // binding's to encode; anything else keeps the scene-scope behavior, matching
    // encodeSourceScopedInstanceReferences.
    resolveInternalComponentRef: (reference) => (coordinate.sourceEntityId(reference.ownerId) ? coordinate.sourceComponentKey(reference.componentId) : void 0) ?? refOptions.resolveInternalComponentRef?.(reference)
  };
}
function encodeNestedInstanceOverrides(binding, coordinate) {
  const overrides = cloneState(binding.overrides);
  for (const bucketOfBuckets of [overrides.componentProps, overrides.addedComponents]) {
    for (const bucket of Object.values(bucketOfBuckets ?? {})) {
      for (const entry of Object.values(bucket)) {
        if (entry.props) {
          entry.props = encodeSourceScopedInstanceReferences(entry.props, coordinate);
        }
        if (entry.calls?.length) {
          entry.calls = encodeSourceScopedInstanceReferences(entry.calls, coordinate);
        }
      }
    }
  }
  return overrides;
}

// packages/model/src/modules/components/domain/sourceComponentPropsPatch.ts
var import_es_toolkit = __toESM(require_dist2());

// packages/model/src/modules/utils/MessageCenter.ts
var import_eventemitter3 = __toESM(require_eventemitter3());
var MessageCenterImpl = class extends import_eventemitter3.EventEmitter {
  dispatch(event, ...args) {
    this.emit(event, ...args);
  }
};
var MessageCenter = new MessageCenterImpl();

// packages/model/src/modules/components/decorators/PropertyProxy.ts
var storedPropertyProxySymbol = Symbol("storedPropertyProxy");

// packages/model/src/modules/components/decorators/Serialize.ts
var storedSerializeSymbol = Symbol("storedSerialize");

// packages/model/src/scene-file-v2/compose-prefab-source.ts
function composePrefabSource(prefabFile, overrides, options = {}) {
  assertSourceV2PrefabFileStructure(prefabFile);
  let result = cloneSourceValue(prefabFile);
  for (const added of overrides?.addedEntities ?? []) {
    const entities = [];
    const components = [];
    const visit = (id, inline) => {
      const { children, components: inlineComponents, ...props } = inline;
      entities.push({
        ...props,
        id,
        ...children ? { children: children.map((child) => child.id) } : {},
        ...inlineComponents ? { components: inlineComponents.map((component) => component.id) } : {}
      });
      components.push(...inlineComponents ?? []);
      for (const child of children ?? [])
        visit(child.id, child);
    };
    visit(added.id, added.entity);
    result = addPrefabSourceEntityTree(result, {
      parentSourceEntityId: added.parent,
      index: Number.MAX_SAFE_INTEGER,
      entities,
      entityIds: entities.map((entity) => entity.id),
      components,
      componentIds: components.map((component) => component.id)
    });
  }
  for (const added of overrides?.addedComponents ?? []) {
    result = addPrefabSourceComponent(result, added.owner, added.id, added.component);
  }
  for (const { target, position, rotation, scale, ...props } of overrides?.entityProps ?? []) {
    const entity = result.entities.find((entity2) => entity2.id === target);
    const rootOverrideTarget = entity?.instance ? options.resolveInstanceRootOverrideTarget?.(entity) : void 0;
    if (entity?.instance && rootOverrideTarget === void 0) {
      throw new Error(`Cannot compose prefab instance entity "${target}" without its root override target`);
    }
    result = applyPrefabSourceEntityProps(
      result,
      target,
      {
        ...props,
        transform: {
          ...position ? { position: tupleToVec3(position, [0, 0, 0]) } : {},
          ...rotation ? { rotation: tupleToVec3(rotation, [0, 0, 0]) } : {},
          ...scale ? { scale: tupleToVec3(scale, [1, 1, 1]) } : {}
        }
      },
      { rootOverrideTarget }
    );
  }
  for (const { target, ...mutation } of overrides?.componentProps ?? []) {
    result = applyPrefabSourceComponentMutation(result, target, mutation);
  }
  for (const id of overrides?.removedComponents ?? []) {
    result = removePrefabSourceComponent(result, id);
  }
  const entityIdsBeforeRemoval = new Set(result.entities.map((entity) => entity.id));
  for (const id of overrides?.removedEntities ?? []) {
    if (!result.entities.some((entity) => entity.id === id) && entityIdsBeforeRemoval.has(id))
      continue;
    result = removePrefabSourceEntityTree(result, id);
  }
  const entityById = new Map(result.entities.map((entity) => [entity.id, entity]));
  const addedIds = new Set(overrides?.addedEntities?.map((added) => added.id));
  for (const entity of result.entities) {
    if (entity.children)
      entity.children = entity.children.filter((id) => !addedIds.has(id));
  }
  const addedEntityIndexByParent = /* @__PURE__ */ new Map();
  for (const added of overrides?.addedEntities ?? []) {
    if (!entityById.has(added.id))
      continue;
    const parent = entityById.get(added.parent);
    const children = parent.children ??= [];
    const fallbackIndex = addedEntityIndexByParent.get(added.parent) ?? 0;
    addedEntityIndexByParent.set(added.parent, fallbackIndex + 1);
    children.splice(Math.min(added.index ?? fallbackIndex, children.length), 0, added.id);
  }
  return result;
}

// packages/model/src/scene-file-v2/resolve-prefab-binding-source.ts
function composeInstanceSource(source, overrides, resolveSource, resolveAssetKind) {
  return composePrefabSource(source, overrides, {
    resolveInstanceRootOverrideTarget: (entity) => {
      const assetId = entity.instance.asset.$ref;
      return resolveSourceInstanceRootOverrideTarget({
        sourceEntity: entity,
        assetId,
        instanceAssetKind: resolveAssetKind?.(assetId),
        bindingSourceRootEntityId: resolveSource(assetId)?.root,
        resolvePrefabSourceFile: resolveSource
      });
    }
  });
}
function resolvePrefabBindingSourceFile(prefab, binding, resolveSource, resolveAssetKind) {
  const visited = /* @__PURE__ */ new Set();
  const resolve = (current) => {
    if (visited.has(current.id))
      throw new Error(`Cyclic nested instance ownership: ${current.id}`);
    visited.add(current.id);
    const source = resolveSource(current.assetId);
    if (!source)
      return void 0;
    const owner = getContainingSourceInstance(prefab, current);
    if (!owner)
      return source;
    const parentSource = resolve(owner.binding);
    if (!parentSource)
      throw new Error(`Prefab source is unavailable: ${owner.binding.assetId}`);
    const instance = parentSource.entities.find((entity) => entity.id === owner.sourceId)?.instance;
    return composeInstanceSource(source, instance?.overrides, resolveSource, resolveAssetKind);
  };
  return resolve(binding);
}

// packages/model/src/scene-file-v2/source-asset-kind.ts
function resolveSourceAssetKind(assetId, options, label) {
  if (options.assetExists?.(assetId) === false)
    return void 0;
  const assetKind = options.resolveAssetKind?.(assetId);
  if (assetKind !== "Prefab" && assetKind !== "glTF") {
    throw new Error(
      `Unable to resolve supported source asset kind for "${assetId}" while refreshing ${label}; expected Prefab or glTF`
    );
  }
  return assetKind;
}

// packages/model/src/scene-file-v2/read-prefab-source-snapshots.ts
function readPrefabSourceSnapshots(prefabFile, inputOptions, identity) {
  const options = withSourceAssetAvailability(inputOptions);
  assertSourceV2PrefabFileStructure(prefabFile);
  const sourceIndex = buildSourceIdIndex(prefabFile);
  const convertSourceRefsToDomainRefs2 = (value) => convertAssetRefsToDomainRefs(value, {
    resolveComponentOwner: (id) => sourceIndex.componentOwnerEntityIdById.get(id)
  });
  const reachableEntityIds = collectReachableSourceEntityIds(prefabFile.entities, [prefabFile.root]);
  const childParentById = /* @__PURE__ */ new Map();
  for (const parentId of reachableEntityIds) {
    const entity = sourceIndex.entityById.get(parentId);
    if (!isSourceInstanceBoundary(entity)) {
      for (const child of entity.children ?? [])
        childParentById.set(child, parentId);
    }
  }
  const readChildIndex = (parent, child) => parent === null ? 0 : Math.max(0, (sourceIndex.entityById.get(parent)?.children ?? []).indexOf(child));
  const snapshots = {};
  for (const sourceEntityId of reachableEntityIds) {
    const sourceEntity = sourceIndex.entityById.get(sourceEntityId);
    if (!sourceEntity) {
      throw new Error(`Prefab source entity "${sourceEntityId}" is missing from the source index`);
    }
    const sceneEntityId = identity.entityId(sourceEntityId);
    const parentSourceEntityId = childParentById.get(sourceEntityId) ?? null;
    const childIndex = readChildIndex(parentSourceEntityId, sourceEntityId);
    const isInstanceBoundary = isSourceInstanceBoundary(sourceEntity);
    const childSourceEntityIds = isInstanceBoundary ? [] : sourceEntity.children ?? [];
    const components = {};
    for (const sourceComponentKey of isInstanceBoundary ? [] : sourceEntity.components ?? []) {
      const sourceComponent = sourceIndex.componentById.get(sourceComponentKey);
      if (!sourceComponent) {
        throw new Error(`Prefab source component "${sourceComponentKey}" is missing from the source index`);
      }
      const sceneComponentId = identity.componentId(sourceEntityId, sourceComponentKey, sourceComponent);
      components[sourceComponentKey] = {
        sceneComponentId,
        type: sourceComponent.type,
        ...sourceComponent.script?.$ref ? { refId: resolveRequiredSourceRef(sourceComponent.script.$ref) } : {},
        ...sourceComponent.script?.key ? { scriptKey: sourceComponent.script.key } : {},
        props: convertSourceRefsToDomainRefs2(sourceComponent.props ?? {}),
        ...sourceComponent.calls?.length ? {
          calls: convertSourceRefsToDomainRefs2(sourceComponent.calls)
        } : {}
      };
    }
    const instanceRef = sourceEntity.instance?.asset?.$ref;
    const assetId = instanceRef ? resolveRequiredSourceRef(instanceRef) : void 0;
    const unresolved = Boolean(assetId && options.assetExists?.(assetId) === false);
    const instanceAssetKind = assetId ? resolveSourceAssetKind(assetId, options, "nested instance") : void 0;
    const rootOverrideTarget = resolveSourceInstanceRootOverrideTarget({
      sourceEntity,
      assetId,
      instanceAssetKind,
      resolvePrefabSourceFile: options.resolvePrefabSourceFile
    });
    const resolved = readSourceEntityResolvedState(sourceEntity, sourceEntityId, {
      ...typeof rootOverrideTarget === "string" ? { rootOverrideTarget } : {},
      resolveInstanceAssetDisplayName: options.resolveInstanceAssetDisplayName
    });
    snapshots[sourceEntityId] = {
      sceneEntityId,
      parentSourceEntityId,
      childSourceEntityIds,
      childIndex,
      ...instanceAssetKind ? { instanceAssetKind } : {},
      ...sourceEntity.instance?.asset.key !== void 0 ? { instanceAssetKey: sourceEntity.instance.asset.key } : {},
      ...unresolved ? { unresolvedSource: createUnresolvedSourceEntity(sourceEntity) } : {},
      name: resolved.name || (unresolved ? assetId : ""),
      isActive: resolved.isActive,
      layer: resolved.layer ?? 1,
      ...resolved.isLocked !== void 0 ? { isLocked: resolved.isLocked } : {},
      transform: resolved.transform,
      components
    };
  }
  return snapshots;
}

// packages/model/src/domain/prefabSnapshotComponent.ts
function componentStateFromSnapshot(snapshot, instance, props, calls) {
  return {
    type: snapshot.type,
    ...snapshot.refId ? { refId: snapshot.refId } : {},
    ...snapshot.scriptKey ? { scriptKey: snapshot.scriptKey } : {},
    props,
    ...calls?.length ? { calls } : {},
    instance: { ...instance }
  };
}

// packages/model/src/domain/gltf-source.ts
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";

// packages/model/src/domain/gltfDomainInstanceBaseline.ts
var TRANSFORM_KEYS = ["position", "rotation", "scale"];
function preservePreviousEntitySnapshotOverrides(snapshot, previousSnapshot, override) {
  if (!previousSnapshot || !override)
    return snapshot;
  const next = cloneState(snapshot);
  if (override.name !== void 0)
    next.name = cloneState(previousSnapshot.name);
  if (override.isActive !== void 0)
    next.isActive = cloneState(previousSnapshot.isActive);
  if (override.layer !== void 0) {
    if (previousSnapshot.layer === void 0) {
      delete next.layer;
    } else {
      next.layer = cloneState(previousSnapshot.layer);
    }
  }
  if (override.isLocked !== void 0) {
    if (previousSnapshot.isLocked === void 0) {
      delete next.isLocked;
    } else {
      next.isLocked = cloneState(previousSnapshot.isLocked);
    }
  }
  for (const key of TRANSFORM_KEYS) {
    if (!override.transform?.[key])
      continue;
    next.transform[key] = cloneState(previousSnapshot.transform[key]);
  }
  return next;
}
function preservePreviousComponentSnapshotProps(props, previousProps, overrideProps) {
  if (!overrideProps)
    return props;
  const next = cloneState(props);
  for (const key of Object.keys(overrideProps)) {
    if (previousProps && key in previousProps) {
      next[key] = cloneState(previousProps[key]);
    } else {
      delete next[key];
    }
  }
  return next;
}
function collectGlTFDomainInstanceBaseline(input) {
  const { state, rootEntityId, previousBinding } = input;
  const entityMappings = [];
  const componentMappings = [];
  const sourceEntitySnapshots = {};
  const previousSceneToSourceEntity = /* @__PURE__ */ new Map();
  const previousSourceIds = /* @__PURE__ */ new Set();
  for (const [sourceEntityId, sceneEntityId] of Object.entries(previousBinding?.sourceToSceneEntity ?? {})) {
    previousSceneToSourceEntity.set(sceneEntityId, sourceEntityId);
    previousSourceIds.add(sourceEntityId);
  }
  for (const [sourceEntityId, snapshot] of Object.entries(previousBinding?.sourceEntitySnapshots ?? {})) {
    previousSceneToSourceEntity.set(snapshot.sceneEntityId, sourceEntityId);
    previousSourceIds.add(sourceEntityId);
  }
  const sidecarAddedEntityIds = new Set(Object.keys(previousBinding?.overrides.addedEntities ?? {}));
  const usedSourceEntityIds = new Set(previousSourceIds);
  const isAddedEntity = (sceneEntityId) => state.entities[sceneEntityId]?.instance?.role === "added" || sidecarAddedEntityIds.has(sceneEntityId);
  const allocateSyntheticChildSourceId = (parentSourceEntityId, childSceneEntityId, preferredIndex) => {
    const previousSourceEntityId = previousSceneToSourceEntity.get(childSceneEntityId);
    if (previousSourceEntityId) {
      usedSourceEntityIds.add(previousSourceEntityId);
      return previousSourceEntityId;
    }
    let index = preferredIndex;
    while (true) {
      const sourceEntityId = parentSourceEntityId === "root" ? `${index}` : `${parentSourceEntityId}/${index}`;
      if (!usedSourceEntityIds.has(sourceEntityId) && !sourceEntitySnapshots[sourceEntityId]) {
        usedSourceEntityIds.add(sourceEntityId);
        return sourceEntityId;
      }
      index += 1;
    }
  };
  const mergePreviousChildSourceId = (parentSourceEntityId, childSourceEntityId) => {
    const parentSnapshot = sourceEntitySnapshots[parentSourceEntityId];
    const previousParentSnapshot = previousBinding?.sourceEntitySnapshots?.[parentSourceEntityId];
    if (!parentSnapshot || parentSnapshot.childSourceEntityIds.includes(childSourceEntityId))
      return;
    const children = /* @__PURE__ */ new Set([...parentSnapshot.childSourceEntityIds, childSourceEntityId]);
    const previousOrder = previousParentSnapshot?.childSourceEntityIds ?? [];
    const ordered = [
      ...previousOrder.filter((sourceEntityId) => children.has(sourceEntityId)),
      ...parentSnapshot.childSourceEntityIds
    ];
    const seen = /* @__PURE__ */ new Set();
    parentSnapshot.childSourceEntityIds = ordered.filter((sourceEntityId) => {
      if (!children.has(sourceEntityId) || seen.has(sourceEntityId))
        return false;
      seen.add(sourceEntityId);
      return true;
    });
  };
  const preservePreviousSourceSnapshotSubtree = (sourceEntityId) => {
    const snapshot = previousBinding?.sourceEntitySnapshots?.[sourceEntityId];
    if (!snapshot)
      return;
    if (!sourceEntitySnapshots[sourceEntityId]) {
      sourceEntitySnapshots[sourceEntityId] = cloneState(snapshot);
    }
    if (snapshot.parentSourceEntityId) {
      mergePreviousChildSourceId(snapshot.parentSourceEntityId, sourceEntityId);
    }
    snapshot.childSourceEntityIds.forEach(preservePreviousSourceSnapshotSubtree);
  };
  const visit = (sceneEntityId, sourceEntityId, parentSourceEntityId, childIndex, role) => {
    const entity = state.entities[sceneEntityId];
    if (!entity)
      return;
    if (role !== "root" && isAddedEntity(sceneEntityId))
      return;
    entityMappings.push({ sceneEntityId, sourceEntityId, role });
    const components = {};
    const componentTypeCounts = /* @__PURE__ */ new Map();
    const usedSourceComponentKeys = new Set(
      Object.keys(previousBinding?.sourceEntitySnapshots?.[sourceEntityId]?.components ?? {})
    );
    const previousSceneComponentToSourceKey = /* @__PURE__ */ new Map();
    for (const [sourceComponentKey, componentSnapshot] of Object.entries(
      previousBinding?.sourceEntitySnapshots?.[sourceEntityId]?.components ?? {}
    )) {
      previousSceneComponentToSourceKey.set(componentSnapshot.sceneComponentId, sourceComponentKey);
    }
    for (const [sceneComponentId, component] of Object.entries(entity.components ?? {})) {
      if (component.instance?.role === "added")
        continue;
      const count = componentTypeCounts.get(component.type) ?? 0;
      componentTypeCounts.set(component.type, count + 1);
      let sourceComponentKey = previousSceneComponentToSourceKey.get(sceneComponentId);
      if (!sourceComponentKey) {
        let index = count;
        do {
          sourceComponentKey = `${component.type}/${index}`;
          index += 1;
        } while (usedSourceComponentKeys.has(sourceComponentKey));
      }
      usedSourceComponentKeys.add(sourceComponentKey);
      componentMappings.push({
        sceneEntityId,
        sceneComponentId,
        sourceComponentKey
      });
      const previousComponentSnapshot = previousBinding?.sourceEntitySnapshots?.[sourceEntityId]?.components?.[sourceComponentKey];
      const componentOverrideEntry = previousBinding?.overrides.componentProps?.[sourceEntityId]?.[sourceComponentKey];
      const hasCallsOverride = Boolean(componentOverrideEntry?.calls?.length);
      const calls = previousComponentSnapshot && hasCallsOverride ? previousComponentSnapshot.calls : component.calls;
      components[sourceComponentKey] = {
        sceneComponentId,
        type: component.type,
        ...component.refId ? { refId: component.refId } : {},
        ...component.scriptKey ? { scriptKey: component.scriptKey } : {},
        props: preservePreviousComponentSnapshotProps(
          cloneState(component.props ?? {}),
          previousComponentSnapshot?.props,
          previousComponentSnapshot ? componentOverrideEntry?.props : void 0
        ),
        ...calls?.length ? { calls: cloneState(calls) } : {}
      };
    }
    const sourceChildren = entity.children.filter((childEntityId) => !isAddedEntity(childEntityId));
    const childSourceEntityIds = sourceChildren.map(
      (childEntityId, index) => allocateSyntheticChildSourceId(sourceEntityId, childEntityId, index)
    );
    const snapshot = {
      sceneEntityId,
      parentSourceEntityId,
      childSourceEntityIds,
      childIndex: previousBinding?.sourceEntitySnapshots?.[sourceEntityId]?.childIndex ?? childIndex,
      name: entity.name,
      isActive: entity.isActive,
      ...entity.layer !== void 0 ? { layer: entity.layer } : {},
      transform: cloneState(entity.transform),
      components
    };
    sourceEntitySnapshots[sourceEntityId] = preservePreviousEntitySnapshotOverrides(
      snapshot,
      previousBinding?.sourceEntitySnapshots?.[sourceEntityId],
      previousBinding?.overrides.entityProps?.[sourceEntityId]
    );
    sourceChildren.forEach((childEntityId, index) => {
      visit(childEntityId, childSourceEntityIds[index], sourceEntityId, index, "linked");
    });
  };
  visit(rootEntityId, "root", null, 0, "root");
  for (const sourceEntityId of Object.keys(previousBinding?.overrides.removedEntities ?? {})) {
    preservePreviousSourceSnapshotSubtree(sourceEntityId);
  }
  for (const [sourceEntityId, removedComponents] of Object.entries(
    previousBinding?.overrides.removedComponents ?? {}
  )) {
    const snapshot = sourceEntitySnapshots[sourceEntityId];
    const previousSnapshot = previousBinding?.sourceEntitySnapshots?.[sourceEntityId];
    if (!snapshot || !previousSnapshot)
      continue;
    for (const sourceComponentKey of Object.keys(removedComponents)) {
      const previousComponentSnapshot = previousSnapshot.components[sourceComponentKey];
      if (previousComponentSnapshot && !snapshot.components[sourceComponentKey]) {
        snapshot.components[sourceComponentKey] = cloneState(previousComponentSnapshot);
      }
    }
  }
  return { entityMappings, componentMappings, sourceEntitySnapshots };
}

// packages/model/src/domain/gltf-source.ts
function transformFromNode(node) {
  const position = new Vector3(...node.translation ?? [0, 0, 0]);
  const rotation = new Quaternion(...node.rotation ?? [0, 0, 0, 1]);
  const scale = new Vector3(...node.scale ?? [1, 1, 1]);
  if (node.matrix) {
    const matrix = new Matrix();
    matrix.copyFromArray(node.matrix);
    matrix.decompose(position, rotation, scale);
  }
  const euler = rotation.toEuler(new Vector3()).scale(180 / Math.PI);
  const plain = ({ x, y, z }) => ({ x, y, z });
  return { position: plain(position), rotation: plain(euler), scale: plain(scale) };
}
function createGlTFSourceBaseline(source, assetId, assetName) {
  const { document, materialRemaps } = source;
  if (document instanceof Error)
    throw document;
  const parents = /* @__PURE__ */ new Map();
  document.nodes?.forEach((node, parent) => node.children?.forEach((child) => parents.set(child, parent)));
  const componentVisits = /* @__PURE__ */ new Map();
  const countVisit = (nodeIndex, visiting2 = /* @__PURE__ */ new Set()) => {
    if (visiting2.has(nodeIndex))
      throw new Error(`Invalid glTF node hierarchy at ${nodeIndex}`);
    componentVisits.set(nodeIndex, (componentVisits.get(nodeIndex) ?? 0) + 1);
    const next = new Set(visiting2).add(nodeIndex);
    document.nodes?.[nodeIndex]?.children?.forEach((child) => countVisit(child, next));
  };
  document.scenes?.forEach((scene2, index) => scene2.nodes?.forEach((nodeIndex) => {
    parents.set(nodeIndex, `scene:${index}`);
    countVisit(nodeIndex);
  }));
  const entities = {};
  const ref = (key) => ({ refId: assetId, key });
  const createEntity = (id, parentId, name, node = {}) => entities[id] = {
    id,
    name,
    parentId,
    isActive: true,
    layer: 1,
    children: [],
    components: {},
    transform: transformFromNode(node)
  };
  const addComponent = (entity, type, props, count = 1) => {
    for (let i = 0; i < count; i++) {
      const index = Object.values(entity.components).filter((c) => c.type === type).length;
      entity.components[`${entity.id}:${type}/${index}`] = { type, props };
    }
  };
  const root = createEntity("root", null, assetName?.replace(/\.glb$/, "") || "GLTF_ROOT");
  const visiting = /* @__PURE__ */ new Set();
  const visit = (nodeIndex, parent, childIndex) => {
    const node = document.nodes?.[nodeIndex];
    if (!node || visiting.has(nodeIndex))
      throw new Error(`Invalid glTF node hierarchy at ${nodeIndex}`);
    visiting.add(nodeIndex);
    const id = parent.id === "root" ? `${childIndex}` : `${parent.id}/${childIndex}`;
    const entity = createEntity(id, parent.id, node.name || `_GLTF_ENTITY_${nodeIndex}`, node);
    parent.children.push(id);
    const lightIndex = node.extensions?.KHR_lights_punctual?.light;
    if (lightIndex !== void 0) {
      const light = document.extensions?.KHR_lights_punctual?.lights[lightIndex];
      if (!light)
        throw new Error(`Missing glTF light ${lightIndex}`);
      const intensity = light.intensity ?? 1;
      const color = light.color ? { r: light.color[0] * intensity, g: light.color[1] * intensity, b: light.color[2] * intensity, a: 1 } : { r: 1, g: 1, b: 1, a: 1 };
      const type = light.type === "directional" ? "DirectLight" : light.type === "point" ? "PointLight" : "SpotLight";
      addComponent(entity, type, {
        color,
        ...light.range && type !== "DirectLight" ? { distance: light.range } : {},
        ...light.spot && type === "SpotLight" ? {
          angle: light.spot.innerConeAngle ?? 0,
          penumbra: (light.spot.outerConeAngle ?? Math.PI / 4) - (light.spot.innerConeAngle ?? 0)
        } : {}
      });
    }
    if (node.camera !== void 0) {
      const camera = document.cameras?.[node.camera];
      if (!camera)
        throw new Error(`Missing glTF camera ${node.camera}`);
      const schema = camera.orthographic ?? camera.perspective ?? {};
      addComponent(entity, "Camera", {
        enabled: false,
        isOrthographic: camera.type === "orthographic",
        ...schema.znear !== void 0 ? { nearClipPlane: schema.znear } : {},
        ...schema.zfar !== void 0 ? { farClipPlane: schema.zfar } : {},
        ...camera.orthographic ? { orthographicSize: Math.max(camera.orthographic.xmag ?? 0, camera.orthographic.ymag ?? 0) / 2 } : {},
        ...camera.perspective?.yfov !== void 0 ? { fieldOfView: camera.perspective.yfov * 180 / Math.PI } : {},
        ...camera.perspective?.aspectRatio !== void 0 ? { aspectRatio: camera.perspective.aspectRatio } : {}
      }, componentVisits.get(nodeIndex));
    }
    if (node.mesh !== void 0) {
      const mesh = document.meshes?.[node.mesh];
      if (!mesh)
        throw new Error(`Missing glTF mesh ${node.mesh}`);
      const weights = node.weights ?? mesh.weights;
      mesh.primitives?.forEach((primitive, index) => {
        const materialIndex = primitive.material ?? -1;
        addComponent(entity, node.skin !== void 0 || weights ? "SkinnedMeshRenderer" : "MeshRenderer", {
          mesh: ref(`meshes[${node.mesh}][${index}]`),
          ...primitive.attributes?.COLOR_0 !== void 0 ? { enableVertexColor: true } : {},
          ...primitive.material === void 0 ? {} : { material: materialRemaps?.[materialIndex] ?? ref(`materials[${materialIndex}]`) },
          ...weights ? { blendShapeWeights: [...weights] } : {}
        }, componentVisits.get(nodeIndex));
      });
    }
    node.children?.filter((index) => parents.get(index) === nodeIndex).forEach((index, ordinal) => visit(index, entity, ordinal));
    visiting.delete(nodeIndex);
  };
  const scene = document.scenes?.[document.scene ?? 0];
  if (!scene)
    throw new Error("glTF default scene is missing");
  scene.nodes?.filter((index) => parents.get(index) === `scene:${document.scene ?? 0}`).forEach((index, ordinal) => visit(index, root, ordinal));
  if (document.skins || document.animations)
    addComponent(root, "Animator", { animatorController: ref("animatorController[0]") });
  const state = {
    version: 0,
    entities,
    assets: {},
    scene: { rootEntityIds: ["root"] },
    prefab: { bindings: {}, byAssetId: {} }
  };
  return collectGlTFDomainInstanceBaseline({ state, rootEntityId: "root" });
}

// packages/model/src/modules/entity/v2-hydration/hydrateSourceV2SceneToDomain.ts
function sourceContentRevisionFromInstance(instance) {
  return instance?.sourceContentRevision ? { sourceContentRevision: instance.sourceContentRevision } : {};
}
function convertSourceRefsToDomainRefs(value, sourceIndex) {
  return convertAssetRefsToDomainRefs(value, {
    resolveComponentOwner: (componentId) => sourceIndex.componentOwnerEntityIdById.get(componentId)
  });
}
function clone(value) {
  return structuredClone(value);
}
function appendUnique(target, values) {
  const seen = new Set(target);
  const next = [...target];
  for (const value of values) {
    if (seen.has(value))
      continue;
    seen.add(value);
    next.push(value);
  }
  return next;
}
function createEmptyPrefabState() {
  return { bindings: {}, byAssetId: {} };
}
function normalizeSourceIdPrefabFile(prefabFile) {
  assertSourceV2PrefabFileStructure(prefabFile);
  return prefabFile;
}
function snapshotComponentToDomainComponent(bindingId, sourceComponentKey, snapshot, propOverrides, callOverrides) {
  const props = mergeSourceValueRecords(snapshot.props ?? {}, propOverrides ?? {});
  const calls = clone([...snapshot.calls ?? [], ...callOverrides ?? []]);
  return componentStateFromSnapshot(snapshot, { bindingId, role: "linked", sourceComponentKey }, props, calls);
}
function mergeTransform(base, override) {
  if (!override)
    return clone(base);
  return {
    position: {
      ...base.position,
      ...override.position ?? {}
    },
    rotation: {
      ...base.rotation,
      ...override.rotation ?? {}
    },
    scale: {
      ...base.scale,
      ...override.scale ?? {}
    }
  };
}
function derivePrefabSourceSnapshotsFromFile(binding, prefabFile, options, componentRecords, usedSceneEntityIds, usedSceneComponentIds) {
  prefabFile = normalizeSourceIdPrefabFile(prefabFile);
  assertSourceV2PrefabFileStructure(prefabFile);
  const sourceIndex = buildSourceIdIndex(prefabFile);
  const reachableEntityIds = collectReachableSourceEntityIds(prefabFile.entities, [prefabFile.root]);
  const hasPreviousSourceSnapshots = Object.keys(binding.sourceEntitySnapshots ?? {}).length > 0;
  const previousSnapshotsByCurrentSourceId = /* @__PURE__ */ new Map();
  for (const sourceEntityId of reachableEntityIds) {
    const sourceEntity = sourceIndex.entityById.get(sourceEntityId);
    if (!sourceEntity) {
      throw new Error(`Prefab source entity "${sourceEntityId}" is missing from the source index`);
    }
    const previousSnapshot = findExactPreviousSourceEntitySnapshot(binding, sourceEntityId);
    if (previousSnapshot)
      previousSnapshotsByCurrentSourceId.set(sourceEntityId, previousSnapshot);
    binding.sourceToSceneEntity[sourceEntityId] = selectSceneEntityIdForSourceSnapshot({
      binding,
      sourceEntityId,
      existingSceneEntityId: binding.sourceToSceneEntity[sourceEntityId],
      previousSceneEntityId: previousSnapshot?.sceneEntityId,
      allowExistingSceneEntityId: !hasPreviousSourceSnapshots || Boolean(previousSnapshot),
      usedSceneEntityIds
    });
  }
  return readPrefabSourceSnapshots(prefabFile, options, {
    entityId: (sourceEntityId) => binding.sourceToSceneEntity[sourceEntityId],
    componentId: (sourceEntityId, sourceComponentKey, sourceComponent) => {
      const previousComponent = findExactPreviousSourceComponentSnapshot(
        previousSnapshotsByCurrentSourceId.get(sourceEntityId),
        sourceComponentKey,
        sourceComponent
      );
      return selectSceneComponentIdForSourceSnapshot({
        bindingId: binding.id,
        sceneEntityId: binding.sourceToSceneEntity[sourceEntityId],
        sourceComponentType: sourceComponent.type,
        sourceComponentKey,
        previousSceneComponentId: previousComponent?.sceneComponentId,
        componentRecords,
        usedSceneComponentIds
      });
    }
  });
}
function findExactPreviousSourceEntitySnapshot(binding, sourceEntityId) {
  return binding.sourceEntitySnapshots?.[sourceEntityId];
}
function collectReachablePrefabEntityIds(prefabFile) {
  return collectReachableSourceEntityIds(prefabFile.entities, [prefabFile.root]);
}
function findExactPreviousSourceComponentSnapshot(previousSnapshot, sourceComponentKey, sourceComponent) {
  const exact = previousSnapshot?.components?.[sourceComponentKey];
  return exact?.type === sourceComponent.type ? exact : void 0;
}
function selectSceneEntityIdForSourceSnapshot(input) {
  const {
    binding,
    sourceEntityId,
    existingSceneEntityId,
    previousSceneEntityId,
    allowExistingSceneEntityId,
    usedSceneEntityIds
  } = input;
  if (sourceEntityId === binding.sourceRootEntityId) {
    const rootSceneEntityId = binding.sourceToSceneEntity[sourceEntityId] ?? previousSceneEntityId ?? binding.instanceRootEntityId;
    usedSceneEntityIds.add(rootSceneEntityId);
    return rootSceneEntityId;
  }
  const preferredSceneEntityId = previousSceneEntityId ?? (allowExistingSceneEntityId ? existingSceneEntityId : void 0);
  if (preferredSceneEntityId && !usedSceneEntityIds.has(preferredSceneEntityId)) {
    usedSceneEntityIds.add(preferredSceneEntityId);
    return preferredSceneEntityId;
  }
  const baseId = `prefab:${binding.id}:${sourceEntityId}`;
  let candidate = baseId;
  let suffix = 1;
  while (usedSceneEntityIds.has(candidate)) {
    candidate = `${baseId}:${suffix++}`;
  }
  usedSceneEntityIds.add(candidate);
  return candidate;
}
function selectSceneComponentIdForSourceSnapshot(input) {
  const {
    bindingId,
    sourceComponentKey,
    sourceComponentType,
    previousSceneComponentId,
    componentRecords,
    sceneEntityId,
    usedSceneComponentIds
  } = input;
  if (previousSceneComponentId && !usedSceneComponentIds.has(previousSceneComponentId)) {
    if (canUseSceneComponentIdForSourceComponent(
      previousSceneComponentId,
      componentRecords,
      bindingId,
      sceneEntityId,
      sourceComponentKey,
      sourceComponentType
    )) {
      usedSceneComponentIds.add(previousSceneComponentId);
      return previousSceneComponentId;
    }
  }
  const baseId = `prefab:${input.bindingId}:${input.sourceComponentKey}`;
  let candidate = baseId;
  let suffix = 1;
  while (usedSceneComponentIds.has(candidate) || !canUseSceneComponentIdForSourceComponent(
    candidate,
    componentRecords,
    bindingId,
    sceneEntityId,
    sourceComponentKey,
    sourceComponentType
  )) {
    candidate = `${baseId}:${suffix++}`;
  }
  usedSceneComponentIds.add(candidate);
  return candidate;
}
function canUseSceneComponentIdForSourceComponent(componentId, componentRecords, bindingId, sceneEntityId, sourceComponentKey, sourceComponentType) {
  const existing = componentRecords.get(componentId);
  return !existing || isSameLinkedSourceComponent(existing, bindingId, sceneEntityId, sourceComponentKey, sourceComponentType);
}
function isSameLinkedSourceComponent(existing, bindingId, sceneEntityId, sourceComponentKey, sourceComponentType) {
  const instance = existing.component.instance;
  return existing.entityId === sceneEntityId && existing.component.type === sourceComponentType && instance?.bindingId === bindingId && instance.role !== "added" && instance.sourceComponentKey === sourceComponentKey;
}
function collectComponentRecords(entities) {
  const records = /* @__PURE__ */ new Map();
  for (const entity of Object.values(entities)) {
    for (const [componentId, component] of Object.entries(entity.components ?? {})) {
      records.set(componentId, { entityId: entity.id, component });
    }
  }
  return records;
}
function createEmptyPrefabOverrides() {
  return {
    entityProps: {},
    componentProps: {},
    removedEntities: {},
    removedComponents: {},
    addedEntities: {},
    addedComponents: {}
  };
}
function seedPrefabOverridesFromInlineSource(overrides, prefabFile) {
  const next = createEmptyPrefabOverrides();
  if (!overrides)
    return next;
  const sourceIndex = buildSourceIdIndex(prefabFile);
  for (const override of overrides.entityProps ?? []) {
    if (typeof override.target !== "string") {
      throw new Error("Invalid source v2 scene file: entityProps override target must be a source entity id");
    }
    if (!sourceIndex.entityById.has(override.target)) {
      throw new Error(`Invalid source v2 scene file: entityProps override target "${override.target}" does not exist`);
    }
    next.entityProps[override.target] = inlineEntityOverrideToDomainProps(override);
  }
  for (const override of overrides.componentProps ?? []) {
    if (typeof override.target !== "string") {
      throw new Error("Invalid source v2 scene file: componentProps override target must be a source component id");
    }
    const ownerSourceEntityId = sourceIndex.componentOwnerEntityIdById.get(override.target);
    if (!ownerSourceEntityId) {
      throw new Error(
        `Invalid source v2 scene file: componentProps override target "${override.target}" does not exist`
      );
    }
    const bucket = next.componentProps[ownerSourceEntityId] ??= {};
    const props = convertSourceRefsToDomainRefs(override.props ?? {}, sourceIndex);
    const calls = override.calls?.length ? convertSourceRefsToDomainRefs(override.calls, sourceIndex) : void 0;
    bucket[override.target] = {
      ...Object.keys(props).length ? { props } : {},
      ...calls?.length ? { calls } : {}
    };
  }
  for (const sourceEntityId of overrides.removedEntities ?? []) {
    if (!sourceIndex.entityById.has(sourceEntityId)) {
      throw new Error(`Invalid source v2 scene file: removed entity target "${sourceEntityId}" does not exist`);
    }
    next.removedEntities[sourceEntityId] = true;
  }
  for (const sourceComponentId of overrides.removedComponents ?? []) {
    const ownerSourceEntityId = sourceIndex.componentOwnerEntityIdById.get(sourceComponentId);
    if (!ownerSourceEntityId) {
      throw new Error(`Invalid source v2 scene file: removed component target "${sourceComponentId}" does not exist`);
    }
    const bucket = next.removedComponents[ownerSourceEntityId] ??= {};
    bucket[sourceComponentId] = true;
  }
  for (const override of overrides.addedEntities ?? []) {
    const entityId = override.id;
    if (!sourceIndex.entityById.has(override.parent)) {
      throw new Error(`Invalid source v2 scene file: added entity parent "${override.parent}" does not exist`);
    }
    next.addedEntities[entityId] = {
      entityId,
      parentSourceEntityId: override.parent
    };
  }
  for (const override of overrides.addedComponents ?? []) {
    if (typeof override.owner !== "string") {
      throw new Error("Invalid source v2 scene file: added component override owner must be a source entity id");
    }
    if (!sourceIndex.entityById.has(override.owner)) {
      throw new Error(`Invalid source v2 scene file: added component owner "${override.owner}" does not exist`);
    }
    const componentId = override.id;
    const component = override.component;
    const bucket = next.addedComponents[override.owner] ??= {};
    bucket[componentId] = {
      componentId,
      ownerSourceEntityId: override.owner,
      type: component.type,
      ...component.script?.$ref ? {
        refId: resolveRequiredSourceRef(component.script.$ref),
        ...component.script.key ? { scriptKey: component.script.key } : {}
      } : {},
      props: convertSourceRefsToDomainRefs(component.props ?? {}, sourceIndex),
      ...component.calls?.length ? { calls: convertSourceRefsToDomainRefs(component.calls, sourceIndex) } : {}
    };
  }
  return next;
}
function seedGLTFOverridesFromInlineSource(overrides) {
  const next = createEmptyPrefabOverrides();
  if (!overrides)
    return next;
  for (const override of overrides.entityProps ?? []) {
    parseGLTFEntityOverrideTarget(override.target);
    next.entityProps[override.target] = inlineEntityOverrideToDomainProps(override);
  }
  for (const sourceEntityId of overrides.removedEntities ?? []) {
    parseGLTFEntityOverrideTarget(sourceEntityId);
    next.removedEntities[sourceEntityId] = true;
  }
  for (const override of overrides.componentProps ?? []) {
    const { sourceEntityId, sourceComponentKey, componentType } = parseGLTFComponentOverrideTarget(override.target);
    const bucket = next.componentProps[sourceEntityId] ??= {};
    const props = convertAssetRefsToDomainRefs(override.props ?? {});
    const calls = override.calls?.length ? convertAssetRefsToDomainRefs(override.calls) : void 0;
    bucket[sourceComponentKey] = {
      ...Object.keys(props).length ? { props } : {},
      ...calls?.length ? { calls } : {}
    };
  }
  for (const target of overrides.removedComponents ?? []) {
    const { sourceEntityId, sourceComponentKey } = parseGLTFComponentOverrideTarget(target);
    const bucket = next.removedComponents[sourceEntityId] ??= {};
    bucket[sourceComponentKey] = true;
  }
  for (const override of overrides.addedEntities ?? []) {
    parseGLTFEntityOverrideTarget(override.parent);
    const entityId = override.id;
    next.addedEntities[entityId] = {
      entityId,
      parentSourceEntityId: override.parent
    };
  }
  for (const override of overrides.addedComponents ?? []) {
    parseGLTFEntityOverrideTarget(override.owner);
    const componentId = override.id;
    const component = override.component;
    const bucket = next.addedComponents[override.owner] ??= {};
    bucket[componentId] = {
      componentId,
      ownerSourceEntityId: override.owner,
      type: component.type,
      ...component.script?.$ref ? {
        refId: resolveRequiredSourceRef(component.script.$ref),
        ...component.script.key ? { scriptKey: component.script.key } : {}
      } : {},
      // 不传 resolveComponentOwner:glTF added component 的 $component 目标只可能是
      // 同 root 的其他内联 added component 或 glTF 内部组件,都不在 scene 文件的
      // flat components 数组里,owner 在此边界结构上不可解析。$component 保持
      // sentinel 形态,由 EngineProjection 投影时解析(getComponentReferenceId 一等支持)。
      props: convertAssetRefsToDomainRefs(component.props ?? {}),
      ...component.calls?.length ? { calls: convertAssetRefsToDomainRefs(component.calls) } : {}
    };
  }
  return next;
}
function filterPrefabOverridesForRefreshedSnapshots(input) {
  const { binding, previousSourceRootEntityId, nextSnapshots } = input;
  const next = createEmptyPrefabOverrides();
  const resolveSourceEntityId = (sourceEntityId) => sourceEntityId === previousSourceRootEntityId ? binding.sourceRootEntityId : sourceEntityId;
  const getUsableSourceEntity = (sourceEntityId) => {
    const currentSourceEntityId = resolveSourceEntityId(sourceEntityId);
    const snapshot = nextSnapshots[currentSourceEntityId];
    if (!snapshot || isSourceEntityRemovedOrCovered(next.removedEntities, nextSnapshots, currentSourceEntityId)) {
      return void 0;
    }
    return { currentSourceEntityId, snapshot };
  };
  const forEachUsableEntityOverride = (overrides, visit) => {
    for (const [sourceEntityId, value] of Object.entries(overrides ?? {})) {
      const usable = getUsableSourceEntity(sourceEntityId);
      if (!usable)
        continue;
      visit(sourceEntityId, usable.currentSourceEntityId, value, usable.snapshot);
    }
  };
  const forEachUsableComponentOverride = (overrides, visit) => {
    forEachUsableEntityOverride(overrides, (sourceEntityId, currentSourceEntityId, components, snapshot) => {
      for (const [sourceComponentKey, value] of Object.entries(components)) {
        if (!snapshot.components[sourceComponentKey])
          continue;
        visit(sourceEntityId, currentSourceEntityId, sourceComponentKey, value, snapshot);
      }
    });
  };
  for (const sourceEntityId of Object.keys(binding.overrides.removedEntities ?? {})) {
    const currentSourceEntityId = resolveSourceEntityId(sourceEntityId);
    if (!nextSnapshots[currentSourceEntityId])
      continue;
    if (isSourceEntityCoveredByRemovedAncestor(binding.overrides.removedEntities, nextSnapshots, currentSourceEntityId)) {
      continue;
    }
    next.removedEntities[currentSourceEntityId] = true;
  }
  forEachUsableComponentOverride(
    binding.overrides.removedComponents,
    (_sourceEntityId, currentSourceEntityId, sourceComponentKey) => {
      const bucket = next.removedComponents[currentSourceEntityId] ??= {};
      bucket[sourceComponentKey] = true;
    }
  );
  forEachUsableEntityOverride(binding.overrides.entityProps, (sourceEntityId, currentSourceEntityId, props) => {
    if (next.entityProps[currentSourceEntityId]) {
      throw new Error(
        `Prefab override entityProps collision: source entity "${sourceEntityId}" maps to "${currentSourceEntityId}", which already has overrides from an earlier source entity`
      );
    }
    next.entityProps[currentSourceEntityId] = clone(props);
  });
  forEachUsableComponentOverride(
    binding.overrides.componentProps,
    (sourceEntityId, currentSourceEntityId, sourceComponentKey, entry) => {
      if (next.removedComponents[currentSourceEntityId]?.[sourceComponentKey])
        return;
      const bucket = next.componentProps[currentSourceEntityId] ??= {};
      if (bucket[sourceComponentKey]) {
        throw new Error(
          `Prefab override componentProps collision: source component "${sourceComponentKey}" on source entity "${sourceEntityId}" maps to "${currentSourceEntityId}", which already has overrides from an earlier source component`
        );
      }
      const nextEntry = {};
      if (entry.props && Object.keys(entry.props).length) {
        nextEntry.props = mergeSourceValueRecords({}, entry.props);
      }
      if (entry.calls?.length) {
        nextEntry.calls = clone(entry.calls);
      }
      bucket[sourceComponentKey] = nextEntry;
    }
  );
  for (const [entityId, added] of Object.entries(binding.overrides.addedEntities ?? {})) {
    const usableParent = getUsableSourceEntity(added.parentSourceEntityId);
    if (!usableParent)
      continue;
    const { currentSourceEntityId: parentSourceEntityId } = usableParent;
    next.addedEntities[entityId] = { ...clone(added), parentSourceEntityId };
  }
  forEachUsableEntityOverride(
    binding.overrides.addedComponents,
    (sourceEntityId, currentSourceEntityId, components) => {
      const bucket = next.addedComponents[currentSourceEntityId] ??= {};
      for (const [componentId, component] of Object.entries(components)) {
        if (bucket[componentId]) {
          throw new Error(
            `Prefab override addedComponents collision: added component "${componentId}" on source entity "${sourceEntityId}" maps to "${currentSourceEntityId}", which already has an added component with the same id`
          );
        }
        bucket[componentId] = { ...clone(component), ownerSourceEntityId: currentSourceEntityId };
      }
    }
  );
  return next;
}
function isSourceEntityCoveredByRemovedAncestor(removedEntities, snapshots, sourceEntityId) {
  let parentSourceEntityId = snapshots[sourceEntityId]?.parentSourceEntityId;
  while (parentSourceEntityId) {
    if (removedEntities[parentSourceEntityId])
      return true;
    parentSourceEntityId = snapshots[parentSourceEntityId]?.parentSourceEntityId ?? null;
  }
  return false;
}
function isSourceEntityRemovedOrCovered(removedEntities, snapshots, sourceEntityId) {
  return Boolean(
    removedEntities[sourceEntityId] || isSourceEntityCoveredByRemovedAncestor(removedEntities, snapshots, sourceEntityId)
  );
}
function collectReservedAddedSceneEntityIds(prefab) {
  const ids = /* @__PURE__ */ new Set();
  for (const binding of Object.values(prefab.bindings)) {
    for (const added of Object.values(binding.overrides.addedEntities ?? {})) {
      ids.add(added.entityId);
    }
  }
  return ids;
}
function collectReservedAddedSceneComponentIds(prefab) {
  const ids = /* @__PURE__ */ new Set();
  for (const binding of Object.values(prefab.bindings)) {
    for (const components of Object.values(binding.overrides.addedComponents ?? {})) {
      for (const added of Object.values(components)) {
        ids.add(added.componentId);
      }
    }
  }
  return ids;
}
function refreshPrefabBindingSnapshotsFromSource(prefab, options, entities, reservedSceneEntityIds = [], reservedSceneComponentIds = []) {
  if (!options.resolvePrefabSourceFile)
    return prefab;
  const next = clone(prefab);
  const componentRecords = collectComponentRecords(entities);
  const usedSceneEntityIds = /* @__PURE__ */ new Set([
    ...reservedSceneEntityIds,
    ...Object.keys(entities),
    ...collectReservedAddedSceneEntityIds(next)
  ]);
  const usedSceneComponentIds = /* @__PURE__ */ new Set([...reservedSceneComponentIds, ...collectReservedAddedSceneComponentIds(next)]);
  for (const binding of Object.values(next.bindings)) {
    if (binding.assetKind !== "Prefab" || options.assetExists?.(binding.assetId) === false)
      continue;
    const resolvedPrefabFile = resolvePrefabBindingSourceFile(
      next,
      binding,
      options.resolvePrefabSourceFile,
      options.resolveAssetKind
    );
    if (!resolvedPrefabFile) {
      throw new Error(
        `Cannot refresh Prefab binding "${binding.id}" for asset "${binding.assetId}": source file is unavailable`
      );
    }
    const prefabFile = normalizeSourceIdPrefabFile(resolvedPrefabFile);
    assertSourceV2PrefabFileStructure(prefabFile);
    const previousSourceRootEntityId = binding.sourceRootEntityId;
    const currentSourceRootEntityId = prefabFile.root;
    if (currentSourceRootEntityId) {
      binding.sourceRootEntityId = currentSourceRootEntityId;
      binding.sourceToSceneEntity[currentSourceRootEntityId] = binding.instanceRootEntityId;
    }
    const sourceEntitySnapshots = derivePrefabSourceSnapshotsFromFile(
      binding,
      prefabFile,
      options,
      componentRecords,
      usedSceneEntityIds,
      usedSceneComponentIds
    );
    binding.sourceToSceneEntity = Object.fromEntries(
      Object.entries(sourceEntitySnapshots).map(([sourceEntityId, snapshot]) => [
        sourceEntityId,
        binding.sourceToSceneEntity[sourceEntityId] ?? snapshot.sceneEntityId
      ])
    );
    binding.sourceEntitySnapshots = sourceEntitySnapshots;
    materializeBindingSnapshotReferences(binding);
    binding.overrides = filterPrefabOverridesForRefreshedSnapshots({
      binding,
      previousSourceRootEntityId,
      nextSnapshots: sourceEntitySnapshots
    });
  }
  return next;
}
function seedSourceSceneInstanceBindings(prefab, sceneFile, options) {
  const next = clone(prefab);
  let changed = false;
  for (const entity of sceneFile.entities) {
    const sourceRef = entity.instance?.asset?.$ref;
    if (!sourceRef)
      continue;
    const assetId = resolveRequiredSourceRef(sourceRef);
    const assetKind = resolveSourceAssetKind(assetId, options, "scene instance");
    if (!assetKind)
      continue;
    if (findBindingForInstanceRoot(next, entity.id, { assetId, assetKind })) {
      if (seedInlineAddedSourceInstanceBindings(next, entity.instance?.overrides, options))
        changed = true;
      continue;
    }
    let binding;
    if (assetKind === "Prefab") {
      if (!options.resolvePrefabSourceFile)
        continue;
      const resolvedPrefabFile = options.resolvePrefabSourceFile(assetId);
      if (!resolvedPrefabFile) {
        throw new Error(
          `Cannot rebuild Prefab binding for scene instance "${entity.id}" and asset "${assetId}": source file is unavailable`
        );
      }
      const prefabFile = normalizeSourceIdPrefabFile(resolvedPrefabFile);
      assertSourceV2PrefabFileStructure(prefabFile);
      const sourceRootEntityId = prefabFile.root;
      const bindingId = `binding-${assetId}-${entity.id}`;
      const overrides = seedPrefabOverridesFromInlineSource(entity.instance?.overrides, prefabFile);
      binding = {
        id: bindingId,
        assetId,
        assetKind,
        instanceRootEntityId: entity.id,
        sourceRootEntityId,
        sourceRevision: 1,
        sourceToSceneEntity: { [sourceRootEntityId]: entity.id },
        sourceEntitySnapshots: {},
        overrides
      };
    } else {
      const bindingId = createUniquePrefabBindingId(next.bindings, assetId, entity.id);
      binding = {
        id: bindingId,
        assetId,
        assetKind,
        instanceRootEntityId: entity.id,
        sourceRootEntityId: "root",
        sourceRevision: 1,
        sourceToSceneEntity: { root: entity.id },
        sourceEntitySnapshots: {
          root: createSyntheticGlTFRootSnapshot({
            sourceEntity: entity,
            sourceEntityId: entity.id,
            sceneEntityId: entity.id,
            options
          })
        },
        ...sourceContentRevisionFromInstance(entity.instance),
        overrides: seedGLTFOverridesFromInlineSource(entity.instance?.overrides)
      };
    }
    next.bindings[binding.id] = binding;
    seedInlineAddedSourceInstanceBindings(next, entity.instance?.overrides, options);
    changed = true;
  }
  if (!changed)
    return prefab;
  return {
    bindings: next.bindings,
    byAssetId: rebuildPrefabBindingAssetIndex(next.bindings)
  };
}
function rebuildPrefabBindingAssetIndex(bindings) {
  const byAssetId = {};
  for (const binding of Object.values(bindings)) {
    const list = byAssetId[binding.assetId] ??= [];
    if (!list.includes(binding.id))
      list.push(binding.id);
  }
  return byAssetId;
}
function sourceVec3Override(value) {
  if (!Array.isArray(value) || value.length < 3)
    return void 0;
  const [x, y, z] = value;
  return typeof x === "number" && typeof y === "number" && typeof z === "number" ? { x, y, z } : void 0;
}
function inlineEntityOverrideToDomainProps(item) {
  const { target, position, rotation, scale, ...rest } = item;
  const props = convertAssetRefsToDomainRefs(rest);
  const transform = {};
  const nextPosition = sourceVec3Override(position);
  const nextRotation = sourceVec3Override(rotation);
  const nextScale = sourceVec3Override(scale);
  if (nextPosition)
    transform.position = nextPosition;
  if (nextRotation)
    transform.rotation = nextRotation;
  if (nextScale)
    transform.scale = nextScale;
  if (Object.keys(transform).length > 0)
    props.transform = transform;
  return props;
}
function findBindingForInstanceRoot(prefab, instanceRootEntityId, expected) {
  return Object.values(prefab.bindings).find((binding) => {
    return binding.instanceRootEntityId === instanceRootEntityId && binding.assetId === expected.assetId && binding.assetKind === expected.assetKind;
  });
}
function getSceneEntityIdForSourceEntity(binding, sourceEntityId) {
  return binding.sourceToSceneEntity[sourceEntityId] ?? binding.sourceEntitySnapshots?.[sourceEntityId]?.sceneEntityId;
}
function applyNestedOverridesSidecar(prefab, entries) {
  if (entries.length === 0)
    return [];
  const resolved = [];
  for (const entry of entries) {
    const address = resolveNestedInstanceAddress(prefab, entry);
    if (address.status !== "resolved")
      continue;
    const nestedBinding = address.chain[address.chain.length - 1];
    if (nestedBinding.assetId !== entry.assetId)
      continue;
    nestedBinding.overrides = mergeNestedOverrides(
      nestedBinding.overrides,
      materializeNestedSidecarOverrides(entry.overrides, nestedBinding)
    );
    resolved.push({ source: entry, binding: nestedBinding, addedEntities: entry.addedEntities ?? [] });
  }
  return resolved;
}
function materializeNestedSidecarOverrides(overrides, binding) {
  const next = cloneState(overrides);
  for (const bucketOfBuckets of [next.componentProps, next.addedComponents]) {
    for (const bucket of Object.values(bucketOfBuckets ?? {})) {
      for (const entry of Object.values(bucket)) {
        if (entry.props) {
          entry.props = materializeSourceScopedInstanceReferences(entry.props, binding);
        }
        if (entry.calls?.length) {
          entry.calls = materializeSourceScopedInstanceReferences(entry.calls, binding);
        }
      }
    }
  }
  return next;
}
function mergeNestedOverrides(base, persisted) {
  return {
    entityProps: { ...base.entityProps, ...persisted.entityProps },
    componentProps: mergeOverrideBuckets(base.componentProps, persisted.componentProps),
    removedEntities: { ...base.removedEntities, ...persisted.removedEntities },
    removedComponents: mergeOverrideBuckets(base.removedComponents, persisted.removedComponents),
    addedEntities: { ...base.addedEntities, ...persisted.addedEntities },
    addedComponents: mergeOverrideBuckets(base.addedComponents, persisted.addedComponents)
  };
}
function mergeOverrideBuckets(base, persisted) {
  const next = { ...base };
  for (const [ownerSourceId, bucket] of Object.entries(persisted)) {
    next[ownerSourceId] = { ...next[ownerSourceId] ?? {}, ...bucket };
  }
  return next;
}
function prunePrefabBindingsToReachableSourceInstances(sceneFile, prefab, options) {
  const reachableBindingIds = /* @__PURE__ */ new Set();
  const markInlineInstances = (overrides) => {
    for (const { id, entity } of inlineSourceInstances(overrides)) {
      const assetId = resolveRequiredSourceRef(entity.instance.asset.$ref);
      const assetKind = resolveSourceAssetKind(assetId, options, "inline added instance");
      if (!assetKind)
        continue;
      const binding = findBindingForInstanceRoot(prefab, id, { assetId, assetKind });
      if (binding)
        markReachableBinding(binding);
    }
  };
  const markReachableBinding = (binding) => {
    if (reachableBindingIds.has(binding.id))
      return;
    reachableBindingIds.add(binding.id);
    if (binding.assetKind !== "Prefab")
      return;
    const resolvedPrefabFile = options.resolvePrefabSourceFile ? resolvePrefabBindingSourceFile(prefab, binding, options.resolvePrefabSourceFile, options.resolveAssetKind) : void 0;
    if (!resolvedPrefabFile)
      return;
    const prefabFile = normalizeSourceIdPrefabFile(resolvedPrefabFile);
    const sourceIndex = buildSourceIdIndex(prefabFile);
    for (const sourceEntityId of collectReachablePrefabEntityIds(prefabFile)) {
      const sourceEntity = sourceIndex.entityById.get(sourceEntityId);
      const sourceRef = sourceEntity?.instance?.asset?.$ref;
      if (!sourceEntity || !sourceEntityId || !sourceRef)
        continue;
      if (isRemovedSourceEntity(binding, sourceEntityId))
        continue;
      const assetId = resolveRequiredSourceRef(sourceRef);
      const assetKind = resolveSourceAssetKind(assetId, options, "nested instance");
      if (!assetKind)
        continue;
      const sceneEntityId = getSceneEntityIdForSourceEntity(binding, sourceEntityId);
      if (!sceneEntityId)
        continue;
      const nestedBinding = findBindingForInstanceRoot(prefab, sceneEntityId, { assetId, assetKind });
      if (nestedBinding) {
        markReachableBinding(nestedBinding);
      }
    }
  };
  sceneFile.entities.forEach((entity) => {
    const entityId = entity.id;
    const sourceRef = entity.instance?.asset?.$ref;
    if (!entityId || !sourceRef)
      return;
    const assetId = resolveRequiredSourceRef(sourceRef);
    const assetKind = resolveSourceAssetKind(assetId, options, "scene instance");
    if (!assetKind)
      return;
    const binding = findBindingForInstanceRoot(prefab, entityId, { assetId, assetKind });
    if (binding) {
      markReachableBinding(binding);
      markInlineInstances(entity.instance?.overrides);
    }
  });
  if (reachableBindingIds.size === Object.keys(prefab.bindings).length)
    return prefab;
  const bindings = {};
  for (const [bindingId, binding] of Object.entries(prefab.bindings)) {
    if (reachableBindingIds.has(bindingId))
      bindings[bindingId] = binding;
  }
  return {
    bindings,
    byAssetId: rebuildPrefabBindingAssetIndex(bindings)
  };
}
function collectMissingNestedSourceInstanceBindings(prefab, options) {
  const missing = [];
  if (!options.resolvePrefabSourceFile)
    return missing;
  for (const binding of Object.values(prefab.bindings)) {
    if (binding.assetKind !== "Prefab" || options.assetExists?.(binding.assetId) === false)
      continue;
    const resolvedPrefabFile = resolvePrefabBindingSourceFile(
      prefab,
      binding,
      options.resolvePrefabSourceFile,
      options.resolveAssetKind
    );
    if (!resolvedPrefabFile) {
      throw new Error(
        `Cannot validate nested source instances for Prefab binding "${binding.id}" for asset "${binding.assetId}": source file is unavailable`
      );
    }
    const prefabFile = normalizeSourceIdPrefabFile(resolvedPrefabFile);
    const sourceIndex = buildSourceIdIndex(prefabFile);
    for (const sourceEntityId of collectReachablePrefabEntityIds(prefabFile)) {
      const sourceEntity = sourceIndex.entityById.get(sourceEntityId);
      const sourceRef = sourceEntity?.instance?.asset?.$ref;
      if (!sourceEntityId || !sourceRef || isRemovedSourceEntity(binding, sourceEntityId))
        continue;
      const assetId = resolveRequiredSourceRef(sourceRef);
      const assetKind = resolveSourceAssetKind(assetId, options, "nested instance");
      if (!assetKind)
        continue;
      const sceneEntityId = getSceneEntityIdForSourceEntity(binding, sourceEntityId);
      if (!sceneEntityId) {
        throw new Error(
          `Prefab binding "${binding.id}" nested source instance "${sourceEntityId}" (${sourceRef}) is missing a scene entity mapping`
        );
      }
      const nestedBinding = findBindingForInstanceRoot(prefab, sceneEntityId, { assetId, assetKind });
      if (nestedBinding)
        continue;
      missing.push({
        bindingId: binding.id,
        sourceEntityId,
        sourceEntity,
        sourceRef,
        assetId,
        assetKind,
        sceneEntityId
      });
    }
  }
  return missing;
}
function assertNestedSourceInstanceBindingsPresent(prefab, options) {
  const missing = collectMissingNestedSourceInstanceBindings(prefab, options);
  if (missing.length === 0)
    return;
  const item = missing[0];
  throw new Error(
    `Prefab binding "${item.bindingId}" nested source instance "${item.sourceEntityId}" (${item.sourceRef}) materializes scene entity "${item.sceneEntityId}", but its ${item.assetKind} binding for asset "${item.assetId}" is missing`
  );
}
function createUniquePrefabBindingId(bindings, assetId, instanceRootEntityId) {
  const baseId = `binding-${assetId}-${instanceRootEntityId}`;
  if (!bindings[baseId])
    return baseId;
  let index = 1;
  while (bindings[`${baseId}-${index}`])
    index += 1;
  return `${baseId}-${index}`;
}
function createSyntheticGlTFRootSnapshot(input) {
  const sourceInstance = input.sourceEntity.instance;
  const sourceEntity = {
    ...input.sourceEntity,
    id: input.sourceEntityId,
    children: void 0,
    components: void 0,
    instance: sourceInstance ? {
      asset: sourceInstance.asset
    } : void 0
  };
  const resolved = readSourceEntityResolvedState(sourceEntity, input.sourceEntityId, {
    resolveInstanceAssetDisplayName: input.options.resolveInstanceAssetDisplayName
  });
  return {
    sceneEntityId: input.sceneEntityId,
    parentSourceEntityId: null,
    childSourceEntityIds: [],
    childIndex: 0,
    name: resolved.name,
    isActive: resolved.isActive,
    ...resolved.layer !== void 0 ? { layer: resolved.layer } : {},
    ...resolved.isLocked !== void 0 ? { isLocked: resolved.isLocked } : {},
    transform: resolved.transform,
    components: {}
  };
}
function createSourceInstanceBindingFromInlineSource(input) {
  const { prefab, sourceEntity, sceneEntityId, sourceRef, assetId, assetKind, options } = input;
  const bindingId = createUniquePrefabBindingId(prefab.bindings, assetId, sceneEntityId);
  if (assetKind === "Prefab") {
    const resolvedPrefabFile = options.resolvePrefabSourceFile?.(assetId);
    if (!resolvedPrefabFile) {
      throw new Error(
        `Cannot rebuild Prefab binding for source instance "${sceneEntityId}" (${sourceRef}) and asset "${assetId}": source file is unavailable`
      );
    }
    const prefabFile = normalizeSourceIdPrefabFile(resolvedPrefabFile);
    const sourceRootEntityId = prefabFile.root;
    return {
      id: bindingId,
      assetId,
      assetKind,
      instanceRootEntityId: sceneEntityId,
      sourceRootEntityId,
      sourceRevision: 1,
      sourceToSceneEntity: { [sourceRootEntityId]: sceneEntityId },
      sourceEntitySnapshots: {},
      overrides: seedPrefabOverridesFromInlineSource(sourceEntity.instance?.overrides, prefabFile)
    };
  }
  return {
    id: bindingId,
    assetId,
    assetKind,
    instanceRootEntityId: sceneEntityId,
    sourceRootEntityId: "root",
    sourceRevision: 1,
    sourceToSceneEntity: { root: sceneEntityId },
    sourceEntitySnapshots: {
      root: createSyntheticGlTFRootSnapshot({
        sourceEntity,
        sourceEntityId: sceneEntityId,
        sceneEntityId,
        options
      })
    },
    ...sourceContentRevisionFromInstance(sourceEntity.instance),
    overrides: seedGLTFOverridesFromInlineSource(sourceEntity.instance?.overrides)
  };
}
function* inlineSourceInstances(overrides) {
  function* visit(id, entity) {
    if (entity.instance) {
      yield { id, entity };
      yield* inlineSourceInstances(entity.instance.overrides);
    }
    for (const child of entity.children ?? [])
      yield* visit(child.id, child);
  }
  for (const added of overrides?.addedEntities ?? [])
    yield* visit(added.id, added.entity);
}
function seedInlineAddedSourceInstanceBindings(prefab, overrides, options) {
  let changed = false;
  for (const { id: sceneEntityId, entity: inlineEntity } of inlineSourceInstances(overrides)) {
    const sourceRef = inlineEntity.instance?.asset?.$ref;
    if (!sourceRef)
      continue;
    const assetId = resolveRequiredSourceRef(sourceRef);
    const assetKind = resolveSourceAssetKind(assetId, options, "inline added instance");
    if (!assetKind)
      continue;
    if (findBindingForInstanceRoot(prefab, sceneEntityId, { assetId, assetKind }))
      continue;
    const binding = createSourceInstanceBindingFromInlineSource({
      prefab,
      sourceEntity: inlineEntity,
      sceneEntityId,
      sourceRef,
      assetId,
      assetKind,
      options
    });
    prefab.bindings[binding.id] = binding;
    changed = true;
  }
  return changed;
}
function seedNestedSourceInstanceBindings(prefab, options, ancestorAssetIdsByBindingId) {
  const missing = collectMissingNestedSourceInstanceBindings(prefab, options);
  if (missing.length === 0)
    return { prefab, changed: false };
  const next = clone(prefab);
  let changed = false;
  for (const item of missing) {
    if (findBindingForInstanceRoot(next, item.sceneEntityId, { assetId: item.assetId, assetKind: item.assetKind })) {
      continue;
    }
    const parentBinding = prefab.bindings[item.bindingId];
    const parentAssetIds = ancestorAssetIdsByBindingId.get(item.bindingId) ?? (parentBinding ? [parentBinding.assetId] : []);
    if (parentAssetIds.includes(item.assetId)) {
      throw new Error(`Prefab source instance asset cycle detected: ${[...parentAssetIds, item.assetId].join(" -> ")}`);
    }
    const bindingId = createUniquePrefabBindingId(next.bindings, item.assetId, item.sceneEntityId);
    let binding;
    if (item.assetKind === "Prefab") {
      const resolvedPrefabFile = options.resolvePrefabSourceFile?.(item.assetId);
      if (!resolvedPrefabFile) {
        throw new Error(
          `Cannot rebuild nested Prefab binding for source instance "${item.sourceEntityId}" and asset "${item.assetId}": source file is unavailable`
        );
      }
      const prefabFile = normalizeSourceIdPrefabFile(resolvedPrefabFile);
      const sourceRootEntityId = prefabFile.root;
      binding = {
        id: bindingId,
        assetId: item.assetId,
        assetKind: item.assetKind,
        instanceRootEntityId: item.sceneEntityId,
        sourceRootEntityId,
        sourceRevision: 1,
        sourceToSceneEntity: { [sourceRootEntityId]: item.sceneEntityId },
        sourceEntitySnapshots: {},
        overrides: createEmptyPrefabOverrides()
      };
    } else {
      binding = {
        id: bindingId,
        assetId: item.assetId,
        assetKind: item.assetKind,
        instanceRootEntityId: item.sceneEntityId,
        sourceRootEntityId: "root",
        sourceRevision: 1,
        sourceToSceneEntity: { root: item.sceneEntityId },
        sourceEntitySnapshots: {
          root: createSyntheticGlTFRootSnapshot({
            sourceEntity: item.sourceEntity,
            sourceEntityId: item.sourceEntityId,
            sceneEntityId: item.sceneEntityId,
            options
          })
        },
        ...sourceContentRevisionFromInstance(item.sourceEntity.instance),
        overrides: seedGLTFOverridesFromInlineSource(item.sourceEntity.instance?.overrides)
      };
    }
    next.bindings[binding.id] = binding;
    ancestorAssetIdsByBindingId.set(binding.id, [...parentAssetIds, item.assetId]);
    changed = true;
  }
  if (!changed)
    return { prefab, changed: false };
  return {
    prefab: {
      bindings: next.bindings,
      byAssetId: rebuildPrefabBindingAssetIndex(next.bindings)
    },
    changed: true
  };
}
function rememberPrefabBindingAssetPaths(prefab, ancestorAssetIdsByBindingId) {
  for (const binding of Object.values(prefab.bindings)) {
    if (!ancestorAssetIdsByBindingId.has(binding.id))
      ancestorAssetIdsByBindingId.set(binding.id, [binding.assetId]);
  }
}
function refreshAndSeedPrefabBindingsFromSource(prefab, sceneFile, options, entities, reservedSceneEntityIds, reservedSceneComponentIds, nestedOverrides) {
  let next = seedSourceSceneInstanceBindings(prefab, sceneFile, options);
  const ancestorAssetIdsByBindingId = /* @__PURE__ */ new Map();
  rememberPrefabBindingAssetPaths(next, ancestorAssetIdsByBindingId);
  for (; ; ) {
    const bindingCountBeforeSeed = Object.keys(next.bindings).length;
    next = refreshPrefabBindingSnapshotsFromSource(
      next,
      options,
      entities,
      reservedSceneEntityIds,
      reservedSceneComponentIds
    );
    applyNestedOverridesSidecar(next, nestedOverrides);
    const seeded = seedNestedSourceInstanceBindings(next, options, ancestorAssetIdsByBindingId);
    next = seeded.prefab;
    rememberPrefabBindingAssetPaths(next, ancestorAssetIdsByBindingId);
    if (!seeded.changed)
      return next;
    const bindingCountAfterSeed = Object.keys(next.bindings).length;
    if (bindingCountAfterSeed <= bindingCountBeforeSeed) {
      throw new Error(
        `Prefab source instance binding refresh did not make progress (${bindingCountBeforeSeed} bindings). Check nested prefab/glTF source instance data for a cycle or invalid materialization state.`
      );
    }
  }
}
function snapshotEntityToDomainEntity(binding, sourceEntityId, snapshot, existing) {
  const sceneEntityId = snapshot.sceneEntityId ?? binding.sourceToSceneEntity[sourceEntityId];
  if (!sceneEntityId) {
    throw new Error(`Prefab binding "${binding.id}" snapshot "${sourceEntityId}" is missing sceneEntityId`);
  }
  const parentId = snapshot.parentSourceEntityId ? binding.sourceToSceneEntity[snapshot.parentSourceEntityId] ?? null : existing?.parentId ?? null;
  const entityOverrides = binding.overrides.entityProps?.[sourceEntityId];
  const existingInstance = existing?.instance;
  const existingIsSameSourceEntity = existingInstance?.bindingId === binding.id && existingInstance.role !== "added" && (existingInstance.sourceEntityId === sourceEntityId || existingInstance.role === "root" && existingInstance.sourceEntityId === void 0 && sourceEntityId === binding.sourceRootEntityId);
  const snapshotChildren = [];
  for (const childSourceEntityId of snapshot.childSourceEntityIds ?? []) {
    if (isRemovedSourceEntity(binding, childSourceEntityId))
      continue;
    const childId = binding.sourceToSceneEntity[childSourceEntityId];
    if (!childId) {
      throw new Error(
        `Prefab binding "${binding.id}" snapshot child "${childSourceEntityId}" is missing sourceToSceneEntity mapping`
      );
    }
    snapshotChildren.push(childId);
  }
  const sourceEntityBySceneEntity = new Map(
    Object.entries(binding.sourceToSceneEntity).map(([sourceId, sceneId]) => [sceneId, sourceId])
  );
  const existingChildren = (existing?.children ?? []).filter((childId) => {
    const childSourceId = sourceEntityBySceneEntity.get(childId);
    return !childSourceId || !isRemovedSourceEntity(binding, childSourceId);
  });
  const components = {};
  for (const [sourceComponentKey, componentSnapshot] of Object.entries(snapshot.components ?? {})) {
    const sceneComponentId = componentSnapshot.sceneComponentId;
    if (!sceneComponentId)
      continue;
    if (binding.overrides.removedComponents?.[sourceEntityId]?.[sourceComponentKey])
      continue;
    const entry = binding.overrides.componentProps?.[sourceEntityId]?.[sourceComponentKey];
    components[sceneComponentId] = snapshotComponentToDomainComponent(
      binding.id,
      sourceComponentKey,
      componentSnapshot,
      entry?.props,
      entry?.calls
    );
  }
  const preserveNestedInstanceRoot = sourceEntityId !== binding.sourceRootEntityId && snapshot.instanceAssetKind && existingInstance?.role === "root" && existingInstance.assetKind === snapshot.instanceAssetKind;
  const existingComponents = Object.fromEntries(
    Object.entries(existing?.components ?? {}).filter(([, component]) => {
      const instance = component.instance;
      return !(instance?.bindingId === binding.id && instance.role !== "added");
    })
  );
  const resolvedLayer = entityOverrides?.layer ?? snapshot.layer ?? (existing?.layer !== void 0 && !existingIsSameSourceEntity && !preserveNestedInstanceRoot ? existing.layer : void 0);
  return {
    id: sceneEntityId,
    ...snapshot.unresolvedSource ? { unresolvedSource: clone(snapshot.unresolvedSource) } : {},
    name: entityOverrides?.name ?? (existing && !existingIsSameSourceEntity && !preserveNestedInstanceRoot ? existing.name : snapshot.name),
    isActive: entityOverrides?.isActive ?? (existing && !existingIsSameSourceEntity && !preserveNestedInstanceRoot ? existing.isActive : snapshot.isActive),
    parentId,
    children: appendUnique(snapshotChildren, existingChildren),
    transform: mergeTransform(
      existing && !existingIsSameSourceEntity && !preserveNestedInstanceRoot ? existing.transform : clone(snapshot.transform),
      entityOverrides?.transform
    ),
    components: {
      ...existingComponents,
      ...components
    },
    ...resolvedLayer !== void 0 && resolvedLayer !== 0 ? { layer: resolvedLayer } : {},
    ...entityOverrides?.isLocked !== void 0 ? { isLocked: entityOverrides.isLocked } : snapshot.isLocked !== void 0 ? { isLocked: snapshot.isLocked } : existing?.isLocked !== void 0 && !existingIsSameSourceEntity && !preserveNestedInstanceRoot ? { isLocked: existing.isLocked } : {},
    instance: preserveNestedInstanceRoot ? {
      ...existingInstance,
      ...snapshot.instanceAssetKey !== void 0 ? { assetKey: snapshot.instanceAssetKey } : {}
    } : {
      bindingId: binding.id,
      assetId: binding.assetId,
      assetKind: binding.assetKind,
      ...(snapshot.instanceAssetKey ?? existingInstance?.assetKey) !== void 0 ? { assetKey: snapshot.instanceAssetKey ?? existingInstance?.assetKey } : {},
      role: sourceEntityId === binding.sourceRootEntityId ? "root" : "linked",
      sourceEntityId
    }
  };
}
function orderPrefabBindingsForSnapshotMaterialization(prefab) {
  const bindings = Object.values(prefab.bindings);
  const bindingById = new Map(bindings.map((binding) => [binding.id, binding]));
  const dependencyIdsByBindingId = /* @__PURE__ */ new Map();
  for (const binding of bindings) {
    let dependencies = dependencyIdsByBindingId.get(binding.id);
    if (!dependencies) {
      dependencies = /* @__PURE__ */ new Set();
      dependencyIdsByBindingId.set(binding.id, dependencies);
    }
    for (const snapshot of Object.values(binding.sourceEntitySnapshots ?? {})) {
      if (!snapshot.instanceAssetKind)
        continue;
      const nestedBinding = bindings.find((candidate) => {
        return candidate.id !== binding.id && candidate.instanceRootEntityId === snapshot.sceneEntityId && candidate.assetKind === snapshot.instanceAssetKind;
      });
      if (nestedBinding)
        dependencies.add(nestedBinding.id);
    }
  }
  const ordered = [];
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const visit = (binding) => {
    if (visited.has(binding.id))
      return;
    if (visiting.has(binding.id)) {
      throw new Error(`Prefab binding materialization dependency cycle detected at "${binding.id}"`);
    }
    visiting.add(binding.id);
    for (const dependencyId of dependencyIdsByBindingId.get(binding.id) ?? []) {
      const dependency = bindingById.get(dependencyId);
      if (dependency)
        visit(dependency);
    }
    visiting.delete(binding.id);
    visited.add(binding.id);
    ordered.push(binding);
  };
  for (const binding of bindings) {
    visit(binding);
  }
  return ordered;
}
function materializePrefabBindingSnapshots(entities, prefab) {
  for (const binding of orderPrefabBindingsForSnapshotMaterialization(prefab)) {
    for (const [sourceEntityId, snapshot] of Object.entries(binding.sourceEntitySnapshots ?? {})) {
      if (isRemovedSourceEntity(binding, sourceEntityId)) {
        const removedSceneEntityId = snapshot.sceneEntityId ?? binding.sourceToSceneEntity[sourceEntityId];
        if (removedSceneEntityId) {
          delete entities[removedSceneEntityId];
        }
        continue;
      }
      const sceneEntityId = snapshot.sceneEntityId ?? binding.sourceToSceneEntity[sourceEntityId];
      if (!sceneEntityId)
        continue;
      entities[sceneEntityId] = snapshotEntityToDomainEntity(binding, sourceEntityId, snapshot, entities[sceneEntityId]);
    }
  }
}
function assertNoUnmaterializedSourceInstances(entities, prefab) {
  for (const entity of Object.values(entities)) {
    const bindingId = entity.instance?.bindingId;
    if (!bindingId || prefab.bindings[bindingId])
      continue;
    throw new Error(
      `Cannot direct-hydrate source v2 instance entity "${entity.id}" without prefab binding snapshots. Asset-backed instance expansion must happen before scene hydration enters DomainState; check that instantiate() ran for all referenced prefab assets.`
    );
  }
}
function materializeSidecarOnlyAddedOverrides(prefab, entities, sceneFile, report) {
  const inlineInstanceIds = new Set(
    sceneFile.entities.filter((entity) => entity.instance?.asset?.$ref).map((entity) => entity.id)
  );
  for (const binding of Object.values(prefab.bindings)) {
    if (inlineInstanceIds.has(binding.instanceRootEntityId))
      continue;
    for (const [sourceEntityId, components] of Object.entries(binding.overrides.addedComponents ?? {})) {
      const sceneEntityId = binding.sourceToSceneEntity[sourceEntityId];
      const sceneEntity = sceneEntityId ? entities[sceneEntityId] : void 0;
      if (!sceneEntity)
        continue;
      for (const added of Object.values(components)) {
        if (hasMaterializedAddedComponent(report, binding.id, sourceEntityId, added.componentId))
          continue;
        if (sceneEntity.components[added.componentId])
          continue;
        sceneEntity.components[added.componentId] = {
          type: added.type,
          ...added.refId ? { refId: added.refId } : {},
          ...added.scriptKey ? { scriptKey: added.scriptKey } : {},
          props: clone(added.props ?? {}),
          ...added.calls?.length ? { calls: clone(added.calls) } : {},
          instance: { bindingId: binding.id, role: "added" }
        };
        recordMaterializedAddedComponent(report, binding.id, sourceEntityId, added.componentId);
      }
    }
  }
}
function assertAddedOverridesMaterialized(prefab, report, deferGLTFInstanceOverrides = false) {
  for (const binding of Object.values(prefab.bindings)) {
    for (const added of Object.values(binding.overrides.addedEntities ?? {})) {
      if (hasMaterializedAddedEntity(report, binding.id, added.entityId))
        continue;
      if (deferGLTFInstanceOverrides && binding.assetKind === "glTF" && !binding.sourceToSceneEntity[added.parentSourceEntityId])
        continue;
      throw new Error(
        `Prefab binding "${binding.id}" added entity "${added.entityId}" is missing inline payload during source-v2 hydration`
      );
    }
    for (const [sourceEntityId, components] of Object.entries(binding.overrides.addedComponents ?? {})) {
      for (const added of Object.values(components)) {
        if (hasMaterializedAddedComponent(report, binding.id, sourceEntityId, added.componentId))
          continue;
        if (deferGLTFInstanceOverrides && binding.assetKind === "glTF" && !binding.sourceToSceneEntity[sourceEntityId])
          continue;
        throw new Error(
          `Prefab binding "${binding.id}" added component "${added.componentId}" is missing inline payload during source-v2 hydration`
        );
      }
    }
  }
}
function assertGLTFBindingsHaveSourceSnapshots(prefab) {
  for (const binding of Object.values(prefab.bindings)) {
    if (binding.assetKind !== "glTF")
      continue;
    const snapshots = binding.sourceEntitySnapshots ?? {};
    if (Object.keys(snapshots).length > 0 && snapshots[binding.sourceRootEntityId])
      continue;
    throw new Error(
      `Cannot direct-hydrate glTF binding "${binding.id}" without source snapshots. Provide available glTF source bytes before materializing this instance.`
    );
  }
}
function hydrateSourceV2SceneToDomain(sceneFile, inputOptions = {}) {
  let options = withSourceAssetAvailability(inputOptions);
  const glTFBaselines = /* @__PURE__ */ new Map();
  if (options.resolveGlTFSource) {
    const originalOptions = options;
    options = {
      ...options,
      // Missing or invalid source bytes make only the instance repairable, not the project unusable.
      assetExists: (assetId) => {
        if (originalOptions.assetExists?.(assetId) === false)
          return false;
        if (originalOptions.resolveAssetKind?.(assetId) !== "glTF")
          return true;
        if (glTFBaselines.has(assetId))
          return true;
        const source = originalOptions.resolveGlTFSource(assetId);
        if (!source || source.document instanceof Error)
          return false;
        try {
          glTFBaselines.set(
            assetId,
            createGlTFSourceBaseline(source, assetId, originalOptions.resolveInstanceAssetDisplayName?.(assetId))
          );
          return true;
        } catch {
          return false;
        }
      }
    };
  }
  const parseSceneFile = sceneFile;
  const entities = {};
  const rootEntityIds = [];
  parseSceneFileV2(parseSceneFile, entities, rootEntityIds, {
    ...options,
    deferPrefabInlineOverrideMaterialization: true
  });
  const reservedSceneEntityIds = parseSceneFile.entities.map((entity) => entity.id);
  const reservedSceneComponentIds = parseSceneFile.components.map((component) => component.id);
  const nestedOverridesSidecar = readNestedOverridesSidecar(sceneFile);
  const initialPrefabState = options.initialPrefabState ? clone(options.initialPrefabState) : createEmptyPrefabState();
  const refreshedPrefab = refreshAndSeedPrefabBindingsFromSource(
    initialPrefabState,
    parseSceneFile,
    options,
    entities,
    reservedSceneEntityIds,
    reservedSceneComponentIds,
    nestedOverridesSidecar
  );
  const prefab = prunePrefabBindingsToReachableSourceInstances(parseSceneFile, refreshedPrefab, options);
  const resolvedNestedOverrides = applyNestedOverridesSidecar(prefab, nestedOverridesSidecar);
  const resolvedEntries = new Set(resolvedNestedOverrides.map((entry) => entry.source));
  const retainedEntries = nestedOverridesSidecar.filter(
    (entry) => !resolvedEntries.has(entry) && resolveNestedInstanceAddress(prefab, entry).status === "unavailable" && parseSceneFile.entities.some((entity) => entity.id === entry.rootSceneEntityId && entity.instance)
  );
  if (retainedEntries.length)
    prefab.unresolvedNestedOverrides = clone(retainedEntries);
  else
    delete prefab.unresolvedNestedOverrides;
  if (options.resolveGlTFSource) {
    const usedEntityIds = new Set(reservedSceneEntityIds);
    const usedComponentIds = new Set(reservedSceneComponentIds);
    for (const binding of Object.values(prefab.bindings)) {
      if (binding.assetKind === "glTF")
        continue;
      Object.values(binding.sourceEntitySnapshots).forEach((snapshot) => {
        usedEntityIds.add(snapshot.sceneEntityId);
        Object.values(snapshot.components).forEach((component) => usedComponentIds.add(component.sceneComponentId));
      });
    }
    for (const binding of Object.values(prefab.bindings)) {
      if (binding.assetKind !== "glTF")
        continue;
      const source = options.resolveGlTFSource(binding.assetId);
      if (!source)
        throw new Error(`glTF source is unavailable: ${binding.assetId}`);
      assertGlTFOverrideRevisionCurrent({
        assetId: binding.assetId,
        bindingId: binding.id,
        requiresRevision: prefabBindingRequiresGlTFContentRevision(binding.overrides),
        authoredRevision: binding.sourceContentRevision,
        currentRevision: source.contentRevision
      });
      const baseline = clone(
        glTFBaselines.get(binding.assetId) ?? createGlTFSourceBaseline(source, binding.assetId, options.resolveInstanceAssetDisplayName?.(binding.assetId))
      );
      for (const [sourceEntityId, snapshot] of Object.entries(baseline.sourceEntitySnapshots)) {
        const previous = binding.sourceEntitySnapshots[sourceEntityId];
        snapshot.sceneEntityId = selectSceneEntityIdForSourceSnapshot({
          binding,
          sourceEntityId,
          existingSceneEntityId: binding.sourceToSceneEntity[sourceEntityId],
          previousSceneEntityId: previous?.sceneEntityId,
          allowExistingSceneEntityId: true,
          usedSceneEntityIds: usedEntityIds
        });
        for (const [sourceComponentKey, component] of Object.entries(snapshot.components)) {
          component.sceneComponentId = selectSceneComponentIdForSourceSnapshot({
            bindingId: binding.id,
            sceneEntityId: snapshot.sceneEntityId,
            sourceComponentKey,
            sourceComponentType: component.type,
            previousSceneComponentId: previous?.components[sourceComponentKey]?.sceneComponentId,
            componentRecords: /* @__PURE__ */ new Map(),
            usedSceneComponentIds: usedComponentIds
          });
        }
      }
      binding.sourceEntitySnapshots = baseline.sourceEntitySnapshots;
      binding.sourceToSceneEntity = Object.fromEntries(
        Object.entries(baseline.sourceEntitySnapshots).map(([id, snapshot]) => [id, snapshot.sceneEntityId])
      );
      binding.sourceContentRevision = source.contentRevision;
    }
  }
  if (!options.allowMissingNestedInstanceBindings) {
    assertNestedSourceInstanceBindingsPresent(prefab, options);
  }
  assertGLTFBindingsHaveSourceSnapshots(prefab);
  materializePrefabBindingSnapshots(entities, prefab);
  const addedOverrideMaterializationReport = createAddedOverrideMaterializationReport();
  materializeAddedOverridesFromSource(
    parseSceneFile,
    entities,
    options.resolveAssetKind,
    prefab,
    addedOverrideMaterializationReport,
    options.assetExists
  );
  for (const entry of resolvedNestedOverrides) {
    materializeNestedInstanceAddedEntities(
      entry.binding,
      entry.addedEntities,
      entities,
      prefab,
      options.resolveAssetKind,
      addedOverrideMaterializationReport,
      options.assetExists
    );
  }
  materializeSidecarOnlyAddedOverrides(prefab, entities, parseSceneFile, addedOverrideMaterializationReport);
  assertAddedOverridesMaterialized(prefab, addedOverrideMaterializationReport, options.deferGLTFInstanceOverrides);
  assertNoUnmaterializedSourceInstances(entities, prefab);
  resolveInstanceComponentTargetsInPlace({ entities, prefab }, prefab, {
    ids: new Set(
      Object.values(entities).filter((entity) => entity.unresolvedSource).map((entity) => entity.id)
    ),
    payloads: /* @__PURE__ */ new Set([
      prefab.unresolvedNestedOverrides,
      ...[
        ...Object.values(entities),
        ...Object.values(prefab.bindings).flatMap((binding) => Object.values(binding.sourceEntitySnapshots ?? {}))
      ].flatMap((entity) => entity.unresolvedSource ? [entity.unresolvedSource.instance] : [])
    ])
  });
  const settings = extractSceneSettings(sceneFile.scene);
  return {
    scene: {
      rootEntityIds,
      ...settings ? { settings } : {}
    },
    entities,
    prefab
  };
}

// packages/model/src/modules/components/domain/componentRuntimeCapabilities.ts
var RENDERER_COMPONENT_TYPES = [
  "Renderer",
  "MeshRenderer",
  "SkinnedMeshRenderer",
  "SpriteRenderer",
  "SpriteMask",
  "TextRenderer",
  "TrailRenderer",
  "ParticleRenderer",
  "UIRenderer",
  "Image",
  "Text",
  "SpineAnimationRenderer"
];
var BUILTIN_COMPONENT_RUNTIME_CAPABILITIES = Object.freeze(
  Object.fromEntries(
    RENDERER_COMPONENT_TYPES.map((type) => [
      type,
      Object.freeze({ propertySetters: Object.freeze({ material: "setMaterial" }) })
    ])
  )
);
function createComponentRuntimeCapabilitySnapshot(declarations = {}) {
  const capabilities = {};
  const componentTypes = /* @__PURE__ */ new Set([...Object.keys(BUILTIN_COMPONENT_RUNTIME_CAPABILITIES), ...Object.keys(declarations)]);
  for (const type of componentTypes) {
    capabilities[type] = Object.freeze({
      propertySetters: Object.freeze({
        ...BUILTIN_COMPONENT_RUNTIME_CAPABILITIES[type]?.propertySetters,
        ...declarations[type]?.propertySetters
      })
    });
  }
  const setterProperties = /* @__PURE__ */ new Set();
  for (const capability of Object.values(capabilities)) {
    for (const property of Object.keys(capability.propertySetters)) {
      setterProperties.add(property);
    }
  }
  return Object.freeze({
    capabilities: Object.freeze(capabilities),
    setterProperties: Object.freeze([...setterProperties].sort())
  });
}
var BUILTIN_COMPONENT_RUNTIME_CAPABILITY_SNAPSHOT = createComponentRuntimeCapabilitySnapshot();
function getBuiltinComponentRuntimeCapabilitySnapshot() {
  return BUILTIN_COMPONENT_RUNTIME_CAPABILITY_SNAPSHOT;
}
function hasComponentRuntimeCapabilityDeclaration(type, snapshot) {
  return Object.prototype.hasOwnProperty.call(snapshot.capabilities, type);
}
function resolveComponentRuntimeCapabilities(type, snapshot) {
  const capability = snapshot.capabilities[type];
  return capability && Object.keys(capability.propertySetters).length > 0 ? capability : void 0;
}
function resolveRuntimeSetterMethod(method, value) {
  return method === "setMaterial" && Array.isArray(value) ? "setMaterials" : method;
}

// packages/builder/utils/component-inheritance.generated.ts
var builtinComponentInheritance = {
  Animator: ["Animator", "Component", "EngineObject"],
  AudioSource: ["AudioSource", "Component", "EngineObject"],
  Button: ["Button", "UIInteractive", "Script", "Component", "EngineObject"],
  Camera: ["Camera", "Component", "EngineObject"],
  CharacterController: ["CharacterController", "Collider", "Component", "EngineObject"],
  Collider: ["Collider", "Component", "EngineObject"],
  Component: ["Component", "EngineObject"],
  CubeProbe: ["CubeProbe", "Probe", "Script", "Component", "EngineObject"],
  DirectLight: ["DirectLight", "Light", "Component", "EngineObject"],
  DynamicCollider: ["DynamicCollider", "Collider", "Component", "EngineObject"],
  FixedJoint: ["FixedJoint", "Joint", "Component", "EngineObject"],
  HingeJoint: ["HingeJoint", "Joint", "Component", "EngineObject"],
  Image: ["Image", "UIRenderer", "Renderer", "Component", "EngineObject"],
  Joint: ["Joint", "Component", "EngineObject"],
  Light: ["Light", "Component", "EngineObject"],
  MeshRenderer: ["MeshRenderer", "Renderer", "Component", "EngineObject"],
  ParticleRenderer: ["ParticleRenderer", "Renderer", "Component", "EngineObject"],
  PointLight: ["PointLight", "Light", "Component", "EngineObject"],
  PostProcess: ["PostProcess", "Component", "EngineObject"],
  Probe: ["Probe", "Script", "Component", "EngineObject"],
  Renderer: ["Renderer", "Component", "EngineObject"],
  Script: ["Script", "Component", "EngineObject"],
  SkinnedMeshRenderer: ["SkinnedMeshRenderer", "MeshRenderer", "Renderer", "Component", "EngineObject"],
  SpotLight: ["SpotLight", "Light", "Component", "EngineObject"],
  SpringJoint: ["SpringJoint", "Joint", "Component", "EngineObject"],
  SpriteMask: ["SpriteMask", "Renderer", "Component", "EngineObject"],
  SpriteRenderer: ["SpriteRenderer", "Renderer", "Component", "EngineObject"],
  StaticCollider: ["StaticCollider", "Collider", "Component", "EngineObject"],
  Text: ["Text", "UIRenderer", "Renderer", "Component", "EngineObject"],
  TextRenderer: ["TextRenderer", "Renderer", "Component", "EngineObject"],
  TrailRenderer: ["TrailRenderer", "Renderer", "Component", "EngineObject"],
  Transform: ["Transform", "Component", "EngineObject"],
  UICanvas: ["UICanvas", "Component", "EngineObject"],
  UIGroup: ["UIGroup", "Component", "EngineObject"],
  UIRenderer: ["UIRenderer", "Renderer", "Component", "EngineObject"],
  UITransform: ["UITransform", "Transform", "Component", "EngineObject"]
};

// packages/builder/utils/scene-runtime/state.ts
var RefTableBuilder = class {
  constructor(_resolveAssetUrl) {
    this._resolveAssetUrl = _resolveAssetUrl;
  }
  refs = [];
  _indexByKey = /* @__PURE__ */ new Map();
  add(ref) {
    const normalizedRef = normalizeSourceAssetRefRecord(ref);
    const normalizedKey = normalizedRef.key === "animatorController[0]" ? "animatorController" : normalizedRef.key || void 0;
    const url = this._resolveAssetUrl(normalizedRef.$ref);
    if (typeof url !== "string" || url.length === 0) {
      throw new Error(`Unable to resolve source asset ref "${normalizedRef.$ref}" to a runtime URL`);
    }
    const dedupeKey = JSON.stringify([url, normalizedKey ?? null]);
    const existing = this._indexByKey.get(dedupeKey);
    if (existing !== void 0)
      return existing;
    const item = { url };
    if (normalizedKey !== void 0)
      item.key = normalizedKey;
    const index = this.refs.length;
    this.refs.push(item);
    this._indexByKey.set(dedupeKey, index);
    return index;
  }
};
function collectComponentReferences(value, result = /* @__PURE__ */ new Set()) {
  if (Array.isArray(value)) {
    for (const item of value)
      collectComponentReferences(item, result);
  } else if (isRecord2(value)) {
    if (typeof value.$component === "string")
      result.add(value.$component);
    for (const item of Object.values(value))
      collectComponentReferences(item, result);
  }
  return result;
}
function matchesBuiltinRuntimeComponent(candidate, selector) {
  if (candidate === selector)
    return true;
  const candidateTypes = builtinComponentInheritance[candidate];
  if (!candidateTypes || !builtinComponentInheritance[selector]) {
    throw new Error(`Cannot lower runtime component inheritance: ${candidate} -> ${selector}`);
  }
  return candidateTypes.includes(selector);
}
function resolveAddedComponentOwner(index, ownerId, options, visited = /* @__PURE__ */ new Set()) {
  if (visited.has(index))
    throw new Error("Cyclic instance source topology");
  const next = new Set(visited).add(index);
  const owner = index.entityById.get(ownerId);
  if (owner && !owner.instance) {
    return {
      path: lowerSourceEntityOverridePath(ownerId, index),
      components: (owner.components ?? []).map((id) => index.componentById.get(id))
    };
  }
  const matches = [];
  for (const [id, entity] of index.entityById) {
    if (!entity.instance || owner && id !== ownerId)
      continue;
    const nested = resolveInstanceAssetSourceIndex(entity.instance.asset.$ref, options);
    if (!nested)
      continue;
    const nestedOwner = owner ? nested.rootEntityIds[0] : ownerId;
    const found = resolveAddedComponentOwner(nested, nestedOwner, options, next);
    if (found) {
      const overrides = entity.instance.overrides;
      const removed = new Set(overrides?.removedComponents);
      const components = [
        ...found.components,
        ...(overrides?.addedComponents ?? []).filter((added) => added.owner === nestedOwner).map((added) => ({ ...added.component, id: added.id }))
      ].filter((component) => !removed.has(component.id));
      matches.push({ path: [...lowerSourceEntityOverridePath(id, index), ...found.path], components });
    }
  }
  if (matches.length > 1)
    throw new Error(`Ambiguous component owner "${ownerId}" in nested source topology`);
  return matches[0];
}
function indexSourceWithInlineAdditions(source, resolveAssetUrl, options, referencedComponents = collectComponentReferences(source)) {
  const index = buildSourceIdIndex(source, { includeInstanceAdditions: true });
  const runtimeType = (component) => component.type === "Script" && component.script ? resolveAssetUrl(component.script.$ref) : component.type;
  for (const [id, { instance }] of index.entityById) {
    if (!instance?.overrides?.addedComponents?.length)
      continue;
    const instanceIndex = resolveInstanceAssetSourceIndex(instance.asset.$ref, options);
    const ownerComponents = /* @__PURE__ */ new Map();
    const matchesRuntimeType = (candidate, selector) => {
      if (runtimeType(candidate) === runtimeType(selector))
        return true;
      if (selector.type === "Script") {
        if (candidate.type === "Script")
          throw new Error("Cannot lower a Script selector without its runtime inheritance topology");
        return false;
      }
      return matchesBuiltinRuntimeComponent(candidate.type, selector.type);
    };
    for (const added of instance.overrides.addedComponents) {
      if (!instanceIndex)
        continue;
      const owner = resolveAddedComponentOwner(instanceIndex, added.owner, options);
      if (!owner)
        throw new Error(`Cannot resolve added component owner "${added.owner}"`);
      const ownerPath = owner.path;
      let components = ownerComponents.get(added.owner);
      if (!components) {
        components = [...owner.components];
        ownerComponents.set(added.owner, components);
      }
      const type = runtimeType(added.component);
      const typeIndex = referencedComponents.has(added.id) ? components.filter((component) => matchesRuntimeType(component, added.component)).length : 0;
      components.push(added.component);
      if (!referencedComponents.has(added.id))
        continue;
      index.componentReferenceTargetById.set(added.id, {
        entity: [...index.entityReferenceTargetById.get(id), ...ownerPath],
        type,
        index: typeIndex
      });
    }
  }
  return index;
}
function allocateInstanceAdditions(instanceEntity, runtimePath, state, resolveAssetUrl, referencedComponents, instanceSourceIndex) {
  const scoped = indexSourceWithInlineAdditions(
    {
      asset: { version: "2.0" },
      root: instanceEntity.id,
      entities: [instanceEntity],
      components: []
    },
    resolveAssetUrl,
    {
      ...state,
      instanceAssetSourceIndexes: new Map(state.instanceAssetSourceIndexes).set(
        instanceEntity.instance.asset.$ref,
        instanceSourceIndex
      )
    },
    referencedComponents
  );
  const target = state.sourceIndex;
  const entityPaths = /* @__PURE__ */ new Map([[0, runtimePath]]);
  for (const [id, index] of scoped.entityIndexById) {
    if (id === instanceEntity.id)
      continue;
    if (target.entityById.has(id))
      throw new Error(`Duplicate authored entity "${id}"`);
    const allocated = state.entities.length++;
    target.entityIndexById.set(id, allocated);
    entityPaths.set(index, [allocated]);
  }
  for (const [id] of scoped.componentIndexById) {
    if (target.componentById.has(id))
      throw new Error(`Duplicate authored component "${id}"`);
    target.componentIndexById.set(id, state.components.length++);
  }
  const relocate = ([root, ...path]) => [...entityPaths.get(root), ...path];
  for (const [id, entity] of scoped.entityById)
    target.entityById.set(id, entity);
  for (const [id, component] of scoped.componentById)
    target.componentById.set(id, component);
  for (const [id, owner] of scoped.componentOwnerEntityIdById)
    target.componentOwnerEntityIdById.set(id, owner);
  for (const [id, path] of scoped.entityReferenceTargetById)
    target.entityReferenceTargetById.set(id, relocate(path));
  for (const [id, ref] of scoped.componentReferenceTargetById) {
    target.componentReferenceTargetById.set(id, { ...ref, entity: relocate(ref.entity) });
  }
  for (const [id, ref] of scoped.componentOverrideTargetById)
    target.componentOverrideTargetById.set(id, ref);
  for (const [id, path] of scoped.entityPathById)
    target.entityPathById.set(id, path);
}
function hasOwnKeys(obj) {
  return Object.keys(obj).length > 0;
}
function hasDefinedOwnKey(obj, keys) {
  const record = obj;
  return keys.some((key) => record[key] !== void 0 && record[key] !== null);
}
function requireNumber(value, path) {
  if (typeof value !== "number") {
    throw new Error(`${path} must be a number`);
  }
  return value;
}
function requireColorTuple(color, path) {
  if (!color || typeof color !== "object") {
    throw new Error(`${path} is required`);
  }
  return [
    requireNumber(color.r, `${path}.r`),
    requireNumber(color.g, `${path}.g`),
    requireNumber(color.b, `${path}.b`),
    requireNumber(color.a, `${path}.a`)
  ];
}
function requireVector3Tuple(value, path) {
  if (Array.isArray(value)) {
    return [
      requireNumber(value[0], `${path}[0]`),
      requireNumber(value[1], `${path}[1]`),
      requireNumber(value[2], `${path}[2]`)
    ];
  }
  if (value && typeof value === "object") {
    const record = value;
    return [
      requireNumber(record.x, `${path}.x`),
      requireNumber(record.y, `${path}.y`),
      requireNumber(record.z, `${path}.z`)
    ];
  }
  throw new Error(`${path} must be a vector3`);
}
function resolveInstanceAssetSourceIndex(sourceRef, options) {
  const cached = options.instanceAssetSourceIndexes?.get(sourceRef);
  if (cached)
    return cached;
  const sourceFile = options.resolveInstanceSourceFile?.(sourceRef);
  if (sourceFile) {
    if ("scene" in sourceFile) {
      throw new Error(
        `Cannot compile instance overrides for "${sourceRef}": Scene assets cannot provide instance override source topology`
      );
    }
    const index = buildSourceIdIndex(sourceFile);
    options.instanceAssetSourceIndexes?.set(sourceRef, index);
    return index;
  }
}
function createRuntimeBuildState(source, resolveAssetUrl, options) {
  const refs = new RefTableBuilder(resolveAssetUrl);
  const instanceAssetSourceIndexes = /* @__PURE__ */ new Map();
  const sourceIndex = indexSourceWithInlineAdditions(source, resolveAssetUrl, {
    ...options,
    instanceAssetSourceIndexes
  });
  return {
    refs,
    entities: new Array(sourceIndex.entityById.size),
    components: new Array(sourceIndex.componentById.size),
    sourceIndex,
    instanceAssetSourceIndexes,
    resolveInstanceSourceFile: options.resolveInstanceSourceFile,
    resolveInstanceAssetKind: options.resolveInstanceAssetKind,
    resolveAssetContentRevision: options.resolveAssetContentRevision,
    componentRuntimeCapabilitySnapshot: options.componentRuntimeCapabilitySnapshot ?? getBuiltinComponentRuntimeCapabilitySnapshot()
  };
}
function assertMethodOwnedInstanceProp(mutationKind, path, propName) {
  if (mutationKind === "instance-override") {
    throw new Error(`${path}.${propName} is method-owned and must be preserved as ordered componentProps.calls`);
  }
}

// packages/builder/utils/scene-runtime/values.ts
function resolveRuntimeScriptComponentType(component, refs) {
  if (component.type !== "Script")
    return void 0;
  const scriptRef = component.script;
  if (!scriptRef || typeof scriptRef !== "object" || typeof scriptRef.$ref !== "string") {
    return void 0;
  }
  return refs.refs[refs.add(scriptRef)]?.url;
}
function runtimeComponentRefOptions(refs) {
  const runtimeType = (component) => resolveRuntimeScriptComponentType(component, refs) ?? component.type;
  return {
    resolveRuntimeComponentType: runtimeType,
    matchesRuntimeComponent: (candidate, selector) => selector.type === "Script" ? runtimeType(candidate) === runtimeType(selector) : matchesBuiltinRuntimeComponent(candidate.type, selector.type)
  };
}
function lowerInstanceComponentRef(ref, sourceIndex, options, refs) {
  const instanceEntity = sourceIndex.entityById.get(ref.instance);
  const instancePath = sourceIndex.entityReferenceTargetById.get(ref.instance);
  if (!instanceEntity?.instance || !instancePath) {
    throw new Error(`Source component ref instance "${ref.instance}" does not exist`);
  }
  const sourceRef = instanceEntity.instance.asset.$ref;
  const instanceSourceIndex = resolveInstanceAssetSourceIndex(sourceRef, options);
  if (instanceSourceIndex) {
    const target = lowerSourceComponentOverrideTarget(ref.target, instanceSourceIndex, runtimeComponentRefOptions(refs));
    return {
      $component: {
        entity: [...instancePath, ...target.path],
        type: target.selector.type,
        index: target.selector.index
      }
    };
  }
  if (options.resolveInstanceAssetKind?.(sourceRef) === "glTF") {
    const target = parseGLTFComponentOverrideTarget(ref.target);
    return {
      $component: {
        entity: [...instancePath, ...target.sourceEntityPath],
        type: target.componentType,
        index: target.componentIndex
      }
    };
  }
  throw new Error(
    `Cannot compile instance component ref "${ref.instance}:${ref.target}": referenced source topology is required`
  );
}
function convertValue(value, refs, sourceIndex, path = "$", options = {}) {
  const normalized = normalizeSourceValue(value);
  return lowerSourceValue(normalized ?? null, refs, sourceIndex, path, options);
}
function convertRuntimeValue(value, refs, sourceIndex, path = "$", options = {}) {
  return lowerSourceValue(value, refs, sourceIndex, path, options);
}
function lowerSourceValue(value, refs, sourceIndex, path, options) {
  if (value === null)
    return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  if (Array.isArray(value)) {
    return value.map((item, index) => lowerSourceValue(item, refs, sourceIndex, `${path}[${index}]`, options));
  }
  const record = value;
  if ("$ref" in record && typeof record.$ref === "string") {
    return { $ref: refs.add(normalizeSourceAssetRefRecord(record)) };
  }
  if ("$entity" in record && typeof record.$entity === "string") {
    try {
      return lowerSourceEntityRef(record, sourceIndex);
    } catch (error) {
      const outerSourceIndex = options.instanceSourceIndex;
      if (outerSourceIndex && outerSourceIndex !== sourceIndex && outerSourceIndex.entityById.has(record.$entity)) {
        return lowerSourceEntityRef(record, outerSourceIndex);
      }
      throw error;
    }
  }
  if ("$component" in record) {
    if (typeof record.$component !== "string") {
      return lowerInstanceComponentRef(
        record.$component,
        options.instanceSourceIndex ?? sourceIndex,
        options,
        refs
      );
    }
    const lowerComponent = (index) => lowerSourceComponentRef(record, index, runtimeComponentRefOptions(refs));
    try {
      return lowerComponent(sourceIndex);
    } catch (error) {
      const outerSourceIndex = options.instanceSourceIndex;
      if (outerSourceIndex && outerSourceIndex !== sourceIndex && outerSourceIndex.componentById.has(record.$component)) {
        return lowerComponent(outerSourceIndex);
      }
      throw error;
    }
  }
  if ("$signal" in record && Array.isArray(record.$signal)) {
    return {
      $signal: record.$signal.map(
        (item, index) => lowerSourceValue(item, refs, sourceIndex, `${path}.$signal[${index}]`, options)
      )
    };
  }
  if ("$type" in record && typeof record.$type === "string") {
    const result2 = { $type: record.$type };
    for (const [key, child] of Object.entries(record)) {
      if (key === "$type")
        continue;
      if (isEditorMetaKey(key))
        continue;
      result2[key] = lowerSourceValue(child, refs, sourceIndex, `${path}.${key}`, options);
    }
    return result2;
  }
  const result = {};
  for (const [key, child] of Object.entries(record)) {
    if (isEditorMetaKey(key))
      continue;
    result[key] = lowerSourceValue(child, refs, sourceIndex, `${path}.${key}`, options);
  }
  return result;
}
function isEditorMetaKey(key) {
  return key.startsWith("_meta");
}
function colorObjectToTuple(color) {
  return [color.r, color.g, color.b, color.a];
}

// packages/model/src/headless/collider-shape.ts
var import_uuid2 = __toESM(require_dist());
function isRecord6(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function normalizeColliderShapeStrict(shape, path) {
  if (!isRecord6(shape)) {
    throw new Error(`${path} must be an object`);
  }
  if (typeof shape.$type === "string") {
    return shape;
  }
  const { class: klass, type, props, ...rest } = shape;
  const shapeType = typeof klass === "string" ? klass : typeof type === "string" ? type : void 0;
  if (shapeType === void 0) {
    throw new Error(`${path} must include a collider shape $type`);
  }
  if (props === void 0 || props === null) {
    return { $type: shapeType, ...rest };
  }
  if (!isRecord6(props)) {
    throw new Error(`${path}.props must be an object`);
  }
  return { $type: shapeType, ...props, ...rest };
}

// packages/model/src/particle-color.ts
function particleColorToLinear(color) {
  const intensity = color.intensity ?? 1;
  return { r: color.r * intensity, g: color.g * intensity, b: color.b * intensity, a: color.a ?? 1 };
}

// packages/model/src/particle-custom-data.ts
var PARTICLE_CUSTOM_DATA_STREAM_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
function isValidParticleCustomDataStreamName(name) {
  return typeof name === "string" && PARTICLE_CUSTOM_DATA_STREAM_NAME_PATTERN.test(name);
}

// packages/builder/utils/scene-runtime/particle.ts
function prepareParticleRendererRuntimeProps(props, path, mutationKind = "component") {
  const generator = props.generator;
  const topLevelProps = pickParticleRendererRuntimeTopLevelProps(props);
  if (!isRecord2(generator)) {
    assertNoUnsupportedParticleRendererTopLevelProps(props, path);
    return {
      props: sanitizeParticleRuntimeValue(topLevelProps, path),
      calls: []
    };
  }
  const normalizedProps = sanitizeParticleRuntimeValue(topLevelProps, path);
  const { generator: runtimeGenerator, calls } = sanitizeParticleGenerator(generator, `${path}.generator`, mutationKind);
  return {
    props: { ...normalizedProps, generator: runtimeGenerator },
    calls
  };
}
var PARTICLE_RENDERER_RUNTIME_TOP_LEVEL_PROPS = /* @__PURE__ */ new Set([
  "enabled",
  "priority",
  "velocityScale",
  "lengthScale",
  "pivot",
  "renderMode",
  "mesh",
  "material"
]);
function pickParticleRendererRuntimeTopLevelProps(props) {
  const result = {};
  for (const key of PARTICLE_RENDERER_RUNTIME_TOP_LEVEL_PROPS) {
    if (props[key] !== void 0)
      result[key] = props[key];
  }
  return result;
}
function assertNoUnsupportedParticleRendererTopLevelProps(props, path) {
  const unsupportedKeys = Object.keys(props).filter(
    (key) => key !== "generator" && !PARTICLE_RENDERER_RUNTIME_TOP_LEVEL_PROPS.has(key)
  );
  if (unsupportedKeys.length === 0)
    return;
  throw new Error(
    `${path} contains ParticleRenderer module props without canonical generator: ${unsupportedKeys.join(", ")}`
  );
}
var DISABLED_PARTICLE_MODULES_CANONICAL_PROPS = /* @__PURE__ */ new Set([
  "sizeOverLifetime",
  "rotationOverLifetime",
  "velocityOverLifetime",
  "limitVelocityOverLifetime",
  "forceOverLifetime",
  "colorOverLifetime",
  "textureSheetAnimation",
  "noise"
]);
var PARTICLE_SHAPE_CLASSES = /* @__PURE__ */ new Set([
  "BoxShape",
  "CircleShape",
  "ConeShape",
  "HemisphereShape",
  "SphereShape",
  "MeshShape"
]);
var PARTICLE_GENERATOR_METHOD_OWNED_LISTS = [
  {
    module: "emission",
    list: "bursts",
    clearMethod: "clearBurst",
    addMethod: "addBurst",
    lowerItemArgs: (burst, path) => [lowerParticleBurst(burst, path)]
  },
  {
    module: "subEmitters",
    list: "subEmitters",
    clearMethod: "clear",
    addMethod: "addSubEmitter",
    lowerItemArgs: lowerParticleSubEmitterSlotArgs
  }
];
function sanitizeParticleGenerator(generator, path, mutationKind = "component") {
  const result = {};
  const calls = [];
  for (const [key, value] of Object.entries(generator)) {
    const childPath = `${path}.${key}`;
    const ownedList = PARTICLE_GENERATOR_METHOD_OWNED_LISTS.find((entry) => entry.module === key);
    if (ownedList && isRecord2(value) && Object.prototype.hasOwnProperty.call(value, ownedList.list)) {
      const { [ownedList.list]: _items, ...moduleProps } = value;
      result[key] = sanitizeParticleRuntimeValue(moduleProps, childPath);
      continue;
    }
    if (key === "customData") {
      const module = sanitizeParticleCustomDataModule(value, childPath, mutationKind);
      result[key] = module.props;
      calls.push(...module.calls);
      continue;
    }
    if (DISABLED_PARTICLE_MODULES_CANONICAL_PROPS.has(key) && isRecord2(value) && value.enabled === false) {
      result[key] = { enabled: false };
      continue;
    }
    result[key] = sanitizeParticleRuntimeValue(value, childPath);
  }
  return { generator: result, calls };
}
function lowerParticleGeneratorListCalls(generator, path, mutationKind) {
  return PARTICLE_GENERATOR_METHOD_OWNED_LISTS.flatMap(({ module, list, clearMethod, addMethod, lowerItemArgs }) => {
    const moduleValue = generator[module];
    if (!isRecord2(moduleValue) || !Object.prototype.hasOwnProperty.call(moduleValue, list))
      return [];
    const listPath = `${path}.generator.${module}.${list}`;
    const items = moduleValue[list];
    if (!Array.isArray(items)) {
      throw new Error(`${listPath} must be an array`);
    }
    const target = ["generator", module];
    const adds = items.flatMap((item, index) => {
      const args = lowerItemArgs(item, `${listPath}[${index}]`);
      return args ? [{ target, method: addMethod, args }] : [];
    });
    return adds.length > 0 || mutationKind === "instance-override" ? [{ target, method: clearMethod }, ...adds] : [];
  });
}
function lowerParticleSubEmitterSlotArgs(slot, path) {
  if (!isRecord2(slot))
    throw new Error(`${path} must be a sub-emitter binding`);
  if (slot.emitter === null)
    return null;
  if (!isRecord2(slot.emitter) || slot.emitter.$component === void 0) {
    throw new Error(`${path}.emitter must reference a ParticleRenderer component`);
  }
  const { type, inheritProperties = 0, emitProbability = 1, emitCount = 1 } = slot;
  return [slot.emitter, type, inheritProperties, emitProbability, emitCount];
}
function assertParticleSubEmitterCalls(componentType, calls, path) {
  if (componentType !== "ParticleRenderer")
    return;
  const subEmittersPath = `${path}.generator.subEmitters`;
  for (const call of calls) {
    if (call.method !== "addSubEmitter" || call.target?.length !== 2 || call.target[0] !== "generator" || call.target[1] !== "subEmitters") {
      continue;
    }
    if ((call.args?.length ?? 0) > 5) {
      throw new Error(`${subEmittersPath} addSubEmitter accepts at most 5 args`);
    }
    const [emitter, type, inheritProperties = 0, emitProbability = 1, emitCount = 1] = call.args ?? [];
    if (!isRecord2(emitter) || !isRecord2(emitter.$component) || emitter.$component.type !== "ParticleRenderer") {
      throw new Error(`${subEmittersPath} emitter must resolve to ParticleRenderer`);
    }
    if (type !== 0 && type !== 1)
      throw new Error(`${subEmittersPath} type must be Birth (0) or Death (1)`);
    if (!Number.isInteger(inheritProperties) || Number(inheritProperties) < 0 || Number(inheritProperties) > 15) {
      throw new Error(`${subEmittersPath} inheritProperties must be a supported inheritance bitmask`);
    }
    if (typeof emitProbability !== "number" || !Number.isFinite(emitProbability) || emitProbability < 0 || emitProbability > 1) {
      throw new Error(`${subEmittersPath} emitProbability must be a finite number between 0 and 1`);
    }
    if (!Number.isInteger(emitCount) || Number(emitCount) < 0) {
      throw new Error(`${subEmittersPath} emitCount must be a nonnegative integer`);
    }
  }
}
function lowerParticleBurst(value, path) {
  const burst = parseParticleBurstSource(value, path);
  const count = burst.count;
  const runtimeCount = {
    $type: "ParticleCompositeCurve",
    $args: count.mode === PARTICLE_BURST_COUNT_MODE_CONSTANT ? [count.constantMax] : [count.constantMin, count.constantMax]
  };
  return {
    $type: "Burst",
    $args: [
      burst.time,
      runtimeCount,
      burst.cycles === Infinity ? { $number: "Infinity" } : burst.cycles,
      burst.repeatInterval
    ]
  };
}
function readParticleConstructor(value, className, path) {
  if (!isRecord2(value) || value.class !== className || !Array.isArray(value.constructParams)) {
    throw new Error(`${path} must be ${className} constructor data`);
  }
  const props = value.props;
  if (props === void 0) {
    return { constructParams: value.constructParams, props: {} };
  }
  if (!isRecord2(props)) {
    throw new Error(`${path}.props must be an object`);
  }
  return { constructParams: value.constructParams, props };
}
function requireParticleNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}
function sanitizeParticleRuntimeValue(value, path) {
  if (value === void 0)
    return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeParticleRuntimeValue(item, `${path}[${index}]`));
  }
  if (!isRecord2(value)) {
    throw new Error(`${path} cannot be compiled to runtime v2`);
  }
  if (isRuntimeSentinelValue(value)) {
    return value;
  }
  if (isParticleShapeOption(value)) {
    return sanitizeParticleShapeOption(value, path);
  }
  const compositeRule = findParticleCompositeOptionRule(value);
  if (compositeRule) {
    return sanitizeParticleCompositeOptions(value, path, compositeRule);
  }
  if (typeof value.class === "string" || Object.prototype.hasOwnProperty.call(value, "constructParams")) {
    throw new Error(`${path} uses editor constructor data that cannot be compiled to engine runtime v2`);
  }
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "module")
      continue;
    const normalized = sanitizeParticleRuntimeValue(child, `${path}.${key}`);
    if (normalized !== null || child === null) {
      result[key] = normalized;
    }
  }
  return result;
}
function isRuntimeSentinelValue(value) {
  return "$ref" in value || "$entity" in value || "$component" in value || "$signal" in value || "$type" in value;
}
function isParticleShapeOption(value) {
  return typeof value.class === "string" && (PARTICLE_SHAPE_CLASSES.has(value.class) || value.class === "Null");
}
function sanitizeParticleShapeOption(value, path) {
  if (value.class === "Null")
    return null;
  const props = isRecord2(value.props) ? value.props : {};
  const result = { $type: value.class };
  for (const [key, child] of Object.entries(props)) {
    const normalized = sanitizeParticleRuntimeValue(child, `${path}.props.${key}`);
    if (normalized !== null || child === null)
      result[key] = normalized;
  }
  return result;
}
var PARTICLE_COMPOSITE_OPTION_RULES = [
  {
    markerKeys: ["curve", "curveMax", "curveMin"],
    constructorKeys: ["curveMin", "curveMax", "curve"],
    lowerConstructor: lowerParticleCurveConstructor
  },
  {
    markerKeys: ["gradient", "gradientMax", "gradientMin"],
    constructorKeys: ["gradientMin", "gradientMax", "gradient"],
    lowerConstructor: lowerParticleGradientConstructor
  }
];
var PARTICLE_COMPOSITE_CONSTANT_KEYS = ["constantMin", "constantMax", "constant"];
function findParticleCompositeOptionRule(value) {
  if (typeof value.mode !== "number")
    return void 0;
  const constructorRule = PARTICLE_COMPOSITE_OPTION_RULES.find((rule) => rule.markerKeys.some((key) => key in value));
  if (constructorRule)
    return constructorRule;
  return PARTICLE_COMPOSITE_CONSTANT_KEYS.some((key) => key in value) ? PARTICLE_COMPOSITE_OPTION_RULES[0] : void 0;
}
function sanitizeParticleCompositeOptions(value, path, rule) {
  const mode = value.mode;
  const result = { mode };
  for (const key of PARTICLE_COMPOSITE_CONSTANT_KEYS) {
    if (value[key] !== void 0) {
      const constant = value[key];
      result[key] = isRecord2(constant) && "r" in constant ? lowerParticleColor(constant, `${path}.${key}`) : sanitizeParticleRuntimeValue(constant, `${path}.${key}`);
    }
  }
  if (mode === 2 || mode === 3) {
    for (const key of rule.constructorKeys) {
      if (value[key] !== void 0) {
        result[key] = rule.lowerConstructor(value[key], `${path}.${key}`);
      }
    }
  }
  return result;
}
function lowerParticleCurveConstructor(value, path) {
  const { constructParams, props } = readParticleConstructor(value, "ParticleCurve", path);
  const result = {
    $type: "ParticleCurve",
    $args: constructParams.map(
      (key, index) => lowerParticleCurveKeyConstructor(key, `${path}.constructParams[${index}]`)
    )
  };
  for (const key of Object.keys(props)) {
    if (key !== "module") {
      throw new Error(`${path}.props.${key} is not a ParticleCurve runtime property`);
    }
  }
  return result;
}
function lowerParticleCurveKeyConstructor(value, path) {
  const { constructParams, props } = readParticleConstructor(value, "CurveKey", path);
  if (constructParams.length !== 2) {
    throw new Error(`${path}.constructParams must contain time and value`);
  }
  const result = {
    $type: "CurveKey",
    $args: [
      requireParticleNumber(constructParams[0], `${path}.constructParams[0]`),
      requireParticleNumber(constructParams[1], `${path}.constructParams[1]`)
    ]
  };
  for (const [key, child] of Object.entries(props)) {
    if (key === "module")
      continue;
    if (key !== "time" && key !== "value") {
      throw new Error(`${path}.props.${key} is not a CurveKey runtime property`);
    }
    result[key] = requireParticleNumber(child, `${path}.props.${key}`);
  }
  return result;
}
function lowerParticleGradientConstructor(value, path) {
  if (!isRecord2(value) || value.class !== "ParticleGradient" || !Array.isArray(value.constructParams)) {
    throw new Error(`${path} must be ParticleGradient constructor data`);
  }
  const [colorKeys, alphaKeys] = value.constructParams;
  if (!Array.isArray(colorKeys) || !Array.isArray(alphaKeys) || value.constructParams.length !== 2) {
    throw new Error(`${path}.constructParams must contain colorKeys and alphaKeys arrays`);
  }
  return {
    $type: "ParticleGradient",
    $args: [
      colorKeys.map((key, index) => lowerParticleGradientColorKey(key, `${path}.constructParams[0][${index}]`)),
      alphaKeys.map((key, index) => lowerParticleGradientAlphaKey(key, `${path}.constructParams[1][${index}]`))
    ]
  };
}
function lowerParticleColor(value, path) {
  return particleColorToLinear({
    r: requireParticleNumber(value.r, `${path}.r`),
    g: requireParticleNumber(value.g, `${path}.g`),
    b: requireParticleNumber(value.b, `${path}.b`),
    a: value.a === void 0 ? 1 : requireParticleNumber(value.a, `${path}.a`),
    intensity: value.intensity === void 0 ? 1 : requireParticleNumber(value.intensity, `${path}.intensity`)
  });
}
function lowerParticleGradientColorKey(value, path) {
  if (!isRecord2(value) || typeof value.time !== "number" || !isRecord2(value.color)) {
    throw new Error(`${path} must contain numeric time and color`);
  }
  const color = lowerParticleColor(value.color, `${path}.color`);
  return {
    $type: "GradientColorKey",
    // Color is not a runtime-loader registered class. GradientColorKey copies
    // the color-like argument, so preserve the value shape without introducing
    // an unresolvable `$type` constructor
    $args: [value.time, { r: color.r, g: color.g, b: color.b, a: color.a }]
  };
}
function lowerParticleGradientAlphaKey(value, path) {
  if (!isRecord2(value) || typeof value.time !== "number" || typeof value.alpha !== "number") {
    throw new Error(`${path} must contain numeric time and alpha`);
  }
  return { $type: "GradientAlphaKey", $args: [value.time, value.alpha] };
}
function sanitizeParticleCustomDataModule(value, path, mutationKind) {
  if (!isRecord2(value))
    throw new Error(`${path} must be an object`);
  const { streams, ...rest } = value;
  const props = sanitizeParticleRuntimeValue(rest, path);
  if (Object.prototype.hasOwnProperty.call(value, "streams")) {
    assertMethodOwnedInstanceProp(mutationKind, path, "streams");
  }
  if (streams === void 0 || streams === null)
    return { props, calls: [] };
  if (!Array.isArray(streams))
    throw new Error(`${path}.streams must be an array`);
  const seen = /* @__PURE__ */ new Set();
  return {
    props,
    calls: streams.map((stream, index) => sanitizeParticleCustomDataStream(stream, `${path}.streams[${index}]`, seen))
  };
}
function sanitizeParticleCustomDataStream(value, path, seen) {
  if (!isRecord2(value))
    throw new Error(`${path} must be an object`);
  if (!isValidParticleCustomDataStreamName(value.name)) {
    throw new Error(`${path}.name must contain only letters, digits, or underscores`);
  }
  if (seen.has(value.name))
    throw new Error(`${path}.name "${value.name}" is already in use`);
  seen.add(value.name);
  if (value.mode === "Number") {
    return {
      target: ["generator", "customData"],
      method: "addCurve",
      args: [value.name, lowerParticleCustomDataCompositeArg(value.curve, "ParticleCompositeCurve", `${path}.curve`)]
    };
  }
  if (value.mode === "Color") {
    return {
      target: ["generator", "customData"],
      method: "addGradient",
      args: [
        value.name,
        lowerParticleCustomDataCompositeArg(value.gradient, "ParticleCompositeGradient", `${path}.gradient`)
      ]
    };
  }
  throw new Error(`${path}.mode must be Number or Color`);
}
function lowerParticleCustomDataCompositeArg(value, className, path) {
  if (!isRecord2(value))
    throw new Error(`${path} must be an object`);
  const rule = className === "ParticleCompositeCurve" ? PARTICLE_COMPOSITE_OPTION_RULES[0] : PARTICLE_COMPOSITE_OPTION_RULES[1];
  if (typeof value.mode !== "number") {
    throw new Error(`${path} must be a ${className} composite option with a numeric mode`);
  }
  const detected = findParticleCompositeOptionRule(value);
  if ((value.mode === 2 || value.mode === 3) && detected !== rule) {
    throw new Error(`${path} must use ${className} constructor keys for mode ${value.mode}`);
  }
  return { $type: className, ...sanitizeParticleCompositeOptions(value, path, rule) };
}

// packages/builder/utils/scene-runtime/component.ts
function compileComponent(component, refs, sourceIndex, options = {}, instanceSourceIndex = sourceIndex) {
  const result = {
    type: component.type
  };
  if (component.script) {
    result.script = refs.add(component.script);
  }
  Object.assign(
    result,
    compileComponentMutation(
      component.type,
      component.props,
      component.calls,
      refs,
      sourceIndex,
      `source component ${component.type}.props`,
      options,
      instanceSourceIndex
    )
  );
  return result;
}
function compileComponentMutation(componentType, props, calls, refs, sourceIndex, path, options = {}, instanceSourceIndex = sourceIndex, mutationKind = "component") {
  const result = {};
  const generatedCalls = [];
  const authoredCalls = [];
  const scopedOptions = instanceSourceIndex === sourceIndex ? options : { ...options, instanceSourceIndex };
  if (props) {
    const normalizedProps = normalizeSourceValueRecord(props);
    const { props: loweredProps, calls: loweredCalls } = lowerComponentProps(
      componentType,
      normalizedProps,
      path,
      mutationKind,
      options.componentRuntimeCapabilitySnapshot ?? getBuiltinComponentRuntimeCapabilitySnapshot()
    );
    if (Object.keys(loweredProps).length > 0) {
      result.props = convertRuntimeValue(loweredProps, refs, sourceIndex, "$", scopedOptions);
    }
    generatedCalls.push(...loweredCalls);
  }
  if (Array.isArray(calls))
    authoredCalls.push(...calls);
  if (generatedCalls.length > 0 || authoredCalls.length > 0) {
    const runtimeGeneratedCalls = generatedCalls.length ? convertRuntimeValue(generatedCalls, refs, sourceIndex, "$", scopedOptions) : [];
    const runtimeAuthoredCalls = authoredCalls.length ? convertValue(authoredCalls, refs, sourceIndex, "$", scopedOptions) : [];
    result.calls = [...runtimeGeneratedCalls, ...runtimeAuthoredCalls];
    assertParticleSubEmitterCalls(componentType, result.calls, path);
  }
  return result;
}
var lowerParticleRendererProps = (props, path, mutationKind) => {
  const generator = props.generator;
  const { props: loweredProps, calls } = prepareParticleRendererRuntimeProps(props, path, mutationKind);
  return {
    props: loweredProps,
    calls: [...calls, ...isRecord2(generator) ? lowerParticleGeneratorListCalls(generator, path, mutationKind) : []]
  };
};
var lowerColliderShapeProps = (props, path, mutationKind) => {
  if (!Object.prototype.hasOwnProperty.call(props, "colliderShapes")) {
    return { props, calls: [] };
  }
  assertMethodOwnedInstanceProp(mutationKind, path, "colliderShapes");
  const { colliderShapes, ...rest } = props;
  if (colliderShapes === void 0 || colliderShapes === null) {
    return { props: rest, calls: [] };
  }
  if (!Array.isArray(colliderShapes)) {
    throw new Error(`${path}.colliderShapes must be an array`);
  }
  return {
    props: rest,
    calls: colliderShapes.map((shape, index) => {
      const { shapeId: _editorShapeId, ...runtimeShape } = normalizeColliderShapeStrict(
        shape,
        `${path}.colliderShapes[${index}]`
      );
      return { method: "addShape", args: [runtimeShape] };
    })
  };
};
var lowerButtonTransitionProps = (props, path, mutationKind) => {
  if (Object.prototype.hasOwnProperty.call(props, "transitions")) {
    assertMethodOwnedInstanceProp(mutationKind, path, "transitions");
  }
  return lowerArrayPropToCalls(props, "transitions", "addTransition", path);
};
var COMPONENT_PROP_LOWERERS = {
  ParticleRenderer: [lowerParticleRendererProps],
  TrailRenderer: [lowerTrailRendererProps],
  StaticCollider: [lowerColliderShapeProps],
  DynamicCollider: [lowerColliderShapeProps],
  CharacterController: [lowerColliderShapeProps],
  Button: [lowerButtonTransitionProps],
  PostProcess: [lowerPostProcessEffects]
};
function lowerTrailRendererProps(props, path) {
  return {
    props: {
      ...props,
      ...props.widthCurve === void 0 ? {} : { widthCurve: lowerParticleCurveConstructor(props.widthCurve, `${path}.widthCurve`) },
      ...props.colorGradient === void 0 ? {} : { colorGradient: lowerParticleGradientConstructor(props.colorGradient, `${path}.colorGradient`) }
    },
    calls: []
  };
}
function lowerComponentProps(componentType, props, path, mutationKind, runtimeCapabilitySnapshot) {
  let loweredProps = props;
  const calls = [];
  for (const lowerer of COMPONENT_PROP_LOWERERS[componentType] ?? []) {
    const result = lowerer(loweredProps, path, mutationKind);
    loweredProps = result.props;
    calls.push(...result.calls);
  }
  const setterResult = lowerRuntimeSetterProps(componentType, loweredProps, path, runtimeCapabilitySnapshot);
  loweredProps = setterResult.props;
  calls.push(...setterResult.calls);
  return { props: loweredProps, calls };
}
function lowerArrayPropToCalls(props, propName, method, path) {
  if (!Object.prototype.hasOwnProperty.call(props, propName)) {
    return { props, calls: [] };
  }
  const { [propName]: values, ...rest } = props;
  if (values === void 0 || values === null) {
    return { props: rest, calls: [] };
  }
  if (!Array.isArray(values)) {
    throw new Error(`${path}.${propName} must be an array`);
  }
  return {
    props: rest,
    calls: values.map((value, index) => {
      if (!isRecord2(value)) {
        throw new Error(`${path}.${propName}[${index}] must be an object`);
      }
      return { method, args: [value] };
    })
  };
}
function lowerPostProcessEffects(props, path, mutationKind) {
  if (!Object.prototype.hasOwnProperty.call(props, "effects")) {
    return { props, calls: [] };
  }
  assertMethodOwnedInstanceProp(mutationKind, path, "effects");
  const { effects, ...rest } = props;
  if (effects === void 0 || effects === null) {
    return { props: rest, calls: [] };
  }
  if (!Array.isArray(effects)) {
    throw new Error(`${path}.effects must be an array`);
  }
  return {
    props: rest,
    calls: effects.map((effect, index) => lowerPostProcessEffect(effect, `${path}.effects[${index}]`))
  };
}
function lowerPostProcessEffect(effect, path) {
  if (!isRecord2(effect)) {
    throw new Error(`${path} must be an object`);
  }
  if (typeof effect.$type === "string") {
    if ("class" in effect || "classType" in effect || "props" in effect) {
      throw new Error(`${path} must use canonical PostProcess effect $type shape`);
    }
    const { $type, ...props } = effect;
    return createPostProcessAddEffectCall($type, props);
  }
  throw new Error(`${path} must be a canonical PostProcess effect object with $type`);
}
function createPostProcessAddEffectCall(effectType, props) {
  const call = {
    method: "addEffect",
    args: [{ $class: effectType }]
  };
  if (Object.keys(props).length > 0) {
    call.result = { props };
  }
  return call;
}
function lowerRuntimeSetterProps(componentType, props, path, snapshot) {
  if (componentType !== "Script" && !hasComponentRuntimeCapabilityDeclaration(componentType, snapshot)) {
    const ambiguousProperty = snapshot.setterProperties.find(
      (property) => Object.prototype.hasOwnProperty.call(props, property)
    );
    if (ambiguousProperty) {
      throw new Error(
        `${path}.${ambiguousProperty} requires an explicit runtime capability declaration for component "${componentType}"; headless compilation cannot determine whether the property must be applied through a method`
      );
    }
  }
  const setters = resolveComponentRuntimeCapabilities(componentType, snapshot)?.propertySetters;
  if (!setters)
    return { props, calls: [] };
  const remaining = { ...props };
  const calls = [];
  for (const [property, method] of Object.entries(setters)) {
    if (!Object.prototype.hasOwnProperty.call(remaining, property))
      continue;
    const value = remaining[property];
    delete remaining[property];
    calls.push({ method: resolveRuntimeSetterMethod(method, value), args: [value] });
  }
  return { props: remaining, calls };
}

// packages/builder/utils/scene-runtime/entity.ts
function compileEntity(entity, state) {
  const result = {};
  if (entity.instance) {
    result.instance = compileInstance(entity.instance, state, collectRootInstanceEntityProps(entity));
    return result;
  }
  if (entity.name !== void 0)
    result.name = entity.name;
  if (entity.children !== void 0) {
    result.children = entity.children.map((childId) => {
      if (typeof childId !== "string") {
        throw new Error(`source entity "${entity.id}" contains a non-id child reference`);
      }
      const index = state.sourceIndex.entityIndexById.get(childId);
      if (index === void 0)
        throw new Error(`source entity "${entity.id}".children references missing entity "${childId}"`);
      return index;
    });
  }
  if (entity.position !== void 0)
    result.position = [...entity.position];
  if (entity.rotation !== void 0)
    result.rotation = [...entity.rotation];
  if (entity.scale !== void 0)
    result.scale = [...entity.scale];
  if (entity.components !== void 0) {
    result.components = entity.components.map((componentId) => {
      if (typeof componentId !== "string") {
        throw new Error(`source entity "${entity.id}" contains a non-id component reference`);
      }
      const index = state.sourceIndex.componentIndexById.get(componentId);
      if (index === void 0) {
        throw new Error(`source entity "${entity.id}".components references missing component "${componentId}"`);
      }
      return index;
    });
  }
  if (entity.isActive !== void 0)
    result.isActive = entity.isActive;
  if (entity.layer !== void 0)
    result.layer = entity.layer;
  return result;
}
function collectRootInstanceEntityProps(entity) {
  const props = {};
  if (entity.name !== void 0)
    props.name = entity.name;
  if (entity.isActive !== void 0)
    props.isActive = entity.isActive;
  if (entity.layer !== void 0)
    props.layer = entity.layer;
  if (entity.position !== void 0)
    props.position = [...entity.position];
  if (entity.rotation !== void 0)
    props.rotation = [...entity.rotation];
  if (entity.scale !== void 0)
    props.scale = [...entity.scale];
  return Object.keys(props).length ? props : void 0;
}
function compileInstance(instance, state, rootEntityProps) {
  assertGlTFInstanceRevisionCurrent(instance, state);
  const result = {
    asset: state.refs.add(instance.asset)
  };
  const overrideSourceIndex = instance.overrides ? resolveInstanceOverrideSourceIndex(instance, state) : state.sourceIndex;
  const overrides = instance.overrides ? compileOverrides(instance.overrides, state, overrideSourceIndex) : void 0;
  const mergedOverrides = mergeRootInstanceEntityProps(overrides, rootEntityProps);
  if (mergedOverrides)
    result.overrides = mergedOverrides;
  return result;
}
function assertGlTFInstanceRevisionCurrent(instance, state) {
  if (!sourceInstanceRequiresGlTFContentRevision(instance.overrides))
    return;
  if (state.resolveInstanceAssetKind?.(instance.asset.$ref) !== "glTF")
    return;
  assertGlTFOverrideRevisionCurrent({
    requiresRevision: true,
    authoredRevision: instance.sourceContentRevision,
    currentRevision: state.resolveAssetContentRevision?.(instance.asset.$ref),
    assetId: instance.asset.$ref
  });
}
function resolveInstanceOverrideSourceIndex(instance, state) {
  const index = resolveInstanceAssetSourceIndex(instance.asset.$ref, state);
  if (index)
    return index;
  if (state.resolveInstanceAssetKind?.(instance.asset.$ref) === "glTF") {
    return createGlTFOverrideSourceIndex(instance.overrides);
  }
  throw new Error(`Cannot compile instance overrides for "${instance.asset.$ref}": referenced source file is required`);
}
function createGlTFOverrideSourceIndex(overrides) {
  const root = { id: "root", components: [] };
  const entityIndexById = /* @__PURE__ */ new Map([["root", 0]]);
  const componentIndexById = /* @__PURE__ */ new Map();
  const entityById = /* @__PURE__ */ new Map([["root", root]]);
  const componentById = /* @__PURE__ */ new Map();
  const componentOwnerEntityIdById = /* @__PURE__ */ new Map();
  const entityReferenceTargetById = /* @__PURE__ */ new Map([["root", [0]]]);
  const componentReferenceTargetById = /* @__PURE__ */ new Map();
  const componentOverrideTargetById = /* @__PURE__ */ new Map();
  const entityPathById = /* @__PURE__ */ new Map([["root", []]]);
  const ensureEntity = (sourceEntityId) => {
    const existing = entityById.get(sourceEntityId);
    if (existing)
      return existing;
    const entity = { id: sourceEntityId, components: [] };
    entityIndexById.set(sourceEntityId, entityIndexById.size);
    entityById.set(sourceEntityId, entity);
    const sourceEntityPath = parseGLTFEntityOverrideTarget(sourceEntityId);
    entityPathById.set(sourceEntityId, sourceEntityPath);
    entityReferenceTargetById.set(sourceEntityId, [0, ...sourceEntityPath]);
    return entity;
  };
  const ensureComponent = (sourceComponentId) => {
    const parsed = parseGLTFComponentOverrideTarget(sourceComponentId);
    if (componentOverrideTargetById.has(sourceComponentId))
      return;
    const owner = ensureEntity(parsed.sourceEntityId);
    const ownerComponents = owner.components ??= [];
    const component = { id: sourceComponentId, type: parsed.componentType };
    componentIndexById.set(sourceComponentId, componentIndexById.size);
    componentById.set(sourceComponentId, component);
    componentOwnerEntityIdById.set(sourceComponentId, parsed.sourceEntityId);
    ownerComponents.push(sourceComponentId);
    componentOverrideTargetById.set(sourceComponentId, {
      path: [...parsed.sourceEntityPath],
      selector: { type: parsed.componentType, index: parsed.componentIndex }
    });
    componentReferenceTargetById.set(sourceComponentId, {
      entity: [0, ...parsed.sourceEntityPath],
      type: parsed.componentType,
      index: parsed.componentIndex
    });
  };
  for (const item of overrides?.entityProps ?? [])
    ensureEntity(item.target);
  for (const sourceEntityId of overrides?.removedEntities ?? [])
    ensureEntity(sourceEntityId);
  for (const item of overrides?.addedEntities ?? [])
    ensureEntity(item.parent);
  for (const item of overrides?.addedComponents ?? [])
    ensureEntity(item.owner);
  for (const item of overrides?.componentProps ?? [])
    ensureComponent(item.target);
  for (const sourceComponentId of overrides?.removedComponents ?? [])
    ensureComponent(sourceComponentId);
  return {
    componentTopology: "sparse",
    entityIndexById,
    componentIndexById,
    entityById,
    componentById,
    componentOwnerEntityIdById,
    entityReferenceTargetById,
    componentReferenceTargetById,
    componentOverrideTargetById,
    entityPathById,
    rootEntityIds: ["root"]
  };
}
function mergeRootInstanceEntityProps(overrides, rootEntityProps) {
  if (!rootEntityProps || Object.keys(rootEntityProps).length === 0)
    return overrides;
  const result = overrides ? { ...overrides } : {};
  const rootOverride = { path: [], ...rootEntityProps };
  const entityProps = result.entityProps ? [...result.entityProps] : [];
  const existingRootIndex = entityProps.findIndex((item) => item.path.length === 0);
  if (existingRootIndex >= 0) {
    entityProps[existingRootIndex] = {
      ...rootOverride,
      ...entityProps[existingRootIndex],
      path: []
    };
  } else {
    entityProps.unshift(rootOverride);
  }
  result.entityProps = entityProps;
  return result;
}
function compileOverrides(overrides, state, overrideSourceIndex) {
  const result = {};
  if (overrides.entityProps?.length) {
    result.entityProps = overrides.entityProps.map((item) => compileEntityPropOverride(item, overrideSourceIndex));
  }
  if (overrides.componentProps?.length) {
    result.componentProps = overrides.componentProps.map((item) => {
      const target = lowerSourceComponentOverrideTarget(
        item.target,
        overrideSourceIndex,
        runtimeComponentRefOptions(state.refs)
      );
      return {
        path: target.path,
        selector: target.selector,
        ...compileComponentMutation(
          target.selector.type,
          item.props,
          item.calls,
          state.refs,
          overrideSourceIndex,
          `source instance override ${target.selector.type}.props`,
          state,
          state.sourceIndex,
          "instance-override"
        )
      };
    });
  }
  if (overrides.removedEntities?.length) {
    result.removedEntities = overrides.removedEntities.map((target) => {
      if (typeof target !== "string")
        throw new Error("source removed entity override must be a source entity id");
      return lowerSourceEntityOverridePath(target, overrideSourceIndex);
    });
  }
  if (overrides.removedComponents?.length) {
    result.removedComponents = overrides.removedComponents.map((target) => {
      if (typeof target !== "string")
        throw new Error("source removed component override must be a source component id");
      const lowered = lowerSourceComponentOverrideTarget(
        target,
        overrideSourceIndex,
        runtimeComponentRefOptions(state.refs)
      );
      return { path: lowered.path, selectors: [lowered.selector] };
    });
  }
  if (overrides.addedEntities?.length) {
    result.addedEntities = overrides.addedEntities.map((item) => {
      if (typeof item.parent !== "string")
        throw new Error("source added entity parent must be a source entity id");
      return {
        parent: lowerSourceEntityOverridePath(item.parent, overrideSourceIndex),
        entity: compileInlineEntity(item.id, item.entity, state, overrideSourceIndex, state.sourceIndex)
      };
    });
  }
  if (overrides.addedComponents?.length) {
    result.addedComponents = overrides.addedComponents.map((item) => {
      if (typeof item.owner !== "string")
        throw new Error("source added component owner must be a source entity id");
      return {
        target: overrideSourceIndex.entityPathById.has(item.owner) ? lowerSourceEntityOverridePath(item.owner, overrideSourceIndex) : resolveAddedComponentOwner(overrideSourceIndex, item.owner, state)?.path ?? lowerSourceEntityOverridePath(item.owner, overrideSourceIndex),
        component: compileInlineComponent(item.id, item.component, state, overrideSourceIndex, state.sourceIndex)
      };
    });
  }
  return Object.keys(result).length ? result : void 0;
}
function compileEntityPropOverride(item, sourceIndex) {
  const result = { path: lowerSourceEntityOverridePath(item.target, sourceIndex) };
  if (item.name !== void 0)
    result.name = item.name;
  if (item.isActive !== void 0)
    result.isActive = item.isActive;
  if (item.layer !== void 0)
    result.layer = item.layer;
  if (item.position !== void 0)
    result.position = [...item.position];
  if (item.rotation !== void 0)
    result.rotation = [...item.rotation];
  if (item.scale !== void 0)
    result.scale = [...item.scale];
  return result;
}
function compileInlineEntity(id, entity, state, sourceIndex = state.sourceIndex, instanceSourceIndex = sourceIndex) {
  const index = state.sourceIndex.entityIndexById.get(id);
  const result = {};
  if (entity.instance) {
    result.instance = compileInstance(entity.instance, state, collectRootInstanceEntityProps(entity));
    state.entities[index] = result;
    return index;
  }
  if (entity.name !== void 0)
    result.name = entity.name;
  if (entity.position !== void 0)
    result.position = [...entity.position];
  if (entity.rotation !== void 0)
    result.rotation = [...entity.rotation];
  if (entity.scale !== void 0)
    result.scale = [...entity.scale];
  if (entity.isActive !== void 0)
    result.isActive = entity.isActive;
  if (entity.layer !== void 0)
    result.layer = entity.layer;
  if (entity.components?.length) {
    result.components = entity.components.map(
      (component) => compileInlineComponent(component.id, component, state, sourceIndex, instanceSourceIndex)
    );
  }
  if (entity.children?.length) {
    result.children = entity.children.map(
      (child) => compileInlineEntity(child.id, child, state, sourceIndex, instanceSourceIndex)
    );
  }
  state.entities[index] = result;
  return index;
}
function compileInlineComponent(id, component, state, sourceIndex = state.sourceIndex, instanceSourceIndex = sourceIndex) {
  const index = state.sourceIndex.componentIndexById.get(id);
  state.components[index] = compileComponent(component, state.refs, sourceIndex, state, instanceSourceIndex);
  return index;
}

// packages/builder/utils/scene-runtime/settings.ts
function compileSceneSettings(scene, refs, sourceIndex) {
  const result = {
    rootEntities: scene.rootEntities.map((entityId) => {
      const index = sourceIndex.entityIndexById.get(entityId);
      if (index === void 0)
        throw new Error(`source scene.rootEntities references missing entity "${entityId}"`);
      return index;
    }),
    background: compileBackground(scene.background, refs)
  };
  if (scene.name !== void 0)
    result.name = scene.name;
  const ambient = compileAmbient(scene.ambient, refs);
  if (ambient)
    result.ambient = ambient;
  if (scene.shadow) {
    const shadow = {};
    if (scene.shadow.castShadows !== void 0)
      shadow.castShadows = scene.shadow.castShadows;
    if (scene.shadow.enableTransparentShadow !== void 0) {
      shadow.enableTransparentShadow = scene.shadow.enableTransparentShadow;
    }
    if (scene.shadow.shadowResolution !== void 0)
      shadow.shadowResolution = scene.shadow.shadowResolution;
    if (scene.shadow.shadowDistance !== void 0)
      shadow.shadowDistance = scene.shadow.shadowDistance;
    if (scene.shadow.shadowCascades !== void 0)
      shadow.shadowCascades = scene.shadow.shadowCascades;
    if (scene.shadow.shadowTwoCascadeSplits !== void 0) {
      shadow.shadowTwoCascadeSplits = scene.shadow.shadowTwoCascadeSplits;
    }
    if (scene.shadow.shadowFourCascadeSplits !== void 0) {
      shadow.shadowFourCascadeSplits = requireVector3Tuple(
        scene.shadow.shadowFourCascadeSplits,
        "source scene.shadow.shadowFourCascadeSplits"
      );
    }
    if (scene.shadow.shadowFadeBorder !== void 0)
      shadow.shadowFadeBorder = scene.shadow.shadowFadeBorder;
    if (hasOwnKeys(shadow))
      result.shadow = shadow;
  }
  if (scene.fog) {
    const fog = {};
    if (scene.fog.mode !== void 0)
      fog.fogMode = scene.fog.mode;
    if (scene.fog.color)
      fog.fogColor = colorObjectToTuple(scene.fog.color);
    if (scene.fog.density !== void 0)
      fog.fogDensity = scene.fog.density;
    if (scene.fog.start !== void 0)
      fog.fogStart = scene.fog.start;
    if (scene.fog.end !== void 0)
      fog.fogEnd = scene.fog.end;
    if (hasOwnKeys(fog))
      result.fog = fog;
  }
  if (scene.ambientOcclusion) {
    const ao = {};
    if (scene.ambientOcclusion.enabled !== void 0) {
      ao.enabledAmbientOcclusion = scene.ambientOcclusion.enabled;
    }
    if (scene.ambientOcclusion.quality !== void 0)
      ao.quality = scene.ambientOcclusion.quality;
    if (scene.ambientOcclusion.intensity !== void 0)
      ao.intensity = scene.ambientOcclusion.intensity;
    if (scene.ambientOcclusion.radius !== void 0)
      ao.radius = scene.ambientOcclusion.radius;
    if (scene.ambientOcclusion.bias !== void 0)
      ao.bias = scene.ambientOcclusion.bias;
    if (scene.ambientOcclusion.power !== void 0)
      ao.power = scene.ambientOcclusion.power;
    if (scene.ambientOcclusion.bilateralThreshold !== void 0) {
      ao.bilateralThreshold = scene.ambientOcclusion.bilateralThreshold;
    }
    if (scene.ambientOcclusion.minHorizonAngle !== void 0) {
      ao.minHorizonAngle = scene.ambientOcclusion.minHorizonAngle;
    }
    if (hasOwnKeys(ao))
      result.ambientOcclusion = ao;
  }
  return result;
}
function compileBackground(background, refs) {
  if (!background || typeof background !== "object") {
    throw new Error("source scene.background is required");
  }
  const result = {
    mode: requireNumber(background.mode, "source scene.background.mode"),
    color: requireColorTuple(background.color, "source scene.background.color")
  };
  if (background.texture)
    result.texture = refs.add(background.texture);
  if (background.textureFillMode !== void 0) {
    result.textureFillMode = background.textureFillMode;
  }
  if (background.skyMesh)
    result.skyMesh = refs.add(background.skyMesh);
  if (background.skyMaterial)
    result.skyMaterial = refs.add(background.skyMaterial);
  return result;
}
var RUNTIME_AMBIENT_INPUT_KEYS = [
  "diffuseMode",
  "ambientLight",
  "diffuseSolidColor",
  "diffuseIntensity",
  "specularMode",
  "customAmbientLight",
  "specularIntensity"
];
function compileAmbient(ambient, refs) {
  if (!ambient || !hasDefinedOwnKey(ambient, RUNTIME_AMBIENT_INPUT_KEYS))
    return void 0;
  const specularMode = compileSpecularMode(ambient.specularMode, ambient.customAmbientLight);
  const result = {
    diffuseMode: requireNumber(ambient.diffuseMode, "source scene.ambient.diffuseMode"),
    diffuseIntensity: requireNumber(ambient.diffuseIntensity, "source scene.ambient.diffuseIntensity"),
    specularMode,
    specularIntensity: requireNumber(ambient.specularIntensity, "source scene.ambient.specularIntensity")
  };
  if (ambient.ambientLight)
    result.ambientLight = refs.add(ambient.ambientLight);
  if (ambient.diffuseSolidColor) {
    result.diffuseSolidColor = colorObjectToTuple(ambient.diffuseSolidColor);
  }
  if (ambient.customAmbientLight)
    result.customAmbientLight = refs.add(ambient.customAmbientLight);
  return result;
}
function compileSpecularMode(value, customAmbientLight) {
  const mode = requireNumber(value, "source scene.ambient.specularMode");
  if (mode === 0)
    return 0;
  if (mode === 1)
    return customAmbientLight ? 1 : 0;
  throw new Error("source scene.ambient.specularMode must be 0 (Sky) or 1 (Custom)");
}

// packages/builder/utils/scene-runtime/compile.ts
function compileSourceSceneToRuntime(source, resolveAssetUrl, options = {}) {
  assertSourceV2SceneFileStructure(source);
  const state = createRuntimeBuildState(source, resolveAssetUrl, options);
  const nestedOverrides = prepareNestedOverrides(source, state, resolveAssetUrl, options);
  const scene = compileSceneSettings(source.scene, state.refs, state.sourceIndex);
  compileRuntimeHierarchy(source, state);
  compileNestedOverrides(nestedOverrides, state);
  return { version: "2.0", refs: state.refs.refs, scene, entities: state.entities, components: state.components };
}
function prepareNestedOverrides(source, state, resolveAssetUrl, options) {
  const entries = readNestedOverridesSidecar(source);
  if (!entries.length)
    return [];
  const domain = hydrateSourceV2SceneToDomain(source, {
    resolveAssetKind: options.resolveInstanceAssetKind,
    resolvePrefabSourceFile: options.resolveInstanceSourceFile
  });
  const plans = [];
  const sceneInstanceIds = new Set(source.entities.map((entity) => entity.id));
  for (const candidate of Object.values(domain.prefab.bindings)) {
    const address = getNestedInstanceAddress(domain.prefab, candidate, sceneInstanceIds);
    if (!address)
      continue;
    const resolution = resolveNestedInstanceAddress(domain.prefab, address);
    if (resolution.status !== "resolved")
      continue;
    const { chain } = resolution;
    const binding = chain[chain.length - 1];
    const entry = entries.find(
      (entry2) => entry2.rootSceneEntityId === address.rootSceneEntityId && entry2.sourceEntityPath.length === address.sourceEntityPath.length && entry2.sourceEntityPath.every((id, depth) => id === address.sourceEntityPath[depth])
    );
    if (entry && binding.assetId !== entry.assetId)
      throw new Error(`Cannot compile nested override for "${entry.assetId}"`);
    const sourceFiles = chain.map((item) => {
      const file = resolvePrefabBindingSourceFile(
        domain.prefab,
        item,
        (id) => options.resolveInstanceSourceFile?.(id),
        options.resolveInstanceAssetKind
      );
      if (!file)
        throw new Error(`Nested override source "${item.assetId}" is required`);
      return file;
    });
    const sourceIndexes = sourceFiles.map((file, depth) => {
      const inherited = depth === 0 ? void 0 : sourceFiles[depth - 1].entities.find((entity) => entity.id === address.sourceEntityPath[depth - 1])?.instance?.overrides;
      const raw = options.resolveInstanceSourceFile(chain[depth].assetId);
      return buildSourceIdIndex(runtimeSourceTopology(raw, file, inherited));
    });
    const prefix = address.sourceEntityPath.flatMap(
      (id, depth) => lowerSourceEntityOverridePath(id, sourceIndexes[depth])
    );
    const rootIndex = state.sourceIndex.entityIndexById.get(address.rootSceneEntityId);
    const sourceIndex = sourceIndexes[sourceIndexes.length - 1];
    for (const [sourceId, snapshot] of Object.entries(binding.sourceEntitySnapshots)) {
      const path = [rootIndex, ...prefix, ...lowerSourceEntityOverridePath(sourceId, sourceIndex)];
      if (!state.sourceIndex.entityById.has(snapshot.sceneEntityId)) {
        state.sourceIndex.entityById.set(snapshot.sceneEntityId, sourceIndex.entityById.get(sourceId));
      }
      state.sourceIndex.entityReferenceTargetById.set(snapshot.sceneEntityId, path);
      for (const [componentId, component] of Object.entries(snapshot.components)) {
        const target = lowerSourceComponentRef(
          { $component: componentId },
          sourceIndex,
          runtimeComponentRefOptions(state.refs)
        ).$component;
        state.sourceIndex.componentById.set(component.sceneComponentId, sourceIndex.componentById.get(componentId));
        state.sourceIndex.componentReferenceTargetById.set(component.sceneComponentId, {
          ...target,
          entity: [rootIndex, ...prefix, ...target.entity.slice(1)]
        });
      }
    }
    if (!entry)
      continue;
    const overrides = prefabBindingToV2Overrides(domain, binding, (id) => id, {}, options.resolveAssetContentRevision);
    if (!overrides)
      continue;
    plans.push({
      rootSceneEntityId: entry.rootSceneEntityId,
      prefix,
      instanceEntity: { id: binding.instanceRootEntityId, instance: { asset: { $ref: binding.assetId }, overrides } },
      overrides,
      sourceIndex: sourceIndexes[sourceIndexes.length - 1]
    });
  }
  const referencedComponents = collectComponentReferences(source);
  for (const plan of plans)
    collectComponentReferences(plan.overrides, referencedComponents);
  for (const plan of plans) {
    const rootIndex = state.sourceIndex.entityIndexById.get(plan.rootSceneEntityId);
    if (rootIndex === void 0)
      throw new Error(`Cannot locate runtime root "${plan.rootSceneEntityId}"`);
    allocateInstanceAdditions(
      plan.instanceEntity,
      [rootIndex, ...plan.prefix],
      state,
      resolveAssetUrl,
      referencedComponents,
      plan.sourceIndex
    );
  }
  return plans;
}
function runtimeSourceTopology(raw, effective, inherited) {
  const childrenByParent = new Map(raw.entities.map((entity) => [entity.id, [...entity.children ?? []]]));
  const indexInlineChildren = (id, entity) => {
    childrenByParent.set(
      id,
      (entity.children ?? []).map((child) => child.id)
    );
    for (const child of entity.children ?? [])
      indexInlineChildren(child.id, child);
  };
  for (const added of inherited?.addedEntities ?? [])
    indexInlineChildren(added.id, added.entity);
  for (const added of inherited?.addedEntities ?? []) {
    const children = childrenByParent.get(added.parent) ?? [];
    children.push(added.id);
    childrenByParent.set(added.parent, children);
  }
  return {
    ...effective,
    entities: effective.entities.map((entity) => {
      const order = childrenByParent.get(entity.id);
      return order && entity.children ? { ...entity, children: order.filter((id) => entity.children.includes(id)) } : entity;
    })
  };
}
function compileNestedOverrides(plans, state) {
  for (const { rootSceneEntityId, prefix, overrides, sourceIndex } of plans) {
    const lowered = compileOverrides(overrides, state, sourceIndex);
    if (!lowered)
      continue;
    const rootIndex = state.sourceIndex.entityIndexById.get(rootSceneEntityId);
    const instance = rootIndex === void 0 ? void 0 : state.entities[rootIndex].instance;
    if (!instance)
      throw new Error(`Cannot locate runtime root "${rootSceneEntityId}"`);
    const target = instance.overrides ??= {};
    for (const item of lowered.entityProps ?? [])
      (target.entityProps ??= []).push({ ...item, path: [...prefix, ...item.path] });
    for (const item of lowered.componentProps ?? [])
      (target.componentProps ??= []).push({ ...item, path: [...prefix, ...item.path] });
    for (const path of lowered.removedEntities ?? [])
      (target.removedEntities ??= []).push([...prefix, ...path]);
    for (const item of lowered.removedComponents ?? [])
      (target.removedComponents ??= []).push({ ...item, path: [...prefix, ...item.path] });
    for (const item of lowered.addedEntities ?? [])
      (target.addedEntities ??= []).push({ ...item, parent: [...prefix, ...item.parent] });
    for (const item of lowered.addedComponents ?? [])
      (target.addedComponents ??= []).push({ ...item, target: [...prefix, ...item.target] });
  }
}
function compileRuntimeHierarchy(source, state) {
  for (let i = 0, n = source.entities.length; i < n; i++) {
    state.entities[i] = compileEntity(source.entities[i], state);
  }
  for (let i = 0, n = source.components.length; i < n; i++) {
    state.components[i] = compileComponent(source.components[i], state.refs, state.sourceIndex, state);
  }
}

// packages/builder/utils/compile-source-prefab-to-runtime.ts
function compileSourcePrefabToRuntime(source, resolveAssetUrl, options = {}) {
  assertSourceV2PrefabFileStructure(source);
  const state = createRuntimeBuildState(source, resolveAssetUrl, options);
  compileRuntimeHierarchy(source, state);
  return {
    version: "2.0",
    refs: state.refs.refs,
    root: state.sourceIndex.entityIndexById.get(source.root),
    entities: state.entities,
    components: state.components
  };
}

// packages/model/src/domain/jsonPointer.ts
function encodeJsonPointerSegment(segment) {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
function decodeJsonPointerSegment(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}
function getRootAssetId(path) {
  if (!path.startsWith("/assets/"))
    return null;
  const rest = path.slice("/assets/".length);
  if (!rest || rest.includes("/"))
    return null;
  return decodeJsonPointerSegment(rest);
}
function getAssetIdOfPath(path) {
  if (!path.startsWith("/assets/"))
    return null;
  const segment = path.slice("/assets/".length).split("/", 1)[0];
  return segment ? decodeJsonPointerSegment(segment) : null;
}

// packages/model/src/domain/normalizedDomainState.ts
function normalizeDomainState(state) {
  const entities = {};
  const components = {};
  const relations = {
    entityChildren: {},
    entityComponents: {},
    componentOwner: {}
  };
  for (const [entityId, entity] of Object.entries(state.entities)) {
    const { children, components: nestedComponents, ...entityFacts } = entity;
    entities[entityId] = {
      ...entityFacts
    };
    relations.entityChildren[entityId] = [...children];
    const componentIds = Object.keys(nestedComponents);
    relations.entityComponents[entityId] = componentIds;
    for (const componentId of componentIds) {
      const component = nestedComponents[componentId];
      components[componentId] = {
        id: componentId,
        entityId,
        ...component,
        props: { ...component.props },
        ...component.instance ? { instance: { ...component.instance } } : {}
      };
      relations.componentOwner[componentId] = entityId;
    }
  }
  return {
    version: state.version,
    scene: structuredClone(state.scene),
    entities,
    components,
    assets: structuredClone(state.assets),
    prefab: structuredClone(state.prefab),
    relations
  };
}

// packages/model/src/domain/commands/types.ts
var CommandError = class extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "CommandError";
  }
};

// packages/model/src/domain/transformHierarchy.ts
import { Matrix as Matrix2, Quaternion as Quaternion2, Vector3 as Vector32 } from "@galacean/engine-math";
var DEG_TO_RAD = Math.PI / 180;
var RAD_TO_DEG = 180 / Math.PI;
var EPSILON = 1e-10;
function cleanNumber(value) {
  if (Math.abs(value) < EPSILON)
    return 0;
  return value;
}
function toVector3(value) {
  return new Vector32(value.x, value.y, value.z);
}
function toPlainVector3(value) {
  return {
    x: cleanNumber(value.x),
    y: cleanNumber(value.y),
    z: cleanNumber(value.z)
  };
}
function rotationToQuaternion(rotation) {
  const quaternion = new Quaternion2();
  Quaternion2.rotationEuler(rotation.x * DEG_TO_RAD, rotation.y * DEG_TO_RAD, rotation.z * DEG_TO_RAD, quaternion);
  return quaternion;
}
function quaternionToRotation(quaternion) {
  const euler = new Vector32();
  quaternion.toEuler(euler);
  return {
    x: cleanNumber(euler.x * RAD_TO_DEG),
    y: cleanNumber(euler.y * RAD_TO_DEG),
    z: cleanNumber(euler.z * RAD_TO_DEG)
  };
}
function vec3Close(a, b) {
  return Math.abs(a.x - b.x) < 1e-8 && Math.abs(a.y - b.y) < 1e-8 && Math.abs(a.z - b.z) < 1e-8;
}
function transformsClose(a, b) {
  return vec3Close(a.position, b.position) && vec3Close(a.rotation, b.rotation) && vec3Close(a.scale, b.scale);
}
function transformToMatrix(transform) {
  const matrix = new Matrix2();
  Matrix2.affineTransformation(
    toVector3(transform.scale),
    rotationToQuaternion(transform.rotation),
    toVector3(transform.position),
    matrix
  );
  return matrix;
}
function matrixToTransform(matrix) {
  const position = new Vector32();
  const rotation = new Quaternion2();
  const scale = new Vector32();
  matrix.decompose(position, rotation, scale);
  return {
    position: toPlainVector3(position),
    rotation: quaternionToRotation(rotation),
    scale: toPlainVector3(scale)
  };
}
function getEntityWorldMatrix(hierarchy, entityId, visiting = /* @__PURE__ */ new Set()) {
  const entity = hierarchy.getNode(entityId);
  if (!entity)
    return null;
  if (visiting.has(entityId))
    return null;
  visiting.add(entityId);
  const localMatrix = transformToMatrix(entity.transform);
  if (!entity.parentId)
    return localMatrix;
  const parentWorldMatrix = getEntityWorldMatrix(hierarchy, entity.parentId, visiting);
  if (!parentWorldMatrix)
    return null;
  const worldMatrix = new Matrix2();
  Matrix2.multiply(parentWorldMatrix, localMatrix, worldMatrix);
  return worldMatrix;
}
function getLocalTransformPreservingWorldInHierarchy(hierarchy, entityId, newParentId) {
  const worldMatrix = getEntityWorldMatrix(hierarchy, entityId);
  if (!worldMatrix)
    return null;
  if (!newParentId) {
    return matrixToTransform(worldMatrix);
  }
  const parentWorldMatrix = getEntityWorldMatrix(hierarchy, newParentId);
  if (!parentWorldMatrix)
    return null;
  const parentWorldInverse = new Matrix2();
  if (Math.abs(parentWorldMatrix.determinant()) < EPSILON)
    return null;
  Matrix2.invert(parentWorldMatrix, parentWorldInverse);
  const localMatrix = new Matrix2();
  Matrix2.multiply(parentWorldInverse, worldMatrix, localMatrix);
  return matrixToTransform(localMatrix);
}
function stateHierarchy(state) {
  return {
    getNode: (id) => {
      const entity = state.entities[id];
      return entity ? { transform: entity.transform, parentId: entity.parentId } : void 0;
    }
  };
}
function getLocalTransformPreservingWorld(state, entityId, newParentId) {
  return getLocalTransformPreservingWorldInHierarchy(stateHierarchy(state), entityId, newParentId);
}

// packages/model/src/domain/commands/EntityCommands.ts
function wouldCreateCycle(state, entityId, newParentId) {
  let current = newParentId;
  while (current) {
    if (current === entityId)
      return true;
    current = state.entities[current]?.parentId ?? null;
  }
  return false;
}
function collectSubtree(state, entityId) {
  const result = [entityId];
  const entity = state.entities[entityId];
  if (entity) {
    for (const childId of entity.children) {
      result.push(...collectSubtree(state, childId));
    }
  }
  return result;
}
function getSiblingsInfo(state, parentId) {
  if (parentId) {
    return {
      siblings: state.entities[parentId].children,
      arrayPath: `/entities/${encodeJsonPointerSegment(parentId)}/children`
    };
  }
  return { siblings: state.scene.rootEntityIds, arrayPath: `/scene/rootEntityIds` };
}
function addTransformChange(transform, field, axis, value) {
  const nextField = transform[field] ?? {};
  nextField[axis] = value;
  transform[field] = nextField;
}
var UpdateEntityCommand = class {
  name = "entity.update";
  execute(state, input) {
    const { entityId, props } = input;
    const encodedEntityId = encodeJsonPointerSegment(entityId);
    const entity = state.entities[entityId];
    if (!entity) {
      throw new CommandError("ENTITY_NOT_FOUND" /* ENTITY_NOT_FOUND */, `Entity "${entityId}" not found`);
    }
    const ops = [];
    const changes = {};
    if (props.name !== void 0 && props.name !== entity.name) {
      ops.push({ op: "replace", path: `/entities/${encodedEntityId}/name`, value: props.name });
      changes.name = props.name;
    }
    if (props.isActive !== void 0 && props.isActive !== entity.isActive) {
      ops.push({ op: "replace", path: `/entities/${encodedEntityId}/isActive`, value: props.isActive });
      changes.isActive = props.isActive;
    }
    if (props.transform) {
      const t = props.transform;
      for (const field of ["position", "rotation", "scale"]) {
        const partial = t[field];
        if (!partial)
          continue;
        const current = entity.transform[field];
        for (const axis of ["x", "y", "z"]) {
          if (partial[axis] !== void 0 && partial[axis] !== current[axis]) {
            ops.push({
              op: "replace",
              path: `/entities/${encodedEntityId}/transform/${field}/${axis}`,
              value: partial[axis]
            });
            const transform = changes.transform ??= {};
            addTransformChange(transform, field, axis, partial[axis]);
          }
        }
      }
    }
    if (props.layer !== void 0 && props.layer !== entity.layer) {
      ops.push({
        op: entity.layer === void 0 ? "add" : "replace",
        path: `/entities/${encodedEntityId}/layer`,
        value: props.layer
      });
      changes.layer = props.layer;
    }
    if (props.isLocked !== void 0 && props.isLocked !== entity.isLocked) {
      ops.push({
        op: entity.isLocked === void 0 ? "add" : "replace",
        path: `/entities/${encodedEntityId}/isLocked`,
        value: props.isLocked
      });
      changes.isLocked = props.isLocked;
    }
    if (props.isClone !== void 0 && props.isClone !== entity.isClone) {
      ops.push({
        op: entity.isClone === void 0 ? "add" : "replace",
        path: `/entities/${encodedEntityId}/isClone`,
        value: props.isClone
      });
      changes.isClone = props.isClone;
    }
    if (props.instance !== void 0) {
      if (props.instance === null && entity.instance !== void 0) {
        ops.push({ op: "remove", path: `/entities/${encodedEntityId}/instance` });
        changes.instance = null;
      } else if (props.instance !== null) {
        ops.push({
          op: entity.instance === void 0 ? "add" : "replace",
          path: `/entities/${encodedEntityId}/instance`,
          value: props.instance
        });
        changes.instance = cloneState(props.instance);
      }
    }
    return {
      operations: ops,
      result: void 0,
      events: ops.length > 0 ? [
        {
          type: "EntityUpdated",
          entityId,
          changes
        }
      ] : []
    };
  }
};
var DeleteEntityCommand = class {
  name = "entity.delete";
  execute(state, input) {
    const { entityId } = input;
    const entity = state.entities[entityId];
    if (!entity) {
      throw new CommandError("ENTITY_NOT_FOUND" /* ENTITY_NOT_FOUND */, `Entity "${entityId}" not found`);
    }
    const subtreeIds = collectSubtree(state, entityId);
    const ops = [];
    const subtreeSnapshots = Object.fromEntries(subtreeIds.map((id) => [id, cloneState(state.entities[id])]));
    const removedBindingIds = /* @__PURE__ */ new Set();
    const retainedNestedOverrides = state.prefab.unresolvedNestedOverrides;
    if (retainedNestedOverrides?.some((entry) => subtreeIds.includes(entry.rootSceneEntityId))) {
      ops.push({
        op: "replace",
        path: "/prefab/unresolvedNestedOverrides",
        value: retainedNestedOverrides.filter((entry) => !subtreeIds.includes(entry.rootSceneEntityId))
      });
    }
    for (const id of subtreeIds) {
      const instance = state.entities[id]?.instance;
      if (!instance?.bindingId)
        continue;
      if (instance.role !== "root")
        continue;
      if (!state.prefab.bindings[instance.bindingId])
        continue;
      removedBindingIds.add(instance.bindingId);
    }
    if (removedBindingIds.size > 0) {
      for (const bindingId of removedBindingIds) {
        ops.push({
          op: "remove",
          path: `/prefab/bindings/${encodeJsonPointerSegment(bindingId)}`
        });
      }
      for (const [assetId, bindingIds] of Object.entries(state.prefab.byAssetId)) {
        const remaining = bindingIds.filter((id) => !removedBindingIds.has(id));
        if (remaining.length === bindingIds.length)
          continue;
        const encodedAssetId = encodeJsonPointerSegment(assetId);
        if (remaining.length === 0) {
          ops.push({ op: "remove", path: `/prefab/byAssetId/${encodedAssetId}` });
        } else {
          ops.push({ op: "replace", path: `/prefab/byAssetId/${encodedAssetId}`, value: remaining });
        }
      }
    }
    const removedAddedOverridePaths = /* @__PURE__ */ new Set();
    for (const id of subtreeIds) {
      const encodedId = encodeJsonPointerSegment(id);
      for (const [bindingId, binding] of Object.entries(state.prefab.bindings)) {
        if (removedBindingIds.has(bindingId))
          continue;
        if (!binding.overrides.addedEntities[id])
          continue;
        const path = `/prefab/bindings/${encodeJsonPointerSegment(bindingId)}/overrides/addedEntities/${encodedId}`;
        if (removedAddedOverridePaths.has(path))
          continue;
        removedAddedOverridePaths.add(path);
        ops.push({ op: "remove", path });
      }
    }
    const { siblings, arrayPath } = getSiblingsInfo(state, entity.parentId);
    const index = siblings.indexOf(entityId);
    if (index >= 0) {
      ops.push({ op: "remove", path: `${arrayPath}/${index}` });
    }
    for (const id of [...subtreeIds].reverse()) {
      ops.push({ op: "remove", path: `/entities/${encodeJsonPointerSegment(id)}` });
    }
    return {
      operations: ops,
      result: void 0,
      events: [
        {
          type: "EntityDeleted",
          entityId,
          snapshot: subtreeSnapshots[entityId],
          subtreeIds: cloneState(subtreeIds),
          subtree: subtreeSnapshots
        }
      ]
    };
  }
};

// packages/model/src/domain/commands/prefab/helpers.ts
function cloneTransform(transform) {
  return {
    position: { ...transform.position },
    rotation: { ...transform.rotation },
    scale: { ...transform.scale }
  };
}
function findBindingByEntityId(state, entityId) {
  const entity = state.entities[entityId];
  if (!entity) {
    throw new CommandError("ENTITY_NOT_FOUND" /* ENTITY_NOT_FOUND */, `ENTITY_NOT_FOUND: entity "${entityId}" not found`);
  }
  if (!entity.instance) {
    throw new CommandError(
      "BINDING_NOT_FOUND" /* BINDING_NOT_FOUND */,
      `BINDING_NOT_FOUND: entity "${entityId}" has no instance link`
    );
  }
  const binding = state.prefab.bindings[entity.instance.bindingId];
  if (!binding) {
    throw new CommandError(
      "BINDING_NOT_FOUND" /* BINDING_NOT_FOUND */,
      `BINDING_NOT_FOUND: binding "${entity.instance.bindingId}" not found`
    );
  }
  return { entity, binding };
}
function isNestedInstanceSubtreeEntity(state, entity, targetBindingId, subtreeIds, exemptBindingId) {
  const instance = entity?.instance;
  if (!instance || instance.bindingId === targetBindingId || instance.bindingId === exemptBindingId)
    return false;
  const nestedBinding = state.prefab.bindings[instance.bindingId];
  return Boolean(nestedBinding && subtreeIds.has(nestedBinding.instanceRootEntityId));
}
function buildAddedInstanceLinkOps(state, subtreeIds, binding, unlinkedBindingId) {
  const ops = [];
  const subtreeIdSet = new Set(subtreeIds);
  const instanceLink = {
    bindingId: binding.id,
    assetId: binding.assetId,
    assetKind: binding.assetKind,
    role: "added"
  };
  for (const subtreeEntityId of subtreeIds) {
    const subtreeEntity = state.entities[subtreeEntityId];
    if (!subtreeEntity)
      continue;
    if (isNestedInstanceSubtreeEntity(state, subtreeEntity, binding.id, subtreeIdSet, unlinkedBindingId))
      continue;
    const encodedSubtreeEntityId = encodeJsonPointerSegment(subtreeEntityId);
    ops.push({
      op: "add",
      path: `/entities/${encodedSubtreeEntityId}/instance`,
      value: instanceLink
    });
    for (const componentId of Object.keys(subtreeEntity.components)) {
      const encodedComponentId = encodeJsonPointerSegment(componentId);
      ops.push({
        op: "add",
        path: `/entities/${encodedSubtreeEntityId}/components/${encodedComponentId}/instance`,
        value: { bindingId: binding.id, role: "added" }
      });
    }
  }
  return ops;
}

// packages/model/src/domain/commands/prefab/RevertCommand.ts
function toComponentStateSnapshot(component) {
  if (!component)
    return void 0;
  const { id: _id, entityId: _entityId, ...componentState } = component;
  return componentState;
}
function removeNestedOverrideContainerIfEmpty(ops, binding, bindingId, overrideKey, sourceEntityId) {
  if (Object.keys(binding.overrides[overrideKey]?.[sourceEntityId] ?? {}).length !== 1)
    return;
  ops.push({
    op: "remove",
    path: `/prefab/bindings/${encodeJsonPointerSegment(bindingId)}/overrides/${overrideKey}/${encodeJsonPointerSegment(
      sourceEntityId
    )}`
  });
}
function pushEntityOverrideEntryOps(ops, overridePath, placement) {
  if (placement) {
    ops.push({ op: "replace", path: overridePath, value: placement });
  } else {
    ops.push({ op: "remove", path: overridePath });
  }
}
var RevertOverrideCommand = class {
  name = "prefab.revertOverride";
  execute(state, input) {
    const { bindingId, type } = input;
    const binding = state.prefab.bindings[bindingId];
    if (!binding) {
      throw new CommandError("BINDING_NOT_FOUND" /* BINDING_NOT_FOUND */, `BINDING_NOT_FOUND: binding "${bindingId}" not found`);
    }
    const ops = [];
    const events = [];
    const encodedBindingId = encodeJsonPointerSegment(bindingId);
    const sourceSnapshots = binding.sourceEntitySnapshots ?? {};
    const normalized = normalizeDomainState(state);
    switch (type) {
      case "entityProps": {
        const sourceEntityId = input.sourceEntityId;
        const encodedSourceId = encodeJsonPointerSegment(sourceEntityId);
        const snapshot = sourceSnapshots[sourceEntityId];
        const sceneEntityId = getSceneEntityIdForPrefabSource(binding, sourceEntityId);
        const { placement, modification } = splitEntityOverrideProps(
          binding.overrides.entityProps[sourceEntityId],
          sourceEntityId === binding.sourceRootEntityId
        );
        if (!modification)
          break;
        if (snapshot && sceneEntityId) {
          const encodedSceneEntityId = encodeJsonPointerSegment(sceneEntityId);
          const changes = {};
          if (modification.name !== void 0) {
            ops.push({
              op: "replace",
              path: `/entities/${encodedSceneEntityId}/name`,
              value: snapshot.name
            });
            changes.name = snapshot.name;
          }
          if (modification.isActive !== void 0) {
            ops.push({
              op: "replace",
              path: `/entities/${encodedSceneEntityId}/isActive`,
              value: snapshot.isActive
            });
            changes.isActive = snapshot.isActive;
          }
          if (modification.layer !== void 0) {
            if (snapshot.layer !== void 0) {
              ops.push({
                op: "replace",
                path: `/entities/${encodedSceneEntityId}/layer`,
                value: snapshot.layer
              });
              changes.layer = snapshot.layer;
            } else if (state.entities[sceneEntityId]?.layer !== void 0) {
              ops.push({
                op: "remove",
                path: `/entities/${encodedSceneEntityId}/layer`
              });
            }
          }
          if (modification.transform?.position) {
            ops.push({
              op: "replace",
              path: `/entities/${encodedSceneEntityId}/transform/position`,
              value: cloneState(snapshot.transform.position)
            });
            (changes.transform ??= {}).position = cloneState(snapshot.transform.position);
          }
          if (modification.transform?.rotation) {
            ops.push({
              op: "replace",
              path: `/entities/${encodedSceneEntityId}/transform/rotation`,
              value: cloneState(snapshot.transform.rotation)
            });
            (changes.transform ??= {}).rotation = cloneState(snapshot.transform.rotation);
          }
          if (modification.transform?.scale) {
            ops.push({
              op: "replace",
              path: `/entities/${encodedSceneEntityId}/transform/scale`,
              value: cloneState(snapshot.transform.scale)
            });
            (changes.transform ??= {}).scale = cloneState(snapshot.transform.scale);
          }
          if (Object.keys(changes).length > 0) {
            events.push({
              type: "EntityUpdated",
              entityId: sceneEntityId ?? void 0,
              changes
            });
          }
        }
        pushEntityOverrideEntryOps(
          ops,
          `/prefab/bindings/${encodedBindingId}/overrides/entityProps/${encodedSourceId}`,
          placement
        );
        events.push({
          type: "PrefabOverrideChanged",
          action: "revert",
          bindingId,
          assetId: binding.assetId,
          bucket: "entityProps",
          entityId: sceneEntityId ?? void 0,
          sourceEntityId
        });
        break;
      }
      case "addedEntities": {
        const entityId = input.entityId;
        const toRemove = [];
        const collectSubtree2 = (currentEntityId) => {
          toRemove.push(currentEntityId);
          const currentEntity = state.entities[currentEntityId];
          if (!currentEntity)
            return;
          for (const childId of currentEntity.children) {
            collectSubtree2(childId);
          }
        };
        collectSubtree2(entityId);
        const entity = state.entities[entityId];
        const subtreeSnapshots = Object.fromEntries(
          toRemove.map((currentEntityId) => [currentEntityId, cloneState(state.entities[currentEntityId])])
        );
        if (entity?.parentId) {
          const parent = state.entities[entity.parentId];
          const childIndex = parent?.children.indexOf(entityId) ?? -1;
          if (childIndex >= 0) {
            ops.push({
              op: "remove",
              path: `/entities/${encodeJsonPointerSegment(entity.parentId)}/children/${childIndex}`
            });
          }
        }
        for (const currentEntityId of toRemove) {
          const encodedEntityId = encodeJsonPointerSegment(currentEntityId);
          ops.push({ op: "remove", path: `/entities/${encodedEntityId}` });
          if (binding.overrides.addedEntities[currentEntityId]) {
            ops.push({
              op: "remove",
              path: `/prefab/bindings/${encodedBindingId}/overrides/addedEntities/${encodedEntityId}`
            });
          }
        }
        if (subtreeSnapshots[entityId]) {
          events.push({
            type: "EntityDeleted",
            entityId,
            snapshot: subtreeSnapshots[entityId],
            subtreeIds: cloneState(toRemove),
            subtree: subtreeSnapshots
          });
        }
        const addedOverride = binding.overrides.addedEntities[entityId];
        events.push({
          type: "PrefabOverrideChanged",
          action: "revert",
          bindingId,
          assetId: binding.assetId,
          bucket: "addedEntities",
          entityId,
          sourceEntityId: addedOverride?.parentSourceEntityId
        });
        break;
      }
      case "removedEntities": {
        const sourceEntityId = input.sourceEntityId;
        const rootSnapshot = sourceSnapshots[sourceEntityId];
        if (!rootSnapshot) {
          ops.push({
            op: "remove",
            path: `/prefab/bindings/${encodedBindingId}/overrides/removedEntities/${encodeJsonPointerSegment(
              sourceEntityId
            )}`
          });
          break;
        }
        const sourceEntityIdsToRestore = [];
        const collectRemovedSourceSubtree = (currentSourceEntityId) => {
          sourceEntityIdsToRestore.push(currentSourceEntityId);
          for (const childSourceEntityId of sourceSnapshots[currentSourceEntityId]?.childSourceEntityIds ?? []) {
            if (binding.overrides.removedEntities[childSourceEntityId] || sourceSnapshots[childSourceEntityId]?.parentSourceEntityId === currentSourceEntityId) {
              collectRemovedSourceSubtree(childSourceEntityId);
            }
          }
        };
        collectRemovedSourceSubtree(sourceEntityId);
        const rootParentSourceEntityId = rootSnapshot.parentSourceEntityId;
        if (rootParentSourceEntityId) {
          const parentSceneEntityId = getSceneEntityIdForPrefabSource(binding, rootParentSourceEntityId);
          if (parentSceneEntityId) {
            const parent = state.entities[parentSceneEntityId];
            const insertIndex = Math.min(rootSnapshot.childIndex, parent?.children.length ?? 0);
            ops.push({
              op: "add",
              path: `/entities/${encodeJsonPointerSegment(parentSceneEntityId)}/children/${insertIndex}`,
              value: rootSnapshot.sceneEntityId
            });
          }
        } else {
          const insertIndex = Math.min(rootSnapshot.childIndex, state.scene.rootEntityIds.length);
          ops.push({
            op: "add",
            path: `/scene/rootEntityIds/${insertIndex}`,
            value: rootSnapshot.sceneEntityId
          });
        }
        for (const currentSourceEntityId of sourceEntityIdsToRestore) {
          const snapshot = sourceSnapshots[currentSourceEntityId];
          if (!snapshot)
            continue;
          const sceneEntityId = snapshot.sceneEntityId;
          const sceneParentId = snapshot.parentSourceEntityId ? sourceSnapshots[snapshot.parentSourceEntityId]?.sceneEntityId ?? null : null;
          const children = snapshot.childSourceEntityIds.map((childSourceEntityId) => sourceSnapshots[childSourceEntityId]?.sceneEntityId).filter((childSceneEntityId) => Boolean(childSceneEntityId));
          const components = Object.fromEntries(
            Object.entries(snapshot.components).map(([sourceComponentKey, componentSnapshot]) => {
              const componentState = componentStateFromSnapshot(
                componentSnapshot,
                { bindingId, role: "linked", sourceComponentKey },
                cloneState(componentSnapshot.props ?? {}),
                cloneState(componentSnapshot.calls)
              );
              return [componentSnapshot.sceneComponentId, componentState];
            })
          );
          const entityState = {
            id: sceneEntityId,
            name: snapshot.name,
            isActive: snapshot.isActive,
            parentId: sceneParentId,
            children,
            transform: cloneTransform(snapshot.transform),
            components,
            ...snapshot.layer !== void 0 ? { layer: snapshot.layer } : {},
            instance: {
              bindingId,
              assetId: binding.assetId,
              assetKind: binding.assetKind,
              role: currentSourceEntityId === binding.sourceRootEntityId ? "root" : "linked",
              sourceEntityId: currentSourceEntityId
            }
          };
          ops.push({
            op: "add",
            path: `/entities/${encodeJsonPointerSegment(sceneEntityId)}`,
            value: entityState
          });
          events.push({
            type: "EntityCreated",
            entityId: sceneEntityId ?? void 0,
            parentId: sceneParentId,
            index: snapshot.childIndex,
            entity: cloneState(entityState)
          });
          ops.push({
            op: "add",
            path: `/prefab/bindings/${encodedBindingId}/sourceToSceneEntity/${encodeJsonPointerSegment(
              currentSourceEntityId
            )}`,
            value: sceneEntityId
          });
          if (binding.overrides.removedEntities[currentSourceEntityId]) {
            ops.push({
              op: "remove",
              path: `/prefab/bindings/${encodedBindingId}/overrides/removedEntities/${encodeJsonPointerSegment(
                currentSourceEntityId
              )}`
            });
          }
        }
        events.push({
          type: "PrefabOverrideChanged",
          action: "revert",
          bindingId,
          assetId: binding.assetId,
          bucket: "removedEntities",
          entityId: rootSnapshot.sceneEntityId,
          sourceEntityId
        });
        break;
      }
      case "componentProps": {
        const sourceEntityId = input.sourceEntityId;
        const componentId = input.componentId;
        const encodedSourceId = encodeJsonPointerSegment(sourceEntityId);
        const encodedComponentId = encodeJsonPointerSegment(componentId);
        const entityOverrides = binding.overrides.componentProps[sourceEntityId];
        const componentOverrideEntry = entityOverrides?.[componentId];
        if (!componentOverrideEntry)
          break;
        const componentOverride = componentOverrideEntry.props;
        const componentCalls = componentOverrideEntry.calls;
        const snapshot = sourceSnapshots[sourceEntityId]?.components[componentId];
        const sceneEntityId = getSceneEntityIdForPrefabSource(binding, sourceEntityId);
        const sceneComponentId = snapshot?.sceneComponentId;
        const componentState = sceneEntityId && sceneComponentId ? getNormalizedComponent(normalized, sceneEntityId, sceneComponentId) : void 0;
        if (sceneEntityId && sceneComponentId && componentState && snapshot) {
          const encodedSceneEntityId = encodeJsonPointerSegment(sceneEntityId);
          const encodedSceneComponentId = encodeJsonPointerSegment(sceneComponentId);
          const changes = {};
          for (const propName of Object.keys(componentOverride ?? {})) {
            const encodedPropName = encodeJsonPointerSegment(propName);
            if (propName in snapshot.props) {
              ops.push({
                op: "replace",
                path: `/entities/${encodedSceneEntityId}/components/${encodedSceneComponentId}/props/${encodedPropName}`,
                value: cloneState(snapshot.props[propName])
              });
              changes[propName] = cloneState(snapshot.props[propName]);
            } else if (propName in componentState.props) {
              ops.push({
                op: "remove",
                path: `/entities/${encodedSceneEntityId}/components/${encodedSceneComponentId}/props/${encodedPropName}`
              });
            }
          }
          if (Object.keys(changes).length > 0) {
            events.push({
              type: "ComponentUpdated",
              entityId: sceneEntityId ?? void 0,
              componentId: sceneComponentId,
              changes
            });
          }
          if (componentCalls?.length) {
            const callsPath = `/entities/${encodedSceneEntityId}/components/${encodedSceneComponentId}/calls`;
            if (snapshot.calls?.length) {
              ops.push({
                op: componentState.calls ? "replace" : "add",
                path: callsPath,
                value: cloneState(snapshot.calls)
              });
            } else if (componentState.calls) {
              ops.push({ op: "remove", path: callsPath });
            }
          }
        }
        ops.push({
          op: "remove",
          path: `/prefab/bindings/${encodedBindingId}/overrides/componentProps/${encodedSourceId}/${encodedComponentId}`
        });
        removeNestedOverrideContainerIfEmpty(ops, binding, bindingId, "componentProps", sourceEntityId);
        events.push({
          type: "PrefabOverrideChanged",
          action: "revert",
          bindingId,
          assetId: binding.assetId,
          bucket: "componentProps",
          entityId: sceneEntityId ?? void 0,
          sourceEntityId,
          componentId
        });
        break;
      }
      case "addedComponents": {
        const sourceEntityId = input.sourceEntityId;
        const componentId = input.componentId;
        const encodedSourceId = encodeJsonPointerSegment(sourceEntityId);
        const encodedComponentId = encodeJsonPointerSegment(componentId);
        const sceneEntityId = getSceneEntityIdForPrefabSource(binding, sourceEntityId);
        const componentSnapshot = sceneEntityId ? toComponentStateSnapshot(getNormalizedComponent(normalized, sceneEntityId, componentId)) : void 0;
        if (sceneEntityId) {
          ops.push({
            op: "remove",
            path: `/entities/${encodeJsonPointerSegment(sceneEntityId)}/components/${encodedComponentId}`
          });
        }
        ops.push({
          op: "remove",
          path: `/prefab/bindings/${encodedBindingId}/overrides/addedComponents/${encodedSourceId}/${encodedComponentId}`
        });
        removeNestedOverrideContainerIfEmpty(ops, binding, bindingId, "addedComponents", sourceEntityId);
        if (sceneEntityId && componentSnapshot) {
          events.push({
            type: "ComponentRemoved",
            entityId: sceneEntityId ?? void 0,
            componentId,
            snapshot: cloneState(componentSnapshot)
          });
        }
        events.push({
          type: "PrefabOverrideChanged",
          action: "revert",
          bindingId,
          assetId: binding.assetId,
          bucket: "addedComponents",
          entityId: sceneEntityId ?? void 0,
          sourceEntityId,
          componentId
        });
        break;
      }
      case "removedComponents": {
        const sourceEntityId = input.sourceEntityId;
        const componentId = input.componentId;
        const encodedSourceId = encodeJsonPointerSegment(sourceEntityId);
        const encodedComponentId = encodeJsonPointerSegment(componentId);
        const sceneEntityId = getSceneEntityIdForPrefabSource(binding, sourceEntityId);
        const componentSnapshot = sourceSnapshots[sourceEntityId]?.components[componentId];
        if (sceneEntityId && componentSnapshot) {
          const componentValue = componentStateFromSnapshot(
            componentSnapshot,
            { bindingId, role: "linked", sourceComponentKey: componentId },
            cloneState(componentSnapshot.props ?? {}),
            cloneState(componentSnapshot.calls)
          );
          ops.push({
            op: "add",
            path: `/entities/${encodeJsonPointerSegment(sceneEntityId)}/components/${encodeJsonPointerSegment(
              componentSnapshot.sceneComponentId
            )}`,
            value: componentValue
          });
          events.push({
            type: "ComponentAdded",
            entityId: sceneEntityId ?? void 0,
            componentId: componentSnapshot.sceneComponentId,
            component: cloneState(componentValue)
          });
        }
        ops.push({
          op: "remove",
          path: `/prefab/bindings/${encodedBindingId}/overrides/removedComponents/${encodedSourceId}/${encodedComponentId}`
        });
        removeNestedOverrideContainerIfEmpty(ops, binding, bindingId, "removedComponents", sourceEntityId);
        events.push({
          type: "PrefabOverrideChanged",
          action: "revert",
          bindingId,
          assetId: binding.assetId,
          bucket: "removedComponents",
          entityId: sceneEntityId ?? void 0,
          sourceEntityId,
          componentId
        });
        break;
      }
    }
    return { operations: ops, result: void 0, events };
  }
};

// packages/model/src/domain/DomainStore.ts
var import_es_toolkit2 = __toESM(require_dist2());

// packages/model/src/domain/types.ts
function createEmptyDomainState() {
  return {
    version: 0,
    scene: { rootEntityIds: [] },
    entities: {},
    assets: {},
    prefab: { bindings: {}, byAssetId: {} }
  };
}

// packages/model/src/domain/operation.ts
function generateTxId() {
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function createTransaction(operations, commandName, events) {
  return {
    id: generateTxId(),
    timestamp: Date.now(),
    operations,
    events,
    commandName
  };
}

// packages/model/src/domain/referenceTraversal.ts
function readReferenceValue(value) {
  const component = getDomainComponentReference(value);
  if (component)
    return { kind: "component", ...component };
  const componentId = getComponentReferenceSentinelId(value);
  if (componentId !== null)
    return { kind: "component", componentId };
  const entityId = getEntityReferenceSentinelId(value);
  if (entityId !== null)
    return { kind: "entity", entityId };
  const instance = getInstanceComponentReference(value);
  if (instance)
    return { kind: "instance-component", ...instance };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return null;
  const record = value;
  const idKey = typeof record.$ref === "string" ? "$ref" : "refId";
  if (typeof record[idKey] !== "string")
    return null;
  const allowed = idKey === "$ref" ? ["$ref", "key"] : ["refId", "key", "isClone"];
  if (!Object.keys(record).every((key) => allowed.includes(key)))
    return null;
  if (record.key !== void 0 && typeof record.key !== "string")
    return null;
  if (record.isClone !== void 0 && typeof record.isClone !== "boolean")
    return null;
  return { kind: "asset", assetId: record[idKey] };
}
function collectReferenceValues(value, visit, path = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectReferenceValues(child, visit, [...path, index]));
    return;
  }
  if (!value || typeof value !== "object")
    return;
  const reference = readReferenceValue(value);
  if (reference) {
    visit(value, path, reference);
    return;
  }
  for (const [key, child] of Object.entries(value))
    collectReferenceValues(child, visit, [...path, key]);
}

// packages/model/src/domain/historyMerge.ts
var RELATION_LEAF_KEYS = /* @__PURE__ */ new Set(["$ref", "assetId", "parentFolderId", "refId"]);
var DOMAIN_RELATION_PATHS = [
  ["assets", "*", "parentFolderId"],
  ["entities", "*", "instance", "assetId"],
  ["entities", "*", "prefabSource", "assetId"],
  ["entities", "*", "components", "*", "refId"],
  ["prefab", "bindings", "*", "assetId"]
];
function splitPointer(path) {
  return path.split("/").slice(1).map(decodeJsonPointerSegment);
}
function collectAddedAssetIds(entries) {
  const ids = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    for (const operation of entry.operations) {
      if (operation.op !== "add")
        continue;
      const assetId = getRootAssetId(operation.path);
      if (assetId)
        ids.add(assetId);
    }
  }
  return ids;
}
function collectPatternValues(pattern, depth, value, out) {
  if (depth === pattern.length) {
    if (typeof value === "string")
      out.push(value);
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    return;
  const record = value;
  const segment = pattern[depth];
  if (segment === "*") {
    for (const child of Object.values(record))
      collectPatternValues(pattern, depth + 1, child, out);
    return;
  }
  if (segment in record)
    collectPatternValues(pattern, depth + 1, record[segment], out);
}
function collectRelationAssetIds(path, value, out) {
  const segments = splitPointer(path);
  const leaf = segments[segments.length - 1];
  if (typeof value === "string" && leaf !== void 0 && RELATION_LEAF_KEYS.has(leaf))
    out.push(value);
  if (segments[0] === "prefab" && segments[1] === "byAssetId" && segments.length >= 3)
    out.push(segments[2]);
  for (const pattern of DOMAIN_RELATION_PATHS) {
    if (segments.length >= pattern.length)
      continue;
    const matches = segments.every((segment, index) => pattern[index] === "*" || pattern[index] === segment);
    if (matches)
      collectPatternValues(pattern, segments.length, value, out);
  }
}
function mentionsCanonicalAssetReference(value, assetIds) {
  let found = false;
  collectReferenceValues(value, (_raw, _path, reference) => {
    if (reference.kind === "asset" && assetIds.has(reference.assetId))
      found = true;
  });
  return found;
}
function referencesAddedAsset(operation, assetIds) {
  const named = [];
  if ("value" in operation) {
    collectRelationAssetIds(operation.path, operation.value, named);
    if (mentionsCanonicalAssetReference(operation.value, assetIds))
      return true;
  }
  if ("oldValue" in operation) {
    collectRelationAssetIds(operation.path, operation.oldValue, named);
    if (mentionsCanonicalAssetReference(operation.oldValue, assetIds))
      return true;
  }
  return named.some((assetId) => assetIds.has(assetId));
}
function sharesPathWithOwned(operation, ownedPaths) {
  const overlaps = (path) => ownedPaths.some((owned) => path === owned || path.startsWith(`${owned}/`) || owned.startsWith(`${path}/`));
  return overlaps(operation.path) || "from" in operation && overlaps(operation.from);
}
function createReorderGuard(owned) {
  const addedAssetIds = collectAddedAssetIds(owned);
  const ownedPaths = owned.flatMap(
    (entry) => entry.operations.flatMap((operation) => "from" in operation ? [operation.path, operation.from] : [operation.path])
  );
  return (foreign) => foreign.operations.every(
    (operation) => !sharesPathWithOwned(operation, ownedPaths) && !referencesAddedAsset(operation, addedAssetIds)
  );
}

// packages/model/src/domain/patch.ts
var import_fast_json_patch = __toESM(require_fast_json_patch());
function deepClone(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  try {
    return structuredClone(value);
  } catch (structuredCloneError) {
    const error = new Error("[deepClone] clone failed: value is not cloneable for domain snapshot isolation");
    error.cause = structuredCloneError;
    throw error;
  }
}
function stripMeta(op) {
  switch (op.op) {
    case "add":
      return { op: "add", path: op.path, value: deepClone(op.value) };
    case "remove":
      return { op: "remove", path: op.path };
    case "replace":
      return { op: "replace", path: op.path, value: deepClone(op.value) };
    case "move":
      return { op: "move", from: op.from, path: op.path };
    case "copy":
      return { op: "copy", from: op.from, path: op.path };
    case "test":
      return { op: "test", path: op.path, value: op.value };
  }
}
function canonicalize(op, result) {
  let path = op.path;
  if (op.op === "add" && path.endsWith("/-")) {
    if (typeof result.index !== "number") {
      throw new Error("Cannot canonicalize '/-' without result.index; ensure the target is an array");
    }
    path = `${path.slice(0, -2)}/${result.index}`;
  }
  switch (op.op) {
    case "replace":
      return { ...op, path, value: deepClone(op.value), oldValue: deepClone(op.oldValue ?? result?.removed) };
    case "remove":
      return { ...op, path, oldValue: deepClone(op.oldValue ?? result?.removed) };
    case "add":
      return { ...op, path, value: deepClone(op.value) };
    default:
      return { ...op, path };
  }
}
function lookupPathValue(state, path, treatArrayIndexAsInsertion = false) {
  if (!path.startsWith("/")) {
    return { exists: false, value: void 0 };
  }
  const segments = path.slice(1).split("/").map((segment) => decodeJsonPointerSegment(segment));
  let cursor = state;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;
    if (Array.isArray(cursor)) {
      if (segment === "-") {
        return { exists: false, value: void 0 };
      }
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return { exists: false, value: void 0 };
      }
      if (isLast) {
        return treatArrayIndexAsInsertion ? { exists: false, value: void 0 } : { exists: true, value: cursor[index] };
      }
      cursor = cursor[index];
      continue;
    }
    if (cursor && typeof cursor === "object") {
      const record = cursor;
      if (!(segment in record)) {
        return { exists: false, value: void 0 };
      }
      if (isLast) {
        return { exists: true, value: record[segment] };
      }
      cursor = record[segment];
      continue;
    }
    return { exists: false, value: void 0 };
  }
  return { exists: false, value: void 0 };
}
function applyOperationsDetailed(state, ops) {
  if (!ops.length)
    return { state, operations: [] };
  for (const op of ops) {
    if (op.path === "/version" || op.path.startsWith("/version/")) {
      throw new Error("DomainState.version is store-managed; do not patch it");
    }
    if (op.op !== "add" && op.path.endsWith("/-")) {
      throw new Error(
        "Non-canonical array index: only 'add' may use '/-' and will be canonicalized; other ops must use explicit index"
      );
    }
  }
  const addPathOldValues = ops.map((op) => {
    if (op.op !== "add") {
      return { exists: false, value: void 0 };
    }
    return lookupPathValue(state, op.path, true);
  });
  const patch = ops.map(stripMeta);
  const results = (0, import_fast_json_patch.applyPatch)(state, patch, false, false);
  const nextState = results.newDocument;
  const appliedOps = ops.map((op, i) => {
    if (op.op !== "add") {
      return canonicalize(op, results[i]);
    }
    const canonicalized = canonicalize(op, results[i]);
    const oldPathValue = addPathOldValues[i];
    if (!oldPathValue.exists) {
      return canonicalized;
    }
    return { ...canonicalized, oldValue: deepClone(oldPathValue.value) };
  });
  return { state: nextState, operations: appliedOps };
}
function inverseOperation(op) {
  switch (op.op) {
    case "add":
      if ("oldValue" in op) {
        return { op: "replace", path: op.path, value: op.oldValue, oldValue: op.value };
      }
      return { op: "remove", path: op.path };
    case "remove":
      if (op.oldValue === void 0)
        throw new Error("Cannot inverse remove without oldValue");
      return { op: "add", path: op.path, value: op.oldValue };
    case "replace":
      if (op.oldValue === void 0)
        throw new Error("Cannot inverse replace without oldValue");
      return { op: "replace", path: op.path, value: op.oldValue, oldValue: op.value };
    case "move":
      return { op: "move", from: op.path, path: op.from };
    case "copy":
      if ("oldValue" in op && op.oldValue !== void 0) {
        return { op: "replace", path: op.path, value: op.oldValue };
      }
      return { op: "remove", path: op.path };
    case "test":
      return op;
  }
}
function inverseOperations(ops) {
  return ops.map(inverseOperation).reverse();
}

// packages/tsconfig/scene-setting-contract.ts
var SCENE_SETTING_LAYER_BY_PATH = {
  "background/mode": "engine-projection",
  "background/color": "engine-projection",
  "background/texture": "engine-projection",
  "background/skyMaterial": "engine-projection",
  "background/skyMesh": "engine-projection",
  "background/textureFillMode": "engine-projection",
  "ambient/ambientLight": "editor-scene",
  "ambient/customAmbientLight": "editor-scene",
  "ambient/diffuseMode": "engine-projection",
  "ambient/diffuseSolidColor": "engine-projection",
  "ambient/diffuseIntensity": "engine-projection",
  "ambient/specularMode": "engine-projection",
  "ambient/customSpecularTexture": "editor-scene",
  "ambient/bakerResolution": "editor-only",
  "ambient/specularIntensity": "engine-projection",
  "shadow/castShadows": "engine-projection",
  "shadow/enableTransparentShadow": "engine-projection",
  "shadow/shadowResolution": "engine-projection",
  "shadow/shadowDistance": "engine-projection",
  "shadow/shadowCascades": "engine-projection",
  "shadow/shadowTwoCascadeSplits": "engine-projection",
  "shadow/shadowFourCascadeSplits": "engine-projection",
  "shadow/shadowFadeBorder": "engine-projection",
  "fog/mode": "engine-projection",
  "fog/color": "engine-projection",
  "fog/density": "engine-projection",
  "fog/start": "engine-projection",
  "fog/end": "engine-projection",
  "ambientOcclusion/enabled": "engine-projection",
  "ambientOcclusion/quality": "engine-projection",
  "ambientOcclusion/intensity": "engine-projection",
  "ambientOcclusion/radius": "engine-projection",
  "ambientOcclusion/bias": "engine-projection",
  "ambientOcclusion/power": "engine-projection",
  "ambientOcclusion/bilateralThreshold": "engine-projection",
  "ambientOcclusion/minHorizonAngle": "engine-projection",
  autoBake: "editor-only"
};
var SCENE_SETTING_PATHS = Object.keys(SCENE_SETTING_LAYER_BY_PATH);
var SCENE_SETTING_PATH_SET = new Set(SCENE_SETTING_PATHS);
function isCanonicalSceneSettingPath(path) {
  return SCENE_SETTING_PATH_SET.has(path);
}
function assertCanonicalSceneSettingPath(path) {
  if (!isCanonicalSceneSettingPath(path)) {
    throw new Error(`Unknown scene setting path: ${path}`);
  }
  return path;
}

// packages/model/src/domain/sceneSettingEvents.ts
var LEGACY_SCENE_SETTING_PATH_MAP = {
  "fog/fogMode": "fog/mode",
  "fog/fogColor": "fog/color",
  "fog/fogStart": "fog/start",
  "fog/fogEnd": "fog/end",
  "fog/fogDensity": "fog/density",
  "ambientOcclusion/enabledAmbientOcclusion": "ambientOcclusion/enabled"
};
function normalizeSceneSettingPath(path) {
  const normalized = path.trim().replace(/^\/+/, "").replace(/\/+/g, "/");
  return assertCanonicalSceneSettingPath(LEGACY_SCENE_SETTING_PATH_MAP[normalized] ?? normalized);
}
function collectLeafPaths(value, prefix) {
  if (prefix.length >= 2 || !isPlainRecord(value)) {
    return prefix.length > 0 ? [assertCanonicalSceneSettingPath(prefix.join("/"))] : [];
  }
  const paths = [];
  for (const [key, nested] of Object.entries(value)) {
    paths.push(...collectLeafPaths(nested, [...prefix, key]));
  }
  return paths;
}
function flattenSceneSettingUpdateEvents(value, prefix = []) {
  if (prefix.length >= 2 || !isPlainRecord(value)) {
    if (prefix.length === 0)
      return [];
    return [
      {
        type: "SceneSettingUpdated",
        settingPath: assertCanonicalSceneSettingPath(prefix.join("/")),
        value: cloneState(value)
      }
    ];
  }
  return Object.entries(value).flatMap(([key, nested]) => flattenSceneSettingUpdateEvents(nested, [...prefix, key]));
}
function flattenSceneSettingRemovalEvents(previousValue, prefix = []) {
  return collectLeafPaths(previousValue, prefix).map((settingPath) => ({
    type: "SceneSettingUpdated",
    settingPath,
    value: void 0
  }));
}

// packages/model/src/domain/deriveEventsFromOperations.ts
function parsePath(path) {
  if (!path.startsWith("/"))
    return [];
  return path.slice(1).split("/").map((segment) => decodeJsonPointerSegment(segment));
}
function getPrefabEntityIds(binding) {
  return getSceneEntityIdsForPrefabBinding(binding);
}
var PREFAB_OVERRIDE_BUCKETS = [
  "entityProps",
  "componentProps",
  "removedEntities",
  "removedComponents",
  "addedEntities",
  "addedComponents"
];
function isPrefabOverrideBucket(value) {
  return !!value && PREFAB_OVERRIDE_BUCKETS.includes(value);
}
function getSiblingIndex(state, entityId, parentId) {
  const siblings = parentId ? state.entities[parentId]?.children ?? [] : state.scene.rootEntityIds;
  return siblings.indexOf(entityId);
}
function setTransformAxis(target, property, axis, value) {
  const next = target[property] ?? {};
  next[axis] = value;
  target[property] = next;
}
function applyEntityUpdateChange(changes, path, value) {
  switch (path[0]) {
    case "name":
      changes.name = value;
      return true;
    case "isActive":
      changes.isActive = value;
      return true;
    case "layer":
      changes.layer = value;
      return true;
    case "isLocked":
      changes.isLocked = value;
      return true;
    case "instance":
      changes.instance = value;
      return true;
    case "transform": {
      const transform = changes.transform ??= {};
      if (path.length === 1) {
        changes.transform = cloneState(value);
        return true;
      }
      if (path.length === 2) {
        transform[path[1]] = cloneState(value);
        return true;
      }
      if (path.length >= 3) {
        setTransformAxis(transform, path[1], path[2], value);
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}
function getStructuralEntityReorderCandidate(op, segments) {
  if (op.op !== "add" && op.op !== "remove")
    return null;
  let parentId;
  if (segments[0] === "entities" && segments[2] === "children" && segments.length >= 4) {
    parentId = segments[1];
  } else if (segments[0] === "scene" && segments[1] === "rootEntityIds" && segments.length >= 3) {
    parentId = null;
  } else {
    return null;
  }
  const entityId = op.op === "add" ? typeof op.value === "string" ? op.value : null : typeof op.oldValue === "string" ? op.oldValue : null;
  if (!entityId)
    return null;
  return { entityId, parentId };
}
function deriveEventsFromOperations(operations, prevState, nextState) {
  const events = [];
  const entityUpdates = /* @__PURE__ */ new Map();
  const componentUpdates = /* @__PURE__ */ new Map();
  const assetUpdates = /* @__PURE__ */ new Set();
  const entityMoves = /* @__PURE__ */ new Map();
  const structuralEntityReorders = /* @__PURE__ */ new Map();
  const emittedSourceBaselineUpdates = /* @__PURE__ */ new Set();
  for (const op of operations) {
    if (op.op === "move" || op.op === "copy" || op.op === "test") {
      console.warn("[deriveEventsFromOperations] Unsupported JSON Patch op skipped.", op);
      continue;
    }
    const segments = parsePath(op.path);
    const reorderCandidate = getStructuralEntityReorderCandidate(op, segments);
    if (reorderCandidate) {
      structuralEntityReorders.set(reorderCandidate.entityId, reorderCandidate.parentId);
    }
    if (segments[0] === "scene" && segments[1] === "settings") {
      if (op.op === "remove") {
        const previousValue = op.oldValue;
        if (segments.length === 4) {
          events.push({
            type: "SceneSettingUpdated",
            settingPath: normalizeSceneSettingPath(segments.slice(2, 4).join("/")),
            value: void 0
          });
        } else {
          events.push(...flattenSceneSettingRemovalEvents(previousValue, segments.slice(2)));
        }
        continue;
      }
      if (op.op === "add" || op.op === "replace") {
        if (segments.length >= 4) {
          events.push({
            type: "SceneSettingUpdated",
            settingPath: normalizeSceneSettingPath(segments.slice(2).join("/")),
            value: cloneState(op.value)
          });
        } else {
          events.push(...flattenSceneSettingUpdateEvents(op.value, segments.slice(2)));
        }
      }
      continue;
    }
    if (segments[0] === "assets" && segments.length >= 2) {
      const assetId = segments[1];
      if (segments.length === 2) {
        if (op.op === "add" && "value" in op) {
          events.push({
            type: "AssetCreated",
            assetId,
            asset: cloneState(op.value)
          });
        } else if (op.op === "remove") {
          events.push({
            type: "AssetDeleted",
            assetId,
            snapshot: cloneState(op.oldValue ?? prevState.assets[assetId] ?? {})
          });
        } else if (op.op === "replace") {
          assetUpdates.add(assetId);
        }
        continue;
      }
      assetUpdates.add(assetId);
      continue;
    }
    if (segments[0] === "prefab" && segments[1] === "bindings" && segments.length >= 3) {
      const bindingId = segments[2];
      if (segments.length === 3) {
        if (op.op === "add" && "value" in op) {
          const binding = cloneState(op.value);
          events.push({
            type: "PrefabBindingCreated",
            source: "derived",
            bindingId,
            assetId: binding.assetId,
            instanceRootEntityId: binding.instanceRootEntityId,
            sourceRootEntityId: binding.sourceRootEntityId,
            entityIds: getPrefabEntityIds(binding)
          });
        } else if (op.op === "remove") {
          const binding = cloneState(op.oldValue ?? prevState.prefab.bindings[bindingId]);
          events.push({
            type: "PrefabBindingRemoved",
            reason: "derived",
            bindingId,
            assetId: binding.assetId,
            instanceRootEntityId: binding.instanceRootEntityId
          });
        }
        continue;
      }
      if (segments[3] === "sourceRevision" && (op.op === "replace" || op.op === "add")) {
        const previousBinding = prevState.prefab.bindings[bindingId];
        const binding = nextState.prefab.bindings[bindingId];
        if (previousBinding && binding) {
          events.push({
            type: "PrefabBindingRebased",
            bindingId,
            assetId: binding.assetId,
            previousRevision: previousBinding.sourceRevision,
            sourceRevision: binding.sourceRevision
          });
        }
        continue;
      }
      if (segments[3] === "assetId" && (op.op === "replace" || op.op === "add")) {
        const previousBinding = prevState.prefab.bindings[bindingId];
        const binding = nextState.prefab.bindings[bindingId];
        if (previousBinding && binding && (previousBinding.assetId !== binding.assetId || previousBinding.assetKind !== binding.assetKind)) {
          events.push({
            type: "PrefabBindingRetargeted",
            bindingId,
            previousAssetId: previousBinding.assetId,
            assetId: binding.assetId,
            instanceRootEntityId: binding.instanceRootEntityId
          });
        }
        continue;
      }
      if (segments[3] === "sourceEntitySnapshots" && !emittedSourceBaselineUpdates.has(bindingId)) {
        const binding = nextState.prefab.bindings[bindingId];
        if (binding) {
          emittedSourceBaselineUpdates.add(bindingId);
          events.push({
            type: "PrefabBindingSourceBaselineUpdated",
            bindingId,
            assetId: binding.assetId,
            instanceRootEntityId: binding.instanceRootEntityId,
            sourceRootEntityId: binding.sourceRootEntityId,
            sourceRevision: binding.sourceRevision
          });
        }
        continue;
      }
      if (segments[3] === "overrides" && segments.length >= 5 && isPrefabOverrideBucket(segments[4])) {
        const binding = nextState.prefab.bindings[bindingId] ?? prevState.prefab.bindings[bindingId];
        if (!binding)
          continue;
        const bucket = segments[4];
        let sourceEntityId;
        let entityId2;
        let componentId;
        switch (bucket) {
          case "entityProps":
          case "componentProps":
          case "removedEntities":
          case "removedComponents":
          case "addedComponents":
            sourceEntityId = segments[5];
            entityId2 = sourceEntityId ? getSceneEntityIdForPrefabSource(binding, sourceEntityId) ?? void 0 : void 0;
            if ((bucket === "componentProps" || bucket === "removedComponents" || bucket === "addedComponents") && segments.length >= 7) {
              componentId = segments[6];
            }
            break;
          case "addedEntities": {
            entityId2 = segments[5];
            const overrideEntry = nextState.prefab.bindings[bindingId]?.overrides.addedEntities[entityId2] ?? prevState.prefab.bindings[bindingId]?.overrides.addedEntities[entityId2];
            sourceEntityId = overrideEntry?.parentSourceEntityId;
            break;
          }
        }
        events.push({
          type: "PrefabOverrideChanged",
          action: "derived",
          bindingId,
          assetId: binding.assetId,
          bucket,
          entityId: entityId2,
          sourceEntityId,
          componentId
        });
        continue;
      }
    }
    if (segments[0] !== "entities" || segments.length < 2)
      continue;
    const entityId = segments[1];
    if (segments.length === 2) {
      if (op.op === "add" && "value" in op) {
        const entity = cloneState(op.value);
        events.push({
          type: "EntityCreated",
          entityId,
          parentId: entity.parentId ?? null,
          index: getSiblingIndex(nextState, entityId, entity.parentId ?? null),
          entity
        });
      } else if (op.op === "remove") {
        const snapshot = cloneState(op.oldValue ?? prevState.entities[entityId] ?? {});
        events.push({
          type: "EntityDeleted",
          entityId,
          snapshot,
          // Derived from raw ops: each remove op yields a single-entity subtreeIds.
          // Command-layer DeleteEntityCommand provides the full subtree in one event.
          subtreeIds: [entityId],
          subtree: {
            [entityId]: snapshot
          }
        });
      }
      continue;
    }
    if (segments[2] === "parentId" && (op.op === "replace" || op.op === "add")) {
      entityMoves.set(entityId, {
        entityId,
        previousParentId: op.oldValue ?? prevState.entities[entityId]?.parentId ?? null,
        parentId: op.value ?? nextState.entities[entityId]?.parentId ?? null,
        previousIndex: getSiblingIndex(
          prevState,
          entityId,
          op.oldValue ?? prevState.entities[entityId]?.parentId ?? null
        ),
        index: getSiblingIndex(
          nextState,
          entityId,
          "value" in op ? op.value : nextState.entities[entityId]?.parentId ?? null
        )
      });
      continue;
    }
    if (segments[2] === "children" && segments.length >= 4 && (op.op === "add" || op.op === "remove")) {
      const changes = entityUpdates.get(entityId) ?? (() => {
        const created = {};
        entityUpdates.set(entityId, created);
        return created;
      })();
      changes.children = cloneState(nextState.entities[entityId]?.children ?? []);
      continue;
    }
    if (segments[2] === "components" && segments.length >= 4) {
      const componentId = segments[3];
      if (segments.length === 4) {
        if (op.op === "add" && "value" in op) {
          events.push({
            type: "ComponentAdded",
            entityId,
            componentId,
            component: cloneState(op.value)
          });
        } else if (op.op === "remove") {
          events.push({
            type: "ComponentRemoved",
            entityId,
            componentId,
            snapshot: cloneState(
              op.oldValue ?? prevState.entities[entityId]?.components?.[componentId] ?? {}
            )
          });
        }
        continue;
      }
      if (segments[4] === "props" && segments.length >= 6 && (op.op === "replace" || op.op === "add" || op.op === "remove")) {
        const key = `${entityId}:${componentId}`;
        const current = componentUpdates.get(key) ?? (() => {
          const created = {
            entityId,
            componentId,
            changes: {},
            fields: {}
          };
          componentUpdates.set(key, created);
          return created;
        })();
        if (op.op === "remove") {
          current.changes[segments[5]] = void 0;
        } else if (segments.length > 6) {
          const fullPropValue = nextState.entities[entityId]?.components?.[componentId]?.props?.[segments[5]];
          current.changes[segments[5]] = fullPropValue !== void 0 ? cloneState(fullPropValue) : cloneState(op.value);
        } else {
          current.changes[segments[5]] = cloneState(op.value);
        }
        continue;
      }
      if ((segments[4] === "refId" || segments[4] === "scriptKey") && segments.length === 5 && (op.op === "replace" || op.op === "add" || op.op === "remove")) {
        const key = `${entityId}:${componentId}`;
        const current = componentUpdates.get(key) ?? (() => {
          const created = {
            entityId,
            componentId,
            changes: {},
            fields: {}
          };
          componentUpdates.set(key, created);
          return created;
        })();
        const next = op.op === "remove" ? null : op.value;
        if (segments[4] === "refId") {
          current.fields.refId = typeof next === "string" ? next : null;
        } else {
          current.fields.scriptKey = typeof next === "string" ? next : null;
        }
        continue;
      }
      if (segments[4] === "type" && segments.length === 5 && (op.op === "replace" || op.op === "add" || op.op === "remove")) {
        const key = `${entityId}:${componentId}`;
        const current = componentUpdates.get(key) ?? (() => {
          const created = {
            entityId,
            componentId,
            changes: {},
            fields: {}
          };
          componentUpdates.set(key, created);
          return created;
        })();
        current.changes.type = op.op === "remove" ? void 0 : cloneState(op.value);
        continue;
      }
    }
    if (op.op === "replace" || op.op === "add" || op.op === "remove") {
      const changes = entityUpdates.get(entityId) ?? (() => {
        const created = {};
        entityUpdates.set(entityId, created);
        return created;
      })();
      const value = op.op === "remove" ? void 0 : op.value;
      const handled = applyEntityUpdateChange(changes, segments.slice(2), value);
      if (!handled && !Object.keys(changes).length) {
        entityUpdates.delete(entityId);
      }
    }
  }
  for (const [entityId, candidateParentId] of structuralEntityReorders) {
    if (entityMoves.has(entityId))
      continue;
    const previousEntity = prevState.entities[entityId];
    const nextEntity = nextState.entities[entityId];
    if (!previousEntity || !nextEntity)
      continue;
    const previousParentId = previousEntity.parentId ?? null;
    const parentId = nextEntity.parentId ?? null;
    if (previousParentId !== parentId || parentId !== candidateParentId)
      continue;
    const previousIndex = getSiblingIndex(prevState, entityId, previousParentId);
    const index = getSiblingIndex(nextState, entityId, parentId);
    if (previousIndex < 0 || index < 0 || previousIndex === index)
      continue;
    entityMoves.set(entityId, {
      entityId,
      previousParentId,
      parentId,
      previousIndex,
      index
    });
  }
  for (const move of entityMoves.values()) {
    events.push({
      type: "EntityMoved",
      entityId: move.entityId,
      previousParentId: move.previousParentId,
      parentId: move.parentId,
      previousIndex: move.previousIndex,
      index: move.index
    });
  }
  for (const [entityId, changes] of entityUpdates) {
    if (Object.keys(changes).length === 0)
      continue;
    events.push({
      type: "EntityUpdated",
      entityId,
      changes
    });
  }
  for (const update of componentUpdates.values()) {
    if (Object.keys(update.changes).length === 0 && Object.keys(update.fields).length === 0)
      continue;
    events.push({
      type: "ComponentUpdated",
      entityId: update.entityId,
      componentId: update.componentId,
      changes: update.changes,
      ...Object.keys(update.fields).length > 0 ? { fields: update.fields } : {}
    });
  }
  for (const assetId of assetUpdates) {
    const previousAsset = prevState.assets[assetId];
    const asset = nextState.assets[assetId];
    if (!previousAsset || !asset)
      continue;
    events.push({
      type: "AssetUpdated",
      assetId,
      previousAsset: cloneState(previousAsset),
      asset: cloneState(asset)
    });
  }
  return events;
}

// packages/model/src/domain/DomainStore.ts
var listenersMap = /* @__PURE__ */ new WeakMap();
var commitGuardsMap = /* @__PURE__ */ new WeakMap();
var historyEvictionListenersMap = /* @__PURE__ */ new WeakMap();
var assetEpochsMap = /* @__PURE__ */ new WeakMap();
function arePreparedPathsUnchanged(previousState, currentState, operations, readPaths = []) {
  const paths = new Set(readPaths);
  for (const operation of operations) {
    paths.add(operation.path);
    if ("from" in operation)
      paths.add(operation.from);
  }
  for (const path of paths) {
    const previous = lookupPathValue(previousState, path);
    const current = lookupPathValue(currentState, path);
    if (previous.exists !== current.exists || !(0, import_es_toolkit2.isEqual)(previous.value, current.value)) {
      return false;
    }
  }
  return true;
}
function getDomainEventMergeKey(event) {
  switch (event.type) {
    case "EntityCreated":
    case "EntityUpdated":
    case "EntityMoved":
    case "EntityDeleted":
      return `${event.type}:${event.entityId}`;
    case "ComponentAdded":
    case "ComponentUpdated":
    case "ComponentRemoved":
      return `${event.type}:${event.entityId}:${event.componentId}`;
    case "SceneSettingUpdated":
      return `${event.type}:${event.settingPath}`;
    case "AssetCreated":
    case "AssetUpdated":
    case "AssetDeleted":
      return `${event.type}:${event.assetId}`;
    case "PrefabBindingCreated":
    case "PrefabBindingRemoved":
    case "PrefabBindingRetargeted":
    case "PrefabBindingRebased":
    case "PrefabBindingSourceBaselineUpdated":
      return `${event.type}:${event.bindingId}`;
    case "PrefabOverrideChanged":
      return `${event.type}:${event.bindingId}:${event.bucket}:${event.entityId ?? ""}:${event.sourceEntityId ?? ""}:${event.componentId ?? ""}`;
    default: {
      const _exhaustive = event;
      return `unknown:${_exhaustive.type}`;
    }
  }
}
function mergeDomainEvents(explicitEvents, derivedEvents) {
  if (!explicitEvents?.length)
    return derivedEvents.length ? derivedEvents : void 0;
  if (!derivedEvents.length)
    return explicitEvents;
  const explicitDeletedSubtreeIds = /* @__PURE__ */ new Set();
  for (const event of explicitEvents) {
    if (event.type === "EntityDeleted") {
      for (const id of event.subtreeIds) {
        explicitDeletedSubtreeIds.add(id);
      }
    }
  }
  const merged = [...explicitEvents];
  const seen = new Set(explicitEvents.map(getDomainEventMergeKey));
  for (const event of derivedEvents) {
    const key = getDomainEventMergeKey(event);
    if (seen.has(key))
      continue;
    if (event.type === "EntityDeleted" && explicitDeletedSubtreeIds.has(event.entityId))
      continue;
    seen.add(key);
    merged.push(event);
  }
  return merged;
}
function compactConsecutiveReplaces(operations) {
  const compacted = [];
  for (const operation of operations) {
    const previous = compacted.at(-1);
    if (previous?.op === "replace" && operation.op === "replace" && previous.path === operation.path && previous.oldValue !== void 0 && operation.oldValue !== void 0 && (0, import_es_toolkit2.isEqual)(previous.value, operation.oldValue)) {
      compacted[compacted.length - 1] = { ...operation, oldValue: previous.oldValue };
    } else {
      compacted.push(operation);
    }
  }
  return compacted;
}
var DomainStore = class {
  _state;
  _normalizedStateCache = null;
  undoStack = [];
  redoStack = [];
  undoStackBytes = 0;
  redoStackBytes = 0;
  /** 历史记录是否暂停（初始化阶段使用） */
  _historyPaused = false;
  /** 事务批处理模式 */
  _batchMode = false;
  /** 批处理期间缓冲的操作 */
  _batchOps = [];
  /** 批处理期间缓冲的领域事件 */
  _batchEvents = [];
  /** 批处理开始时的状态快照 */
  _batchStateSnapshot = null;
  /** 批处理中观察到的命令名（用于 auto-flush 命名） */
  _batchCommandName = null;
  _batchHasMixedCommandNames = false;
  /** undo group 嵌套深度 */
  _undoGroupDepth = 0;
  /** undo group 期间收集的 transaction ID（Set 便于 trim 时 O(1) 判定） */
  _undoGroupTxIds = null;
  /** Origins of the history scopes still running; their recorded entries are trimming-protected */
  _activeOrigins = /* @__PURE__ */ new Set();
  /** 最大 undo 栈深度，防止长时间编辑导致内存增长 */
  maxUndoStackSize;
  /** 最大 undo 栈大小（估算字节数），防止长时间编辑导致内存增长 */
  maxUndoStackBytes;
  constructor(initialState, options) {
    this._state = initialState ?? createEmptyDomainState();
    this.maxUndoStackSize = options?.maxUndoStackSize ?? 100;
    this.maxUndoStackBytes = options?.maxUndoStackBytes ?? 10 * 1024 * 1024;
    listenersMap.set(this, /* @__PURE__ */ new Set());
    commitGuardsMap.set(this, /* @__PURE__ */ new Set());
    historyEvictionListenersMap.set(this, /* @__PURE__ */ new Set());
  }
  estimateValueByteSize(value) {
    const maxNodes = 200;
    const seen = /* @__PURE__ */ new Set();
    const stack = [value];
    let size = 0;
    let nodes = 0;
    while (stack.length) {
      const v = stack.pop();
      nodes++;
      if (nodes > maxNodes) {
        size += 1024;
        break;
      }
      if (v === null || v === void 0)
        continue;
      const vt = typeof v;
      if (vt === "string") {
        size += v.length * 2;
        continue;
      }
      if (vt === "number" || vt === "bigint") {
        size += 8;
        continue;
      }
      if (vt === "boolean") {
        size += 4;
        continue;
      }
      if (vt !== "object")
        continue;
      const obj = v;
      if (seen.has(obj))
        continue;
      seen.add(obj);
      if (Array.isArray(v)) {
        size += 16;
        for (const item of v)
          stack.push(item);
        continue;
      }
      size += 8;
      for (const [k, val] of Object.entries(v)) {
        size += k.length * 2;
        stack.push(val);
      }
    }
    return size;
  }
  estimateTransactionByteSize(tx) {
    let size = 64;
    for (const op of tx.operations) {
      size += op.path.length * 2;
      if ("from" in op)
        size += op.from.length * 2;
      if ("value" in op)
        size += this.estimateValueByteSize(op.value);
      if ("oldValue" in op)
        size += this.estimateValueByteSize(op.oldValue);
    }
    return size;
  }
  getTransactionByteSize(tx) {
    if (typeof tx.byteSize === "number")
      return tx.byteSize;
    const size = this.estimateTransactionByteSize(tx);
    tx.byteSize = size;
    return size;
  }
  clearRedoStack() {
    if (this.redoStack.length === 0)
      return;
    const evicted = this.redoStack;
    this.redoStack = [];
    this.redoStackBytes = 0;
    this.emitHistoryEvicted(evicted);
  }
  pushUndo(tx) {
    const size = this.getTransactionByteSize(tx);
    this.undoStack.push(tx);
    this.undoStackBytes += size;
    this.trimUndoStack();
    if (this._undoGroupTxIds) {
      this._undoGroupTxIds.add(tx.id);
    }
  }
  trimUndoStack() {
    const inGroup = this._undoGroupTxIds;
    const canEvict = (tx) => (!inGroup || !inGroup.has(tx.id)) && (!tx.origin || !this._activeOrigins.has(tx.origin));
    while (this.maxUndoStackSize > 0 && this.undoStack.length > this.maxUndoStackSize && this.undoStack.length > 0 && canEvict(this.undoStack[0])) {
      const removed = this.undoStack.shift();
      if (removed)
        this.undoStackBytes -= this.getTransactionByteSize(removed);
    }
    while (this.maxUndoStackBytes > 0 && this.undoStackBytes > this.maxUndoStackBytes && this.undoStack.length > 1 && canEvict(this.undoStack[0])) {
      const removed = this.undoStack.shift();
      if (removed)
        this.undoStackBytes -= this.getTransactionByteSize(removed);
    }
  }
  /**
   * 开始 undo 分组。
   * 分组期间所有 pushUndo 的 transaction 会被记录，
   * endUndoGroup 时合并为单个 undo 条目。
   * 支持嵌套（最外层 endUndoGroup 时合并）。
   */
  beginUndoGroup() {
    if (this._undoGroupDepth === 0) {
      this._undoGroupTxIds = /* @__PURE__ */ new Set();
    }
    this._undoGroupDepth++;
  }
  /**
   * Run an asset creation and record everything it commits as one "asset.create" undo entry.
   *
   * The executor receives the origin that marks the writes it authors and must pass it to
   * every one of them: created assets, the parent folders it adds, their initial content and
   * props, and the Prefab binding that makes a source an instance of a created asset. Entries
   * written without that origin are other operations, so an edit made elsewhere while the
   * creation awaits stays separately undoable.
   *
   * The merged entry keeps the "asset.create" name because redo of that command is what
   * resumes remote creation. A creation that throws still merges the writes it already made -
   * the origin marks them regardless of the outcome - and rethrows its error to the caller.
   *
   * @param executor - The creation, given the origin that marks its writes
   * @returns The creation result
   */
  async recordAssetCreation(executor) {
    const origin = { id: generateTxId(), commandName: "asset.create" };
    this._activeOrigins.add(origin.id);
    try {
      return await executor(origin);
    } finally {
      try {
        this.mergeOriginEntries(origin);
      } finally {
        this._activeOrigins.delete(origin.id);
        this.trimUndoStack();
      }
    }
  }
  /**
   * Merge the entries one origin recorded into a single undo entry, placed where its last entry
   * was, so undo reverts the operation before edits that finished earlier. Entries recorded
   * elsewhere in between stay separate; if moving the operation after one of them would change
   * what either recorded, nothing is merged.
   */
  mergeOriginEntries(origin) {
    const owned = this.undoStack.filter((tx) => tx.origin === origin.id);
    if (owned.length <= 1)
      return;
    const last = this.undoStack.indexOf(owned[owned.length - 1]);
    const first = this.undoStack.indexOf(owned[0]);
    const crossed = this.undoStack.slice(first, last + 1).filter((tx) => tx.origin !== origin.id);
    if (crossed.length > 0 && !crossed.every(createReorderGuard(owned)))
      return;
    const mergedTx = this.mergeTransactions(owned, origin.commandName);
    if (!mergedTx)
      return;
    const insertAt = last - (owned.length - 1);
    for (const tx of owned)
      this.undoStackBytes -= this.getTransactionByteSize(tx);
    this.undoStack = this.undoStack.filter((tx) => !owned.includes(tx));
    this.undoStack.splice(insertAt, 0, mergedTx);
    this.undoStackBytes += this.getTransactionByteSize(mergedTx);
    if (this._undoGroupTxIds && owned.some((tx) => this._undoGroupTxIds.has(tx.id))) {
      this._undoGroupTxIds.add(mergedTx.id);
    }
  }
  /**
   * 结束 undo 分组，将分组内的 undo 条目合并为一个。
   */
  endUndoGroup(commandName) {
    if (this._undoGroupDepth === 0)
      return;
    this._undoGroupDepth--;
    if (this._undoGroupDepth > 0)
      return;
    const txIds = this._undoGroupTxIds;
    this._undoGroupTxIds = null;
    if (!txIds || txIds.size <= 1)
      return;
    const toMerge = this.undoStack.filter((tx) => txIds.has(tx.id));
    if (toMerge.length === 0)
      return;
    const mergedTx = this.mergeTransactions(toMerge, commandName);
    if (!mergedTx)
      return;
    for (const tx of toMerge)
      this.undoStackBytes -= this.getTransactionByteSize(tx);
    this.undoStack = this.undoStack.filter((tx) => !txIds.has(tx.id));
    this.pushUndo(mergedTx);
  }
  /**
   * Combine recorded entries into one entry that replays all of them and keeps what each owned: the awaited
   * runtime effect, the asynchronous execution playback resumes, and the origin that authored them. An entry
   * owns at most one execution and one origin, so entries owning different ones cannot become one and are left
   * as recorded.
   *
   * @param entries - Recorded entries in stack order
   * @param commandName - Name of the merged entry
   * @returns The merged entry, or null when the entries own more than one execution or origin
   */
  mergeTransactions(entries, commandName) {
    const executions = entries.flatMap((tx) => tx.execution ? [tx.execution] : []);
    if (executions.length > 1)
      return null;
    const origins = new Set(entries.map((tx) => tx.origin ?? null));
    if (origins.size > 1)
      return null;
    const merged = createTransaction(compactConsecutiveReplaces(entries.flatMap((tx) => tx.operations)), commandName);
    if (entries.some((tx) => tx.requiresAsyncEffect))
      merged.requiresAsyncEffect = true;
    if (executions.length === 1)
      merged.execution = executions[0];
    const origin = entries[0].origin;
    if (origin)
      merged.origin = origin;
    return merged;
  }
  /**
   * 暂停历史记录（初始化阶段使用）
   */
  pauseHistory() {
    this._historyPaused = true;
  }
  /**
   * 恢复历史记录（初始化完成后调用）
   * 相当于旧 UndoManager 的 startCapturing()
   */
  resumeHistory() {
    this._historyPaused = false;
  }
  get isHistoryPaused() {
    return this._historyPaused;
  }
  getNormalizedState() {
    if (this._normalizedStateCache?.state === this._state) {
      return this._normalizedStateCache.normalized;
    }
    const normalized = normalizeDomainState(this._state);
    this._normalizedStateCache = {
      state: this._state,
      normalized
    };
    return normalized;
  }
  /**
   * 开始事务批处理
   * 在批处理模式下，所有 apply 调用的操作会被缓冲，直到 commitBatch 时作为单个事务提交
   */
  beginBatch() {
    if (this._batchMode) {
      throw new Error("DomainStore: Nested batch is not supported. Call commitBatch() or abortBatch() first.");
    }
    this._batchMode = true;
    this._batchOps = [];
    this._batchEvents = [];
    this._batchCommandName = null;
    this._batchHasMixedCommandNames = false;
    this._batchStateSnapshot = this._state;
  }
  /**
   * Current lifecycle epoch of one asset.
   *
   * A new epoch starts when a transaction adds, removes or replaces `/assets/<id>`, when a remote
   * transaction replaces its content url, and when a reset presents a different asset entry
   * object. A write captures the epochs it started for before awaiting a receipt and rejects the
   * receipt once the asset moved on; epochs only advance, so a rolled back batch never reuses a
   * generation a caller may already hold.
   *
   * @param assetId - Asset whose lifecycle generation is requested
   * @returns Monotonic lifecycle epoch, `0` for an asset this store never touched
   */
  getAssetEpoch(assetId) {
    return this.assetEpochs.get(assetId) ?? 0;
  }
  advanceAssetEpoch(assetId) {
    this.assetEpochs.set(assetId, this.getAssetEpoch(assetId) + 1);
  }
  /** Advance the assets whose lifecycle entry a transaction wrote, before any listener observes it. */
  recordAssetLifecycle(transaction) {
    for (const operation of transaction.operations) {
      const entryAssetId = getRootAssetId(operation.path);
      if (entryAssetId) {
        this.advanceAssetEpoch(entryAssetId);
        continue;
      }
      if (transaction.commandName !== "remote")
        continue;
      const assetId = getAssetIdOfPath(operation.path);
      if (assetId && operation.path === `/assets/${encodeJsonPointerSegment(assetId)}/url`) {
        this.advanceAssetEpoch(assetId);
      }
    }
  }
  /**
   * Advance every asset whose entry object differs between two presentations of the state.
   *
   * Used by reset, which receives the caller's map: a scene-only reset spreads the current state
   * and reuses every untouched asset entry, while a replaced snapshot or a recreated asset
   * presents new objects. No deep comparison stands in for identity.
   */
  recordAssetEntryReplacement(previous, next) {
    const assetIds = /* @__PURE__ */ new Set([...Object.keys(previous.assets), ...Object.keys(next.assets)]);
    for (const assetId of assetIds) {
      if (previous.assets[assetId] !== next.assets[assetId])
        this.advanceAssetEpoch(assetId);
    }
  }
  /**
   * Advance every asset whose buffered write a rollback abandons.
   *
   * A rollback restores the batch snapshot, so the entries the buffer produced are gone. The
   * buffered ops are the record of which assets those were; comparing the two states by reference
   * cannot answer it, because applying any op rebuilds every untouched asset entry object as well.
   */
  recordBufferedAssetLifecycle() {
    const assetIds = /* @__PURE__ */ new Set();
    for (const operation of this._batchOps) {
      const assetId = getAssetIdOfPath(operation.path);
      if (assetId)
        assetIds.add(assetId);
    }
    for (const assetId of assetIds)
      this.advanceAssetEpoch(assetId);
  }
  /**
   * 提交批处理事务
   * @param commandName - 事务标签
   * @returns 合并后的事务，如果没有操作则返回 null
   */
  commitBatch(commandName, mode = "local", execution) {
    if (!this._batchMode) {
      console.warn("[DomainStore] Not in batch mode");
      return null;
    }
    const ops = compactConsecutiveReplaces(this._batchOps);
    const rawEvents = this._batchEvents;
    const resolvedCommandName = this.resolveBatchCommandName(commandName);
    const previousState = this._batchStateSnapshot;
    if (!ops.length) {
      this.clearBatch();
      return null;
    }
    const deduped = [];
    const seen = /* @__PURE__ */ new Map();
    for (const event of rawEvents) {
      const key = getDomainEventMergeKey(event);
      const existingIndex = seen.get(key);
      if (existingIndex !== void 0) {
        const existing = deduped[existingIndex];
        if (existing.type === "AssetUpdated" && event.type === "AssetUpdated") {
          deduped[existingIndex] = { ...event, previousAsset: existing.previousAsset };
        } else if (existing.type === "ComponentUpdated" && event.type === "ComponentUpdated") {
          const fields = { ...existing.fields, ...event.fields };
          deduped[existingIndex] = {
            ...event,
            changes: { ...existing.changes, ...event.changes },
            ...Object.keys(fields).length > 0 ? { fields } : {}
          };
        } else if (existing.type === "EntityUpdated" && event.type === "EntityUpdated") {
          deduped[existingIndex] = { ...event, changes: { ...existing.changes, ...event.changes } };
        } else {
          deduped[existingIndex] = event;
        }
      } else {
        seen.set(key, deduped.length);
        deduped.push(event);
      }
    }
    const tx = createTransaction(ops, resolvedCommandName, deduped.length > 0 ? deduped : void 0);
    if (execution)
      tx.execution = execution;
    try {
      this.assertCommitAllowed(previousState, this._state, tx, mode);
    } catch (error) {
      this.recordBufferedAssetLifecycle();
      this._state = previousState;
      this.clearBatch();
      throw error;
    }
    this.clearBatch();
    if (mode === "local" && !this._historyPaused) {
      this.pushUndo(tx);
      this.clearRedoStack();
    }
    this.notify(tx, mode);
    return tx;
  }
  /**
   * 放弃批处理
   * 恢复状态到 batch 开始前
   * 不需要 notify，因为投影在 batch 期间没收到任何通知，已经和恢复后的 state 一致
   */
  abortBatch() {
    if (!this._batchMode) {
      console.warn("[DomainStore] Not in batch mode");
      return;
    }
    const snapshot = this._batchStateSnapshot;
    this.recordBufferedAssetLifecycle();
    this.clearBatch();
    if (snapshot) {
      this._state = snapshot;
    }
  }
  get isBatchMode() {
    return this._batchMode;
  }
  get listeners() {
    return listenersMap.get(this);
  }
  get assetEpochs() {
    let epochs = assetEpochsMap.get(this);
    if (!epochs) {
      epochs = /* @__PURE__ */ new Map();
      assetEpochsMap.set(this, epochs);
    }
    return epochs;
  }
  get commitGuards() {
    return commitGuardsMap.get(this);
  }
  get state() {
    return this._state;
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  buildAppliedTransaction(ops, options = {}) {
    const prevState = this._state;
    const applied = applyOperationsDetailed(this._state, ops);
    const nextState = { ...applied.state, version: applied.state.version + 1 };
    const derivedEvents = deriveEventsFromOperations(applied.operations, prevState, nextState);
    const effectiveEvents = mergeDomainEvents(options.events, derivedEvents);
    const tx = createTransaction(
      applied.operations,
      options.commandName,
      effectiveEvents && effectiveEvents.length > 0 ? effectiveEvents : void 0
    );
    if (options.requiresAsyncEffect) {
      tx.requiresAsyncEffect = true;
    }
    if (options.history)
      tx.history = options.history;
    if (options.execution)
      tx.execution = options.execution;
    if (options.origin)
      tx.origin = options.origin;
    return { tx, appliedOps: applied.operations, nextState };
  }
  /**
   * Prepare an atomic Domain write without changing state or history.
   *
   * @param ops - Operations to validate and canonicalize
   * @param commandName - Transaction label
   * @param events - Explicit domain events
   * @param requiresAsyncEffect - Whether undo and redo require an awaited runtime effect
   * @param commitMode - Domain ownership mode used when the prepared write commits
   * @param readPaths - Additional state read by the external effect
   * @param origin - Authoring operation whose undo entries merge, when the write belongs to one
   * @returns A prepared write, or null for a no-op
   */
  prepareApply(ops, commandName, events, requiresAsyncEffect = false, commitMode = "local", readPaths = [], origin) {
    if (!ops.length)
      return null;
    if (this._batchMode) {
      throw new Error("DomainStore: prepared apply is not supported inside a batch");
    }
    const previousState = this._state;
    const result = this.buildAppliedTransaction(ops, { commandName, events, requiresAsyncEffect, origin });
    return {
      kind: "apply",
      previousState,
      transaction: result.tx,
      commitMode,
      readPaths: [...readPaths]
    };
  }
  /**
   * Commit a previously prepared atomic write.
   *
   * @param prepared - The write returned by prepareApply
   * @returns The committed transaction
   */
  commitPreparedApply(prepared) {
    if (this._batchMode) {
      throw new Error("DomainStore: cannot commit a prepared apply inside a batch");
    }
    if (!arePreparedPathsUnchanged(
      prepared.previousState,
      this._state,
      prepared.transaction.operations,
      prepared.readPaths
    )) {
      throw new Error("DomainStore: a prepared path changed before the apply could commit");
    }
    const wasRebased = this._state !== prepared.previousState;
    const rebased = this.buildAppliedTransaction(prepared.transaction.operations, {
      commandName: prepared.transaction.commandName,
      events: wasRebased ? void 0 : prepared.transaction.events,
      requiresAsyncEffect: prepared.transaction.requiresAsyncEffect,
      origin: prepared.transaction.origin
    });
    this.assertCommitAllowed(this._state, rebased.nextState, rebased.tx, prepared.commitMode);
    this._state = rebased.nextState;
    this.recordAssetLifecycle(rebased.tx);
    if (prepared.commitMode === "remote") {
      this.clearRedoStack();
    } else if (prepared.commitMode === "local" && !this._historyPaused) {
      this.pushUndo(rebased.tx);
      this.clearRedoStack();
    }
    this.notify(rebased.tx, prepared.commitMode);
    return rebased.tx;
  }
  /**
   * Prepare undo or redo without changing Domain state or either history stack.
   *
   * @param kind - History direction to prepare
   * @returns The prepared transition, or null when that direction is unavailable
   */
  prepareHistoryTransition(kind) {
    if (this._batchMode) {
      this.commitBatch();
    }
    const sourceTransaction = kind === "undo" ? this.undoStack.at(-1) : this.redoStack.at(-1);
    if (!sourceTransaction)
      return null;
    const operations = kind === "undo" ? inverseOperations(sourceTransaction.operations) : sourceTransaction.operations;
    const result = this.buildAppliedTransaction(operations, {
      commandName: `${kind}:${sourceTransaction.commandName}`,
      requiresAsyncEffect: sourceTransaction.requiresAsyncEffect,
      history: { direction: kind },
      execution: sourceTransaction.execution
    });
    return {
      kind,
      previousState: this._state,
      sourceTransaction,
      transaction: result.tx,
      nextState: result.nextState,
      readPaths: []
    };
  }
  /**
   * Extend a prepared transition with additional canonical read paths while
   * preserving its original Domain baseline.
   *
   * @param prepared - Prepared transition whose baseline must remain unchanged
   * @param readPaths - Canonical JSON Pointer paths consumed by later preparation or effects
   * @returns The same prepared transition shape with a deduplicated read set
   */
  withPreparedReadPaths(prepared, readPaths) {
    return {
      ...prepared,
      readPaths: Array.from(/* @__PURE__ */ new Set([...prepared.readPaths, ...readPaths]))
    };
  }
  prepareReadFence(readPaths) {
    if (readPaths.length === 0) {
      throw new Error("DomainStore: a prepared read fence requires at least one path");
    }
    return {
      kind: "read-fence",
      previousState: this._state,
      readPaths: Array.from(new Set(readPaths))
    };
  }
  commitPreparedReadFence(prepared) {
    if (!arePreparedPathsUnchanged(prepared.previousState, this._state, [], prepared.readPaths)) {
      throw new Error("DomainStore: a prepared path changed before the effect could commit");
    }
  }
  /**
   * Commit a prepared undo or redo after its external effect has succeeded.
   *
   * @param prepared - The transition returned by prepareHistoryTransition
   * @returns The committed undo or redo transaction
   */
  commitPreparedHistoryTransition(prepared) {
    if (this._batchMode) {
      throw new Error("DomainStore: cannot commit prepared history while a batch is active");
    }
    if (!arePreparedPathsUnchanged(
      prepared.previousState,
      this._state,
      prepared.transaction.operations,
      prepared.readPaths
    )) {
      throw new Error("DomainStore: a prepared path changed before the history transition could commit");
    }
    const sourceStack = prepared.kind === "undo" ? this.undoStack : this.redoStack;
    if (sourceStack.at(-1) !== prepared.sourceTransaction) {
      throw new Error("DomainStore: history changed before the prepared transition could commit");
    }
    const wasRebased = this._state !== prepared.previousState;
    const rebased = this.buildAppliedTransaction(prepared.transaction.operations, {
      commandName: prepared.transaction.commandName,
      events: wasRebased ? void 0 : prepared.transaction.events,
      requiresAsyncEffect: prepared.transaction.requiresAsyncEffect,
      history: prepared.transaction.history,
      execution: prepared.transaction.execution
    });
    this.assertCommitAllowed(this._state, rebased.nextState, rebased.tx, "local");
    const source = sourceStack.pop();
    if (prepared.kind === "undo") {
      this.undoStackBytes -= this.getTransactionByteSize(source);
      this.redoStack.push(source);
      this.redoStackBytes += this.getTransactionByteSize(source);
    } else {
      this.redoStackBytes -= this.getTransactionByteSize(source);
      this.pushUndo(source);
    }
    this._state = rebased.nextState;
    this.recordAssetLifecycle(rebased.tx);
    this.notify(rebased.tx, "local");
    return rebased.tx;
  }
  /**
   * Settle an execution into each recorded asset snapshot without moving later
   * authoring changes into earlier entries. The receipt owner supplies the same
   * pure update used for the live asset, including defaults and field removals.
   */
  refreshRecordedAssetState(assetIds, settle, settleProps) {
    const ids = new Set(assetIds);
    if (ids.size === 0)
      return;
    const refresh = (transaction) => {
      let changed = false;
      const operations = transaction.operations.map((operation) => {
        const assetId = getRootAssetId(operation.path);
        if (!assetId) {
          const propsAssetId = operation.path.endsWith("/props") ? getRootAssetId(operation.path.slice(0, -"/props".length)) : null;
          if (!propsAssetId || !ids.has(propsAssetId) || !settleProps)
            return operation;
          if (operation.op !== "add" && operation.op !== "replace" && operation.op !== "remove")
            return operation;
          const oldValue = settleProps(deepClone(operation.oldValue));
          const value = settleProps(
            deepClone(operation.op === "remove" ? void 0 : operation.value)
          );
          changed = true;
          return value === void 0 ? { op: "remove", path: operation.path, oldValue } : { op: "add", path: operation.path, value, ...oldValue === void 0 ? {} : { oldValue } };
        }
        if (!ids.has(assetId))
          return operation;
        if (operation.op === "add") {
          changed = true;
          return { ...operation, value: settle(deepClone(operation.value)) };
        }
        if (operation.op === "remove" && operation.oldValue !== void 0) {
          changed = true;
          return { ...operation, oldValue: settle(deepClone(operation.oldValue)) };
        }
        return operation;
      });
      return changed ? { ...transaction, operations, byteSize: void 0 } : null;
    };
    for (const stack of [this.undoStack, this.redoStack]) {
      for (let index = 0; index < stack.length; index++) {
        const refreshed = refresh(stack[index]);
        if (!refreshed)
          continue;
        const previousBytes = this.getTransactionByteSize(stack[index]);
        stack[index] = refreshed;
        const delta = this.getTransactionByteSize(refreshed) - previousBytes;
        if (stack === this.undoStack)
          this.undoStackBytes += delta;
        else
          this.redoStackBytes += delta;
      }
    }
  }
  /**
   * Drop history entries that only recorded additions which were rolled back.
   *
   * @param assetIds - Assets whose creation produced nothing
   */
  dropRecordedCreations(assetIds) {
    const ids = new Set(assetIds);
    if (ids.size === 0)
      return;
    const keep = (transaction) => {
      if (transaction.operations.length === 0)
        return true;
      if (!transaction.operations.every((operation) => operation.op === "add"))
        return true;
      return !transaction.operations.every((operation) => {
        const assetId = getRootAssetId(operation.path);
        return Boolean(assetId && ids.has(assetId));
      });
    };
    for (const stack of [this.undoStack, this.redoStack]) {
      for (const transaction of stack) {
        if (keep(transaction))
          continue;
        if (stack === this.undoStack)
          this.undoStackBytes -= this.getTransactionByteSize(transaction);
        else
          this.redoStackBytes -= this.getTransactionByteSize(transaction);
      }
    }
    this.undoStack = this.undoStack.filter(keep);
    this.redoStack = this.redoStack.filter(keep);
  }
  /**
   * Observe recorded entries that became unreachable when the redo stack was
   * cleared. Their external resources are no longer retained for playback.
   */
  onHistoryEvicted(listener) {
    const listeners = historyEvictionListenersMap.get(this);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  emitHistoryEvicted(transactions) {
    for (const listener of [...historyEvictionListenersMap.get(this)]) {
      try {
        listener(transactions);
      } catch (error) {
        console.error("DomainStore: history eviction listener threw", error);
      }
    }
  }
  apply(ops, commandName, events, origin) {
    if (!ops.length)
      return null;
    const previousState = this._state;
    const result = this.buildAppliedTransaction(ops, { commandName, events, origin });
    const { tx } = result;
    if (!this._batchMode) {
      this.assertCommitAllowed(previousState, result.nextState, tx, "local");
    }
    this._state = result.nextState;
    this.recordAssetLifecycle(tx);
    if (this._batchMode) {
      this.recordBatchCommandName(commandName);
      this._batchOps.push(...result.appliedOps);
      if (tx.events?.length)
        this._batchEvents.push(...tx.events);
    } else if (!this._historyPaused) {
      this.pushUndo(tx);
      this.clearRedoStack();
    }
    if (!this._batchMode) {
      this.notify(tx, "local");
    }
    return tx;
  }
  /**
   * 应用远端操作（不入 undo 栈）
   * 用于协作场景，避免用户撤销他人的修改
   */
  applyRemote(ops) {
    if (!ops.length)
      return null;
    const previousState = this._state;
    const { tx, nextState } = this.buildAppliedTransaction(ops, { commandName: "remote" });
    this.assertCommitAllowed(previousState, nextState, tx, "remote");
    this._state = nextState;
    this.recordAssetLifecycle(tx);
    this.clearRedoStack();
    this.notify(tx, "remote");
    return tx;
  }
  /**
   * 应用系统内部操作（不入 undo 栈，不清 redo 栈）
   * 用于 Effects 层回填元数据（如 serverId），避免污染用户的 undo/redo 栈
   */
  applySystem(ops) {
    if (!ops.length)
      return null;
    const previousState = this._state;
    const { tx, nextState } = this.buildAppliedTransaction(ops, { commandName: "system" });
    this.assertCommitAllowed(previousState, nextState, tx, "system");
    this._state = nextState;
    this.recordAssetLifecycle(tx);
    this.notify(tx, "system");
    return tx;
  }
  undo() {
    const prepared = this.prepareHistoryTransition("undo");
    if (!prepared)
      return null;
    if (prepared.sourceTransaction.requiresAsyncEffect) {
      throw new Error("DomainStore: this transaction requires the awaited undo transition");
    }
    return this.commitPreparedHistoryTransition(prepared);
  }
  redo() {
    const prepared = this.prepareHistoryTransition("redo");
    if (!prepared)
      return null;
    if (prepared.sourceTransaction.requiresAsyncEffect) {
      throw new Error("DomainStore: this transaction requires the awaited redo transition");
    }
    return this.commitPreparedHistoryTransition(prepared);
  }
  /**
   * Remove every undo/redo operation under one Domain path, dropping transactions left empty.
   * Call only after a rollback removed that subtree, so history can no longer replay against it.
   *
   * @param path - JSON Pointer of the discarded subtree, such as `/assets/<id>`
   */
  discardHistoryPath(path) {
    const touches = (pointer) => pointer === path || pointer?.startsWith(`${path}/`);
    const discard = (stack) => {
      let changed = false;
      const next = stack.flatMap((tx) => {
        const operations = tx.operations.filter(
          (op) => !touches(op.path) && !touches("from" in op ? op.from : void 0)
        );
        if (operations.length === tx.operations.length)
          return [tx];
        changed = true;
        return operations.length > 0 ? [{ ...tx, operations, byteSize: void 0 }] : [];
      });
      return { stack: next, changed };
    };
    const undo = discard(this.undoStack);
    const redo = discard(this.redoStack);
    if (!undo.changed && !redo.changed)
      return;
    this.undoStack = undo.stack;
    this.redoStack = redo.stack;
    this.undoStackBytes = this.undoStack.reduce((sum, tx) => sum + this.getTransactionByteSize(tx), 0);
    this.redoStackBytes = this.redoStack.reduce((sum, tx) => sum + this.getTransactionByteSize(tx), 0);
    this.notify(createTransaction([], "history.discard"), "system");
  }
  reset(state) {
    const tx = createTransaction([], "reset");
    this.clearRedoStack();
    const nextState = deepClone(state);
    this.recordAssetEntryReplacement(this._state, state);
    this._state = nextState;
    this.undoStack = [];
    this.redoStack = [];
    this.undoStackBytes = 0;
    this.redoStackBytes = 0;
    this.notify(tx, "system");
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.unsubscribe(listener);
  }
  unsubscribe(listener) {
    this.listeners.delete(listener);
  }
  /**
   * Register a synchronous pre-commit invariant.
   *
   * Guards run before state/history move. Effect owners use prepared commits,
   * while direct writes that would bypass an awaited runtime transition fail
   * before they can create projection drift.
   */
  addCommitGuard(guard) {
    this.commitGuards.add(guard);
    return () => this.commitGuards.delete(guard);
  }
  _notifying = false;
  assertCommitAllowed(previousState, nextState, transaction, mode) {
    for (const guard of this.commitGuards) {
      guard(previousState, nextState, transaction, mode);
    }
  }
  recordBatchCommandName(commandName) {
    if (!commandName)
      return;
    if (!this._batchCommandName) {
      this._batchCommandName = commandName;
      return;
    }
    if (this._batchCommandName !== commandName) {
      this._batchHasMixedCommandNames = true;
    }
  }
  clearBatch() {
    this._batchMode = false;
    this._batchOps = [];
    this._batchEvents = [];
    this._batchStateSnapshot = null;
    this._batchCommandName = null;
    this._batchHasMixedCommandNames = false;
  }
  resolveBatchCommandName(explicitCommandName) {
    if (explicitCommandName)
      return explicitCommandName;
    if (!this._batchCommandName)
      return "batch";
    if (this._batchHasMixedCommandNames)
      return "batch:mixed";
    return this._batchCommandName;
  }
  notify(tx, mode) {
    if (this._notifying) {
      throw new Error("DomainStore: reentrant notify");
    }
    this._notifying = true;
    try {
      for (const listener of [...this.listeners]) {
        try {
          listener(tx, this._state, mode);
        } catch (err) {
          console.error("DomainStore: listener threw during notify", err);
        }
      }
    } finally {
      this._notifying = false;
    }
  }
};

// packages/model/src/domain/CommandBus.ts
var CommandBus = class {
  constructor(store) {
    this.store = store;
  }
  executeCommand(command, input) {
    const state = this.store.state;
    try {
      const output = command.execute(state, input);
      return {
        operations: output.operations,
        result: output.result,
        events: output.events ?? []
      };
    } catch (error) {
      if (error instanceof CommandError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new CommandError(
        "INVALID_OPERATION" /* INVALID_OPERATION */,
        `Unexpected error in command "${command.name}": ${message}`,
        { originalError: error }
      );
    }
  }
  /**
   * 执行命令
   * @param command - 要执行的命令
   * @param input - 命令输入参数
   * @param commandName - 可选的命令名称（用于调试/日志）
   * @param origin - 发起该写入的操作身份，同一 origin 的 undo 记录会合并为一步
   * @returns 事务和命令结果
   */
  execute(command, input, commandName, origin) {
    const { operations, result, events } = this.executeCommand(command, input);
    const transaction = this.store.apply(operations, commandName ?? command.name, events, origin);
    return { transaction, result, events: transaction?.events ?? events };
  }
  /**
   * Prepare a command without changing Domain state or history.
   *
   * @param command - Command to validate
   * @param input - Command input
   * @param commandName - Transaction label
   * @param requiresAsyncEffect - Whether history playback requires an awaited effect
   * @param commitMode - Domain ownership mode used when the prepared command commits
   * @param readPaths - Additional state read by the external effect
   * @param origin - Authoring operation the committed write belongs to, if any
   * @returns Prepared command output
   */
  prepare(command, input, commandName, requiresAsyncEffect = false, commitMode = "local", readPaths = [], origin) {
    const { operations, result, events } = this.executeCommand(command, input);
    const prepared = this.store.prepareApply(
      operations,
      commandName ?? command.name,
      events,
      requiresAsyncEffect,
      commitMode,
      readPaths,
      origin
    );
    return { prepared, result, events: prepared?.transaction.events ?? events };
  }
  /**
   * Commit a command returned by prepare.
   *
   * @param preparedResult - Prepared command output
   * @returns Committed command output
   */
  commit(preparedResult) {
    const transaction = preparedResult.prepared ? this.store.commitPreparedApply(preparedResult.prepared) : null;
    return {
      transaction,
      result: preparedResult.result,
      events: transaction?.events ?? preparedResult.events
    };
  }
};

// packages/model/src/domain/commands/prefab/OverrideCommands.ts
var import_es_toolkit3 = __toESM(require_dist2());
var TRANSFORM_OVERRIDE_EPSILON = 1e-8;
var TRANSFORM_AXIS_KEYS = ["x", "y", "z"];
function requireSourceComponentKey(component, entityId, componentId) {
  const sourceComponentKey = component.instance?.sourceComponentKey;
  if (!sourceComponentKey) {
    throw new CommandError(
      "INVALID_OPERATION" /* INVALID_OPERATION */,
      `INVALID_OPERATION: prefab source component "${componentId}" on entity "${entityId}" is missing sourceComponentKey`
    );
  }
  return sourceComponentKey;
}
function mergeTransformOverride(existing, incoming) {
  if (!existing && !incoming)
    return void 0;
  return {
    ...existing?.position || incoming?.position ? {
      position: {
        ...existing?.position ?? {},
        ...incoming?.position ?? {}
      }
    } : {},
    ...existing?.rotation || incoming?.rotation ? {
      rotation: {
        ...existing?.rotation ?? {},
        ...incoming?.rotation ?? {}
      }
    } : {},
    ...existing?.scale || incoming?.scale ? {
      scale: {
        ...existing?.scale ?? {},
        ...incoming?.scale ?? {}
      }
    } : {}
  };
}
function mergeEntityOverrideProps(existing, incoming) {
  const merged = { ...existing ?? {}, ...incoming };
  const mergedTransform = mergeTransformOverride(existing?.transform, incoming.transform);
  if (mergedTransform) {
    merged.transform = mergedTransform;
  } else {
    delete merged.transform;
  }
  return merged;
}
function compactDomainValuePatch(base, patch) {
  if (patch === void 0)
    return void 0;
  if (!isPlainRecord(base) || !isPlainRecord(patch)) {
    return (0, import_es_toolkit3.isEqual)(base, patch) ? void 0 : cloneState(patch);
  }
  if (isReferenceValue(base) || isReferenceValue(patch)) {
    return (0, import_es_toolkit3.isEqual)(base, patch) ? void 0 : cloneState(patch);
  }
  const result = {};
  for (const [key, value] of Object.entries(patch)) {
    const compacted = compactDomainValuePatch(base[key], value);
    if (compacted !== void 0)
      result[key] = compacted;
  }
  return Object.keys(result).length ? result : void 0;
}
function compactDomainRecordPatch(base, patch) {
  const compacted = compactDomainValuePatch(base ?? {}, patch);
  return isPlainRecord(compacted) && Object.keys(compacted).length ? compacted : void 0;
}
function compactTransformAgainstSnapshot(snapshot, transform) {
  if (!transform)
    return void 0;
  const next = {};
  for (const key of ["position", "rotation", "scale"]) {
    const axisPatch = transform[key];
    if (!axisPatch)
      continue;
    const compactedAxis = {};
    for (const axis of TRANSFORM_AXIS_KEYS) {
      const value = axisPatch[axis];
      if (value === void 0)
        continue;
      if (Math.abs(value - snapshot[key][axis]) > TRANSFORM_OVERRIDE_EPSILON) {
        compactedAxis[axis] = value;
      }
    }
    if (Object.keys(compactedAxis).length)
      next[key] = cloneState(compactedAxis);
  }
  return Object.keys(next).length ? next : void 0;
}
function compactEntityOverrideAgainstSnapshot(snapshot, props) {
  if (!snapshot)
    return cloneState(props);
  const next = {};
  if (props.name !== void 0 && !(0, import_es_toolkit3.isEqual)(props.name, snapshot.name))
    next.name = cloneState(props.name);
  if (props.isActive !== void 0 && !(0, import_es_toolkit3.isEqual)(props.isActive, snapshot.isActive)) {
    next.isActive = cloneState(props.isActive);
  }
  if (props.layer !== void 0 && !(0, import_es_toolkit3.isEqual)(props.layer, snapshot.layer ?? 0))
    next.layer = cloneState(props.layer);
  if (props.isLocked !== void 0 && !(0, import_es_toolkit3.isEqual)(props.isLocked, snapshot.isLocked ?? false)) {
    next.isLocked = cloneState(props.isLocked);
  }
  const transform = compactTransformAgainstSnapshot(snapshot.transform, props.transform);
  if (transform)
    next.transform = transform;
  return Object.keys(next).length ? next : void 0;
}
function compactComponentOverrideAgainstSnapshot(snapshot, props) {
  if (!snapshot)
    return cloneState(props);
  return compactDomainRecordPatch(snapshot.props ?? {}, props);
}
function createAddedComponentOverrideState(componentId, ownerSourceEntityId, component) {
  return {
    componentId,
    ownerSourceEntityId,
    type: component.type,
    ...component.refId ? { refId: component.refId } : {},
    ...component.scriptKey ? { scriptKey: component.scriptKey } : {},
    props: cloneState(component.props),
    ...component.calls?.length ? { calls: cloneState(component.calls) } : {}
  };
}
function isDomainAncestorOrSelf(state, ancestorId, entityId) {
  const visited = /* @__PURE__ */ new Set();
  let currentId = entityId;
  while (currentId && !visited.has(currentId)) {
    if (currentId === ancestorId)
      return true;
    visited.add(currentId);
    currentId = state.entities[currentId]?.parentId ?? null;
  }
  return false;
}
function resolveAddedEntityParentSceneEntityId(state, binding, parentSourceEntityId, explicitParentSceneEntityId) {
  const boundParentSceneEntityId = getSceneEntityIdForPrefabSource(binding, parentSourceEntityId);
  if (boundParentSceneEntityId && state.entities[boundParentSceneEntityId])
    return boundParentSceneEntityId;
  if (!explicitParentSceneEntityId || !state.entities[explicitParentSceneEntityId]) {
    throw new CommandError(
      "PARENT_NOT_FOUND" /* PARENT_NOT_FOUND */,
      `PARENT_NOT_FOUND: prefab source parent "${parentSourceEntityId}" is not bound in instance "${binding.id}"`,
      { bindingId: binding.id, parentSourceEntityId }
    );
  }
  if (!isDomainAncestorOrSelf(state, binding.instanceRootEntityId, explicitParentSceneEntityId)) {
    throw new CommandError(
      "INVALID_OPERATION" /* INVALID_OPERATION */,
      `INVALID_OPERATION: entity "${explicitParentSceneEntityId}" is outside prefab instance "${binding.id}"`,
      { bindingId: binding.id, parentSceneEntityId: explicitParentSceneEntityId }
    );
  }
  const parentEntity = state.entities[explicitParentSceneEntityId];
  const parentBindingId = parentEntity?.instance?.bindingId;
  const parentBinding = parentBindingId ? state.prefab.bindings[parentBindingId] : void 0;
  const nestedParentSourceEntityId = parentBinding ? getSourceEntityIdForPrefabScene(
    parentBinding,
    explicitParentSceneEntityId,
    parentEntity?.instance?.sourceEntityId
  ) : null;
  if (!parentBinding || parentBinding.id === binding.id || parentBinding.assetKind !== "Prefab" && parentBinding.assetKind !== "glTF" || nestedParentSourceEntityId !== parentSourceEntityId || !isDomainAncestorOrSelf(state, binding.instanceRootEntityId, parentBinding.instanceRootEntityId)) {
    throw new CommandError(
      "PARENT_NOT_FOUND" /* PARENT_NOT_FOUND */,
      `PARENT_NOT_FOUND: prefab source parent "${parentSourceEntityId}" is not bound in instance "${binding.id}"`,
      { bindingId: binding.id, parentSourceEntityId, parentSceneEntityId: explicitParentSceneEntityId }
    );
  }
  return explicitParentSceneEntityId;
}
function requirePrefabSourceEntityId(entity, entityId, binding) {
  if (entity.instance?.role === "added") {
    throw new CommandError(
      "INVALID_OPERATION" /* INVALID_OPERATION */,
      `INVALID_OPERATION: entity "${entityId}" has no sourceEntityId for prefab override`,
      {
        entityId,
        role: entity.instance.role,
        bindingId: entity.instance.bindingId
      }
    );
  }
  const sourceEntityId = getSourceEntityIdForPrefabScene(binding, entityId, entity.instance?.sourceEntityId);
  if (sourceEntityId)
    return sourceEntityId;
  throw new CommandError(
    "INVALID_OPERATION" /* INVALID_OPERATION */,
    `INVALID_OPERATION: entity "${entityId}" has no sourceEntityId for prefab override`,
    {
      entityId,
      role: entity.instance?.role,
      bindingId: entity.instance?.bindingId
    }
  );
}
function pushTransformReplaceOps(ops, encodedEntityId, transform) {
  ops.push({ op: "replace", path: `/entities/${encodedEntityId}/transform/position`, value: transform.position });
  ops.push({ op: "replace", path: `/entities/${encodedEntityId}/transform/rotation`, value: transform.rotation });
  ops.push({ op: "replace", path: `/entities/${encodedEntityId}/transform/scale`, value: transform.scale });
}
var SetEntityOverrideCommand = class {
  name = "prefab.setEntityOverride";
  execute(state, input) {
    const { entityId, overrides } = input;
    const { entity } = findBindingByEntityId(state, entityId);
    const ops = [];
    const encodedEntityId = encodeJsonPointerSegment(entityId);
    const owner = entity.instance?.role === "added" ? null : resolveInstanceRootPropsOwner(state, entityId);
    if (!owner) {
      throw new CommandError(
        "INVALID_OPERATION" /* INVALID_OPERATION */,
        `INVALID_OPERATION: entity "${entityId}" has no sourceEntityId for prefab override`,
        { entityId, role: entity.instance?.role, bindingId: entity.instance?.bindingId }
      );
    }
    const binding = owner.binding;
    const sourceEntityId = owner.sourceEntityId;
    const encodedSourceId = encodeJsonPointerSegment(sourceEntityId);
    const encodedBindingId = encodeJsonPointerSegment(binding.id);
    const sourceSnapshot = binding.sourceEntitySnapshots?.[sourceEntityId];
    const existingOverride = binding.overrides.entityProps[sourceEntityId];
    if (overrides.name !== void 0) {
      ops.push({ op: "replace", path: `/entities/${encodedEntityId}/name`, value: overrides.name });
    }
    if (overrides.isActive !== void 0) {
      ops.push({ op: "replace", path: `/entities/${encodedEntityId}/isActive`, value: overrides.isActive });
    }
    if (overrides.isLocked !== void 0) {
      const isLockedOp = state.entities[entityId]?.isLocked !== void 0 ? "replace" : "add";
      ops.push({ op: isLockedOp, path: `/entities/${encodedEntityId}/isLocked`, value: overrides.isLocked });
    }
    if (overrides.layer !== void 0) {
      const layerOp = state.entities[entityId]?.layer !== void 0 ? "replace" : "add";
      ops.push({ op: layerOp, path: `/entities/${encodedEntityId}/layer`, value: overrides.layer });
    }
    if (overrides.transform !== void 0) {
      const t = overrides.transform;
      const currentTransform = state.entities[entityId]?.transform;
      if (t.position) {
        ops.push({
          op: "replace",
          path: `/entities/${encodedEntityId}/transform/position`,
          value: { ...currentTransform?.position, ...t.position }
        });
      }
      if (t.rotation) {
        ops.push({
          op: "replace",
          path: `/entities/${encodedEntityId}/transform/rotation`,
          value: { ...currentTransform?.rotation, ...t.rotation }
        });
      }
      if (t.scale) {
        ops.push({
          op: "replace",
          path: `/entities/${encodedEntityId}/transform/scale`,
          value: { ...currentTransform?.scale, ...t.scale }
        });
      }
    }
    const merged = mergeEntityOverrideProps(existingOverride, overrides);
    const compacted = compactEntityOverrideAgainstSnapshot(sourceSnapshot, merged);
    let overrideChangeAction = null;
    if (compacted) {
      ops.push({
        op: existingOverride ? "replace" : "add",
        path: `/prefab/bindings/${encodedBindingId}/overrides/entityProps/${encodedSourceId}`,
        value: compacted
      });
      overrideChangeAction = "set";
    } else if (existingOverride) {
      ops.push({
        op: "remove",
        path: `/prefab/bindings/${encodedBindingId}/overrides/entityProps/${encodedSourceId}`
      });
      overrideChangeAction = "remove";
    }
    const events = [
      {
        type: "EntityUpdated",
        entityId,
        changes: cloneState(overrides)
      }
    ];
    if (overrideChangeAction) {
      events.push({
        type: "PrefabOverrideChanged",
        action: overrideChangeAction,
        bindingId: binding.id,
        assetId: binding.assetId,
        bucket: "entityProps",
        entityId,
        sourceEntityId
      });
    }
    return { operations: ops, result: void 0, events };
  }
};
var SetComponentOverrideCommand = class {
  name = "prefab.setComponentOverride";
  execute(state, input) {
    const { entityId, componentId, overrides } = input;
    const { entity, binding } = findBindingByEntityId(state, entityId);
    const ops = [];
    const encodedEntityId = encodeJsonPointerSegment(entityId);
    const encodedComponentId = encodeJsonPointerSegment(componentId);
    const sourceEntityId = requirePrefabSourceEntityId(entity, entityId, binding);
    const encodedSourceId = encodeJsonPointerSegment(sourceEntityId);
    const encodedBindingId = encodeJsonPointerSegment(binding.id);
    const component = entity.components[componentId];
    if (!component) {
      throw new CommandError(
        "COMPONENT_NOT_FOUND" /* COMPONENT_NOT_FOUND */,
        `COMPONENT_NOT_FOUND: component "${componentId}" not found on entity "${entityId}"`
      );
    }
    for (const [propName, propValue] of Object.entries(overrides)) {
      const propExists = Object.prototype.hasOwnProperty.call(component.props, propName);
      ops.push({
        op: propExists ? "replace" : "add",
        path: `/entities/${encodedEntityId}/components/${encodedComponentId}/props/${encodeJsonPointerSegment(
          propName
        )}`,
        value: propValue
      });
    }
    const sourceComponentKey = requireSourceComponentKey(component, entityId, componentId);
    const encodedSourceCompKey = encodeJsonPointerSegment(sourceComponentKey);
    const existingEntityOverrides = binding.overrides.componentProps[sourceEntityId];
    const existingCompOverrides = existingEntityOverrides?.[sourceComponentKey];
    const existingProps = existingCompOverrides?.props ?? {};
    const merged = { ...existingProps, ...overrides };
    const compacted = compactComponentOverrideAgainstSnapshot(
      binding.sourceEntitySnapshots?.[sourceEntityId]?.components[sourceComponentKey],
      merged
    );
    const existingCalls = existingCompOverrides?.calls ?? [];
    const nextEntry = {
      ...compacted && Object.keys(compacted).length ? { props: compacted } : {},
      ...existingCalls.length ? { calls: existingCalls } : {}
    };
    let overrideChangeAction = null;
    if (Object.keys(nextEntry).length > 0) {
      if (existingEntityOverrides !== void 0 && Object.keys(existingEntityOverrides).length > 0) {
        ops.push({
          op: existingCompOverrides ? "replace" : "add",
          path: `/prefab/bindings/${encodedBindingId}/overrides/componentProps/${encodedSourceId}/${encodedSourceCompKey}`,
          value: nextEntry
        });
      } else {
        ops.push({
          op: "add",
          path: `/prefab/bindings/${encodedBindingId}/overrides/componentProps/${encodedSourceId}`,
          value: { [sourceComponentKey]: nextEntry }
        });
      }
      overrideChangeAction = "set";
    } else if (existingCompOverrides) {
      const existingKeys = Object.keys(existingEntityOverrides ?? {});
      ops.push({
        op: "remove",
        path: existingKeys.length === 1 ? `/prefab/bindings/${encodedBindingId}/overrides/componentProps/${encodedSourceId}` : `/prefab/bindings/${encodedBindingId}/overrides/componentProps/${encodedSourceId}/${encodedSourceCompKey}`
      });
      overrideChangeAction = "remove";
    }
    const events = [
      {
        type: "ComponentUpdated",
        entityId,
        componentId,
        changes: cloneState(overrides)
      }
    ];
    if (overrideChangeAction) {
      events.push({
        type: "PrefabOverrideChanged",
        action: overrideChangeAction,
        bindingId: binding.id,
        assetId: binding.assetId,
        bucket: "componentProps",
        entityId,
        sourceEntityId,
        componentId: sourceComponentKey
      });
    }
    return { operations: ops, result: void 0, events };
  }
};
var MoveEntityInstanceClaimCommand = class {
  name = "prefab.moveEntityInstanceClaim";
  execute(state, input) {
    const { entityId, target } = input;
    const binding = target ? state.prefab.bindings[target.bindingId] : void 0;
    if (target && !binding) {
      throw new CommandError(
        "BINDING_NOT_FOUND" /* BINDING_NOT_FOUND */,
        `BINDING_NOT_FOUND: binding "${target.bindingId}" not found`
      );
    }
    const entity = state.entities[entityId];
    if (!entity) {
      throw new CommandError("ENTITY_NOT_FOUND" /* ENTITY_NOT_FOUND */, `ENTITY_NOT_FOUND: entity "${entityId}" not found`);
    }
    const subtreeIds = collectSubtree(state, entityId);
    const subtreeIdSet = new Set(subtreeIds);
    for (const subtreeEntityId of subtreeIds) {
      const subtreeEntity = state.entities[subtreeEntityId];
      if (!subtreeEntity?.instance)
        continue;
      if (subtreeEntity.instance.role === "added")
        continue;
      if (isNestedInstanceSubtreeEntity(state, subtreeEntity, target?.bindingId ?? null, subtreeIdSet))
        continue;
      throw new CommandError(
        "INVALID_OPERATION" /* INVALID_OPERATION */,
        `INVALID_OPERATION: entity "${subtreeEntityId}" already has an instance link`,
        {
          entityId: subtreeEntityId,
          bindingId: subtreeEntity.instance.bindingId,
          role: subtreeEntity.instance.role
        }
      );
    }
    const parentSceneEntityId = target ? resolveAddedEntityParentSceneEntityId(state, binding, target.parentSourceEntityId, input.parentSceneEntityId) : input.parentSceneEntityId;
    if (parentSceneEntityId && !state.entities[parentSceneEntityId]) {
      throw new CommandError(
        "PARENT_NOT_FOUND" /* PARENT_NOT_FOUND */,
        `PARENT_NOT_FOUND: parent entity "${parentSceneEntityId}" not found`,
        { parentSceneEntityId }
      );
    }
    if (entityId === parentSceneEntityId || parentSceneEntityId && wouldCreateCycle(state, entityId, parentSceneEntityId)) {
      throw new CommandError(
        "CYCLE_DETECTED" /* CYCLE_DETECTED */,
        `Cannot move entity "${entityId}" under "${parentSceneEntityId}"`
      );
    }
    const ops = [];
    const events = [];
    const encodedEntityId = encodeJsonPointerSegment(entityId);
    const bindingRootInsideSubtree = (bindingId) => {
      const binding2 = bindingId ? state.prefab.bindings[bindingId] : void 0;
      return Boolean(binding2 && subtreeIdSet.has(binding2.instanceRootEntityId));
    };
    for (const subtreeEntityId of subtreeIds) {
      const encodedSubtreeEntityId = encodeJsonPointerSegment(subtreeEntityId);
      for (const [bindingId, candidate] of Object.entries(state.prefab.bindings)) {
        if (bindingId === target?.bindingId || subtreeIdSet.has(candidate.instanceRootEntityId))
          continue;
        const removedRecord = candidate.overrides.addedEntities[subtreeEntityId];
        if (!removedRecord)
          continue;
        ops.push({
          op: "remove",
          path: `/prefab/bindings/${encodeJsonPointerSegment(bindingId)}/overrides/addedEntities/${encodedSubtreeEntityId}`
        });
        events.push({
          type: "PrefabOverrideChanged",
          action: "remove",
          bindingId,
          assetId: candidate.assetId,
          bucket: "addedEntities",
          entityId: subtreeEntityId,
          sourceEntityId: removedRecord.parentSourceEntityId
        });
      }
      const subtreeEntity = state.entities[subtreeEntityId];
      if (subtreeEntity?.instance?.role === "added" && subtreeEntity.instance.bindingId !== target?.bindingId && !bindingRootInsideSubtree(subtreeEntity.instance.bindingId)) {
        ops.push({ op: "remove", path: `/entities/${encodedSubtreeEntityId}/instance` });
      }
      for (const [componentId, component] of Object.entries(subtreeEntity?.components ?? {})) {
        if (component.instance?.role !== "added" || component.instance.bindingId === target?.bindingId || bindingRootInsideSubtree(component.instance.bindingId)) {
          continue;
        }
        ops.push({
          op: "remove",
          path: `/entities/${encodedSubtreeEntityId}/components/${encodeJsonPointerSegment(componentId)}/instance`
        });
      }
    }
    const oldParentId = entity.parentId;
    const { siblings: oldSiblings, arrayPath: oldArrayPath } = getSiblingsInfo(state, oldParentId);
    const oldIndex = oldSiblings.indexOf(entityId);
    const sameParent = oldParentId === parentSceneEntityId;
    const nextLocalTransform = sameParent || input.preserveWorldTransform === false ? null : getLocalTransformPreservingWorld(state, entityId, parentSceneEntityId);
    const { siblings: parentChildren, arrayPath: parentArrayPath } = getSiblingsInfo(state, parentSceneEntityId);
    const requestedIndex = input.index ?? parentChildren.length;
    const maxIndex = Math.max(0, parentChildren.length - (sameParent && oldIndex >= 0 ? 1 : 0));
    const adjustedIndex = sameParent && oldIndex >= 0 && oldIndex < requestedIndex ? requestedIndex - 1 : requestedIndex;
    const targetIndex = Math.min(Math.max(adjustedIndex, 0), maxIndex);
    if (oldIndex >= 0 && (!sameParent || oldIndex !== targetIndex)) {
      ops.push({ op: "remove", path: `${oldArrayPath}/${oldIndex}` });
    }
    if (!sameParent) {
      ops.push({ op: "replace", path: `/entities/${encodedEntityId}/parentId`, value: parentSceneEntityId });
      if (nextLocalTransform && !transformsClose(entity.transform, nextLocalTransform)) {
        pushTransformReplaceOps(ops, encodedEntityId, nextLocalTransform);
      }
    }
    if (oldIndex === -1 || !sameParent || oldIndex !== targetIndex) {
      ops.push({ op: "add", path: `${parentArrayPath}/${targetIndex}`, value: entityId });
    }
    if (target && binding) {
      const encodedBindingId = encodeJsonPointerSegment(target.bindingId);
      ops.push(...buildAddedInstanceLinkOps(state, subtreeIds, binding));
      const addedOverride = {
        entityId,
        parentSourceEntityId: target.parentSourceEntityId
      };
      const existingAddedOverride = binding.overrides.addedEntities[entityId];
      ops.push({
        op: existingAddedOverride ? "replace" : "add",
        path: `/prefab/bindings/${encodedBindingId}/overrides/addedEntities/${encodedEntityId}`,
        value: addedOverride
      });
      events.push({
        type: "PrefabOverrideChanged",
        action: "add",
        bindingId: target.bindingId,
        assetId: binding.assetId,
        bucket: "addedEntities",
        entityId,
        sourceEntityId: target.parentSourceEntityId
      });
    }
    return { operations: ops, result: void 0, events };
  }
};
var RemoveSourceEntityOverrideCommand = class {
  name = "prefab.removeSourceEntityOverride";
  execute(state, input) {
    const { entityId } = input;
    const { entity, binding } = findBindingByEntityId(state, entityId);
    const ops = [];
    const encodedBindingId = encodeJsonPointerSegment(binding.id);
    const toRemove = [];
    const collectDescendants = (eid) => {
      toRemove.push(eid);
      const e = state.entities[eid];
      if (e) {
        for (const childId of e.children) {
          collectDescendants(childId);
        }
      }
    };
    collectDescendants(entityId);
    if (entity.parentId) {
      const parent = state.entities[entity.parentId];
      if (parent) {
        const childIdx = parent.children.indexOf(entityId);
        if (childIdx >= 0) {
          ops.push({
            op: "remove",
            path: `/entities/${encodeJsonPointerSegment(entity.parentId)}/children/${childIdx}`
          });
        }
      }
    } else {
      const rootIdx = state.scene.rootEntityIds.indexOf(entityId);
      if (rootIdx >= 0) {
        ops.push({
          op: "remove",
          path: `/scene/rootEntityIds/${rootIdx}`
        });
      }
    }
    const subtreeSnapshots = Object.fromEntries(
      toRemove.map((eid) => [eid, cloneState(state.entities[eid])])
    );
    const removedSourceIds = /* @__PURE__ */ new Set();
    for (const eid of toRemove) {
      const encodedEid = encodeJsonPointerSegment(eid);
      ops.push({ op: "remove", path: `/entities/${encodedEid}` });
      const sourceId = getSourceEntityIdForPrefabScene(binding, eid, state.entities[eid]?.instance?.sourceEntityId);
      if (sourceId) {
        removedSourceIds.add(sourceId);
        const encodedSrcId = encodeJsonPointerSegment(sourceId);
        ops.push({
          op: "add",
          path: `/prefab/bindings/${encodedBindingId}/overrides/removedEntities/${encodedSrcId}`,
          value: true
        });
        if (binding.sourceToSceneEntity?.[sourceId] != null) {
          ops.push({
            op: "remove",
            path: `/prefab/bindings/${encodedBindingId}/sourceToSceneEntity/${encodedSrcId}`
          });
        }
      }
    }
    const pushRemoveSourceBucket = (bucket, sourceId) => {
      if (binding.overrides[bucket]?.[sourceId] === void 0)
        return;
      ops.push({
        op: "remove",
        path: `/prefab/bindings/${encodedBindingId}/overrides/${bucket}/${encodeJsonPointerSegment(sourceId)}`
      });
    };
    for (const removedSourceId of removedSourceIds) {
      pushRemoveSourceBucket("entityProps", removedSourceId);
      pushRemoveSourceBucket("componentProps", removedSourceId);
      pushRemoveSourceBucket("removedComponents", removedSourceId);
      pushRemoveSourceBucket("addedComponents", removedSourceId);
    }
    if (binding.instanceRootEntityId === entityId) {
      const containing = resolveContainingPrefabBindingForInstance(state, binding);
      if (containing?.sourceEntityId) {
        ops.push({
          op: "add",
          path: `/prefab/bindings/${encodeJsonPointerSegment(
            containing.binding.id
          )}/overrides/removedEntities/${encodeJsonPointerSegment(containing.sourceEntityId)}`,
          value: true
        });
      }
    }
    const removedSceneEntityIds = new Set(toRemove);
    for (const [addedEntityId, added] of Object.entries(binding.overrides.addedEntities)) {
      if (!removedSourceIds.has(added.parentSourceEntityId) && !removedSceneEntityIds.has(addedEntityId))
        continue;
      ops.push({
        op: "remove",
        path: `/prefab/bindings/${encodedBindingId}/overrides/addedEntities/${encodeJsonPointerSegment(addedEntityId)}`
      });
    }
    const events = [
      {
        type: "EntityDeleted",
        entityId,
        snapshot: subtreeSnapshots[entityId],
        subtreeIds: cloneState(toRemove),
        subtree: subtreeSnapshots
      },
      {
        type: "PrefabOverrideChanged",
        action: "add",
        bindingId: binding.id,
        assetId: binding.assetId,
        bucket: "removedEntities",
        entityId,
        sourceEntityId: entity.instance?.sourceEntityId
      }
    ];
    return { operations: ops, result: void 0, events };
  }
};
var AddComponentOverrideCommand = class {
  name = "prefab.addComponentOverride";
  execute(state, input) {
    const { entityId, componentId, type, props } = input;
    const { entity, binding } = findBindingByEntityId(state, entityId);
    const ops = [];
    const encodedEntityId = encodeJsonPointerSegment(entityId);
    const encodedComponentId = encodeJsonPointerSegment(componentId);
    const encodedBindingId = encodeJsonPointerSegment(binding.id);
    const sourceEntityId = requirePrefabSourceEntityId(entity, entityId, binding);
    const encodedSourceId = encodeJsonPointerSegment(sourceEntityId);
    const component = {
      type,
      ...input.refId ? { refId: input.refId } : {},
      ...input.scriptKey ? { scriptKey: input.scriptKey } : {},
      props,
      ...input.calls?.length ? { calls: cloneState(input.calls) } : {},
      instance: {
        bindingId: binding.id,
        role: "added"
      }
    };
    ops.push({
      op: "add",
      path: `/entities/${encodedEntityId}/components/${encodedComponentId}`,
      value: component
    });
    const addedOverride = createAddedComponentOverrideState(componentId, sourceEntityId, component);
    const existingEntityAddedComps = binding.overrides.addedComponents[sourceEntityId];
    if (existingEntityAddedComps) {
      ops.push({
        op: "add",
        path: `/prefab/bindings/${encodedBindingId}/overrides/addedComponents/${encodedSourceId}/${encodedComponentId}`,
        value: addedOverride
      });
    } else {
      ops.push({
        op: "add",
        path: `/prefab/bindings/${encodedBindingId}/overrides/addedComponents/${encodedSourceId}`,
        value: { [componentId]: addedOverride }
      });
    }
    const events = [
      {
        type: "ComponentAdded",
        entityId,
        componentId,
        component: cloneState(component)
      },
      {
        type: "PrefabOverrideChanged",
        action: "add",
        bindingId: binding.id,
        assetId: binding.assetId,
        bucket: "addedComponents",
        entityId,
        sourceEntityId,
        componentId
      }
    ];
    return { operations: ops, result: void 0, events };
  }
};
var UpdateAddedComponentOverrideCommand = class {
  name = "prefab.updateAddedComponentOverride";
  execute(state, input) {
    const { entityId, componentId, setProps, removeProps = [] } = input;
    const { entity, binding } = findBindingByEntityId(state, entityId);
    const sourceEntityId = requirePrefabSourceEntityId(entity, entityId, binding);
    const component = entity.components[componentId];
    if (!component) {
      throw new CommandError(
        "COMPONENT_NOT_FOUND" /* COMPONENT_NOT_FOUND */,
        `COMPONENT_NOT_FOUND: component "${componentId}" not found on entity "${entityId}"`
      );
    }
    if (component.instance?.role !== "added") {
      throw new CommandError(
        "INVALID_OPERATION" /* INVALID_OPERATION */,
        `INVALID_OPERATION: component "${componentId}" on entity "${entityId}" is not a prefab added component`
      );
    }
    const addedOverride = binding.overrides.addedComponents[sourceEntityId]?.[componentId];
    if (!addedOverride) {
      throw new CommandError(
        "INVALID_OPERATION" /* INVALID_OPERATION */,
        `INVALID_OPERATION: prefab added component "${componentId}" on source entity "${sourceEntityId}" is missing addedComponents override`
      );
    }
    const ops = [];
    const changes = {};
    const nextProps = { ...component.props };
    const encodedEntityId = encodeJsonPointerSegment(entityId);
    const encodedComponentId = encodeJsonPointerSegment(componentId);
    for (const propName of removeProps) {
      if (Object.prototype.hasOwnProperty.call(setProps, propName)) {
        throw new CommandError(
          "INVALID_OPERATION" /* INVALID_OPERATION */,
          `Component prop "${propName}" cannot be set and removed in the same prefab-added update`
        );
      }
    }
    for (const [propName, propValue] of Object.entries(setProps)) {
      if ((0, import_es_toolkit3.isEqual)(component.props[propName], propValue))
        continue;
      const encodedPropName = encodeJsonPointerSegment(propName);
      const propExists = Object.prototype.hasOwnProperty.call(component.props, propName);
      ops.push({
        op: propExists ? "replace" : "add",
        path: `/entities/${encodedEntityId}/components/${encodedComponentId}/props/${encodedPropName}`,
        value: cloneState(propValue)
      });
      nextProps[propName] = cloneState(propValue);
      changes[propName] = cloneState(propValue);
    }
    for (const propName of removeProps) {
      if (!Object.prototype.hasOwnProperty.call(component.props, propName))
        continue;
      ops.push({
        op: "remove",
        path: `/entities/${encodedEntityId}/components/${encodedComponentId}/props/${encodeJsonPointerSegment(
          propName
        )}`
      });
      delete nextProps[propName];
      changes[propName] = void 0;
    }
    const nextAddedOverride = createAddedComponentOverrideState(componentId, sourceEntityId, {
      ...component,
      props: nextProps
    });
    if (!(0, import_es_toolkit3.isEqual)(addedOverride, nextAddedOverride)) {
      ops.push({
        op: "replace",
        path: `/prefab/bindings/${encodeJsonPointerSegment(
          binding.id
        )}/overrides/addedComponents/${encodeJsonPointerSegment(sourceEntityId)}/${encodedComponentId}`,
        value: nextAddedOverride
      });
    }
    const events = [];
    if (Object.keys(changes).length > 0) {
      events.push({
        type: "ComponentUpdated",
        entityId,
        componentId,
        changes
      });
    }
    if (ops.length > 0) {
      events.push({
        type: "PrefabOverrideChanged",
        action: "set",
        bindingId: binding.id,
        assetId: binding.assetId,
        bucket: "addedComponents",
        entityId,
        sourceEntityId,
        componentId
      });
    }
    return { operations: ops, result: void 0, events };
  }
};
var RemoveSourceComponentOverrideCommand = class {
  name = "prefab.removeSourceComponentOverride";
  execute(state, input) {
    const { entityId, componentId } = input;
    const { entity, binding } = findBindingByEntityId(state, entityId);
    const ops = [];
    const encodedEntityId = encodeJsonPointerSegment(entityId);
    const encodedComponentId = encodeJsonPointerSegment(componentId);
    const encodedBindingId = encodeJsonPointerSegment(binding.id);
    const sourceEntityId = requirePrefabSourceEntityId(entity, entityId, binding);
    const encodedSourceId = encodeJsonPointerSegment(sourceEntityId);
    const component = entity.components[componentId];
    if (!component) {
      throw new CommandError(
        "COMPONENT_NOT_FOUND" /* COMPONENT_NOT_FOUND */,
        `COMPONENT_NOT_FOUND: component "${componentId}" not found on entity "${entityId}"`
      );
    }
    ops.push({
      op: "remove",
      path: `/entities/${encodedEntityId}/components/${encodedComponentId}`
    });
    const sourceComponentKey = requireSourceComponentKey(component, entityId, componentId);
    const encodedSourceCompKey = encodeJsonPointerSegment(sourceComponentKey);
    const existingEntityRemovedComps = binding.overrides.removedComponents[sourceEntityId];
    if (existingEntityRemovedComps) {
      ops.push({
        op: "add",
        path: `/prefab/bindings/${encodedBindingId}/overrides/removedComponents/${encodedSourceId}/${encodedSourceCompKey}`,
        value: true
      });
    } else {
      ops.push({
        op: "add",
        path: `/prefab/bindings/${encodedBindingId}/overrides/removedComponents/${encodedSourceId}`,
        value: { [sourceComponentKey]: true }
      });
    }
    const events = [
      {
        type: "ComponentRemoved",
        entityId,
        componentId,
        snapshot: cloneState(component)
      },
      {
        type: "PrefabOverrideChanged",
        action: "add",
        bindingId: binding.id,
        assetId: binding.assetId,
        bucket: "removedComponents",
        entityId,
        sourceEntityId,
        componentId: sourceComponentKey
      }
    ];
    return { operations: ops, result: void 0, events };
  }
};

// packages/model/src/domain/commands/ComponentCommands.ts
var import_uuid3 = __toESM(require_dist());
var import_es_toolkit4 = __toESM(require_dist2());
function generateComponentId() {
  return `comp-${(0, import_uuid3.v4)().slice(0, 8)}`;
}
function assertEntityExists(state, entityId) {
  const entity = state.entities[entityId];
  if (!entity) {
    throw new CommandError("ENTITY_NOT_FOUND" /* ENTITY_NOT_FOUND */, `Entity "${entityId}" not found`);
  }
  return entity;
}
var AddComponentCommand = class {
  name = "component.add";
  execute(state, input) {
    const { entityId, type, props } = input;
    const encodedEntityId = encodeJsonPointerSegment(entityId);
    const componentId = input.componentId ?? generateComponentId();
    const encodedComponentId = encodeJsonPointerSegment(componentId);
    const entity = assertEntityExists(state, entityId);
    if (entity.components[componentId]) {
      throw new CommandError(
        "DUPLICATE_ID" /* DUPLICATE_ID */,
        `Component "${componentId}" already exists on entity "${entityId}"`
      );
    }
    const component = {
      type,
      ...input.refId ? { refId: input.refId } : {},
      ...input.scriptKey ? { scriptKey: input.scriptKey } : {},
      props: props ?? {},
      ...input.calls?.length ? { calls: input.calls } : {}
    };
    const ops = [
      { op: "add", path: `/entities/${encodedEntityId}/components/${encodedComponentId}`, value: component }
    ];
    return {
      operations: ops,
      result: componentId,
      events: [
        {
          type: "ComponentAdded",
          entityId,
          componentId,
          component: cloneState(component)
        }
      ]
    };
  }
};
var UpdateComponentCommand = class {
  name = "component.update";
  execute(state, input) {
    const { entityId, componentId, props, removeProps } = input;
    const encodedEntityId = encodeJsonPointerSegment(entityId);
    const encodedComponentId = encodeJsonPointerSegment(componentId);
    const entity = assertEntityExists(state, entityId);
    const component = entity.components[componentId];
    if (!component) {
      throw new CommandError(
        "COMPONENT_NOT_FOUND" /* COMPONENT_NOT_FOUND */,
        `Component "${componentId}" not found on entity "${entityId}"`
      );
    }
    const ops = [];
    const changes = {};
    const fields = {};
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if ((0, import_es_toolkit4.isEqual)(component.props[key], value))
          continue;
        const encodedKey = encodeJsonPointerSegment(key);
        const path = `/entities/${encodedEntityId}/components/${encodedComponentId}/props/${encodedKey}`;
        const existingValue = component.props[key];
        if (existingValue !== void 0) {
          ops.push({ op: "replace", path, value });
        } else {
          ops.push({ op: "add", path, value });
        }
        changes[key] = cloneState(value);
      }
    }
    for (const key of removeProps ?? []) {
      if (props && Object.prototype.hasOwnProperty.call(props, key)) {
        throw new CommandError(
          "INVALID_OPERATION" /* INVALID_OPERATION */,
          `Component prop "${key}" cannot be set and removed in the same update`
        );
      }
      if (!Object.prototype.hasOwnProperty.call(component.props, key))
        continue;
      const encodedKey = encodeJsonPointerSegment(key);
      ops.push({
        op: "remove",
        path: `/entities/${encodedEntityId}/components/${encodedComponentId}/props/${encodedKey}`
      });
      changes[key] = void 0;
    }
    if (input.refId !== void 0) {
      const path = `/entities/${encodedEntityId}/components/${encodedComponentId}/refId`;
      const next = input.refId === "" || input.refId === null ? null : input.refId;
      const existing = component.refId;
      if (next === null) {
        if (existing !== void 0) {
          ops.push({ op: "remove", path });
          fields.refId = null;
        }
      } else if (existing === void 0) {
        ops.push({ op: "add", path, value: next });
        fields.refId = next;
      } else if (!(0, import_es_toolkit4.isEqual)(existing, next)) {
        ops.push({ op: "replace", path, value: next });
        fields.refId = next;
      }
    }
    if (input.scriptKey !== void 0) {
      const path = `/entities/${encodedEntityId}/components/${encodedComponentId}/scriptKey`;
      const next = input.scriptKey === "" || input.scriptKey === null ? null : input.scriptKey;
      const existing = component.scriptKey;
      if (next === null) {
        if (existing !== void 0) {
          ops.push({ op: "remove", path });
          fields.scriptKey = null;
        }
      } else if (existing === void 0) {
        ops.push({ op: "add", path, value: next });
        fields.scriptKey = next;
      } else if (!(0, import_es_toolkit4.isEqual)(existing, next)) {
        ops.push({ op: "replace", path, value: next });
        fields.scriptKey = next;
      }
    }
    if (input.calls !== void 0) {
      const path = `/entities/${encodedEntityId}/components/${encodedComponentId}/calls`;
      const next = input.calls === null || Array.isArray(input.calls) && input.calls.length === 0 ? null : input.calls;
      const existing = component.calls;
      if (next === null) {
        if (existing !== void 0) {
          ops.push({ op: "remove", path });
          changes.calls = null;
        }
      } else if (existing === void 0) {
        ops.push({ op: "add", path, value: cloneState(next) });
        changes.calls = cloneState(next);
      } else if (!(0, import_es_toolkit4.isEqual)(existing, next)) {
        ops.push({ op: "replace", path, value: cloneState(next) });
        changes.calls = cloneState(next);
      }
    }
    const events = ops.length > 0 ? [
      {
        type: "ComponentUpdated",
        entityId,
        componentId,
        changes,
        ...Object.keys(fields).length > 0 ? { fields } : {}
      }
    ] : [];
    return { operations: ops, result: void 0, events };
  }
};
var RemoveComponentCommand = class {
  name = "component.remove";
  execute(state, input) {
    const { entityId, componentId } = input;
    const encodedEntityId = encodeJsonPointerSegment(entityId);
    const encodedComponentId = encodeJsonPointerSegment(componentId);
    const entity = assertEntityExists(state, entityId);
    if (!entity.components[componentId]) {
      throw new CommandError(
        "COMPONENT_NOT_FOUND" /* COMPONENT_NOT_FOUND */,
        `Component "${componentId}" not found on entity "${entityId}"`
      );
    }
    const ops = [{ op: "remove", path: `/entities/${encodedEntityId}/components/${encodedComponentId}` }];
    return {
      operations: ops,
      result: void 0,
      events: [
        {
          type: "ComponentRemoved",
          entityId,
          componentId,
          snapshot: cloneState(entity.components[componentId])
        }
      ]
    };
  }
};

// runtime-source-model.ts
function runtimeSourceReferenceIds(source, options = {}) {
  const state = createRuntimeBuildState(source, (path) => path, options);
  const { sourceIndex } = state;
  if ("scene" in source && readNestedOverridesSidecar(source).length) {
    const domain = hydrate(source, options), roots = new Set(source.entities.map((entity) => entity.id));
    const entries = readNestedOverridesSidecar(source);
    const plans = Object.values(domain.prefab.bindings).flatMap((binding) => {
      const address = getNestedInstanceAddress(domain.prefab, binding, roots);
      if (!address || !entries.some((entry) => entry.rootSceneEntityId === address.rootSceneEntityId && JSON.stringify(entry.sourceEntityPath) === JSON.stringify(address.sourceEntityPath)))
        return [];
      const resolved = resolveNestedInstanceAddress(domain.prefab, address);
      if (resolved.status !== "resolved")
        return [];
      const indices = resolved.chain.map((owner) => buildSourceIdIndex(resolvePrefabBindingSourceFile(domain.prefab, owner, options.resolveInstanceSourceFile, options.resolveInstanceAssetKind)));
      const prefix = address.sourceEntityPath.flatMap((id, depth) => lowerSourceEntityOverridePath(id, indices[depth]));
      const overrides = prefabBindingToV2Overrides(domain, binding, (id) => id, {}, options.resolveAssetContentRevision);
      return overrides ? [{ address, binding, overrides, index: indices.at(-1), prefix }] : [];
    });
    const references = collectComponentReferences(source);
    for (const plan of plans)
      collectComponentReferences(plan.overrides, references);
    for (const plan of plans)
      allocateInstanceAdditions(
        {
          id: plan.binding.instanceRootEntityId,
          instance: { asset: { $ref: plan.binding.assetId }, overrides: plan.overrides }
        },
        [sourceIndex.entityIndexById.get(plan.address.rootSceneEntityId), ...plan.prefix],
        state,
        (path) => path,
        references,
        plan.index
      );
  }
  const entities = [], components = [];
  for (const [id, index] of sourceIndex.entityIndexById)
    entities[index] = id;
  for (const [id, index] of sourceIndex.componentIndexById)
    components[index] = id;
  return { entities, components };
}
function hydrate(source, options) {
  const state = { ...createEmptyDomainState(), ...hydrateSourceV2SceneToDomain(source, {
    resolveAssetKind: options.resolveInstanceAssetKind,
    resolvePrefabSourceFile: options.resolveInstanceSourceFile
  }) };
  state.assets = Object.fromEntries(Object.values(state.prefab.bindings).map((binding) => [binding.assetId, { id: binding.assetId, name: binding.assetId, type: binding.assetKind ?? "Prefab", parentFolderId: null, meta: {} }]));
  return state;
}
function sourceNestedViews(source, options) {
  const domain = hydrate(source, options), roots = new Set(buildSourceIdIndex(source, { includeInstanceAdditions: true }).entityById.keys());
  return Object.values(domain.prefab.bindings).flatMap((binding) => {
    const address = getNestedInstanceAddress(domain.prefab, binding, roots);
    if (!address?.sourceEntityPath.length)
      return [];
    const baseline = resolvePrefabBindingSourceFile(domain.prefab, binding, options.resolveInstanceSourceFile, options.resolveInstanceAssetKind);
    if (!baseline)
      throw Error(`Missing nested Prefab source '${binding.assetId}'`);
    return [{ address, baseline, instance: { asset: { $ref: binding.assetId }, overrides: prefabBindingToV2Overrides(domain, binding, (id) => id) } }];
  });
}
var transformProps = (props) => {
  const { position, rotation, scale, ...rest } = props;
  const transform = Object.fromEntries(Object.entries({ position, rotation, scale }).filter(([, v]) => v !== void 0).map(([key, v]) => [key, { x: v[0], y: v[1], z: v[2] }]));
  return { ...rest, ...Object.keys(transform).length ? { transform } : {} };
};
function mutateSourceInstance(source, options, address, action, input) {
  source = structuredClone(source);
  if (action === "create") {
    source.entities.push(input.entity);
    source.scene.rootEntities.push(input.entity.id);
  }
  const store = new DomainStore(hydrate(source, options)), bus = new CommandBus(store);
  const resolution = resolveNestedInstanceAddress(store.state.prefab, address);
  if (resolution.status !== "resolved")
    throw Error("Unavailable Prefab instance scope");
  const binding = resolution.chain.at(-1);
  const findEntity = (target) => binding.sourceEntitySnapshots[target]?.sceneEntityId ?? (store.state.entities[target] ? target : void 0);
  let entityId = findEntity(input.target);
  let componentId;
  if (input.component) {
    for (const snapshot of Object.values(binding.sourceEntitySnapshots)) {
      const component = snapshot.components[input.component];
      if (component) {
        entityId = snapshot.sceneEntityId;
        componentId = component.sceneComponentId;
        break;
      }
    }
    if (!componentId)
      for (const entity2 of Object.values(store.state.entities)) {
        if (entity2.components[input.component]) {
          entityId = entity2.id;
          componentId = input.component;
          break;
        }
      }
  }
  if (!entityId)
    throw Error(`Unknown instance member '${input.target ?? input.component}'`);
  const run = (command, value) => bus.execute(command, value, command.name);
  const entity = store.state.entities[entityId];
  if (action === "create" || action === "move") {
    run(new MoveEntityInstanceClaimCommand(), {
      entityId: action === "create" ? input.entity.id : input.id,
      parentSceneEntityId: entityId,
      target: resolveRequiredInstanceClaim(store.state, entityId, store.state.entities[action === "create" ? input.entity.id : input.id]) ?? void 0,
      preserveWorldTransform: action === "create" ? false : input.preserveWorld
    });
  } else if (action === "entity.update") {
    const props = transformProps(input.props);
    run(
      entity.instance?.role === "added" ? new UpdateEntityCommand() : new SetEntityOverrideCommand(),
      entity.instance?.role === "added" ? { entityId, props } : { entityId, overrides: props }
    );
  } else if (action === "entity.delete") {
    run(entity.instance?.role === "added" ? new DeleteEntityCommand() : new RemoveSourceEntityOverrideCommand(), { entityId });
  } else if (action === "component.add") {
    run(entity.instance?.role === "added" ? new AddComponentCommand() : new AddComponentOverrideCommand(), {
      entityId,
      componentId: input.id,
      type: input.value.type,
      refId: input.value.script?.$ref,
      scriptKey: input.value.script?.key,
      props: input.value.props ?? {},
      calls: input.value.calls
    });
  } else if (action === "component.update") {
    const component = entity.components[componentId];
    if (entity.instance?.role === "added")
      run(new UpdateComponentCommand(), { entityId, componentId, props: input.props });
    else if (component.instance?.role === "added")
      run(new UpdateAddedComponentOverrideCommand(), { entityId, componentId, setProps: input.props });
    else
      run(new SetComponentOverrideCommand(), { entityId, componentId, overrides: input.props });
  } else if (action === "component.delete") {
    if (entity.components[componentId].instance?.role === "added") {
      const sourceEntityId = Object.entries(binding.sourceEntitySnapshots).find(([, snapshot]) => snapshot.sceneEntityId === entityId)?.[0];
      run(new RevertOverrideCommand(), { bindingId: binding.id, type: "addedComponents", sourceEntityId, componentId });
    } else
      run(entity.instance?.role === "added" ? new RemoveComponentCommand() : new RemoveSourceComponentOverrideCommand(), { entityId, componentId });
  } else if (action === "component.revert" || action === "entity.revert") {
    const state = structuredClone(store.state), owner = state.prefab.bindings[binding.id];
    const key = Object.entries(binding.sourceEntitySnapshots).find(([, s]) => s.sceneEntityId === entityId)?.[0];
    if (!key)
      throw Error("An added member has no template override to revert");
    if (action === "component.revert") {
      const entry = owner.overrides.componentProps[key]?.[input.component];
      if (entry) {
        if (input.keys)
          for (const k of input.keys)
            delete entry.props?.[k];
        else
          delete owner.overrides.componentProps[key][input.component];
        if (entry.props && !Object.keys(entry.props).length)
          delete entry.props;
        if (!entry.props && !entry.calls?.length)
          delete owner.overrides.componentProps[key][input.component];
      }
    } else {
      const entry = owner.overrides.entityProps[key];
      if (entry)
        for (const k of input.keys) {
          if (["position", "rotation", "scale"].includes(k))
            delete entry.transform?.[k];
          else
            delete entry[k];
        }
    }
    return domainStateToSceneFileV2(state, { assetExists: () => true });
  } else
    throw Error(`Unknown instance edit '${action}'`);
  return domainStateToSceneFileV2(store.state, { assetExists: () => true });
}
function moveSourceAddition(source, options, id, parentId, address, target, preserveWorld) {
  const store = new DomainStore(hydrate(source, options)), bus = new CommandBus(store);
  let owner;
  if (address) {
    const resolved = resolveNestedInstanceAddress(store.state.prefab, address);
    if (resolved.status !== "resolved")
      throw Error("Unavailable destination Prefab");
    const binding = resolved.chain.at(-1);
    parentId = binding.sourceEntitySnapshots[target]?.sceneEntityId ?? parentId;
  }
  owner = resolveRequiredInstanceClaim(store.state, parentId, store.state.entities[id]) ?? void 0;
  bus.execute(new MoveEntityInstanceClaimCommand(), { entityId: id, parentSceneEntityId: parentId, target: owner, preserveWorldTransform: preserveWorld }, "prefab.moveEntityInstanceClaim");
  const moved = store.state.entities[id];
  if (isInstanceRootEntity(store.state, id))
    bus.execute(
      new SetEntityOverrideCommand(),
      { entityId: id, overrides: { transform: structuredClone(moved.transform) } },
      "prefab.setEntityOverride"
    );
  return domainStateToSceneFileV2(store.state, { assetExists: () => true });
}
export {
  compileSourcePrefabToRuntime,
  compileSourceSceneToRuntime,
  getBuiltinComponentRuntimeCapabilitySnapshot,
  mergeSourceValueRecords,
  moveSourceAddition,
  mutateSourceInstance,
  runtimeSourceReferenceIds,
  sourceNestedViews
};
/*! Bundled license information:

fast-json-patch/commonjs/helpers.js:
  (*!
   * https://github.com/Starcounter-Jack/JSON-Patch
   * (c) 2017-2022 Joachim Wester
   * MIT licensed
   *)

fast-json-patch/commonjs/duplex.js:
  (*!
   * https://github.com/Starcounter-Jack/JSON-Patch
   * (c) 2017-2021 Joachim Wester
   * MIT license
   *)
*/
