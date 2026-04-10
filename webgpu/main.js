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


// getting rid of this trash
function bruh(r){
    // PUT IT ALL TOGETHER
    // create a uniform containing projection matrix (4x4) and object transformation matrix (4x4)
    let depthTexture;
    if(pause){
        requestAnimationFrame(() => bruh(r))
        return
    }
    for(let m of meshes){
        if(m.isNew){
        vbuffers.push(vbuffer_from_mesh(m))
        m.isNew = false
        }
    }

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
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
    const padding = subpart(uniformValuesAsF32, 33, 36);
    // mat4.perspective(3*Math.PI/2, 1, 0.1, 1000.0, cameraMatrix);
    // cameraMatrix.set(mat4.perspective(3*Math.PI/2, 1, 0.1, 1000.0))
    const WSCALE = 3;
    const FOCUSZ = -10;
    // NOTE: THIS IS TRANSPOSED!!!
    const hardcodedCameraMatrix = new Float32Array([
        1,0,0,0,
        0,1,0,0,
        0,0,1,-WSCALE/FOCUSZ,
        0,0,0,WSCALE,
    ]);
    // console.log(mat4.translation( [1,2,3], hardcodedCameraMatrix))
    cameraMatrix.set(hardcodedCameraMatrix)
    time.set(new Float32Array([r]))
    padding.set(new Float32Array([0, 0, 0]))


    mat4.identity(objectMatrix);
    mat4.translate(objectMatrix, [0,0,2], objectMatrix); // why are these transformations in reverse order!?
    mat4.rotateX(objectMatrix, r, objectMatrix);
    mat4.rotateZ(objectMatrix, r, objectMatrix);

    // console.log("mine", objectMatrix)
    // console.log("bruh", objectMatrix)

    device.queue.writeBuffer(uniformBuffer, 0, uniformValuesAsF32);
    // console.log(uniformValuesAsF32)


    const bindGroup = device.createBindGroup({
        layout: drawHistogramPipeline.getBindGroupLayout(0),
        entries: [
        { binding: 0, resource: { buffer: uniformBuffer } }, // matrices
        { binding: 1, resource: texture.createView() }, // textures
        ],
    });

    const canvasTexture = context.getCurrentTexture()

    // Get the current texture from the canvas context and
    // set it as the texture to render to.
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
        // view: <- to be filled out when we render
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        },
    };

    if (!depthTexture ||
        depthTexture.width !== canvasTexture.width ||
        depthTexture.height !== canvasTexture.height) {
        if (depthTexture) {
        depthTexture.destroy();
        }
        depthTexture = device.createTexture({
        size: [canvasTexture.width, canvasTexture.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }
    renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();


    const encoder = device.createCommandEncoder({ label: 'render histogram' });
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(drawHistogramPipeline);
    pass.setBindGroup(0, bindGroup);
    for (let i = 0; i<meshes.length; i++){
        if(i != meshes.length-1){
        continue
        }
        pass.setVertexBuffer(0, vbuffers[i]); // Slot 0 should be used here
        pass.draw(meshes[i].array.length/8, 1, 0, 0); // 8 floats per vertex
    }

    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
    requestAnimationFrame(() => bruh(r+0.01))
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

function makeCameraMatrix(device, r){
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
    const padding = subpart(uniformValuesAsF32, 33, 36);
    // mat4.perspective(3*Math.PI/2, 1, 0.1, 1000.0, cameraMatrix);
    // cameraMatrix.set(mat4.perspective(3*Math.PI/2, 1, 0.1, 1000.0))
    const WSCALE = 3;
    const FOCUSZ = -10;
    // NOTE: THIS IS TRANSPOSED!!!
    const hardcodedCameraMatrix = new Float32Array([
        1,0,0,0,
        0,1,0,0,
        0,0,1,-WSCALE/FOCUSZ,
        0,0,0,WSCALE,
    ]);
    // console.log(mat4.translation( [1,2,3], hardcodedCameraMatrix))
    cameraMatrix.set(hardcodedCameraMatrix)
    time.set(new Float32Array([r]))
    padding.set(new Float32Array([0, 0, 0]))


    mat4.identity(objectMatrix);
    mat4.translate(objectMatrix, [0,0,2], objectMatrix); // why are these transformations in reverse order!?
    mat4.rotateX(objectMatrix, r, objectMatrix);
    mat4.rotateZ(objectMatrix, r, objectMatrix);

    // console.log("mine", objectMatrix)
    // console.log("bruh", objectMatrix)

    device.queue.writeBuffer(uniformBuffer, 0, uniformValuesAsF32);
    // console.log(uniformValuesAsF32)
    return uniformBuffer
}

function describeRenderPassAndResize(device, context){
    let depthTexture;
    context.canvas.width = context.canvas.offsetWidth
    context.canvas.height = context.canvas.offsetHeight
    const canvasTexture = context.getCurrentTexture()
    // Get the current texture from the canvas context and
    // set it as the texture to render to.
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
        // view: <- to be filled out when we render
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        },
    };

    if (!depthTexture ||
        depthTexture.width !== canvasTexture.width ||
        depthTexture.height !== canvasTexture.height) {
        if (depthTexture) {
        depthTexture.destroy();
        }
        depthTexture = device.createTexture({
        size: [canvasTexture.width, canvasTexture.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }
    renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();
    return [renderPassDescriptor, canvasTexture]
}


// function renderLoop(device, context, drawHistogramPipeline, texture, renderPassDescriptor, vbuffers, r){
//     if(pause){
//         requestAnimationFrame(() => bruh(r))
//         return
//     }
//     let uniformBuffer = makeCameraMatrix(device, r)

//     const bindGroup = device.createBindGroup({
//         layout: drawHistogramPipeline.getBindGroupLayout(0),
//         entries: [
//         { binding: 0, resource: { buffer: uniformBuffer } }, // matrices
//         { binding: 1, resource: texture.createView() }, // textures
//         ],
//     });

//     describeRenderPassAndResize(device, context)

//     const encoder = device.createCommandEncoder({ label: 'render histogram' });
//     const pass = encoder.beginRenderPass(renderPassDescriptor);
//     pass.setPipeline(drawHistogramPipeline);
//     pass.setBindGroup(0, bindGroup);
//     // console.log(vbuffers)
//     for (let i = 0; i<vbuffers.length; i++){
//         if(i != vbuffers.length-1){
//             continue
//         }
//         pass.setVertexBuffer(0, vbuffers[i]); // Slot 0 should be used here
//         // pass.draw(meshes[i].array.length/8, 1, 0, 0); // 8 floats per vertex
//         pass.draw(3, 1, 0, 0); // 8 floats per vertex
//     }

//     pass.end();

//     const commandBuffer = encoder.finish();
//     device.queue.submit([commandBuffer]);
//     requestAnimationFrame(() => renderLoop(device, context, drawHistogramPipeline, texture, renderPassDescriptor, vbuffers, r+0.01))
// }


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

    const imgBitmap = await loadImageBitmap('resources/images/hoco pic.jpg'); /* webgpufundamentals: url */
    const texture = createTextureFromSource(device, imgBitmap);
    const sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
    });
    // let renderPassDescriptor, canvasTexture = describeRenderPassAndResize(device, context);
    // let renderPassDescriptor, canvasTexture;

    function renderLoop(r){
        if(pause){
            requestAnimationFrame(() => bruh(r))
            return
        }
        let uniformBuffer = makeCameraMatrix(device, r)
        const bindGroup = device.createBindGroup({
            layout: drawHistogramPipeline.getBindGroupLayout(0),
            entries: [
            { binding: 0, resource: { buffer: uniformBuffer } }, // matrices
            { binding: 1, resource: texture.createView() }, // textures
            { binding: 2, resource: sampler },
            ],
        });

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
            pass.draw(6, 1, 0, 0); // 8 floats per vertex
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