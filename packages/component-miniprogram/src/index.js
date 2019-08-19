import {
  registerCanvas,
  dispatchTouchStart,
  dispatchTouchMove,
  dispatchTouchEnd,
} from '@alipay/o3-adapter-miniprogram/dist/miniprogram';

import * as O3 from '@alipay/o3/dist/miniprogram';

Component({
  props: {
    onLoad: () => {
    }
  },
  methods: {
    onTouchStart(e) {
      dispatchTouchStart(e);
    },
    onTouchMove(e) {
      dispatchTouchMove(e);
    },
    onTouchEnd(e) {
      dispatchTouchEnd(e);
    },
  },
  didMount() {
    my._createCanvas({
      id: 'canvas',
      success: (canvas) => {
        registerCanvas(canvas, 'canvas');
        this.props.onLoad(O3, canvas);
      }
    });
  }
});
