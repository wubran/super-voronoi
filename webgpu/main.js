import voronoi from "./shaders/shader.js"

// see https://webgpufundamentals.org/webgpu/lessons/webgpu-utils.html#wgpu-matrix
import { mat4 } from '../3rdparty/wgpu-matrix.module.js';
// see https://webgpufundamentals.org/webgpu/lessons/webgpu-utils.html#webgpu-utils
import {
  loadImageBitmap,
  createTextureFromSource,
} from '../3rdparty/webgpu-utils-1.x.module.js';

const DEFAULT_MAX_SITES = 64;
const FLOATS_PER_VERTEX = 8;
const VERTEX_BUFFER_STRIDE = FLOATS_PER_VERTEX * 4;
const PLANE_Z_SENSITIVITY = 0.012;
const PLANE_Z_DAMPING = 0.86;
const PLANE_Z_MIN = -500;
const PLANE_Z_MAX = 500;
const PLANE_Z_MAX_VELOCITY = 10;

const pointerState = {
  x: 0,
  y: 0,
  normalizedX: 0,
  normalizedY: 0,
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

  canvas.addEventListener('pointermove', updatePointer);
  canvas.addEventListener('pointerdown', (event) => { updatePointer(event); pointerState.pressed = true; });
  canvas.addEventListener('pointerup', () => { pointerState.pressed = false; });
  canvas.addEventListener('pointerleave', () => { pointerState.pressed = false; });

  return pointerState;
}

function setupPlaneZScroll(canvas, onDeltaZ) {
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const deltaZ = event.deltaY * PLANE_Z_SENSITIVITY;
    onDeltaZ(deltaZ);
  }, { passive: false });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

let pause = false;

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
    context.configure({
        device,
        format: presentationFormat,
    });
    // canvas.height = canvas.width;

    document.body.appendChild(canvas);
    
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
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

function updateUniforms(buffer, device, r, planeZ, numSites){
    const uniformValuesAsF32 = new Float32Array(36);
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

    device.queue.writeBuffer(buffer, 0, uniformValuesAsF32);
}

function makeUniforms(device, numSites){
    // const uniformValuesAsU32 = new Uint32Array(uniformValuesAsF32.buffer);
    const uniformBuffer = device.createBuffer({
        label: 'voronoi uniform buffer',
        size: 36 * 4, // 36 floats
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    updateUniforms(uniformBuffer, device, 0, 0, numSites)
    return uniformBuffer
}

function createSitesBuffer(device, maxSites) {
    return device.createBuffer({
        size: maxSites * 4 * 4, // vec3<f32> with implicit padding to 16 bytes per element
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
}

function createEdgeBindGroup(device, pipeline, uniformBuffer, texture, idTexture) {
    return device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: texture.createView() },
            { binding: 3, resource: idTexture.createView() },
        ],
    });
}

// length of sites must be <= maxSites * 4 because each site stores a vec3 and padding
function updateSitesBuffer(device, buffer, sites) {
    device.queue.writeBuffer(buffer, 0, sites);
}

function updateSitesArray(sites, sitesArray) {
    for (let i = 0; i < sites.length; i++) {
        sitesArray[4*i] = sites[i].pos.x;
        sitesArray[4*i+1] = sites[i].pos.y;
        sitesArray[4*i+2] = sites[i].pos.z;
        sitesArray[4*i+3] = 0;
    }
}

let idTexture = null;
let lastWidth = 0;
let lastHeight = 0;

function describeRenderPassAndResize(device, context) {
    const canvas = context.canvas;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(canvas.clientWidth * dpr);
    const height = Math.floor(canvas.clientHeight * dpr);
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
            alphaMode: "opaque",
        });

        if (idTexture) {
            idTexture.destroy();
        }

        idTexture = device.createTexture({
            size: [width, height],
            format: "r32uint",
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING,
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

    const imgBitmap = await loadImageBitmap('resources/images/image.png'); /* webgpufundamentals: url */
    const texture = createTextureFromSource(device, imgBitmap);
    idTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: "r32uint",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING,
    });

    const maxSites = DEFAULT_MAX_SITES;
    const sites = [];
    const cols = Math.ceil(Math.sqrt(maxSites));
    const rows = Math.ceil(maxSites / cols);
    const cellWidth = canvas.width / cols;
    const cellHeight = canvas.height / rows;
    const jitterFac = 0.6;

    for (let i = 0; i < maxSites; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const jitterX = (0.2 + Math.random() * jitterFac) * cellWidth;
        const jitterY = (0.2 + Math.random() * jitterFac) * cellHeight;
        const site = new Site3D([
            col * cellWidth + jitterX,
            row * cellHeight + jitterY,
            (Math.random() - 0.5) * (PLANE_Z_MAX - PLANE_Z_MIN),
        ]);
        sites.push(site);
    }

    const numSites = sites.length;
    const voronoiSites = new Float32Array(maxSites * 4);
    updateSitesArray(sites, voronoiSites);
    const voronoiSitesBuffer = createSitesBuffer(device, maxSites);

    const uniformBuffer = makeUniforms(device, numSites);
    const voronoiBindGroup = device.createBindGroup({
        layout: voronoiPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: texture.createView() },
            { binding: 2, resource: { buffer: voronoiSitesBuffer } },
        ],
    });
    let edgeBindGroup = createEdgeBindGroup(device, edgePipeline, uniformBuffer, texture, idTexture);

    function renderLoop(r) {
        if (!pause) {
            for (const site of sites) {
                // site.calc();
            }
            for (const site of sites) {
                site.update();
            }

            updateSitesArray(sites, voronoiSites);
            updateSitesBuffer(device, voronoiSitesBuffer, voronoiSites);
        }

        planeZ += planeZVelocity;
        planeZ = clamp(planeZ, PLANE_Z_MIN, PLANE_Z_MAX);
        planeZVelocity *= PLANE_Z_DAMPING;
        if (Math.abs(planeZVelocity) < 0.001) planeZVelocity = 0;

        updateUniforms(uniformBuffer, device, r, planeZ, numSites);

        const [renderPassDescriptor, resized] = describeRenderPassAndResize(device, context);
        if (resized) {
            edgeBindGroup = createEdgeBindGroup(device, edgePipeline, uniformBuffer, texture, idTexture);
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

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
        requestAnimationFrame(() => renderLoop(r + 1));
    }

    renderLoop(0);
}


function fail(msg) {
  // eslint-disable-next-line no-alert
  alert(msg);
}


main();