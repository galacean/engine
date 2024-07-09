 #ifndef TONE_SCALE
 #define TONE_SCALE
 
 const mediump mat3 M = mat3(
    vec3(0.5, -1.0, 0.5),
    vec3(-1.0, 1.0, 0.5),
    vec3(0.5, 0.0, 0.0)
  );

  mediump float segmented_spline_c5_fwd(mediump float x){
    #ifdef GRAPHICS_API_WEBGL2
      const mediump float coefsLow[6] = float[6](-4.0000000000, -4.0000000000, -3.1573765773, -0.4852499958, 1.8477324706, 1.8477324706); // coefs for B-spline between minPoint and midPoint (units of log luminance)
      const mediump float coefsHigh[6] = float[6](-0.7185482425, 2.0810307172, 3.6681241237, 4.0000000000, 4.0000000000, 4.0000000000);   // coefs for B-spline between midPoint and maxPoint (units of log luminance)
    #else
      const mediump float coefsLow_0 = -4.0000000000;
      const mediump float coefsLow_1 = -4.0000000000;
      const mediump float coefsLow_2 = -3.1573765773;
      const mediump float coefsLow_3 = -0.4852499958;
      const mediump float coefsLow_4 = 1.8477324706;
      const mediump float coefsLow_5 = 1.8477324706;

      const mediump float coefsHigh_0 = -0.7185482425;
      const mediump float coefsHigh_1 = 2.0810307172;
      const mediump float coefsHigh_2 = 3.6681241237;
      const mediump float coefsHigh_3 = 4.0000000000;
      const mediump float coefsHigh_4 = 4.0000000000;
      const mediump float coefsHigh_5 = 4.0000000000;
    #endif

    // const vec2 minPoint = vec2(0.18 * exp2(-15.0), 0.0001); // {luminance, luminance} linear extension below this
    const mediump vec2 minPoint = vec2(0.0000054931640625, 0.0001); // {luminance, luminance} linear extension below this
    const mediump vec2 midPoint = vec2(0.18, 0.48); // {luminance, luminance}
    // const vec2 maxPoint = vec2(0.18 * exp2(18.0), 10000.0); // {luminance, luminance} linear extension above this
    const mediump vec2 maxPoint = vec2(47185.92, 10000.0); // {luminance, luminance} linear extension above this
    const mediump float slopeLow = 0.0; // log-log slope of low linear extension
    const mediump float slopeHigh = 0.0; // log-log slope of high linear extension

    const int N_KNOTS_LOW = 4;
    const int N_KNOTS_HIGH = 4;

    // Check for negatives or zero before taking the log. If negative or zero,
    // set to ACESMIN.1
    mediump float logx = log10(max(x, HALF_MIN));
    mediump float logy;

    if (logx <= log10(minPoint.x)){
        logy = logx * slopeLow + (log10(minPoint.y) - slopeLow * log10(minPoint.x));
    } else if ((logx > log10(minPoint.x)) && (logx < log10(midPoint.x))){
        mediump float knot_coord = float(N_KNOTS_LOW - 1) * (logx - log10(minPoint.x)) / (log10(midPoint.x) - log10(minPoint.x));
        int j = int(knot_coord);
        mediump float t = knot_coord - float(j);

        mediump vec3 cf;
        #ifdef GRAPHICS_API_WEBGL2
          cf = vec3(coefsLow[j], coefsLow[j + 1], coefsLow[j + 2]);
        #else
          if (j <= 0) {
            cf = vec3(coefsLow_0, coefsLow_1, coefsLow_2);
          } else if (j == 1) {
            cf = vec3(coefsLow_1, coefsLow_2, coefsLow_3);
          } else if (j == 2) {
            cf = vec3(coefsLow_2, coefsLow_3, coefsLow_4);
          } else { // if (j == 3)
            cf = vec3(coefsLow_3, coefsLow_4, coefsLow_5);
          }
        #endif

        mediump vec3 monomials = vec3(t * t, t, 1.0);
        logy = dot(monomials, M * cf);
    } else if ((logx >= log10(midPoint.x)) && (logx < log10(maxPoint.x))){
        mediump float knot_coord = float(N_KNOTS_HIGH - 1) * (logx - log10(midPoint.x)) / (log10(maxPoint.x) - log10(midPoint.x));
        int j = int(knot_coord);
        mediump float t = knot_coord - float(j);

        mediump vec3 cf;
        #ifdef GRAPHICS_API_WEBGL2
          cf = vec3(coefsHigh[j], coefsHigh[j + 1], coefsHigh[j + 2]);
        #else
          if (j <= 0) {
            cf = vec3(coefsHigh_0, coefsHigh_1, coefsHigh_2);
          } else if (j == 1) {
            cf = vec3(coefsHigh_1, coefsHigh_2, coefsHigh_3);
          } else if (j == 2) {
            cf = vec3(coefsHigh_2, coefsHigh_3, coefsHigh_4);
          } else { // if (j == 3)
            cf = vec3(coefsHigh_3, coefsHigh_4, coefsHigh_5);
          }
        #endif

        mediump vec3 monomials = vec3(t * t, t, 1.0);
        logy = dot(monomials, M * cf);
    } else {
        logy = logx * slopeHigh + (log10(maxPoint.y) - slopeHigh * log10(maxPoint.x));
    }

    return pow(10.0, logy);
  }

  // The metal compiler does not optimize structure access
  // struct SegmentedSplineParams_c9{
  //   float coefsLow[10];    // coefs for B-spline between minPoint and midPoint (units of log luminance)
  //   float coefsHigh[10];   // coefs for B-spline between midPoint and maxPoint (units of log luminance)
  //   mediump vec2 minPoint; // {luminance, luminance} linear extension below this
  //   mediump vec2 midPoint; // {luminance, luminance}
  //   mediump vec2 maxPoint; // {luminance, luminance} linear extension above this
  //   float slopeLow;       // log-log slope of low linear extension
  //   float slopeHigh;      // log-log slope of high linear extension
  // };


  mediump float segmented_spline_c9_fwd(mediump float x){
      // ODT_48nits
      #ifdef GRAPHICS_API_WEBGL2
        const mediump float coefsLow[10] = float[10](-1.6989700043, -1.6989700043, -1.4779000000, -1.2291000000, -0.8648000000, -0.4480000000, 0.0051800000, 0.4511080334, 0.9113744414, 0.9113744414);
        const mediump float coefsHigh[10] = float[10](0.5154386965, 0.8470437783, 1.1358000000, 1.3802000000, 1.5197000000, 1.5985000000, 1.6467000000, 1.6746091357, 1.6878733390, 1.6878733390);
      #else
        const mediump float coefsLow_0 = -1.6989700043;
        const mediump float coefsLow_1 = -1.6989700043;
        const mediump float coefsLow_2 = -1.4779000000;
        const mediump float coefsLow_3 = -1.2291000000;
        const mediump float coefsLow_4 = -0.8648000000;
        const mediump float coefsLow_5 = -0.4480000000;
        const mediump float coefsLow_6 = 0.0051800000;
        const mediump float coefsLow_7 = 0.4511080334;
        const mediump float coefsLow_8 = 0.9113744414;
        const mediump float coefsLow_9 = 0.9113744414;

        const mediump float coefsHigh_0 = 0.5154386965;
        const mediump float coefsHigh_1 = 0.8470437783;
        const mediump float coefsHigh_2 = 1.1358000000;
        const mediump float coefsHigh_3 = 1.3802000000;
        const mediump float coefsHigh_4 = 1.5197000000;
        const mediump float coefsHigh_5 = 1.5985000000;
        const mediump float coefsHigh_6 = 1.6467000000;
        const mediump float coefsHigh_7 = 1.6746091357;
        const mediump float coefsHigh_8 = 1.6878733390;
        const mediump float coefsHigh_9 = 1.6878733390;
      #endif

      mediump vec2 minPoint = vec2(segmented_spline_c5_fwd(0.18 * pow(2.0, -6.5)), 0.02);
      mediump vec2 midPoint = vec2(segmented_spline_c5_fwd(0.18), 4.8);
      mediump vec2 maxPoint = vec2(segmented_spline_c5_fwd(0.18 * pow(2., 6.5)), 48.0);

      // const mediump vec2 minPoint = vec2(0.0028799, 0.02);
      // const mediump vec2 midPoint = vec2(4.799999, 4.8);
      // const mediump vec2 maxPoint = vec2(1005.719, 48.0);

      const mediump float slopeLow = 0.0;
      const mediump float slopeHigh = 0.04;

      const int N_KNOTS_LOW = 8;
      const int N_KNOTS_HIGH = 8;

      // Check for negatives or zero before taking the log. If negative or zero,
      // set to OCESMIN.
      mediump float logx = log10(max(x, 1e-4));
      mediump float logy;

      if (logx <= log10(minPoint.x)) {
          logy = logx * slopeLow + (log10(minPoint.y) - slopeLow * log10(minPoint.x));
      } else if ((logx > log10(minPoint.x)) && (logx < log10(midPoint.x))) {
          mediump float knot_coord = float(N_KNOTS_LOW - 1) * (logx - log10(minPoint.x)) / (log10(midPoint.x) - log10(minPoint.x));
          int j = int(knot_coord);
          mediump float t = knot_coord - float(j);

          mediump vec3 cf;
          #ifdef GRAPHICS_API_WEBGL2
            cf = vec3(coefsLow[j], coefsLow[j + 1], coefsLow[j + 2]);
          #else
            if (j <= 0) {
                cf = vec3(coefsLow_0, coefsLow_1, coefsLow_2);
            } else if (j == 1) {
                cf = vec3(coefsLow_1, coefsLow_2, coefsLow_3);
            } else if (j == 2) {
                cf = vec3(coefsLow_2, coefsLow_3, coefsLow_4);
            } else if (j == 3) {
                cf = vec3(coefsLow_3, coefsLow_4, coefsLow_5);
            } else if (j == 4) {
                cf = vec3(coefsLow_4, coefsLow_5, coefsLow_6);
            } else if (j == 5) {
                cf = vec3(coefsLow_5, coefsLow_6, coefsLow_7);
            } else if (j == 6) {
                cf = vec3(coefsLow_6, coefsLow_7, coefsLow_8);
            } else { // if (j == 7)
                cf = vec3(coefsLow_7, coefsLow_8, coefsLow_9);
            }
          #endif

          mediump vec3 monomials = vec3(t * t, t, 1.0);
          logy = dot(monomials, M * cf);
      } else if ((logx >= log10(midPoint.x)) && (logx < log10(maxPoint.x))) {
          mediump float knot_coord = float(N_KNOTS_HIGH - 1) * (logx - log10(midPoint.x)) / (log10(maxPoint.x) - log10(midPoint.x));
          int j = int(knot_coord);
          mediump float t = knot_coord - float(j);

          mediump vec3 cf;
          #ifdef GRAPHICS_API_WEBGL2
            cf = vec3(coefsHigh[j], coefsHigh[j + 1], coefsHigh[j + 2]);
          #else
            if (j <= 0) {
                cf = vec3(coefsHigh_0, coefsHigh_1, coefsHigh_2);
            } else if (j == 1) {
                cf = vec3(coefsHigh_1, coefsHigh_2, coefsHigh_3);
            } else if (j == 2) {
                cf = vec3(coefsHigh_2, coefsHigh_3, coefsHigh_4);
            } else if (j == 3) {
                cf = vec3(coefsHigh_3, coefsHigh_4, coefsHigh_5);
            } else if (j == 4) {
                cf = vec3(coefsHigh_4, coefsHigh_5, coefsHigh_6);
            } else if (j == 5) {
                cf = vec3(coefsHigh_5, coefsHigh_6, coefsHigh_7);
            } else if (j == 6) {
                cf = vec3(coefsHigh_6, coefsHigh_7, coefsHigh_8);
            } else { // if (j == 7)
                cf = vec3(coefsHigh_7, coefsHigh_8, coefsHigh_9);
            }
          #endif

          mediump vec3 monomials = vec3(t * t, t, 1.0);
          logy = dot(monomials, M * cf);
      } else {
          logy = logx * slopeHigh + (log10(maxPoint.y) - slopeHigh * log10(maxPoint.x));
      }

      return pow(10.0, logy);
  }


#endif