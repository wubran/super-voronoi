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
  planeZ: f32,
  numSites: f32,
  // 8 padding bytes
};

struct Site {
    pos: vec3<f32>,
    mass: f32,
};

@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> voronoiSites: array<Site>;
@group(0) @binding(3) var idTex: texture_2d<u32>;

@vertex fn vs(vert: Vertex) -> OurVertexShaderOutput {
  var vsOutput: OurVertexShaderOutput;
  vsOutput.position = uni.cameraM * uni.objectM * vec4f(vert.position, 1.0);
  let size = textureDimensions(ourTexture, 0);
  vsOutput.normal = uni.objectM * vec4f(vert.normal, 0);
  vsOutput.texCoords = vert.texCoords;
  return vsOutput;
}

fn distance3(x: vec3<f32>, p: vec3<f32>, w: f32) -> f32 {
  let v = x - p;
  // return max(abs(v.x), abs(v.y)); // L-infinity distance (square cells)
  // return sqrt(dot(v, v))/w;
  return sqrt(dot(v, v)) - 50*w; // NEEDS SCALING
}
fn distance2(x: vec2<f32>, p: vec2<f32>) -> f32 {
  let v = x - p;
  // return max(abs(v.x), abs(v.y)); // L-infinity distance (square cells)
  return sqrt(dot(v, v));
}

fn scaleUpTo1(x: f32) -> f32 {
  return x / (x + 1.0);
}
fn scaleDownTo0(x: f32) -> f32 {
  return 1.0 / (x + 1.0);
}

fn modf(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}
fn hash31(p: vec3<f32>) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

fn noise3(p: vec3<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);

    // smooth interpolation curve
    let u = f * f * (3.0 - 2.0 * f);

    let a = hash31(i + vec3<f32>(0.0, 0.0, 0.0));
    let b = hash31(i + vec3<f32>(1.0, 0.0, 0.0));
    let c = hash31(i + vec3<f32>(0.0, 1.0, 0.0));
    let d = hash31(i + vec3<f32>(1.0, 1.0, 0.0));
    let e = hash31(i + vec3<f32>(0.0, 0.0, 1.0));
    let f1 = hash31(i + vec3<f32>(1.0, 0.0, 1.0));
    let g = hash31(i + vec3<f32>(0.0, 1.0, 1.0));
    let h = hash31(i + vec3<f32>(1.0, 1.0, 1.0));

    let x1 = mix(a, b, u.x);
    let x2 = mix(c, d, u.x);
    let y1 = mix(x1, x2, u.y);

    let x3 = mix(e, f1, u.x);
    let x4 = mix(g, h, u.x);
    let y2 = mix(x3, x4, u.y);

    return mix(y1, y2, u.z);
}
fn vectorNoise(p: vec2<f32>, t: f32) -> vec2<f32> {
    let p3 = vec3<f32>(p, t);

    let nx = noise3(p3); // scale to [-1, 1]
    let ny = noise3(p3 + vec3<f32>(100.0, 100.0, 100.0)); // offset to decorrelate

    return vec2<f32>(nx, ny);
}


@fragment
fn voronoi_fs(fsInput: OurVertexShaderOutput) -> @location(0) u32 {
  let noiseScale = 2.0;
  let spaceFreq = 0.1;
  let timeFreq = 0.01;

  let coord = fsInput.position.xy;
  let loc2 = coord + noiseScale*(vectorNoise(spaceFreq*coord, timeFreq*uni.time)*2.0 - 1.0);
  let loc3 = vec3<f32>(loc2, uni.planeZ);

  var minDist = distance3(voronoiSites[0].pos.xyz, loc3, voronoiSites[0].mass); // NEEDS PROOF
  var closestSite = 0u;
  for (var i = 0u; i < u32(uni.numSites); i++) {
      let site = voronoiSites[i].pos;
      let dist = distance3(site.xyz, loc3, voronoiSites[i].mass);

    if (dist < minDist) {
      minDist = dist;
      closestSite = i;
    }
  }

  let siteRadius = 5.0; // pixels
  // let dist2 = distance2(voronoiSites[closestSite].pos.xy, coord);
  let dist2 = distance2(voronoiSites[closestSite].pos.xy, loc2);
  if (dist2 < siteRadius) {
    return u32(uni.numSites);
  }

  return closestSite;
}


@fragment
fn edge_fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
  // let random_value = hash(vec2(fsInput.position[0], fsInput.position[1])); // v_uv is the texture coordinate
  var color = vec4f(1.0, 1.0, 1.0, 1.0); // default white
  let dims = vec2<i32>(textureDimensions(idTex, 0));
  let coord = vec2<i32>(fsInput.position.xy);
  let center = textureLoad(idTex, coord, 0).r;
  var isEdge = false;
  let sampleRing5 = array<vec2<i32>, 12>(
    vec2<i32>(-2, -1), vec2<i32>(-2, 0), vec2<i32>(-2, 1),
    vec2<i32>(-1, -2), vec2<i32>(-1, 2),
    vec2<i32>(0, -2), vec2<i32>(0, 2),
    vec2<i32>(1, -2), vec2<i32>(1, 2),
    vec2<i32>(2, -1), vec2<i32>(2, 0), vec2<i32>(2, 1),
  );
  // 3x3 kernel (radius = 1)
  for (var i = 0; i < 12; i++) {
    let offset = sampleRing5[i];
    let nx = coord.x + offset.x;
    let ny = coord.y + offset.y;

    // bounds check (important!)
    if (nx < 0 || ny < 0 || nx >= dims.x || ny >= dims.y) {
        continue;
    }

    let neighbor = textureLoad(idTex, vec2<i32>(nx, ny), 0).r;

    if (neighbor != center) {
        isEdge = true;
    }
  }

  let edgeColor = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  let nearestSite = vec2<i32>(voronoiSites[i32(center)].pos.xy);
  let imageCenter = vec2<i32>(textureDimensions(ourTexture, 0)/2);
  // translate site center to image center
  let othercolor = textureLoad(ourTexture, nearestSite-coord+imageCenter, 0);
  return select(othercolor, edgeColor, isEdge);
}
`
export default voronoi;