declare var Cesium;

import { createSimpleIndicesArray, to2D } from './Util';

let defaultVs = require('./shaders/default.vs.glsl');
let defaultFs = require('./shaders/default.fs.glsl');

export class EllipsePrimitive {
	private _center: any;
	private _semiMajor: number;
	private _semiMinor: number;
	private _rotation: number;
	private _show: boolean;
	private _showBorder: boolean;
	private _showFill: boolean;
	private _modelMatrix: any;
	private _renderState: any;
	private _borderDrawCommand: any;
	private _drawCommand: any;
	private _points: any;
	private _borderIndicesArray: Uint16Array;
	private _indicesArray: number[];
	private _boundingVolume: any;
	private _dirty: boolean = true;
	private _lastMode: any;
	private _color: number[];
	private _borderColor: number[];
	private _borderVertexArray: any;
	private _vertexArray: any;
	private _shaderProgram: any;

	constructor(options: {center: any, semiMajorAxis: number, semiMinorAxis: number, rotation?: number, border?: boolean, fill?: boolean, show?: boolean, color?: number[], borderColor?: number[]}) {
		this._center = Cesium.Cartesian3.clone(options.center);
		this._semiMajor = options.semiMajorAxis;
		this._semiMinor = options.semiMinorAxis;
		this._rotation = options.rotation || 0;
		this._show = Cesium.defaultValue(options.show, true);
		this._showBorder = Cesium.defaultValue(options.border, true);
		this._showFill = Cesium.defaultValue(options.fill, true);
		this._color = options.color || [0.0, 0.0, 0.0, 1.0];
		this._borderColor = options.borderColor || [0.0, 0.0, 0.0, 1.0];

		this._modelMatrix = Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY);
		this._borderDrawCommand = new Cesium.DrawCommand({owner: this});
		this._drawCommand = new Cesium.DrawCommand({owner: this});

		this.calculatePoints();
	}

	get center(): any {
		return this._center;
	}

	set center(value: any) {
		if (this._center !== value) {
			this._center = value;
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

	get showBorder(): boolean {
		return this._showBorder;
	}

	set showBorder(value: boolean) {
		this._showBorder = value;
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

	updateLocationData(data: {center?, semiMajorAxis?: number, semiMinorAxis?: number, rotation?: number}) {
		this.center = data.center || this._center;

		this.calculatePoints();

		this.createBoundingVolume();
	}

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

		if (this._showBorder) {
			this._borderVertexArray = (this._dirty || !this._borderVertexArray) ? this.createBorderVertexArray(context, frameState) : this._borderVertexArray;
			this.setupDrawCommand(this._borderDrawCommand, this._borderVertexArray, Cesium.PrimitiveType.LINE_LOOP);
			frameState.commandList.push(this._borderDrawCommand);
		}

		if (this._showFill) {
			this._vertexArray = (this._dirty || !this._vertexArray) ? this.createVertexArray(context, frameState) : this._vertexArray;
			this.setupDrawCommand(this._drawCommand, this._vertexArray, Cesium.PrimitiveType.TRIANGLE_FAN);
			frameState.commandList.push(this._drawCommand);
		}

		this._dirty = false;
		this._lastMode = frameState.mode;
	}

	destroy() {
		this._shaderProgram.destroy();
		this._vertexArray.destroy();
		this._borderVertexArray.destroy();
	}

	private shouldRender() {
		return this._show && (this._showFill || this._showBorder);
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
			blending: undefined
		});
	}

	private setupDrawCommand(drawCommand, vertexArray, primitiveType, debugShowBoundingVolume: boolean = false) {
		drawCommand.modelMatrix = this._modelMatrix;
		drawCommand.renderState = this._renderState;
		drawCommand.shaderProgram = this._shaderProgram;
		drawCommand.boundingVolume = this._boundingVolume;
		drawCommand.pass = Cesium.Pass.OPAQUE;

		drawCommand.debugShowBoundingVolume = debugShowBoundingVolume;
		drawCommand.primitiveType = primitiveType;
		drawCommand.vertexArray = vertexArray;
	}

	private calculatePoints() {
		let points = Cesium.EllipseGeometryLibrary.computeEllipsePositions({
			center: this._center,
			rotation: this._rotation,
			semiMajorAxis: this._semiMajor,
			semiMinorAxis: this._semiMinor,
			granularity: 0.03
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