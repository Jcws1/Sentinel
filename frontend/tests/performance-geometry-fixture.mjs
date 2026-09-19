import { Buffer } from 'node:buffer';
// Task-only loaded mesh derived from map-recovery's existing fixture.
// Roof at 300m above an unchanged 180m supplied Video eye; never operational data.
export function syntheticScene(origin) {
  const longitude = (103.85 * Math.PI) / 180;
  const latitude = (1.29 * Math.PI) / 180;
  const sinLon = Math.sin(longitude),
    cosLon = Math.cos(longitude);
  const sinLat = Math.sin(latitude),
    cosLat = Math.cos(latitude);
  const eccentricitySquared = 0.0066943799901413165;
  const normal = 6378137 / Math.sqrt(1 - eccentricitySquared * sinLat * sinLat);
  const transform = [
    -sinLon,
    cosLon,
    0,
    0,
    -sinLat * cosLon,
    -sinLat * sinLon,
    cosLat,
    0,
    cosLat * cosLon,
    cosLat * sinLon,
    sinLat,
    0,
    normal * cosLat * cosLon,
    normal * cosLat * sinLon,
    normal * (1 - eccentricitySquared) * sinLat,
    1,
  ];
  const positions = new Float32Array([
    -3000, -3000, 300, 3000, -3000, 300, 3000, 3000, 300, -3000, 3000, 300,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const buffer = Buffer.concat([
    Buffer.from(positions.buffer),
    Buffer.from(indices.buffer),
  ]);
  return {
    root: {
      asset: { version: '1.1', gltfUpAxis: 'Z' },
      // The tileset-level error describes the error when this mesh is absent.
      // Zero here lets Cesium cull the entire tileset without fetching its leaf.
      geometricError: 10000,
      root: {
        transform,
        boundingVolume: { box: [0, 0, 300, 3001, 0, 0, 0, 3001, 0, 0, 0, 1] },
        geometricError: 0,
        refine: 'ADD',
        content: { uri: `${origin}/synthetic-recovery/scene.gltf` },
      },
    },
    gltf: {
      asset: {
        version: '2.0',
        copyright: 'SYNTHETIC PROVIDER TEST — NO GEOGRAPHIC DATA',
      },
      extensionsUsed: ['KHR_materials_unlit'],
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      buffers: [
        {
          byteLength: buffer.length,
          uri: `data:application/octet-stream;base64,${buffer.toString('base64')}`,
        },
      ],
      bufferViews: [
        {
          buffer: 0,
          byteOffset: 0,
          byteLength: positions.byteLength,
          target: 34962,
        },
        {
          buffer: 0,
          byteOffset: positions.byteLength,
          byteLength: indices.byteLength,
          target: 34963,
        },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 4,
          type: 'VEC3',
          min: [-3000, -3000, 300],
          max: [3000, 3000, 300],
        },
        {
          bufferView: 1,
          componentType: 5123,
          count: 6,
          type: 'SCALAR',
          min: [0],
          max: [3],
        },
      ],
      materials: [
        {
          doubleSided: true,
          extensions: { KHR_materials_unlit: {} },
          pbrMetallicRoughness: { baseColorFactor: [0.12, 0.15, 0.18, 1] },
        },
      ],
      meshes: [
        {
          primitives: [
            { attributes: { POSITION: 0 }, indices: 1, material: 0 },
          ],
        },
      ],
    },
  };
}
