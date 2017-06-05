declare var Cesium;

import { createSimpleIndicesArray, to2D, isTranslucent } from './Util';
import { UpdateablePrimitive } from './UpdateablePrimitive';
import { Primitive } from './Primitive';

let defaultVs = require('./shaders/default.vs.glsl');
let defaultFs = require('./shaders/default.fs.glsl');


/**
 * EllipsePrimitive is implemented to be as minimal as possible.
 * Both border and fill are ON by default and you will need to disable them.
 * Both color and border color are just an array of 4 floats from 0 to 1 in the RGBA format, currently we do not support materials.
 */
export class EllipsePrimitive extends Primitive implements UpdateablePrimitive {
	private _center: any;
	private _semiMajor: number;
	private _semiMinor: number;
	private _rotation: number;
	private _granularity: number;
	private _border: {show: boolean, style: string};
	private _showFill: boolean;
	private _borderDrawCommand: any;
	private _borderIndicesArray: Uint16Array;
	private _borderColor: number[];
	private _borderVertexArray: any;

	private static borderStyleToPrimitiveType = {
		solid: Cesium.PrimitiveType.LINE_LOOP,
		dashed: Cesium.PrimitiveType.LINES
	};

	/**
	 * The ellipse constructor requires an ellipse center point a semiMinor and semiMajor, these are used to calculate the ellipses position and thus mandatory.
	 * @param options The ellipses options.
	 * @param options.center The ellipses center point in 3D space.
	 * @param options.semiMajorAxis The ellipses big radius.
	 * @param options.semiMinorAxis The ellipses small radius.
	 * @param options.rotation The ellipses rotation, defaults to 0.
	 * @param options.border an Object containing show:a boolean and style: a string that indicates the border style(solid/dashed) default: {show:true, style:solid}
	 * @param options.fill Defines whether we should render the fill, defaults to true.
	 * @param options.show Defines whether we should render the ellipse, defaults to true.
	 * @param options.granularity The angular distance between points on the ellipse in radians, smaller values for smooter ellipses, bigger values for better performence, defaults to 0.3.
	 */
	constructor(options: {center: any, semiMajorAxis: number, semiMinorAxis: number, rotation?: number, border?: {show: boolean, style: string}, fill?: boolean, show?: boolean, color?: number[], borderColor?: number[], granularity?: number}) {
		super(options);
		this._center = Cesium.Cartesian3.clone(options.center);
		this._semiMajor = options.semiMajorAxis;
		this._semiMinor = options.semiMinorAxis;
		this._rotation = options.rotation || 0;
		this._border = Cesium.defaultValue(options.border, {show: true, style: 'solid'});
		this._showFill = Cesium.defaultValue(options.fill, true);
		this._borderColor = options.borderColor || [0.0, 0.0, 0.0, 1.0];
		this._granularity = options.granularity || 0.3;

		this._borderDrawCommand = new Cesium.DrawCommand({owner: this});

		this.calculatePoints();
	}

	/**
	 * @returns {Cesium.Cartesian3} - Cesium.Cartesian3
	 */
	get center(): any {
		return this._center;
	}

	/**
	 * @param value a Cesium.Cartesian3 value.
	 */
	set center(value: any) {
		if (this._center !== value) {
			this._center = value;
			this._dirty = true;
		}
	}


	get semiMajor(): number {
		return this._semiMajor;
	}

	set semiMajor(value: number) {
		if (this._semiMajor !== value) {
			this._semiMajor = value;
			this._dirty = true;
		}
	}

	get semiMinor(): number {
		return this._semiMinor;
	}

	set semiMinor(value: number) {
		if (this._semiMinor !== value) {
			this._semiMinor = value;
			this._dirty = true;
		}
	}

	get rotation(): number {
		return this._rotation;
	}

	set rotation(value: number) {
		if (this._rotation !== value) {
			this._rotation = value;
			this._dirty = true;
		}
	}

	get color(): number[] {
		return this._color;
	}

	set color(value: number[]) {
		this._color = value;

		this._dirty = true;
	}

	get borderColor(): number[] {
		return this._borderColor;
	}

	set borderColor(value: number[]) {
		this._borderColor = value;

		this._dirty = true;
	}

	get show(): boolean {
		return this._show;
	}

	set show(value: boolean) {
		this._show = value;
	}

	get border(): {show: boolean, style: string} {
		return this._border;
	}

