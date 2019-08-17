
import {EventDispatcher, Event} from "@alipay/o3-base";
const dispatcher = new EventDispatcher();

/**
 * 以下代码, 原先的结果为:
 *    onListener1:
 *    onListener3:
 *    onListener4:
 * (错误: onListener2被跳过了)
 * 
 * 修改后: 
 *    onListener1:
 *    onListener2:
 *    onListener3:
 *    onListener4:
 */

const onListener1 = ( e ) => {
  console.error('onListener1: ');
  dispatcher.removeEventListener('test', onListener1);
}

const onListener2 = ( e ) => {
  console.error('onListener2: ');
}

const onListener3 = ( e ) => {
  console.error('onListener3: ');
}

const onListener4 = ( e ) => {
  console.error('onListener4: ');
}

dispatcher.addEventListener('test', onListener1 );
dispatcher.addEventListener('test', onListener2 );
dispatcher.addEventListener('test', onListener3 );
dispatcher.addEventListener('test', onListener4 );

setTimeout( () => {

  const e = new Event('test');
  dispatcher.trigger( e );
}, 2000 );


const domCon = document.body.querySelector('.example-html');
domCon.innerHTML = '<div>No view for this demo, see console instead...</div>';

// const testCount = 1000000;
// const originalArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// const sharedTmpArray = [];
// const arraySlice = () => {
//     const origin = originalArray;
//     let tmp;
//     let t = performance.now();
//     for( let i = 0, l = testCount; i !== l; ++ i ) {
//       tmp = origin.slice();
//     }
//     t = performance.now() - t;
//     console.log('arraySlice: ' + t);
// };

// const sharedCopy = () => {
//   const origin = originalArray;
//   let tmp;
//   let t = performance.now();
//   for( let i = 0, l = testCount; i !== l; ++ i ) {

//     tmp = sharedTmpArray;
//     for( let j = 0, jl = origin.length; j !== jl; ++ j ) {
//       tmp[j] = origin[j]
//     }
//     tmp.length = 0;
//   }
//   t = performance.now() - t;
//   console.log('sharedCopy: ' + t);
// };

// const newArray = () => {
//   const origin = originalArray;
//   let tmp;
//   let t = performance.now();
//   for( let i = 0, l = testCount; i !== l; ++ i ) {
//     tmp = [];
//     for( let j = 0, jl = origin.length; j !== jl; ++ j ) {
//       tmp[j] = origin[j]
//     }
//   }
//   t = performance.now() - t;
//   console.log('newArray: ' + t);
// };

// setTimeout(arraySlice, 4000);
// setTimeout(sharedCopy, 6000);
// setTimeout(newArray, 8000);
