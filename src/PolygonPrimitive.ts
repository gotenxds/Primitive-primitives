import {isTranslucent, createSimpleIndicesArray, to2D, createSimpleIndexBuffer} from "./Util";
declare var Cesium;

import {UpdateablePrimitive} from './UpdateablePrimitive';
import {Primitive} from './Primitive';

let defaultVs = require('./shaders/default.vs.glsl');
let defaultFs = require('./shaders/default.fs.glsl');


/**
 * PolygonPrimitive is implemented to be as minimal as possible.
 */
export class PolygonPrimitive extends Primitive implements UpdateablePrimitive {

    private _center: any;
    private _granularity: number;
    private _border: {show: boolean, style: string};
    private _showFill: boolean;
    private _borderDrawCommand: any;
    private _borderIndicesArray: Uint16Array;
    private _borderColor: number[];
    private _borderVertexArray: any;

    /**
     * The polygon constructor requires an polygon center point a semiMinor and semiMajor, these are used to calculate the polygons position and thus mandatory.
     * @param options The polygons options.
     * @param options.points The polygon points, an array of Cesium.Cartesian3 values.
     * @param options.border an Object containing show:a boolean and style: a string that indicates the border style(solid/dashed) default: {show:true, style:solid}
     * @param options.fill Defines whether we should render the fill, defaults to true.
     * @param options.show Defines whether we should render the polygon, defaults to true.
     * @param options.granularity The angular distance between points on the polygon in radians, smaller values for smoother polygons, bigger values for better performence, defaults to 0.3.
     */
    constructor(options: {points: any[], border?: {show: boolean, style: string}, fill?: boolean, show?: boolean, color?: number[], borderColor?: number[], granularity?: number}) {
        super(options);
        this.points = options.points;
        this._border = Cesium.defaultValue(options.border, {show: true, style: 'solid'});
        this._showFill = Cesium.defaultValue(options.fill, true);
        this._borderColor = options.borderColor || [0.0, 0.0, 0.0, 1.0];
        this._granularity = options.granularity || 0.3;

        this._borderDrawCommand = new Cesium.DrawCommand({owner: this});
    }

    get points(): any[] {
        return this._points;
    }

    set points(points: any[]) {

        if (!this._borderIndicesArray || (this._points && this._points.length !== points.length)) {
            this._borderIndicesArray = PolygonPrimitive.createBorderIndicesArray(points.length);
            this._center = PolygonPrimitive.calculateCenter(points);
            let radius = this.findRadius(this._center, points);
            this._dirty = true;

            this.createBoundingVolume(radius);
        }

        this._points = Cesium.Cartesian3.packArray(points, []);
    }

    updateLocationData(points:any[]) {
        this.points = points;
    }

    private findRadius(center: any, points: any[]) {
        let farthest = points[0];
        let lastDistance = 0;

        points.forEach(point => {
            let distance = Cesium.Cartesian3.distance(center, point);
            if (distance > lastDistance){
                lastDistance = distance;
                farthest = point;
            }
        });

        return lastDistance;
    }

    /**
     * This is a Cesium only function it is called once each tick of the render engine, do NOT call it!
     * @param frameState
     */
    update(frameState) {
        if (!this.shouldRender()) {
            return;
        }

        if (frameState.mode !== this._lastMode) {
            this._dirty = true;
        }

        let context = frameState.context;

        this.setupRenderState();
        this.setupShaderProgram(context);

        if (this._border) {
            this._borderVertexArray = (this._dirty || !this._borderVertexArray) ? this.createBorderVertexArray(context, frameState) : this._borderVertexArray;
            this.setupDrawCommand(this._borderDrawCommand, this._borderVertexArray,
                Cesium.PrimitiveType.LINE_LOOP, isTranslucent(this._borderColor));
            frameState.commandList.push(this._borderDrawCommand);
        }

        this._dirty = false;
        this._lastMode = frameState.mode;
    }

    private setupShaderProgram(context: any) {
        this._shaderProgram = this._shaderProgram || Cesium.ShaderProgram.replaceCache({
                context: context,
                shaderProgram: this._shaderProgram,
                vertexShaderSource: defaultVs,
                fragmentShaderSource: defaultFs
            });
    }

    private setupRenderState() {
        this._renderState = Cesium.RenderState.fromCache({
            cull: {
                enabled: true,
                face: Cesium.CullFace.BACK
            },
            depthTest: {
                enabled: false
            },
            depthMask: true,
            blending: this.isTranslucent() || isTranslucent(this._borderColor) ? {enabled: true} : undefined
        });
    }

    private createBorderVertexArray(context: any, frameState) {
        let points = frameState.mode === Cesium.SceneMode.SCENE_3D ? this._points : to2D(frameState, this._points);

        let vertexBuffer = Cesium.Buffer.createVertexBuffer({
            context: context,
            typedArray: new Float32Array(points),
            usage: Cesium.BufferUsage.STATIC_DRAW
        });

        let attributes = [
            {
                index: 0,
                enabled: true,
                vertexBuffer: vertexBuffer,
                componentsPerAttribute: 3,
                componentDatatype: Cesium.ComponentDatatype.FLOAT,
                normalize: false,
                offsetInBytes: 0,
                strideInBytes: 0
            },
            {
                index: 1,
                enabled: true,
                value: this._borderColor,
                componentsPerAttribute: 4,
                componentDatatype: Cesium.ComponentDatatype.FLOAT,
                normalize: false,
                offsetInBytes: 0,
                strideInBytes: 0
            }
        ];

        return new Cesium.VertexArray({
            context: context,
            attributes: attributes,
            indexBuffer: createSimpleIndexBuffer(context, this._borderIndicesArray)
        });
    }

    private static createBorderIndicesArray(size: number): Uint16Array {
        return createSimpleIndicesArray(size);
    }

    private createBoundingVolume(radius) {
        this._boundingVolume = new Cesium.BoundingSphere(this._center, radius);
    }

    /*
    * I'm using the following algorithm to compute the centroid of a non-intersecting polygon:
    * https://en.wikipedia.org/wiki/Centroid#Centroid_of_a_polygon
    * */
    private static calculateCenter(points: any[]) {
        let polygonArea = 0;
        let centroid = {x: 0, y: 0};

        for (let index = 0; index < points.length; index++) {
            let nextIndex = (index + 1) % points.length; // looping to start if in last index.
            let point = points[index];
            let nextPoint = points[nextIndex];

            let diff = point.x * nextPoint.y - nextPoint.x * point.y;

            polygonArea += diff;

            centroid.x += (point.x + nextPoint.x) * diff;
            centroid.y += (point.y + nextPoint.y) * diff;
        }

        polygonArea *= .5;

        centroid.x *= 1 / (6 * polygonArea);
        centroid.y *= 1 / (6 * polygonArea);

        return new Cesium.Cartesian3(centroid.x, centroid.y);
    }
}