import voronoi from "./shaders/shader.js"

// see https://webgpufundamentals.org/webgpu/lessons/webgpu-utils.html#wgpu-matrix
import { mat4 } from '../vendor/wgpu-matrix.module.js';

const DEFAULT_MAX_SITES = 22;  // TODO: THIS IS THE NUMBER OF SITE THUMBNAILS
const MAX_SITES_DISPLAYED = 16;
const FLOATS_PER_VERTEX = 8;
const VERTEX_BUFFER_STRIDE = FLOATS_PER_VERTEX * 4;
const PLANE_Z_SENSITIVITY = 0.008;
const PLANE_Z_DAMPING = 0.86;
const PLANE_Z_MIN = -2000; // should depend on the screen size
const PLANE_Z_MAX = 0;
const PLANE_Z_MAX_VELOCITY = 10;
const ID_READBACK_BYTES_PER_ROW = 256;
const ID_READBACK_SIZE = ID_READBACK_BYTES_PER_ROW * 1;
const ID_TEXTURE_SCALE = 0.5; // 0.5 = half resolution, 0.25 = quarter resolution

const pointerState = {
  x: -1,
  y: -1,
  normalizedX: -1,
  normalizedY: -1,
  pressed: false,
};

function setupPointerInteraction(canvas) {
  const updatePointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerState.x = event.clientX - rect.left;
    pointerState.y = event.clientY - rect.top;
    pointerState.normalizedX = rect.width > 0 ? pointerState.x / rect.width : 0;
    pointerState.normalizedY = rect.height > 0 ? pointerState.y / rect.height : 0;
  };

  canvas.addEventListener('pointermove', (event) => { updatePointer(event); needsIdRead = true; });
  canvas.addEventListener('pointerdown', (event) => {
    updatePointer(event);
    pointerState.pressed = true;
    needsIdRead = true;
    if (event.button === 0) {
      clickPending = true;
    }
  });
  
  canvas.addEventListener('pointerup', () => { pointerState.pressed = false; needsIdRead = true; });
  canvas.addEventListener('pointerleave', () => {
    pointerState.pressed = false;
    pointerState.x = -1;
    pointerState.y = -1;
    pointerState.normalizedX = -1;
    pointerState.normalizedY = -1;
    needsIdRead = false;
    hoveredSiteId = DEFAULT_MAX_SITES;
  });
  canvas.addEventListener('pointerenter', () => {
    hoveredSiteId = -1;
  });
  return pointerState;
}

function setupPlaneZScroll(canvas, onDeltaZ) {
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const deltaZ = event.deltaY * PLANE_Z_SENSITIVITY;
    onDeltaZ(deltaZ);
  }, { passive: false });
}

let overlayImage = null;
let overlayBlurb = null;
let overlayHeader = null;
let overlayClickHandler = null;
let overlayState = {
  x: 0,
  y: 0,
  scale: 1,
  anchor: 'center',
  hidden: true,
  blurb: '',
  headerText: '',
  bodyText: '',
};

function updateImageOverlay() {
  if (!overlayImage) return;

  const width = overlayImage.naturalWidth || overlayImage.width || 0;
  const height = overlayImage.naturalHeight || overlayImage.height || 0;
  let x = overlayState.x;
  let y = overlayState.y;

  if (overlayState.anchor === 'center' && width > 0 && height > 0) {
    x -= (width * overlayState.scale) * 0.5;
    y -= (height * overlayState.scale) * 0.5;
  }

  overlayImage.style.transform = `translate(${x}px, ${y}px) scale(${overlayState.scale})`;
  overlayImage.style.display = overlayState.hidden ? 'none' : '';

  const hasHeader = !overlayState.hidden && typeof overlayState.headerText === 'string' && overlayState.headerText.trim() !== '';
  if (overlayHeader) {
    overlayHeader.style.display = hasHeader ? '' : 'none';
    if (hasHeader) {
      overlayHeader.style.transform = `translate(${x}px, ${Math.max(0, y - 36)}px)`;
      overlayHeader.textContent = overlayState.headerText;
    }
  }

  if (overlayBlurb) {
    const hasBody = !overlayState.hidden && typeof overlayState.bodyText === 'string' && overlayState.bodyText.trim() !== '';
    overlayBlurb.style.display = hasBody ? '' : 'none';
    if (hasBody) {
      const height = overlayImage.naturalHeight || overlayImage.height || 0;
      const offsetX = 20;
      const offsetY = (height > 0 ? height * overlayState.scale + 20 : 20);
      overlayBlurb.style.transform = `translate(${x + offsetX}px, ${y + offsetY}px)`;
      overlayBlurb.textContent = overlayState.bodyText;
    }
  }
}

