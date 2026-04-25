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
  numSites: f32,
  // 8 padding bytes
};

struct Site {
    pos: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> voronoiSites: array<Site>;
// @group(0) @binding(3) var idTex: texture_2d<u32>;
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

// fn hash(p: vec2<f32>) -> f32 {
//   return fract(sin(dot(p, vec2<f32>(12.9898, 78.233)) + uni.time*0.1) * 43758.5453);
// }


fn distanceMetric(x: vec2<f32>, p: vec2<f32>) -> f32 {
  let v = x - p;
  if x.y < 0.5 || p.y < 0.5 {
    // return abs(v.x) + abs(v.y);
    return max(abs(v.x), abs(v.y));
  }
  return sqrt(dot(v, v));
  // let absV = abs(v);
  // return max(absV.x, absV.y);
  // return absV.x + absV.y;
}

// fn distanceMetric(x: vec2<f32>, p: vec2<f32>) -> f32 {
//   let v = x - p;
//   let wackdot = exp(v.x*10.0) * exp(v.x*10.0) + v.y * v.y;
//   // let wdot = dot(v, v * vec2f(1.0, 2.0));
//   let kernelTrick = wackdot;
//   // let kernelTrick = pow(wdot + 10.0, 3.0);
//   // let kernelTrick = exp(wdot);
//   return sqrt(kernelTrick);
// }


fn scaleUpTo1(x: f32) -> f32 {
  return x / (x + 1.0);
}
fn scaleDownTo0(x: f32) -> f32 {
  return 1.0 / (x + 1.0);
}

fn modf(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}


@fragment
fn voronoi_fs(fsInput: OurVertexShaderOutput) -> @location(0) u32 {
    // let random_value = hash(vec2(fsInput.position[0], fsInput.position[1])); // v_uv is the texture coordinate
  var color = vec4f(1.0, 1.0, 1.0, 1.0); // default white
  // let color = vec4f(1.0, 1-fsInput.position[2], fsInput.position[2], 1.0); // yellow-red
  var closestSite1 = 0u;
  // not handling less than 3 sites for now
  var minDist1 = distanceMetric(voronoiSites[0].pos, fsInput.texCoords);
  var numSites = uni.numSites;
  for (var i = 0u; i < u32(numSites); i++) {
    let site = voronoiSites[i].pos;
    let dist = distanceMetric(site, fsInput.texCoords);

    if (dist < minDist1) {
      minDist1 = dist;
      closestSite1 = i;
    }
  }
  return closestSite1;
}

@fragment fn fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
  // let random_value = hash(vec2(fsInput.position[0], fsInput.position[1])); // v_uv is the texture coordinate
  var color = vec4f(1.0, 1.0, 1.0, 1.0); // default white
  // let color = vec4f(1.0, 1-fsInput.position[2], fsInput.position[2], 1.0); // yellow-red
  var closestSite1 = 0u;
  var closestSite2 = 0u;
  var closestSite3 = 0u;
  // not handling less than 3 sites for now
  var minDist1 = distanceMetric(voronoiSites[0].pos, fsInput.texCoords) + 1.0;
  var minDist2 = minDist1 + distanceMetric(voronoiSites[1].pos, fsInput.texCoords);
  var minDist3 = minDist2 + distanceMetric(voronoiSites[2].pos, fsInput.texCoords);
  var numSites = uni.numSites;
  for (var i = 0u; i < u32(numSites); i++) {
    let site = voronoiSites[i].pos;
    let dist = distanceMetric(site, fsInput.texCoords);

    if (dist < minDist1) {
      minDist3 = minDist2;
      minDist2 = minDist1;
      minDist1 = dist;
      closestSite3 = closestSite2;
      closestSite2 = closestSite1;
      closestSite1 = i;
    } else if (dist < minDist2) {
      minDist3 = minDist2;
      minDist2 = dist;
      closestSite3 = closestSite2;
      closestSite2 = i;
    } else if (dist < minDist3) {
      minDist3 = dist;
      closestSite3 = i;
    }
  }

  color = vec4f(f32(closestSite1 % 20u)/20.0, 0.0, 0.0, 1.0);
  // color = vec4f(modf(200.0*minDist1, 2.0)/2.0, 0.0, 0.0, 1.0);
  // color = vec4f(f32(u32(200*minDist1) % 2u)/2.0, 0.0, 0.0, 1.0);

