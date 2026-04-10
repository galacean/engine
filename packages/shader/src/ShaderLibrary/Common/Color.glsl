#ifndef COLOR_INCLUDED
#define COLOR_INCLUDED

#ifdef RENDERER_ENABLE_VERTEXCOLOR
    varying vec4 v_color;
#endif

// Vertex: assign vertex color
// Requires COLOR_0 attribute
#ifdef RENDERER_ENABLE_VERTEXCOLOR
    void initVertexColor(vec4 vertexColor, inout vec4 vColor) {
        vColor = vertexColor;
    }
#endif

#endif
