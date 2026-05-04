const THUMBNAIL_MANIFEST_URL = 'resources/images/thumbnails/manifest.json';

const FALLBACK_THUMBNAIL_PATHS = [
  'resources/images/thumbnails/fish/earlyfish.jpg',
  'resources/images/thumbnails/fish/naval_academy_cart.JPG',
  'resources/images/thumbnails/fish/naval_academy_fish.JPG',
  'resources/images/thumbnails/food/died_tomatoes.JPG',
  'resources/images/thumbnails/food/hand_noodles.jpg',
  'resources/images/thumbnails/food/musubi.jpg',
  'resources/images/thumbnails/food/shrimp_pesto.jpg',
  'resources/images/thumbnails/outside/fall_campus.JPG',
  'resources/images/thumbnails/outside/kenilworth.jpg',
  'resources/images/thumbnails/outside/kenilworth_bud.jpg',
  'resources/images/thumbnails/outside/kenilworth_keychain.jpg',
  'resources/images/thumbnails/outside/patapsco.jpg',
  'resources/images/thumbnails/outside/patapsco_again.JPG',
  'resources/images/thumbnails/outside/patapsco_green.JPG',
  'resources/images/thumbnails/outside/patapsco_snow.JPG',
  'resources/images/thumbnails/outside/quad_biking.jpg',
  'resources/images/thumbnails/outside/solar_eclispe.JPG',
  'resources/images/thumbnails/outside/yellowstone_artist.JPG',
  'resources/images/thumbnails/outside/yellowstone_falls.JPG',
  'resources/images/thumbnails/outside/yellowstone_steam.JPG',
  'resources/images/thumbnails/rov/capstone_fair.jpg',
  'resources/images/thumbnails/rov/rov_carrier_bare.jpg',
  'resources/images/thumbnails/rov/rov_corpse.jpg',
  'resources/images/thumbnails/rov/rov_disemboweled.jpg',
];

// warning: all this basepath concat stuff has been lazily nullified
function getArtifactsManifest(manifest) {
  let artifacts = manifest["artifacts"];
  const results = [];

  for (const entry of artifacts) {
    results.push({
      url: entry.url,
      width: typeof entry.width === 'number' ? entry.width : 1,
      height: typeof entry.height === 'number' ? entry.height : 1,
      color: typeof entry.color === 'string' ? entry.color : "#000000.FF",
      blurb: typeof entry.blurb === 'string' ? entry.blurb : '',
      headerText: typeof entry.headerText === 'string' ? entry.headerText : '',
      tags: typeof entry.tags === 'object' ? entry.tags : [],
      bodyText: typeof entry.bodyText === 'string' ? entry.bodyText : '',
    });
  }
  return results;
}

function getTagsManifest(manifest){
  // const results = {};
  // let tags = manifest["tags"];
  // for (const tag of tags){
  //   // results.push({
  //   //   name: tag.name,
  //   //   blurb: tag.blurb,
  //   // });
  //   results[tag.name] = tag.blurb;
  // }
  // return results;
  return manifest["tags"];
}

async function fetchThumbnailManifest(url = THUMBNAIL_MANIFEST_URL) {
  // try {
    const response = await fetch(url);
  //   if (!response.ok) {
  //     throw new Error(`Failed to fetch thumbnail manifest: ${response.status} ${response.statusText}`);
  //   }
    const manifest = await response.json();
    const tags = getTagsManifest(manifest);
    const artifacts = getArtifactsManifest(manifest);
    for(let artifact of artifacts){
      for(let i = 0; i<artifact.tags.length; i++){
        let tag = artifact.tags[i];
        if (!tags[tag]){
          console.log(`tag \'${tag}\' not recognized!`);
          artifact.tags.splice(i,1);
          i--;
        }
      }
    }
    return [artifacts, tags];
  // } catch (error) {
  //   console.warn('Could not load thumbnail manifest, using fallback list.', error);
  //   return flattenThumbnailManifest(FALLBACK_THUMBNAIL_PATHS);
  // }
}

async function retrieveThumbnailMetadata(manifestUrl = THUMBNAIL_MANIFEST_URL) {
  return await fetchThumbnailManifest(manifestUrl)
}

async function retrieveThumbnailPaths(manifestUrl = THUMBNAIL_MANIFEST_URL) {
  const [metadata, tags] = await retrieveThumbnailMetadata(manifestUrl);
  return metadata.map((item) => item.url);
}

const THUMBNAIL_TILE_SIZE = 256;
const MAX_THUMBNAIL_LAYERS = 64;

function createThumbnailSampler(device) {
  return device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
}

function createPlaceholderThumbnailArrayTexture(device, width = THUMBNAIL_TILE_SIZE, height = THUMBNAIL_TILE_SIZE, layers = 1) {
  const texture = device.createTexture({
    size: [width, height, layers],
    dimension: '2d',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
  });

  const pixelData = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < pixelData.length; offset += 4) {
    pixelData[offset] = 0;
    pixelData[offset + 1] = 0;
    pixelData[offset + 2] = 0;
    pixelData[offset + 3] = 0;
  }

  for (let layer = 0; layer < layers; layer++) {
    device.queue.writeTexture(
      { texture, origin: [0, 0, layer] },
      pixelData,
      { bytesPerRow: width * 4, rowsPerImage: height },
      [width, height, 1]
    );
  }

  return texture;
}

