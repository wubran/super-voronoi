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
  mouseID: f32,
  activeID: f32,
  padding: f32,
};

struct Site {
    pos: vec3<f32>,
    mass: f32,
    index: f32,
    // thumbnail: ThumbnailInfo,
};

struct ThumbnailInfo {
    originalSize: vec2<f32>,
    padding: vec2<f32>,
    avgColor: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(0) @binding(1) var ourTexture: texture_2d_array<f32>;
@group(0) @binding(2) var<storage, read> voronoiSites: array<Site>;
@group(0) @binding(3) var idTex: texture_2d<u32>;
@group(0) @binding(4) var ourSampler: sampler;
@group(0) @binding(5) var<storage, read> thumbnailInfo: array<ThumbnailInfo>;

const ID_TEXTURE_SCALE: f32 = 1.0; // low-res canvas already matches id texture resolution

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
  return sqrt(dot(v, v)) - 50*w;
  // return sqrt(dot(v, v) - 2500*w);
  // return max(max(abs(v.x), abs(v.y)), abs(v.z)) - 50*w; // L-infinity distance (square cells)
  // return abs(v.x) + abs(v.y) + abs(v.z) - 50*w; // L-infinity distance (square cells)
}
// fn distance3(x: vec3<f32>, p: vec3<f32>, w: f32) -> f32 {
//   let v = x - p;
//   return max(max(abs(v.x), abs(v.y)), abs(v.z)) - 50*w; // L-infinity distance (square cells)
// }
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
  // let loc2 = coord + noiseScale*(vectorNoise(spaceFreq*coord, timeFreq*uni.time)*2.0 - 1.0);
  let loc3 = vec3<f32>(coord, uni.planeZ);

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

  // let siteRadius = 5.0; // pixels
  // // let dist2 = distance2(voronoiSites[closestSite].pos.xy, coord);
  // let dist2 = distance2(voronoiSites[closestSite].pos.xy, loc2);
  // if (dist2 < siteRadius) {
  //   return u32(uni.numSites);
  // }

  // return u32(voronoiSites[closestSite].index);
  return closestSite;
}

fn blend4(x: vec4<f32>, y: vec4<f32>, z: vec4<f32>, t: f32, g: f32, r: f32) -> vec4<f32> {
    let a = clamp(r*(t-g), 0.0, 1.0);
    let b = clamp(r*(-t-g), 0.0, 1.0);
    // let c = clamp(r*(abs(t)-g), 0.0, 1.0)

    return a * x + b * y + (1-a-b) * z;
}

fn gapLinear(x: f32, m:f32, g: f32) ->  f32 {
  return m*(max(x-0.5*g, 0) + min(x+0.5*g, 0));
}
// fn softGapLinear(x: f32, m:f32, g: f32, s: f32) ->  f32 {
//   let t = gapLinear(x, m, g);
//   return t*abs(t)/(abs(t)+s*g); // magic s for softness
// }
fn softGapLinear(x: f32, m:f32, g: f32, s: f32) ->  f32 { // temporary version
  let t = gapLinear(x, m, g);
  return t*abs(t)/(abs(t)+s*g)+2; // magic s for softness
}

@fragment
fn edge_fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
  let white = vec4f(1.0, 1.0, 1.0, 1.0); // default white
  let dims = vec2<i32>(textureDimensions(idTex, 0));
  let coordff = fsInput.position.xy;
  let coord = vec2<i32>(
      clamp(i32(coordff.x), 0, dims.x - 1),
      clamp(i32(coordff.y), 0, dims.y - 1)
  );
  let centerShown = textureLoad(idTex, coord, 0).r;
  // let xEdge = dpdx(f32(centerShown)) != 0;
  // let yEdge = dpdy(f32(centerShown)) != 0;
  // let isEdge = xEdge || yEdge;
  // // let isEdge = false;

  let edgeColor = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  let nearest = voronoiSites[i32(centerShown)];
  let center = u32(voronoiSites[centerShown].index);
  let nearestSite = vec2<f32>(nearest.pos.xy);
  let nearestZ = f32(nearest.pos.z);
  let nearestMass = nearest.mass;
  let sliderGap = 30; // bigger allows for easier locating
  let tintSlider = softGapLinear((uni.planeZ - nearestZ)/nearestMass, 2, 20, 20); // interpreting mass as "radius"
  let textureSize = vec2<f32>(textureDimensions(ourTexture, 0));

  // noise needs TO BE UNIFIED WITH ABOVE
  // let noiseScale = 5.0;
  let noiseScale = tintSlider;
  let spaceFreq = 1.0;
  let timeFreq = 0.00001;
  // let timeFreq = 0.004;
  let isHovered = u32(uni.mouseID) == center;
  let coordf = fsInput.position.xy;
  let loc2 = coordf + noiseScale*(vectorNoise(spaceFreq*coordf, timeFreq*uni.time)*2.0 - 1.0);
  let loc3 = vec3<f32>(loc2, uni.planeZ);

  // get original image size
  let layerCount = i32(textureNumLayers(ourTexture));
  let textureLayer = select(i32(center) % layerCount, 0, layerCount == 0);
  let originalSize = thumbnailInfo[textureLayer].originalSize * 0.5; // should be canvas pix scale
  let desiredHeight = 400.0 * 0.5; // temp
  let desiredWidth = desiredHeight * originalSize.x / originalSize.y;
  let desiredSize = vec2<f32>(desiredWidth, desiredHeight);
  // translate site center to image center
  let imageCenter = desiredSize*0.5;
  let noisyImageCoord = (loc2.xy - (nearestSite - imageCenter));
  let noisyBaseUv = noisyImageCoord/desiredSize;
  let clampedUv = clamp(noisyBaseUv, vec2<f32>(0.0), vec2<f32>(0.99));
  let centerColor = textureSample(ourTexture, ourSampler, clampedUv, textureLayer);
  let transparent = vec4<f32>(0.0,0.0,0.0,0.0);
  let isTransparent = i32(uni.activeID) == i32(center);

  // let edgeMix = select(vec4<f32>(1.0,1.0,1.0,1.0), vec4<f32>(0.8,0.8,0.8,1.0), isEdge);
  // let finalColor = centerColor * edgeMix;
  // return select(finalColor, transparent, isTransparent);
  return select(centerColor, transparent, isTransparent);
}
`
export default voronoi;