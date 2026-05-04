const fs = require('fs');
const path = require('path');

const jimp = require('jimp');
const { Jimp, intToRGBA } = jimp;

const WEBGPU_ROOT = path.resolve(__dirname, '..');
const THUMBNAIL_DIR = path.join(WEBGPU_ROOT, 'resources', 'images', 'thumbnails');
const MANIFEST_PATH = path.join(THUMBNAIL_DIR, 'manifest.json');
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];

function isImageFile(fileName) {
  return IMAGE_EXTENSIONS.includes(path.extname(fileName).toLowerCase());
}

function isTagFile(fileName) {
  let base = path.basename(fileName).slice(0, -4);
  return path.extname(fileName).toLowerCase() == ".txt" && base == base.toUpperCase();
}

function walkDirectory(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const imagefiles = [];
  const tagFiles = [];

  for (const entry of entries) {
    const targetPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      let [imgs, tags] = walkDirectory(targetPath)
      imagefiles.push(...imgs);
      tagFiles.push(...tags);
    } else if (entry.isFile() && isImageFile(entry.name)) {
      imagefiles.push(targetPath);
    } else if (entry.isFile() && isTagFile(entry.name)) {
      tagFiles.push(targetPath);
    } 
  }
  return [imagefiles, tagFiles];
}

function readUInt24BE(buffer, offset) {
  return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
}

function getImageSize(filePath) {
  const buffer = fs.readFileSync(filePath);

  if (buffer.length < 24) {
    throw new Error(`Image file too small: ${filePath}`);
  }

  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer.slice(0, 3).toString('ascii') === 'GIF') {
    return {
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }

  if (buffer.slice(0, 2).toString('ascii') === 'BM') {
    return {
      width: buffer.readUInt32LE(18),
      height: Math.abs(buffer.readInt32LE(22)),
    };
  }

  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    if (buffer.slice(12, 16).toString('ascii') === 'VP8 ') {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (buffer.slice(12, 16).toString('ascii') === 'VP8L') {
      const bits = buffer.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (buffer.slice(12, 16).toString('ascii') === 'VP8X') {
      return {
        width: readUInt24BE(buffer, 24) + 1,
        height: readUInt24BE(buffer, 27) + 1,
      };
    }
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        throw new Error(`Invalid JPEG marker at offset ${offset}: ${filePath}`);
      }

      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3 || marker >= 0xc5 && marker <= 0xc7 || marker >= 0xc9 && marker <= 0xcb || marker >= 0xcd && marker <= 0xcf) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }

      offset += 2 + length;
    }
  }

  throw new Error(`Unsupported image format: ${filePath}`);
}

function normalizeUrl(filePath) {
  const relative = path.relative(WEBGPU_ROOT, filePath).replace(/\\/g, '/');
  return relative;
}

function rgbToHex(r, g, b) {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b)
    .toString(16)
    .slice(1)
    .toUpperCase()}`;
}

async function getRepresentativeColor(filePath) {
  const image = await Jimp.read(filePath);
  const thumbnail = image.clone().resize({
    w: 8,
    h: 8,
    mode: "nearestNeighbor"
  });
  let r = 0, g = 0, b = 0;
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      const { r: pr, g: pg, b: pb } = intToRGBA(
        thumbnail.getPixelColor(x, y)
      );
      r += pr; g += pg; b += pb;
    }
  }

  const total = 64;
  return rgbToHex(r / total, g / total, b / total);
}


function parseBlurb(blurb, url){
  let bodyStart = 1;
  const filename = url ? url.replace(/^.*[\/]/, '').replace(/\.[^/.]+$/, '') : '';
  const rawBlurb = typeof blurb === 'string' ? blurb : '';
  const lines = rawBlurb.split(/\r?\n/);
  const dateLine = lines.length > 0 && lines[0].trim() !== '' ? lines[0].trim() : filename;
  const tags = lines.length > 1 && lines[1].startsWith('TAGS') ? lines[1].trim().split("#").slice(1) : [];
  if(tags.length > 0){
    bodyStart = 2;
  }
  const bodyText = lines.length >= bodyStart ? lines.slice(bodyStart).join('\n').trim() : "";
  const headerText = filename ? `${dateLine} · ${filename}` : dateLine;
  return [headerText, tags, bodyText]
}


async function generateManifest() {
  if (!fs.existsSync(THUMBNAIL_DIR)) {
    throw new Error(`Thumbnail directory not found: ${THUMBNAIL_DIR}`);
  }

  const [imageFiles, tagFiles] = walkDirectory(THUMBNAIL_DIR).sort();
  const manifestItems = await Promise.all(imageFiles.map(async (filePath) => {
    const { width, height } = getImageSize(filePath);
    const color = await getRepresentativeColor(filePath);
    const blurbPath = path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}.txt`);
    let blurb = '';
    if (fs.existsSync(blurbPath) && fs.statSync(blurbPath).isFile()) {
      blurb = fs.readFileSync(blurbPath, 'utf8').trim();
    }
    const [headerText, tags, bodyText] = parseBlurb(blurb, filePath)
    return {
      url: normalizeUrl(filePath),
      width,
      height,
      color,
      blurb,
      headerText,
      tags,
      bodyText,
    };
  }));
  manifestItems.sort((a, b) => {
    const parse = s => {
      const [m, d, y] = s.split(/\r?\n| /)[0].split("/").map(Number);
      return new Date(y < 100 ? y + 2000 : y, m - 1, d);
    };
    return parse(b.blurb) - parse(a.blurb);
  });
  const tagItems = await Promise.all(tagFiles.map(async (filePath) => {
    let blurb = '';
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      blurb = fs.readFileSync(filePath, 'utf8').trim();
    }
    return {
      url: normalizeUrl(filePath),
      blurb,
    }
  }));
  // for(let i = 0; i<manifestItems.length; i++){
  //   const item = manifestItems[i];
  //   const parse = s => {
  //     const [m, d, y] = s.split(/\r?\n| /)[0].split("/").map(Number);
  //     console.log(m,d,y)
  //     return new Date(y < 100 ? y + 2000 : y, m - 1, d);
  //   };
  //   console.log(parse(item.blurb), item.url)
  // }
  let output = {"artifacts": manifestItems, "tags":tagItems}
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Generated ${manifestItems.length} thumbnail entries in ${MANIFEST_PATH}`);
}

if (require.main === module) {
  generateManifest().catch((error) => {
    console.error('Failed to generate thumbnail manifest:', error);
    process.exit(1);
  });
}
