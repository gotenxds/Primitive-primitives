
attribute vec3 position;
attribute vec4 color;
varying vec4 v_color;

void main() {
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
    v_color = color;
}