function hideImageOverlay() {
  overlayState.hidden = true;
  updateImageOverlay();
}

function createImageOverlay(initialImageUrl = '') {
  if (overlayImage) return;
  overlayImage = document.createElement('img');
  overlayImage.id = 'gpu-image-overlay';
  overlayImage.src = initialImageUrl;
  overlayImage.alt = 'Selected thumbnail overlay';
  overlayImage.style.position = 'absolute';
  overlayImage.style.top = '0';
  overlayImage.style.left = '0';
  overlayImage.style.transformOrigin = 'top left';
  overlayImage.style.pointerEvents = 'auto';
  overlayImage.style.cursor = 'pointer';
  overlayImage.style.zIndex = '2';
  overlayImage.style.opacity = '1.0';
  overlayImage.style.maxWidth = 'none';
  overlayImage.style.maxHeight = 'none';
  overlayImage.style.display = 'none';
  overlayImage.addEventListener('click', (event) => {
    event.stopPropagation();
    if (typeof overlayClickHandler === 'function') {
      overlayClickHandler(event);
    }
  });
  overlayImage.addEventListener('load', () => {
    if (overlayState.anchor === 'center') {
      updateImageOverlay();
    }
  });
  document.body.appendChild(overlayImage);

  overlayHeader = document.createElement('div');
  overlayHeader.id = 'gpu-image-overlay-header';
  overlayHeader.style.position = 'absolute';
  overlayHeader.style.top = '0';
  overlayHeader.style.left = '0';
  overlayHeader.style.pointerEvents = 'none';
  overlayHeader.style.display = 'none';
  overlayHeader.style.background = 'rgba(16, 24, 52, 0.90)';
  overlayHeader.style.color = '#e8eefc';
  overlayHeader.style.padding = '8px 12px';
  overlayHeader.style.borderRadius = '16px';
  overlayHeader.style.boxShadow = '0 14px 32px rgba(0, 0, 0, 0.30)';
  overlayHeader.style.whiteSpace = 'nowrap';
  overlayHeader.style.overflow = 'hidden';
  overlayHeader.style.textOverflow = 'ellipsis';
  overlayHeader.style.fontWeight = '600';
  overlayHeader.style.fontSize = '0.92rem';
  overlayHeader.style.fontFamily = 'system-ui, sans-serif';
  overlayHeader.style.zIndex = '3';
  document.body.appendChild(overlayHeader);

  overlayBlurb = document.createElement('div');
  overlayBlurb.id = 'gpu-image-overlay-blurb';
  overlayBlurb.style.position = 'absolute';
  overlayBlurb.style.top = '0';
  overlayBlurb.style.left = '0';
  overlayBlurb.style.pointerEvents = 'none';
  overlayBlurb.style.display = 'none';
  overlayBlurb.style.maxWidth = '360px';
  overlayBlurb.style.background = 'rgba(12, 18, 34, 0.92)';
  overlayBlurb.style.color = '#f8f8ff';
  overlayBlurb.style.padding = '14px 16px';
  overlayBlurb.style.borderRadius = '18px';
  overlayBlurb.style.boxShadow = '0 18px 40px rgba(0, 0, 0, 0.35)';
  overlayBlurb.style.whiteSpace = 'pre-wrap';
  overlayBlurb.style.lineHeight = '1.4';
  overlayBlurb.style.fontSize = '0.95rem';
  overlayBlurb.style.fontFamily = 'system-ui, sans-serif';
  overlayBlurb.style.zIndex = '2';
  document.body.appendChild(overlayBlurb);

  updateImageOverlay();
}

