import { loadBinary } from './loadBinary';
import { loadImage } from './loadImage';
import { TGA } from './TGA';

export function loadTGA( url, callback, crossOrigin = true, reSample = true ) {

  loadBinary( url, function( err, data ) {

    if ( err ) {

      callback( 'Error loading TGA file from ' + url, null );
      return;

    }

    const tga = new TGA();
    try {

      tga.parseData( new Uint8Array( data ) );

    }
    catch ( e ) {

      callback( 'Error parse TGA data', null );
      return;

    }

    const imgUrl = tga.getDataURL();
    loadImage( imgUrl, callback, crossOrigin, reSample );

  } );

}