	set border(value: {show: boolean, style: string}) {
		this._border = value;
	}

	get showFill(): boolean {
		return this._showFill;
	}

	set showFill(value: boolean) {
		this._showFill = value;
	}

	private set points(value) {
		if (!this._borderIndicesArray || (this._points && this._points.outerPositions && this._points.outerPositions.length !== value.outerPositions.length)) {
			this._borderIndicesArray = EllipsePrimitive.createBorderIndicesArray(value.outerPositions.length / 3);
		}

		if (!this._indicesArray || (this._points && this._points.positions && this._points.positions.length !== value.positions.length)) {
			this._indicesArray = EllipsePrimitive.createIndicesArray(value.innerPoints.length / 3);
		}

		this._points = value;
	}

	/**
	 * This will update the location of the ellipse for the next render, If any parameter is not defined in the data param it will default to the allready defined value.
	 *
	 * @param data
	 */
	updateLocationData(data: {center?, semiMajorAxis?: number, semiMinorAxis?: number, rotation?: number}) {
		this.center = data.center || this._center;
		this.semiMajor = data.semiMajorAxis || this._semiMajor;
		this.semiMinor = data.semiMinorAxis || this._semiMinor;
		this._rotation = data.rotation || this._rotation;

		this.calculatePoints();

		this.createBoundingVolume();
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
								  EllipsePrimitive.borderStyleToPrimitiveType[this._border.style], isTranslucent(this._borderColor));
			frameState.commandList.push(this._borderDrawCommand);
		}

		if (this._showFill) {
			this._vertexArray = (this._dirty || !this._vertexArray) ? this.createVertexArray(context, frameState) : this._vertexArray;
			this.setupDrawCommand(this._drawCommand, this._vertexArray, Cesium.PrimitiveType.TRIANGLE_FAN, this.isTranslucent());
			frameState.commandList.push(this._drawCommand);
		}

		this._dirty = false;
		this._lastMode = frameState.mode;
	}

	/**
	 * This is a cesium only function, cesium calles it when the user removes the primitive from a primitive collection.
	 */
	destroy() {
		this._shaderProgram.destroy();
		this._vertexArray.destroy();
		this._borderVertexArray.destroy();
	}

	protected shouldRender(): boolean {
		return super.shouldRender() && (this._showFill || this._border.show);
	}

	private createBorderVertexArray(context: any, frameState) {
		let points = frameState.mode === Cesium.SceneMode.SCENE_3D ? this._points.outerPositions : to2D(frameState, this._points.outerPositions);

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
			indexBuffer: this.createBorderIndexBuffer(context)
		});
	}

	private createVertexArray(context: any, frameState) {
		let points = frameState.mode === Cesium.SceneMode.SCENE_3D ? this._points.innerPoints : to2D(frameState, this._points.innerPoints);

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
				value: this._color,
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
			indexBuffer: this.createIndexBuffer(context)
		});
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

	private calculatePoints() {
		let points = Cesium.EllipseGeometryLibrary.computeEllipsePositions({
			center: this._center,
			rotation: this._rotation,
			semiMajorAxis: this._semiMajor,
			semiMinorAxis: this._semiMinor,
			granularity: this._granularity
		}, false, true);

		points.innerPoints = Cesium.Cartesian3.pack(this._center, []).concat(points.outerPositions);

		this.points = points;
	}

	private createBorderIndexBuffer(context) {
		return Cesium.Buffer.createIndexBuffer({
			context: context,
			typedArray: this._borderIndicesArray,
			usage: Cesium.BufferUsage.STATIC_DRAW,
			indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT
		});
	}

	private createBoundingVolume() {
		this._boundingVolume = new Cesium.BoundingSphere(this._center, this._semiMajor);
	}

	private createIndexBuffer(context: any) {
		return Cesium.Buffer.createIndexBuffer({
			context: context,
			typedArray: new Uint16Array(this._indicesArray),
			usage: Cesium.BufferUsage.STATIC_DRAW,
			indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT
		});
	}

	private static createBorderIndicesArray(size: number): Uint16Array {
		return createSimpleIndicesArray(size);
	}

	private static createIndicesArray(length) {
		let indices = [];

		for (let i = 2; i < length; i++) {
			indices.push(0, i - 1, i);
		}

		indices.push(0, length - 1, 1);

		return indices;
	}
}