function setGpuOverlay({ url, x = 0, y = 0, scale = 1, blurb = '' } = {}) {
  if (url) {
    if (!overlayImage) {
      createImageOverlay(url);
    } else {
      overlayImage.src = url;
    }
  }

  const filename = url ? url.replace(/^.*[\/]/, '').replace(/\.[^/.]+$/, '') : '';
  const rawBlurb = typeof blurb === 'string' ? blurb : '';
  const lines = rawBlurb.split(/\r?\n/);
  const dateLine = lines.length > 0 && lines[0].trim() !== '' ? lines[0].trim() : filename;
  const bodyText = lines.slice(1).join('\n').trim();
  const headerText = filename ? `${dateLine} · ${filename}` : dateLine;

  overlayState.anchor = 'center';
  overlayState.x = x;
  overlayState.y = y;
  overlayState.scale = scale;
  overlayState.blurb = rawBlurb;
  overlayState.headerText = headerText;
  overlayState.bodyText = bodyText;
  overlayState.hidden = false;
  updateImageOverlay();
}

function setGpuOverlayImage(url) {
  setGpuOverlay({ url, x: overlayState.x, y: overlayState.y, scale: overlayState.scale, blurb: overlayState.blurb });
}

function setGpuOverlayTransform(x, y, scale = 1) {
  if (!overlayImage) {
    createImageOverlay();
  }
  overlayState.anchor = 'top-left';
  overlayState.x = x;
  overlayState.y = y;
  overlayState.scale = scale;
  updateImageOverlay();
}

function setGpuOverlayCenter(x, y, scale = 1, url) {
  if (url) {
    if (!overlayImage) {
      createImageOverlay(url);
    } else {
      overlayImage.src = url;
    }
  } else if (!overlayImage) {
    createImageOverlay();
  }
  overlayState.anchor = 'center';
  overlayState.x = x;
  overlayState.y = y;
  overlayState.scale = scale;
  updateImageOverlay();
}

window.setGpuOverlay = setGpuOverlay;
window.setGpuOverlayImage = setGpuOverlayImage;
window.setGpuOverlayTransform = setGpuOverlayTransform;
window.setGpuOverlayCenter = setGpuOverlayCenter;
window.setGpuOverlayClickHandler = (handler) => {
  overlayClickHandler = typeof handler === 'function' ? handler : null;
};
window.setGpuOverlayBlurb = (blurb) => {
  overlayState.blurb = typeof blurb === 'string' ? blurb : '';
  updateImageOverlay();
};
window.setGpuOverlayClickHandler(() => {
    activeSiteId = -1;
    // time saving trick gotta speedrun
    hideImageOverlay();
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

let pause = false;
let needsIdRead = false;
let isReadingId = false;
let hoveredSiteId = DEFAULT_MAX_SITES;
let activeSiteId = -1;
let clickPending = false;
let idReadbackBuffer = null;

document.addEventListener('keydown', (event) => {
    const keyName = event.key;
    switch(keyName){
    case 'Control':
        return;
    case 'Escape':
        return;
    case ' ':
        pause = !pause;
        return;
    // default:
    // console.log(keyName);
    // return;
    }
}, false);


function vbuffer_from_mesh(device, m){
    const vertexBuffer = device.createBuffer({
        size: m.array.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });

    new Float32Array(vertexBuffer.getMappedRange()).set(m.array);
    vertexBuffer.unmap();
    return vertexBuffer
}


function prepareCanvas(device, presentationFormat){
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgpu');

    document.body.appendChild(canvas);
    canvas.style.display = 'block';

    // const dpr = window.devicePixelRatio || 1;
    const dpr = 1;
    const displayWidth = Math.max(1, document.documentElement.clientWidth);
    const displayHeight = Math.max(1, document.documentElement.clientHeight);
    canvas.width = Math.max(1, Math.floor(displayWidth * dpr * ID_TEXTURE_SCALE));
    canvas.height = Math.max(1, Math.floor(displayHeight * dpr * ID_TEXTURE_SCALE));

    context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
    });

    return [canvas, context]
}


function simpleRectangleMesh(){
    let array = new Float32Array([
        // x,y,z, nx,ny,nz, u,v
        -1,-1,0, 0,0,1, 0,0,
        1,-1,0, 0,0,1, 1,0,
        -1,1,0, 0,0,1, 0,1,
        -1,1,0, 0,0,1, 0,1,
        1,-1,0, 0,0,1, 1,0,
        1,1,0, 0,0,1, 1,1,
    ]);
    return array;
}

