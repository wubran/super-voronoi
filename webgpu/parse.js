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
        results.push(basePath ? `${basePath}/${entry}` : entry);
      } else if (typeof entry === 'object' && entry !== null) {
        results.push(...flattenThumbnailManifest(entry, basePath));
      }
    }
    return results;
  }

  if (typeof manifest === 'object' && manifest !== null) {
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
    return [...FALLBACK_THUMBNAIL_PATHS];
  }
}

async function retrieveThumbnailPaths(manifestUrl = THUMBNAIL_MANIFEST_URL) {
  const paths = await fetchThumbnailManifest(manifestUrl);
  return paths.filter((path) => typeof path === 'string' && path.length > 0);
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

async function waitForIdle() {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    await new Promise((resolve) => window.requestIdleCallback(resolve, { timeout: 50 }));
  } else {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function loadImageBitmapFromUrl(url, width, height) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load image: ${url}`);
  }
  const blob = await response.blob();
  const options = width && height ? { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' } : undefined;
  return options ? await createImageBitmap(blob, options) : await createImageBitmap(blob);
}

async function fillThumbnailTextureArray(device, texture, urls, width = THUMBNAIL_TILE_SIZE, height = THUMBNAIL_TILE_SIZE) {
  for (let layer = 0; layer < urls.length && layer < MAX_THUMBNAIL_LAYERS; layer++) {
    await waitForIdle();
    try {
      const imageBitmap = await loadImageBitmapFromUrl(urls[layer], width, height);
      device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture, origin: [0, 0, layer] },
        [width, height, 1]
      );
    } catch (error) {
      console.warn(`Failed to fill thumbnail layer ${layer} from ${urls[layer]}:`, error);
    }
  }
}

async function loadThumbnailTextureArray(device, manifestUrl = THUMBNAIL_MANIFEST_URL) {
  const paths = await retrieveThumbnailPaths(manifestUrl);
  const urls = paths.slice(0, MAX_THUMBNAIL_LAYERS);
  const layerCount = Math.max(1, urls.length);
  const sampler = createThumbnailSampler(device);
  const texture = createPlaceholderThumbnailArrayTexture(device, THUMBNAIL_TILE_SIZE, THUMBNAIL_TILE_SIZE, layerCount);

  await fillThumbnailTextureArray(device, texture, urls, THUMBNAIL_TILE_SIZE, THUMBNAIL_TILE_SIZE);

  return {
    texture,
    sampler,
    layerCount,
    width: THUMBNAIL_TILE_SIZE,
    height: THUMBNAIL_TILE_SIZE,
    urls,
  };
}

window.loadThumbnailTextureArray = loadThumbnailTextureArray;
window.loadThumbnailTextures = loadThumbnailTextureArray;
window.createPlaceholderThumbnailArrayTexture = createPlaceholderThumbnailArrayTexture;
window.fillThumbnailTextureArray = fillThumbnailTextureArray;
window.retrieveThumbnailPaths = retrieveThumbnailPaths;
window.THUMBNAIL_MANIFEST_URL = THUMBNAIL_MANIFEST_URL;
