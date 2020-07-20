// // import { Resource } from "@alipay/o3-loader";
// import { TextureConfig } from "@alipay/o3-material";

// import { khronosTextureContainerParser } from "../KhronosTextureContainer";
// import { CompressedTexture2D } from "../CompressedTexture2D";
// import { CompressedTextureCubeMap } from "../CompressedTextureCubeMap";
// // /**
// //  * @private
// //  */
// // export class KTXTextureHandler {
// //   load(request, props, callback) {
// //     let urls = props.url;
// //     if (!Array.isArray(urls)) urls = [props.url];
// //     if (urls.length !== 1 && urls.length !== 6) {
// //       callback(new Error("KTXTextureLoader: ktx texture should have 1 or 6 url"));
// //       return;
// //     }
// //     const promises = urls.map(url => {
// //       return new Promise((resolve, reject) => {
// //         request.load("binary", Object.assign({}, props, { url }), function(err, buffer) {
// //           if (!err) {
// //             resolve(buffer);
// //           } else {
// //             reject("Error loading KTXTexture from " + url);
// //           }
// //         });
// //       });
// //     });

// //     Promise.all(promises)
// //       .then(res => {
// //         callback(null, res);
// //       })
// //       .catch(err => {
// //         callback(err);
// //       });
// //   }

// //   open(resource: Resource) {
// //     if (resource.data.length === 1) {
// //       const data = resource.data[0];
// //       resource.asset = parseSingleKTX(resource.name, data);
// //     } else if (resource.data.length === 6) {
// //       resource.asset = parseCubeKTX(resource.name, resource.data);
// //     } else {
// //       throw new Error("KTXTextureLoader: ktx texture should have 1 or 6 texture");
// //     }
// //   }
// // }

// export function parseCubeKTX(name: string, dataArray: ArrayBuffer[], config?: TextureConfig): CompressedTextureCubeMap {
//   const mipmapsFaces = [];
//   let internalFormat: number;
//   let width: number;
//   let height: number;
//   for (let i = 0; i < dataArray.length; i++) {
//     const ktx = khronosTextureContainerParser.parse(dataArray[i], 1, true);
//     mipmapsFaces.push(ktx.mipmaps);
//     if (i === 0) {
//       width = ktx.pixelWidth;
//       height = ktx.pixelHeight;
//       internalFormat = ktx.glInternalFormat;
//     }
//   }
//   return new CompressedTextureCubeMap(
//     name,
//     {
//       mipmapsFaces,
//       internalFormat,
//       width,
//       height
//     },
//     config
//   );
// }

// export function parseSingleKTX(name: string, data: ArrayBuffer, config?: TextureConfig): CompressedTexture2D {
//   const ktx = khronosTextureContainerParser.parse(data, 1, true);
//   return new CompressedTexture2D(
//     name,
//     {
//       mipmaps: ktx.mipmaps,
//       internalFormat: ktx.glInternalFormat,
//       width: ktx.pixelWidth,
//       height: ktx.pixelHeight
//     },
//     config
//   );
// }
