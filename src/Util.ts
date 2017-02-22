declare var Cesium;

export function to2D(frameState, points) {
	let unpacked = [];
	let repacked = [];

	Cesium.Cartesian3.unpackArray(points, unpacked);
	Cesium.Cartesian3.packArray(unpacked.map(p => Cesium.SceneTransforms.computeActualWgs84Position(frameState, p)), repacked);

	return repacked;
}

export function createSimpleIndicesArray(size: number): Uint16Array {
	let indicesArray = [];

	for (let i = 0; i < size; i++) {
		indicesArray.push(i);
	}

	return new Uint16Array(indicesArray);
}

export function isTranslucent(color:number[]){
	return color[3] < 1.0;
}