function updateUniforms(buffer, device, r, planeZ, numSites, activeSiteId){
    const uniformValuesAsF32 = new Float32Array(40);
    const cameraMatrix = uniformValuesAsF32.subarray(0, 16);
    const objectMatrix = uniformValuesAsF32.subarray(16, 32);

    const hardcodedCameraMatrix = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    ]);

    cameraMatrix.set(hardcodedCameraMatrix);
    mat4.identity(objectMatrix);

    uniformValuesAsF32[32] = r;
    uniformValuesAsF32[33] = planeZ;
    uniformValuesAsF32[34] = numSites;
    uniformValuesAsF32[35] = hoveredSiteId;
    uniformValuesAsF32[36] = activeSiteId;

    device.queue.writeBuffer(buffer, 0, uniformValuesAsF32);
}

function makeUniforms(device, numSites){
    // const uniformValuesAsU32 = new Uint32Array(uniformValuesAsF32.buffer);
    const uniformBuffer = device.createBuffer({
        label: 'voronoi uniform buffer',
        size: 40 * 4, // 40 floats to include active site and padding
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    updateUniforms(uniformBuffer, device, 0, 0, numSites, -1)
    return uniformBuffer
}

function createSitesBuffer(device, maxSites) {
    return device.createBuffer({
        size: maxSites * 8 * 4, // 7*<f32> with implicit padding
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
}

function createEdgeBindGroup(device, pipeline, uniformBuffer, texture, voronoiSitesBuffer, idTexture, sampler, thumbnailInfoBuffer) {
    return device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: texture.createView() },
            { binding: 2, resource: { buffer: voronoiSitesBuffer } },
            { binding: 3, resource: idTexture.createView() },
            { binding: 4, resource: sampler },
            { binding: 5, resource: { buffer: thumbnailInfoBuffer } },
        ],
    });
}

function updateSitesBuffer(device, buffer, sites) {
    device.queue.writeBuffer(buffer, 0, sites);
}

function updateSitesArray(sites, sitesArray, planeZ) {
    // get the closest 10 sites
    let closestIndices = [];
    let closestZdist = [];
    for (let i = 0; i < sites.length; i++) {
        let zDist = Math.abs(sites[i].pos.z - planeZ)
        let insertHere = MAX_SITES_DISPLAYED;
        for (let j = closestIndices.length-1; j >= 0; j--) {
            // lazy
            if (closestZdist[j] > zDist){
                insertHere = j;
            } else{
                break;
            }
        }
        if (insertHere < MAX_SITES_DISPLAYED ||closestIndices.length < MAX_SITES_DISPLAYED){
            closestIndices.splice(insertHere, 0, i);
            closestZdist.splice(insertHere, 0, zDist);

        }
        if (closestIndices.length > MAX_SITES_DISPLAYED){
            closestIndices.splice(MAX_SITES_DISPLAYED-1, 1);
            closestZdist.splice(MAX_SITES_DISPLAYED-1, 1);
        }
    }
    for (let i = 0; i < MAX_SITES_DISPLAYED; i++) {
        let site = sites[closestIndices[i]];
        sitesArray[8*i] = site.pos.x;
        sitesArray[8*i+1] = site.pos.y;
        sitesArray[8*i+2] = site.pos.z;
        sitesArray[8*i+3] = site.massShown;
        sitesArray[8*i+4] = closestIndices[i];
        sitesArray[8*i+5] = closestIndices[i];
        sitesArray[8*i+6] = closestIndices[i];
    }
    // console.log(closestZdist)
    return closestIndices;
}

let idTexture = null;
let idTextureWidth = 0;
let idTextureHeight = 0;
let lastWidth = 0;
let lastHeight = 0;

