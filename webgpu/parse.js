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

function createThumbnailSampler(device) {
  return device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
}

function createTextureFromImageBitmap(device, imageBitmap) {
  const texture = device.createTexture({
    size: [imageBitmap.width, imageBitmap.height, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
  });

  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture },
    [imageBitmap.width, imageBitmap.height, 1]
  );

  return texture;
}

async function loadImageBitmapFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load image: ${url}`);
  }
  const blob = await response.blob();
  return await createImageBitmap(blob);
}

async function waitForIdle() {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    await new Promise((resolve) => window.requestIdleCallback(resolve, { timeout: 50 }));
  } else {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function loadThumbnailTextures(device, manifestUrl = THUMBNAIL_MANIFEST_URL) {
  const paths = await retrieveThumbnailPaths(manifestUrl);
  const sampler = createThumbnailSampler(device);
  const textures = [];

  for (const url of paths) {
    await waitForIdle();
    try {
      const imageBitmap = await loadImageBitmapFromUrl(url);
      const texture = createTextureFromImageBitmap(device, imageBitmap);
      textures.push({
        url,
        texture,
        sampler,
        width: imageBitmap.width,
        height: imageBitmap.height,
      });
    } catch (error) {
      console.warn(`Failed to load thumbnail ${url}:`, error);
    }
  }

  return textures;
}

window.loadThumbnailTextures = loadThumbnailTextures;
window.retrieveThumbnailPaths = retrieveThumbnailPaths;
window.THUMBNAIL_MANIFEST_URL = THUMBNAIL_MANIFEST_URL;
