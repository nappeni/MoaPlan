import { ImageMagick, initializeImageMagick, MagickFormat } from '@imagemagick/magick-wasm';
import fs from 'node:fs/promises';
let ready;
export async function optimize(buffer) {
  ready ||= fs.readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm'))).then(initializeImageMagick);
  await ready;
  if (buffer.length > 15 * 1024 * 1024) throw new Error('Image exceeds 15 MB');
  return ImageMagick.read(new Uint8Array(buffer), (img) => {
    if (img.width * img.height > 16000000) throw new Error('Image exceeds 16 megapixels');
    img.autoOrient();
    const ratio = Math.min(1, 1080 / img.width, 1350 / img.height);
    img.resize(Math.max(1, Math.round(img.width * ratio)), Math.max(1, Math.round(img.height * ratio)));
    img.strip();
    const width = img.width;
    let out;
    for (const quality of [85, 78, 70]) {
      img.quality = quality;
      out = img.write(MagickFormat.Jpeg, (data) => Buffer.from(data));
      if (out.length <= 500 * 1024) break;
    }
    img.resize(320, Math.max(1, Math.round(img.height * 320 / img.width)));
    img.quality = 65;
    const thumb = img.write(MagickFormat.WebP, (data) => Buffer.from(data));
    return {out, thumb, width};
  });
}