function describeRenderPassAndResize(device, context) {
    const canvas = context.canvas;
    // const dpr = window.devicePixelRatio || 1;
    const dpr = 1;
    const displayWidth = Math.max(1, document.documentElement.clientWidth);
    const displayHeight = Math.max(1, document.documentElement.clientHeight);
    const width = Math.max(1, Math.floor(displayWidth * dpr * ID_TEXTURE_SCALE));
    const height = Math.max(1, Math.floor(displayHeight * dpr * ID_TEXTURE_SCALE));
    let resized = false;
    
    if (width !== lastWidth || height !== lastHeight) {
        console.log("Resized to", width, height);
        lastWidth = width;
        lastHeight = height;
        resized = true;

        canvas.width = width;
        canvas.height = height;

        context.configure({
            device,
            format: navigator.gpu.getPreferredCanvasFormat(),
            alphaMode: "premultiplied",
        });

        if (idTexture) {
            idTexture.destroy();
        }

        idTextureWidth = width;
        idTextureHeight = height;

        idTexture = device.createTexture({
            size: [idTextureWidth, idTextureHeight],
            format: "r32uint",
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_SRC,

        });
    }

    const renderPassDescriptor = {
        label: 'voronoi id render pass',
        colorAttachments: [
            {
                view: idTexture.createView(),
                clearValue: [0, 0, 0, 0],
                loadOp: 'clear',
                storeOp: 'store',
            },
        ],
    };

    return [renderPassDescriptor, resized];
}