  // calculate direction normal to bisector
  let edgeWidth = 0.002;
  let vertexWidth = 0.006;
  let siteWidth = 0.008;
  let edgeColor = vec4f(0.0, 1.0, 0.0, 1.0); // green for edges
  let vertexColor = vec4f(0.0, 0.0, 1.0, 1.0); // blue for vertices
  let siteColor = vec4f(1.0, 0.0, 0.0, 1.0); // red for sites

  let normal12 = normalize(vec2f(voronoiSites[closestSite2].pos - voronoiSites[closestSite1].pos));
  let midpoint12 = (voronoiSites[closestSite1].pos + voronoiSites[closestSite2].pos) / 2.0;
  let projection12 = dot(fsInput.texCoords - midpoint12, normal12);
  let distToEdge12 = abs(projection12);

  // let normal23 = normalize(vec2f(voronoiSites[closestSite3].pos - voronoiSites[closestSite2].pos));
  // let midpoint23 = (voronoiSites[closestSite2].pos + voronoiSites[closestSite3].pos) / 2.0;
  // let projection23 = dot(fsInput.texCoords - midpoint23, normal23);
  // let distToEdge23 = abs(projection23);

  // let normal13 = normalize(vec2f(voronoiSites[closestSite3].pos - voronoiSites[closestSite1].pos));
  // let midpoint13 = (voronoiSites[closestSite1].pos + voronoiSites[closestSite3].pos) / 2.0;
  // let projection13 = dot(fsInput.texCoords - midpoint13, normal13);
  // let distToEdge13 = abs(projection13);

  // // hard to explain, but the second closest edge doesn't play nice near vertices
  // let edgeDist = min(distToEdge12, distToEdge13);
  // // let edgeDist = distToEdge12;
  // let vertexDist = max(max(distToEdge12, distToEdge13), distToEdge23);
  // color = vec4f(scaleUpTo1(50*edgeDist), 0.0, 0.0, 1.0); // fade to white as you get farther from the site
  // // color = vec4f(scaleUpTo1(100*vertexDist), 0.0, 0.0, 1.0); // fade to white as you get farther from the site

  // if (edgeDist < edgeWidth) {
  //   color = edgeColor;
  // }
  // if (vertexDist < vertexWidth) {
  //   color = vertexColor;
  // }


  let delta = minDist2 - minDist1;
  let dx = dpdx(delta);
  let dy = dpdy(delta);
  // fwidth = |dpdx| + |dpdy|
  let w = abs(dx) + abs(dy);
  // let w = fwidth(delta);
  // avoid divide-by-zero issues
  let inv_w = 1.0 / max(w, 1e-6);
  // normalize to pixel space
  let edge_coord = delta * inv_w;


  let delta2 = minDist3 - minDist1;
  let dx2 = dpdx(delta2);
  let dy2 = dpdy(delta2);
  // fwidth = |dpdx| + |dpdy|
  let w2 = abs(dx2) + abs(dy2);
  // let w = fwidth(delta);
  // avoid divide-by-zero issues
  let inv_w2 = 1.0 / max(w2, 1e-6);
  // normalize to pixel space
  let edge_coord2= min(delta2 * inv_w2, edge_coord);


  // thickness in pixels (tune this)
  let thickness = 10.0;
  // smooth edge (anti-aliased)
  let edge = 1.0 - smoothstep(0.0, thickness, edge_coord2);
  let base_color = vec4<f32>(0.2, 0.6, 1.0, 1.0);
  let edge_color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  // mix edge on top
  color = mix(base_color, edge_color, edge);

  if (minDist1 < siteWidth) {
    color = siteColor;
  }



  // my old lighting stuff
  // let ambient = f32(1);
  // let diffuse_intense = f32(1);
  // let diffuse_material = f32(1);
  // let dotLighting = diffuse_material * diffuse_intense * (1+dot(fsInput.normal, vec4f(0.7,0.7,0.7,0)))/2; // cos^2(theta/2)
  // return color * (ambient*0.1 + dotLighting*0.9);
  return color;
}
`
export default voronoi;