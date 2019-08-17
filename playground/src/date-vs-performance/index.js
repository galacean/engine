import { Util } from "@alipay/o3-base";
import { ABoxCollider } from "@alipay/o3-collider/src/ABoxCollider";



const testCount = 1000000;
const performanceNow = () => {
    let t = performance.now();
    let kkk = 0;
    for( let i = 0, l = testCount; i !== l; ++ i ) {
      kkk += performance.now();
    }
    t = performance.now() - t;
    console.log('performanceNow: ' + t + '(kkk is ' + kkk + ')');
};

const dateNow = () => {
  let t = performance.now();
  let kkk = 0;
  for( let i = 0, l = testCount; i !== l; ++ i ) {
    kkk += Date.now();
  }
  t = performance.now() - t;
  console.log('dateNow: ' + t + '(kkk is ' + kkk + ')');
};

// Date.now() is 3x faster than performance.now() on Chrome v69.0.3497.100 (Mac)
// So do we really need performance.now() in 'o3-base/Timer.js'?
setTimeout(performanceNow, 2000);
setTimeout(dateNow, 3000);

const domCon = document.body.querySelector('.example-html');
domCon.innerHTML = '<div>No view for this demo, see console instead...</div>';

// let obj = {
//   bb: [12, 23, 12, {
//     cc: 22
//   }],
//   dd: 33
// };

// let obj2 = Util.clone(obj);
// obj.bb[3].cc = 44;
// console.log(obj, obj2);

// let box = new ABoxCollider();
// box.setBoxMinMax( [-0.5,0,0], [1,1,1]);
// console.log(box.getCorners());

// let t0 = {t: 0};
// let t1 = {t: 1};
// let t2 = {t: 2};
// let fn = function(){console.log('hello0');};
// let t01 = [t0, t1, fn];
// let t12 = [t1, t2, fn];
// let o = {};
// o[t01] = 1;
// o[t12] = 2;

// console.log(o, o[t01], o[t12]);

// let o = {a:1, b:2, c: 3};
// for ( const key in o) {
//   console.log(key, o[key]);
// }