async function main() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
        fail('need a browser that supports WebGPU');
        return;
    }

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    const [canvas, context] = prepareCanvas(device, presentationFormat);
    setupPointerInteraction(canvas);

    let planeZ = 0;
    let planeZVelocity = 0;
    setupPlaneZScroll(canvas, (deltaZ) => {
      planeZVelocity = clamp(planeZVelocity + deltaZ * 7.5, -PLANE_Z_MAX_VELOCITY, PLANE_Z_MAX_VELOCITY);
    });

    const voronoiModule = device.createShaderModule({
        label: 'voronoi shader',
        code: voronoi,
    });

    const meshArray = simpleRectangleMesh();
    const vbuffer = vbuffer_from_mesh(device, { array: meshArray });
    const vertexCount = meshArray.length / FLOATS_PER_VERTEX;
 

    const vertexBufferLayout = {
        arrayStride: 3 * 4 + 3 * 4 + 2 * 4,  // Each vertex is 3 floats (x, y, z) and each float is 4 bytes.
        attributes: [
        {
            shaderLocation: 0,  // vertex position will be at location 0 in the vertex shader.
            offset: 0,          // Start at the beginning of each vertex for position.
            format: 'float32x3', // Each vertex position is a vec3 (3 floats).
        },
        {
            shaderLocation: 1,  // Vertext normal
            offset: 12,
            format: 'float32x3', // Each vertex position is a vec3 (3 floats).
        },
        {
            shaderLocation: 2,  // Vertex UV
            offset: 24,
            format: 'float32x2', // Each vertex position is a vec3 (3 floats).
        },
        ],
    };
    const voronoiPipeline = device.createRenderPipeline({
        label: 'voronoi pipeline',
        layout: 'auto',
        vertex: {
            module: voronoiModule,
            entryPoint: 'vs',
            buffers: [vertexBufferLayout],  // The layout of the vertex buffer.
        },
        fragment: {
            module: voronoiModule,
            entryPoint: 'voronoi_fs',
            targets: [{format: "r32uint"}],
        },
        primitive: {
            topology: 'triangle-list',  // Draw triangles from the vertices.
        },
    });
    const edgePipeline = device.createRenderPipeline({
        label: 'edge pipeline',
        layout: "auto",
        vertex: {
            module: voronoiModule,
            entryPoint: "vs",
            buffers: [vertexBufferLayout],  // The layout of the vertex buffer.
        },
        fragment: {
            module: voronoiModule,
            entryPoint: "edge_fs",
            targets: [{format: presentationFormat}]
        },
        primitive: {
            topology: "triangle-list"
        }
    });

    const linearSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    const thumbnailMetadata = await retrieveThumbnailMetadata();
    const thumbnailUrls = thumbnailMetadata.map((entry) => entry.url);
    // createImageOverlay(thumbnailUrls[0]);
    const entries = thumbnailMetadata.slice(0, 64);
    const layerCount = Math.max(1, entries.length);
    const thumbnailTextureArray = createPlaceholderThumbnailArrayTexture(device, 256, 256, layerCount);
    const thumbnailInfoBuffer = createThumbnailInfoBuffer(device, layerCount);

    window.thumbnailTextureArray = {
      texture: thumbnailTextureArray,
      sampler: linearSampler,
      infoBuffer: thumbnailInfoBuffer,
      layerCount,
      width: 256,
      height: 256,
      urls: thumbnailUrls,
      metadata: entries,
    };

    const thumbnailTextureArrayPromise = fillThumbnailTextureArray(device, thumbnailTextureArray, thumbnailInfoBuffer, entries, 256, 256);
    window.thumbnailTextureArrayPromise = thumbnailTextureArrayPromise;
    thumbnailTextureArrayPromise
      .then(() => {
        console.log('Filled thumbnail texture array:', layerCount);
      })
      .catch((error) => {
        console.warn('Thumbnail loading failed:', error);
      });

    idTextureWidth = canvas.width;
    idTextureHeight = canvas.height;
    idTexture = device.createTexture({
      size: [idTextureWidth, idTextureHeight],
      format: "r32uint",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING,
    });
    idReadbackBuffer = device.createBuffer({
      size: ID_READBACK_SIZE,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    let bounds = {
      xMin: 0,
      xMax: canvas.width,
      yMin: 0,
      yMax: canvas.height,
      zMin: PLANE_Z_MIN,
      zMax: PLANE_Z_MAX,
      margin: 80
    };
    const maxSites = DEFAULT_MAX_SITES;
    const sites = [];
    const cols = Math.ceil(Math.sqrt(maxSites));
    const rows = Math.ceil(maxSites / cols);
    const cellWidth = (canvas.width-2*bounds.margin) / cols;
    const cellHeight = (canvas.height-2*bounds.margin) / rows;
    const jitterFac = 0.6;

    for (let i = 0; i < maxSites; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const jitterX = (0.2 + Math.random() * jitterFac) * cellWidth;
        const jitterY = (0.2 + Math.random() * jitterFac) * cellHeight;
        const site = new Site3D([
            bounds.margin + col * cellWidth + jitterX,
            bounds.margin + row * cellHeight + jitterY,
            bounds.margin + PLANE_Z_MIN + Math.random() * (PLANE_Z_MAX - PLANE_Z_MIN - 2*bounds.margin),
        ], [0,0,0], [0,0,0], Math.random()+1);
        sites.push(site);
    }

    // const numSites = sites.length;
    const numSites = sites.length;
    const voronoiSites = new Float32Array(MAX_SITES_DISPLAYED * 4);
    let sitesShown = updateSitesArray(sites, voronoiSites, planeZ);
    const voronoiSitesBuffer = createSitesBuffer(device, maxSites);

    const uniformBuffer = makeUniforms(device, numSites);
    const voronoiBindGroup = device.createBindGroup({
        layout: voronoiPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: thumbnailTextureArray.createView() },
            { binding: 2, resource: { buffer: voronoiSitesBuffer } },
        ],
    });
    let edgeBindGroup = createEdgeBindGroup(device, edgePipeline, uniformBuffer, thumbnailTextureArray, voronoiSitesBuffer, idTexture, linearSampler, thumbnailInfoBuffer);

    function renderLoop(r) {
        if (!pause) {
            // for (let i=0; i<sites.length-1; i++) {
            for (let i=0; i<sites.length; i++) {
                let site = sites[i];
                site.calcSites(sites, i, hoveredSiteId, activeSiteId);
                site.calcBounds(bounds);
                if (i == activeSiteId){
                    site.calcGoto(canvas.width/2, canvas.height/2 - 40) // TODO: PROPER SPACING
                }
            }
            for (const site of sites) {
                site.update();
            }

            sitesShown = updateSitesArray(sites, voronoiSites, planeZ);
            updateSitesBuffer(device, voronoiSitesBuffer, voronoiSites);
        }

        planeZ += planeZVelocity;
        planeZ = clamp(planeZ, PLANE_Z_MIN, PLANE_Z_MAX);
        planeZVelocity *= PLANE_Z_DAMPING;
        if (Math.abs(planeZVelocity) < 0.001) planeZVelocity = 0;

        updateUniforms(uniformBuffer, device, r, planeZ, numSites, activeSiteId);
        let inFocus = false;//hoveredSiteId == activeSiteId; // javascript yuh
        // PROBLEM: When the overlay is clicked, the mouse enters canvas but doesnt trigger enter event
        if (pointerState.x > 0 && pointerState.y > 0 &&
            hoveredSiteId >= 0 && hoveredSiteId < DEFAULT_MAX_SITES
        ){
            let dz = (planeZ - sites[hoveredSiteId].pos.z)/sites[hoveredSiteId].massShown;
            inFocus |= sites[hoveredSiteId].inFocus(dz, 5.0, 40.0, 20.0);
            inFocus &= activeSiteId != hoveredSiteId;
            canvas.style.cursor = inFocus ? 'pointer' : 'default';
            canvas.style.transform = 'translateZ(0)';
            canvas.offsetHeight;
            canvas.style.transform = '';
        }

        const [renderPassDescriptor, resized] = describeRenderPassAndResize(device, context);
        if (resized) {
            let bounds = {
                xMin: 0,
                xMax: canvas.width,
                yMin: 0,
                yMax: canvas.height,
                zMin: PLANE_Z_MIN,
                zMax: PLANE_Z_MAX,
                margin: 80
            };
            edgeBindGroup = createEdgeBindGroup(device, edgePipeline, uniformBuffer, thumbnailTextureArray, voronoiSitesBuffer, idTexture, linearSampler, thumbnailInfoBuffer);
        }

        if (activeSiteId >= 0 && activeSiteId < DEFAULT_MAX_SITES){
            // let url = thumbnailUrls[sitesShown[activeSiteId]];
            let id = activeSiteId;
            let url = thumbnailUrls[id];
            let pic = thumbnailMetadata[id];
            let site = sites[id];
            // scale such that everythign is 500 pixels
            let screenX = site.pos.x/ID_TEXTURE_SCALE;
            let screenY = site.pos.y/ID_TEXTURE_SCALE;
            setGpuOverlay({ url, x: screenX, y: screenY, scale: 400 / pic.height, blurb: pic.blurb });
            // setGpuOverlay({ url, x:screenX/2, y:screenY/2, scale:1.25});

        }

        const encoder = device.createCommandEncoder({ label: 'render voronoi' });
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(voronoiPipeline);
        pass.setBindGroup(0, voronoiBindGroup);
        pass.setVertexBuffer(0, vbuffer);
        pass.draw(vertexCount, 1, 0, 0);
        pass.end();

        const pass2 = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });
        pass2.setPipeline(edgePipeline);
        pass2.setBindGroup(0, edgeBindGroup);
        pass2.setVertexBuffer(0, vbuffer);
        pass2.draw(vertexCount, 1, 0, 0);
        pass2.end();

        const shouldReadId = needsIdRead && !isReadingId && idReadbackBuffer;

        if (shouldReadId) {
            const mouseX = Math.floor(pointerState.normalizedX * canvas.width);
            const mouseY = Math.floor(pointerState.normalizedY * canvas.height);

            if (mouseX >= 0 && mouseX < canvas.width && mouseY >= 0 && mouseY < canvas.height) {
                encoder.copyTextureToBuffer(
                    { texture: idTexture, origin: { x: clamp(mouseX, 0, idTextureWidth - 1), y: clamp(mouseY, 0, idTextureHeight - 1), z: 0 } },
                    { buffer: idReadbackBuffer, bytesPerRow: ID_READBACK_BYTES_PER_ROW, rowsPerImage: 1 },
                    { width: 1, height: 1, depthOrArrayLayers: 1 }
                );

                needsIdRead = false;
                isReadingId = true;
            }
        }

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);

        if (shouldReadId) {
            idReadbackBuffer.mapAsync(GPUMapMode.READ, 0, 4)
            .then(() => {
                const view = new Uint32Array(idReadbackBuffer.getMappedRange(0, 4));
                if(hoveredSiteId < DEFAULT_MAX_SITES){
                    // hoveredSiteId = sitesShown[view[0]];
                    hoveredSiteId = sitesShown[view[0]];
                    window.hoveredSiteId = hoveredSiteId;
                    // probably should be updated here anyway...
                    if(clickPending){
                        if(inFocus && activeSiteId != hoveredSiteId){
                            activeSiteId = hoveredSiteId;
                            console.log("active site id: ", activeSiteId)
                        }
                        clickPending = false;
                    }
                }
                idReadbackBuffer.unmap();

                isReadingId = false;
            })
            .catch((error) => {
                console.error('id texture readback failed', error);
                isReadingId = false;
                needsIdRead = true;
            });
        }

        requestAnimationFrame(() => renderLoop(r + 1));
    }

    renderLoop(0);
}


function fail(msg) {
  // eslint-disable-next-line no-alert
  alert(msg);
}


main();