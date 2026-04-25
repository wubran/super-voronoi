import voronoi from "./shaders/shader.js"

// see https://webgpufundamentals.org/webgpu/lessons/webgpu-utils.html#wgpu-matrix
import { mat4 } from '../3rdparty/wgpu-matrix.module.js';
// see https://webgpufundamentals.org/webgpu/lessons/webgpu-utils.html#webgpu-utils
import {
  loadImageBitmap,
  createTextureFromSource,
} from '../3rdparty/webgpu-utils-1.x.module.js';


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

function makeUniforms(device, r, numSites){
    const uniformValuesAsF32 = new Float32Array(36);
    // const uniformValuesAsU32 = new Uint32Array(uniformValuesAsF32.buffer);
    const uniformBuffer = device.createBuffer({
        label: 'draw histogram uniform buffer',
        size: uniformValuesAsF32.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const subpart = (view, offset, length) => view.subarray(offset, offset + length);
    const cameraMatrix = subpart(uniformValuesAsF32, 0, 16);
    const objectMatrix = subpart(uniformValuesAsF32, 16, 32);
    const time = subpart(uniformValuesAsF32, 32, 33);
    const nSites = subpart(uniformValuesAsF32, 33, 34);
    const padding = subpart(uniformValuesAsF32, 34, 36);
    // mat4.perspective(3*Math.PI/2, 1, 0.1, 1000.0, cameraMatrix);
    // cameraMatrix.set(mat4.perspective(3*Math.PI/2, 1, 0.1, 1000.0))
    const WSCALE = 3;
    const FOCUSZ = -10;
    // NOTE: THIS IS TRANSPOSED!!!
    // const hardcodedCameraMatrix = new Float32Array([
    //     1,0,0,0,
    //     0,1,0,0,
    //     0,0,1,-WSCALE/FOCUSZ,
    //     0,0,0,WSCALE,
    // ]);
    const hardcodedCameraMatrix = new Float32Array([
        1,0,0,0,
        0,1,0,0,
        0,0,1,0,
        0,0,0,1,
    ]);
    // console.log(mat4.translation( [1,2,3], hardcodedCameraMatrix))
    cameraMatrix.set(hardcodedCameraMatrix)
    time.set(new Float32Array([r]))
    nSites.set(new Uint32Array([numSites])) // doesnt actually work. gets casted to float...
    padding.set(new Float32Array([0, 0]))


    mat4.identity(objectMatrix);
    // mat4.translate(objectMatrix, [0,0,2], objectMatrix); // why are these transformations in reverse order!?
    // mat4.rotateX(objectMatrix, r, objectMatrix);
    // mat4.rotateZ(objectMatrix, r, objectMatrix);

    device.queue.writeBuffer(uniformBuffer, 0, uniformValuesAsF32);
    // console.log(uniformValuesAsF32)
    return uniformBuffer
}

function createSitesBuffer(device, maxSites) {
    return device.createBuffer({
        size: maxSites * 2 * 4, // vec2<f32>
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
}


// length of sites must be <= maxSites * 2
function updateSitesBuffer(device, buffer, sites) {
    device.queue.writeBuffer(buffer, 0, sites);
}

function updateSitesArray(sites, sitesArray) {
    for (let i = 0; i < sites.length; i++) {
        sitesArray[2*i] = sites[i].pos.x;
        sitesArray[2*i+1] = sites[i].pos.y;
    }
}


// function describeRenderPassAndResize(device, context){
//     let depthTexture;
//     context.canvas.width = context.canvas.offsetWidth
//     context.canvas.height = context.canvas.offsetHeight
//     const canvasTexture = context.getCurrentTexture()
//     // Get the current texture from the canvas context and
//     // set it as the texture to render to.
//     const renderPassDescriptor = {
//         label: 'our basic canvas renderPass',
//         colorAttachments: [
//         {
//             view: canvasTexture.createView(),
//             clearValue: [0, 0.3, 0.3, 1],
//             loadOp: 'clear',
//             storeOp: 'store',
//         },
//         ],
//         depthStencilAttachment: {
//         // view: <- to be filled out when we render
//         depthClearValue: 1.0,
//         depthLoadOp: 'clear',
//         depthStoreOp: 'store',
//         },
//     };

//     if (!depthTexture ||
//         depthTexture.width !== canvasTexture.width ||
//         depthTexture.height !== canvasTexture.height) {
//         if (depthTexture) {
//         depthTexture.destroy();
//         }
//         depthTexture = device.createTexture({
//         size: [canvasTexture.width, canvasTexture.height],
//         format: 'depth24plus',
//         usage: GPUTextureUsage.RENDER_ATTACHMENT,
//         });
//     }
//     renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();
//     return [renderPassDescriptor, canvasTexture]
// }

let depthTexture = null;
let lastWidth = 0;
let lastHeight = 0;

function describeRenderPassAndResize(device, context) {
    const canvas = context.canvas;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(canvas.clientWidth * dpr);
    const height = Math.floor(canvas.clientHeight * dpr);

    // ✅ Only resize when needed
    if (width !== lastWidth || height !== lastHeight) {
        lastWidth = width;
        lastHeight = height;

        canvas.width = width;
        canvas.height = height;

        context.configure({
            device,
            format: navigator.gpu.getPreferredCanvasFormat(),
            alphaMode: "opaque",
        });

        // ✅ Recreate depth texture ONLY on resize
        if (depthTexture) {
            depthTexture.destroy();
        }

        depthTexture = device.createTexture({
            size: [width, height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    // ✅ Always get fresh swapchain texture
    const canvasTexture = context.getCurrentTexture();

    const renderPassDescriptor = {
        label: 'our basic canvas renderPass',
        colorAttachments: [
            {
                view: canvasTexture.createView(),
                clearValue: [0, 0.3, 0.3, 1],
                loadOp: 'clear',
                storeOp: 'store',
            },
        ],
        depthStencilAttachment: {
            view: depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
        },
    };

    return [renderPassDescriptor, canvasTexture];
}


async function main() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
        fail('need a browser that supports WebGPU');
        return;
    }

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    var [canvas, context] = prepareCanvas(device, presentationFormat);


    const drawHistogramModule = device.createShaderModule({
        label: 'draw histogram shader',
        code: voronoi,
    });

    
    let m = {array: simpleRectangleMesh(), isNew: true}
    // let meshes = [m]
    let vbuffers = [vbuffer_from_mesh(device, m)]
 

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
    const drawHistogramPipeline = device.createRenderPipeline({
        label: 'draw histogram',
        layout: 'auto',
        vertex: {
        module: drawHistogramModule,
        entryPoint: 'vs',
        buffers: [vertexBufferLayout],  // The layout of the vertex buffer.
        },
        fragment: {
        module: drawHistogramModule,
        entryPoint: 'fs',
        targets: [{ format: presentationFormat }],
        },
        primitive: {
            topology: 'triangle-list',  // Draw triangles from the vertices.
        },
        depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
        },
    });
    // const edgePipeline = device.createRenderPipeline({
    //     layout: "auto",
    //     vertex: {
    //         module: vertexModule,
    //         entryPoint: "vs_main",
    //     },
    //     fragment: {
    //         module: edgeShaderModule,
    //         entryPoint: "fs_main",
    //         targets: [{
    //         format: presentationFormat
    //         }]
    //     },
    //     primitive: {
    //         topology: "triangle-list"
    //     }
    // });

    const imgBitmap = await loadImageBitmap('resources/images/hoco pic.jpg'); /* webgpufundamentals: url */
    const texture = createTextureFromSource(device, imgBitmap);
    // const sampler = device.createSampler({
    //     magFilter: "linear",
    //     minFilter: "linear",
    // });
    const idTexture = device.createTexture({
    size: [texture.width, texture.height],
    format: "r32uint",
    usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING
    });
    const maxSites = 50;

    const sites = [];
    const siteTree = new Quadtree(0, 0, 1, 1);
    for (let i = 0; i < maxSites; i++) {
        const site = new Site2D([Math.random(), Math.random()]);
        sites.push(site);
        siteTree.insert(site.pos.x, site.pos.y);
    }
    const numSites = sites.length
    const voronoiSites = new Float32Array(maxSites * 2);
    updateSitesArray(sites, voronoiSites)
    let voronoiSitesBuffer = createSitesBuffer(device, maxSites);

    let uniformBuffer = makeUniforms(device, 0, numSites)
    const bindGroup = device.createBindGroup({
        layout: drawHistogramPipeline.getBindGroupLayout(0),
        entries: [
        { binding: 0, resource: { buffer: uniformBuffer } }, // matrices
        { binding: 1, resource: texture.createView() }, // textures
        // { binding: 2, resource: sampler },
        { binding: 2, resource: { buffer: voronoiSitesBuffer } }, // voronoi sites
        ],
    });

    function renderLoop(r){
        if(!pause){
            for(let site of sites){
                site.calc();
            }
            for(let site of sites){
                site.update();
            }
            updateSitesArray(sites, voronoiSites)
            updateSitesBuffer(device, voronoiSitesBuffer, voronoiSites)
        }

        let [renderPassDescriptor, canvasTexture] = describeRenderPassAndResize(device, context)

        const encoder = device.createCommandEncoder({ label: 'render histogram' });
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(drawHistogramPipeline);
        pass.setBindGroup(0, bindGroup);
        // console.log(vbuffers)
        for (let i = 0; i<vbuffers.length; i++){
            if(i != vbuffers.length-1){
                continue
            }
            pass.setVertexBuffer(0, vbuffers[i]); // Slot 0 should be used here
            // pass.draw(meshes[i].array.length/8, 1, 0, 0); // 8 floats per vertex
            pass.draw(vbuffers[i].size/32, 1, 0, 0); // 8 floats per vertex
        }
        pass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
        requestAnimationFrame(() => renderLoop(r))
        // requestAnimationFrame(() => renderLoop(r))
    }

    renderLoop(0);
}


function fail(msg) {
  // eslint-disable-next-line no-alert
  alert(msg);
}


main();