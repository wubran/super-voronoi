const voronoi = /* wgsl */`

struct Vertex {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) texCoords: vec2<f32>,
}

struct OurVertexShaderOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec4f,
  @location(1) texCoords: vec2<f32>,  // Texture coordinates
  // @location(2) color: vec4<f32>,      // Vertex color
};

struct Uniforms {
  cameraM: mat4x4f,
  objectM: mat4x4f,
  time: f32,
  // 12 padding bytes
};

@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;
@group(0) @binding(2) var ourSampler: sampler;
// @group(0) @binding(2) var<storage, read_write> scale: vec4f;

@vertex fn vs(
  vert: Vertex,
) -> OurVertexShaderOutput {
  var vsOutput: OurVertexShaderOutput;
  vsOutput.position = uni.cameraM * uni.objectM * vec4f(vert.position, 1.0);
  let size = textureDimensions(ourTexture, 0);
  vsOutput.normal = uni.objectM * vec4f(vert.normal, 0);
  vsOutput.texCoords = vert.texCoords;
  return vsOutput;
}
// take a triangle (3 sets of outputs from vertex shader)
// rasterize the triangle, and interpolate the structs at each pixel (fragment)
// the interpolated structs corresponding to a pixel are passed to fragment shader

fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(12.9898, 78.233)) + uni.time*0.1) * 43758.5453);
}

@fragment fn fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
  let random_value = hash(vec2(fsInput.position[0], fsInput.position[1])); // v_uv is the texture coordinate

  // let color = vec4f(1.0, 1-fsInput.position[2], fsInput.position[2], 1.0); // yellow-red
  let color = textureSample(ourTexture, ourSampler, fsInput.texCoords);
  // let color = fsInput.normal;
  let ambient = f32(1);
  let diffuse_intense = f32(1);
  let diffuse_material = f32(1);
  // let dotLighting = diffuse_material * diffuse_intense * max(dot(fsInput.normal, vec4f(0,0,1,0)), 0); // light source from negative z (camera)
  let dotLighting = diffuse_material * diffuse_intense * (1+dot(fsInput.normal, vec4f(0.7,0.7,0.7,0)))/2; // cos^2(theta/2)
  
  return color * (ambient*0.1 + dotLighting*0.9);
  // return (floor(random_value+0.5)) * color * (ambient*0.1 + dotLighting*0.9);
}
`
export default voronoi;