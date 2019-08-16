export function loadImageBuffer( imageBuffer, type, callback ) {

  const blob = new window.Blob( [ imageBuffer ], { type } );
  const img = new Image();
  img.src = URL.createObjectURL( blob );

  img.crossOrigin = 'anonymous';
  img.onerror = function () {

    callback( new Error( 'Failed to load image buffer' ), null );

  };
  img.onload = function () {

    callback( null, img );

  };

}
