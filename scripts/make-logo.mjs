// Turns the white-background logo into a trimmed transparent PNG. Usage: node scripts/make-logo.mjs <in> <out.png> [width]
import sharp from 'sharp';
const [inp, out, w = '900'] = process.argv.slice(2);
const { data, info } = await sharp(inp, { limitInputPixels: false }).trim({ threshold: 20 }).resize(Number(w)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const rgba = Buffer.alloc(info.width * info.height * 4);
for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const a = 1 - Math.min(r, g, b) / 255; // white -> fully transparent, keeps soft edges
  if (a < 0.02) continue;
  rgba[j] = Math.round((r - 255 * (1 - a)) / a);
  rgba[j + 1] = Math.round((g - 255 * (1 - a)) / a);
  rgba[j + 2] = Math.round((b - 255 * (1 - a)) / a);
  rgba[j + 3] = Math.round(a * 255);
}
await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(out);
console.log(info.width, info.height);
