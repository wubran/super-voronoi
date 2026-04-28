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

function flattenThumbnailManifest(manifest, basePath = '') {
  const results = [];

  if (Array.isArray(manifest)) {
    for (const entry of manifest) {
      if (typeof entry === 'string') {
        results.push({
          url: basePath ? `${basePath}/${entry}` : entry,
          width: 1,
          height: 1,
        });
      } else if (entry && typeof entry === 'object') {
        if (typeof entry.url === 'string') {
          results.push({
            url: basePath ? `${basePath}/${entry.url}` : entry.url,
            width: typeof entry.width === 'number' ? entry.width : 1,
            height: typeof entry.height === 'number' ? entry.height : 1,
          });
        } else {
          results.push(...flattenThumbnailManifest(entry, basePath));
        }
      }
    }
    return results;
  }

  if (manifest && typeof manifest === 'object') {
    for (const key of Object.keys(manifest)) {
      results.push(...flattenThumbnailManifest(manifest[key], basePath ? `${basePath}/${key}` : key));
    }
  }

  return results;
}

async function fetchThumbnailManifest(url = THUMBNAIL_MANIFEST_URL) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch thumbnail manifest: ${response.status} ${response.statusText}`);
    }
    const manifest = await response.json();
    return flattenThumbnailManifest(manifest);
  } catch (error) {
    console.warn('Could not load thumbnail manifest, using fallback list.', error);
    return flattenThumbnailManifest(FALLBACK_THUMBNAIL_PATHS);
  }
}

async function retrieveThumbnailMetadata(manifestUrl = THUMBNAIL_MANIFEST_URL) {
  return await fetchThumbnailManifest(manifestUrl);
}

async function retrieveThumbnailPaths(manifestUrl = THUMBNAIL_MANIFEST_URL) {
  const metadata = await retrieveThumbnailMetadata(manifestUrl);
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
    pixelData[offset] = 128;
    pixelData[offset + 1] = 128;
    pixelData[offset + 2] = 128;
    pixelData[offset + 3] = 255;
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
  const info = new Float32Array(layerCount * 2);
  for (let i = 0; i < info.length; i += 2) {
    info[i] = 1.0;
    info[i + 1] = 1.0;
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

  return [Math.max(1, width), Math.max(1, height)];
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

async function fillThumbnailTextureArray(device, texture, infoBuffer, items, width = THUMBNAIL_TILE_SIZE, height = THUMBNAIL_TILE_SIZE) {
  const infoArray = new Float32Array(items.length * 2);

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

      infoArray[layer * 2] = widthToUse;
      infoArray[layer * 2 + 1] = heightToUse;

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
      infoArray[layer * 2] = 1.0;
      infoArray[layer * 2 + 1] = 1.0;
    }
  }

  device.queue.writeBuffer(infoBuffer, 0, infoArray);
}

async function loadThumbnailTextureArray(device, manifestUrl = THUMBNAIL_MANIFEST_URL) {
  const items = await retrieveThumbnailMetadata(manifestUrl);
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