function createThumbnailInfoBuffer(device, layerCount) {
  const info = new Float32Array(layerCount * 8);
  for (let i = 0; i < info.length; i += 8) {
    info[i] = 1.0;
    info[i + 1] = 1.0;

    info[i + 2] = 0.0;
    info[i + 3] = 0.0;

    info[i + 4] = 0.0;
    info[i + 5] = 0.0;
    info[i + 6] = 0.0;
    info[i + 7] = 0.0;
  }

  const buffer = device.createBuffer({
    size: info.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set(info);
  buffer.unmap();
  return buffer;
}

function fitThumbnailToTile(origWidth, origHeight, maxWidth, maxHeight) {
  const aspect = origWidth / origHeight;
  let width = maxWidth;
  let height = Math.floor(maxWidth / aspect);

  if (height > maxHeight) {
    height = maxHeight;
    width = Math.floor(maxHeight * aspect);
  }

  // return [Math.max(1, width), Math.max(1, height)];
  return [255, 255];
}

async function waitForIdle() {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    await new Promise((resolve) => window.requestIdleCallback(resolve, { timeout: 50 }));
  } else {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function loadImageBitmapFromUrl(url, options) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load image: ${url}`);
  }
  const blob = await response.blob();
  return options ? await createImageBitmap(blob, options) : await createImageBitmap(blob);
}

function hexToRGBA(hex) {
  hex = hex.slice(1,10);

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // const a = hex.length === 8 ? parseInt(hex.slice(7, 9), 16) : 255;
  const a = 255;
  return [r, g, b, a];
}

async function fillThumbnailTextureArray(device, texture, infoBuffer, items, width = THUMBNAIL_TILE_SIZE, height = THUMBNAIL_TILE_SIZE) {
  const infoArray = new Float32Array(items.length * 8);

  for (let layer = 0; layer < items.length && layer < MAX_THUMBNAIL_LAYERS; layer++) {
    const item = items[layer];
    await waitForIdle();
    try {
      const response = await fetch(item.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch thumbnail ${item.url}: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      const origWidth = typeof item.width === 'number' && item.width > 0 ? item.width : undefined;
      const origHeight = typeof item.height === 'number' && item.height > 0 ? item.height : undefined;
      let widthToUse = origWidth;
      let heightToUse = origHeight;
      let originalImage;

      if (widthToUse === undefined || heightToUse === undefined) {
        originalImage = await createImageBitmap(blob);
        widthToUse = originalImage.width;
        heightToUse = originalImage.height;
      }
      let color = typeof item.color === 'string' ? item.color : "#000000.FF"
      let r,g,b,a = hexToRGBA(color);
      infoArray[layer * 8] = widthToUse;
      infoArray[layer * 8 + 1] = heightToUse;

      infoArray[layer * 8 + 2] = 0.0;
      infoArray[layer * 8 + 3] = 0.0;

      infoArray[layer * 8 + 4] = r;
      infoArray[layer * 8 + 5] = g;
      infoArray[layer * 8 + 6] = b;
      infoArray[layer * 8 + 7] = a;

      const [destWidth, destHeight] = fitThumbnailToTile(widthToUse, heightToUse, width, height);
      const resizedImage = (!originalImage || destWidth !== widthToUse || destHeight !== heightToUse)
        ? await createImageBitmap(blob, { resizeWidth: destWidth, resizeHeight: destHeight, resizeQuality: 'high' })
        : originalImage;

      const originX = Math.floor((width - destWidth) / 2);
      const originY = Math.floor((height - destHeight) / 2);
      device.queue.copyExternalImageToTexture(
        { source: resizedImage },
        { texture, origin: [originX, originY, layer] },
        [destWidth, destHeight, 1]
      );
    } catch (error) {
      console.warn(`Failed to fill thumbnail layer ${layer} from ${item.url}:`, error);
      infoArray[layer * 8] = 1.0;
      infoArray[layer * 8 + 1] = 1.0;

      infoArray[layer * 8 + 2] = 0.0;
      infoArray[layer * 8 + 3] = 0.0;

      infoArray[layer * 8 + 4] = 0.0;
      infoArray[layer * 8 + 5] = 0.0;
      infoArray[layer * 8 + 6] = 0.0;
      infoArray[layer * 8 + 7] = 0.0;
    }
  }

  device.queue.writeBuffer(infoBuffer, 0, infoArray);
}

async function loadThumbnailTextureArray(device, manifestUrl = THUMBNAIL_MANIFEST_URL) {
  const [items, tags] = await retrieveThumbnailMetadata(manifestUrl);
  const entries = items.slice(0, MAX_THUMBNAIL_LAYERS);
  const layerCount = Math.max(1, entries.length);
  const sampler = createThumbnailSampler(device);
  const texture = createPlaceholderThumbnailArrayTexture(device, THUMBNAIL_TILE_SIZE, THUMBNAIL_TILE_SIZE, layerCount);
  const infoBuffer = createThumbnailInfoBuffer(device, layerCount);

  await fillThumbnailTextureArray(device, texture, infoBuffer, entries, THUMBNAIL_TILE_SIZE, THUMBNAIL_TILE_SIZE);

  return {
    texture,
    sampler,
    infoBuffer,
    layerCount,
    width: THUMBNAIL_TILE_SIZE,
    height: THUMBNAIL_TILE_SIZE,
    urls: entries.map((entry) => entry.url),
    entries,
  };
}

window.loadThumbnailTextureArray = loadThumbnailTextureArray;
window.loadThumbnailTextures = loadThumbnailTextureArray;
window.createPlaceholderThumbnailArrayTexture = createPlaceholderThumbnailArrayTexture;
window.createThumbnailInfoBuffer = createThumbnailInfoBuffer;
window.fillThumbnailTextureArray = fillThumbnailTextureArray;
window.retrieveThumbnailPaths = retrieveThumbnailPaths;
window.THUMBNAIL_MANIFEST_URL = THUMBNAIL_MANIFEST_URL;
