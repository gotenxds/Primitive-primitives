# Primitive primitives
Primitive primitives is a small cesium extention library providing lightweight updateable primitives for cesium.

Cesium has a lot pf great primitives such as polyline, polygon, ellipse etc, unfortunately they are not
updateable so if you want to update the location of a primitive you need to destroy and recreate this.
Thin in turn leads to poor performance, to solve this I've created this library, providing simple implementations of the primitives, with less capabilities but better performance + updateable :)

# Existing primitives:
## Ellipse
`let primitive = new EllipsePrimitive();`
