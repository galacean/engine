#ifndef WATER_OCEAN_WAVE_SPECTRUM_INCLUDED
#define WATER_OCEAN_WAVE_SPECTRUM_INCLUDED

          // Three inclusive spectrum groups, each evaluating four wave lanes.
          amplitude *= fadeFactor;
          if (oceanMaximum4(waveGridWeight) > 0.0) {
            waveBandlimitWeight = waveGridWeight * oceanGeometryWaveViewWeight(
          waveWavelength,
          directionAB,
          directionCD,
          viewDistance,
          viewDirection,
          projectedPixelsPerMetre,
          grazingWeight
            );
            applyWaveGroup(
              restXZ,
              amplitude,
              frequency,
              phase,
              steepness,
              directionAB,
              directionCD,
              waveBandlimitWeight,
              offset,
              normalSum
            );
          }

          frequency *= {{SECOND_GROUP_FREQUENCY_SCALE}};
          waveWavelength = oceanGeometryWaveWavelength(frequency);
          waveGridWeight = oceanGeometryWaveGridWeight(waveWavelength, attributes.TEXCOORD_0.x);
          amplitude *= fadeFactor;
          if (oceanMaximum4(waveGridWeight) > 0.0) {
            waveBandlimitWeight = waveGridWeight * oceanGeometryWaveViewWeight(
          waveWavelength,
          directionAB,
          directionCD,
          viewDistance,
          viewDirection,
          projectedPixelsPerMetre,
          grazingWeight
            );
            applyWaveGroup(
              restXZ,
              amplitude,
              frequency,
              phase,
              steepness,
              directionAB,
              directionCD,
              waveBandlimitWeight,
              offset,
              normalSum
            );
          }

          frequency *= {{THIRD_GROUP_FREQUENCY_SCALE}};
          waveWavelength = oceanGeometryWaveWavelength(frequency);
          waveGridWeight = oceanGeometryWaveGridWeight(waveWavelength, attributes.TEXCOORD_0.x);
          amplitude *= fadeFactor;
          if (oceanMaximum4(waveGridWeight) > 0.0) {
            waveBandlimitWeight = waveGridWeight * oceanGeometryWaveViewWeight(
          waveWavelength,
          directionAB,
          directionCD,
          viewDistance,
          viewDirection,
          projectedPixelsPerMetre,
          grazingWeight
            );
            applyWaveGroup(
              restXZ,
              amplitude,
              frequency,
              phase,
              steepness,
              directionAB,
              directionCD,
              waveBandlimitWeight,
              offset,
              normalSum
            );
          }

#endif
