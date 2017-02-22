import { isTranslucent } from './Util';
declare var Cesium;

/**
 * This is the default implementation of a primitive, all primitives extend this class.
 */
export abstract class Primitive{
	protected _show:boolean;
	protected _modelMatrix: any;
	protected _renderState: any;
	protected _drawCommand: any;
	protected _points: any;
	protected _indicesArray: number[];
	protected _boundingVolume: any;
	protected _dirty: boolean = true;
	protected _lastMode: any;
	protected _color: number[];
	protected _vertexArray: any;
	protected _shaderProgram: any;

	constructor(options: {show?: boolean, color?: number[]}) {
		this._show = Cesium.defaultValue(options.show, true);
		this._color = options.color || [0.0, 0.0, 0.0, 1.0];

		this._modelMatrix = Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY);
		this._drawCommand = new Cesium.DrawCommand({owner: this});
	}

	get color(): number[] {
		return this._color;
	}

	set color(value: number[]) {
		this._color = value;

		this._dirty = true;
	}

	get show(): boolean {
		return this._show;
	}

	set show(value: boolean) {
		this._show = value;
	}

	public isTranslucent(){
		return isTranslucent(this._color);
	}

	protected shouldRender() {
		return this._show;
	}

	protected setupDrawCommand(drawCommand, vertexArray, primitiveType, translucent:boolean = false, debugShowBoundingVolume: boolean = false) {
		drawCommand.modelMatrix = this._modelMatrix;
		drawCommand.renderState = this._renderState;
		drawCommand.shaderProgram = this._shaderProgram;
		drawCommand.boundingVolume = this._boundingVolume;
		drawCommand.pass = translucent ? Cesium.Pass.TRANSLUCENT : Cesium.Pass.OPAQUE;

		drawCommand.debugShowBoundingVolume = debugShowBoundingVolume;
		drawCommand.primitiveType = primitiveType;
		drawCommand.vertexArray = vertexArray;
	}
}