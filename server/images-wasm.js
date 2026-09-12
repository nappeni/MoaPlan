import { Buffer } from 'node:buffer';
import { ImageMagick, initializeImageMagick, MagickFormat, MagickColor, AlphaAction } from '@imagemagick/magick-wasm';
let ready;
let loader = async () => {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm')));
};
export function setWasmLoader(value) { loader = value; }
export async function optimize(buffer) {
  if (buffer.length > 15 * 1024 * 1024) throw new Error('15MB 이하 이미지를 선택해 주세요.');
  ready ||= loader().then(initializeImageMagick).catch(e => { ready = undefined; throw e; });
  await ready;
  return ImageMagick.read(new Uint8Array(buffer), (img) => {
    if (img.width * img.height > 16000000) throw new Error('이미지를 1600만 화소 이하로 줄여 주세요.');
    img.autoOrient();
    const ratio = Math.min(1, 1080 / img.width, 1350 / img.height);
    img.resize(Math.max(1, Math.round(img.width * ratio)), Math.max(1, Math.round(img.height * ratio)));
    img.backgroundColor = new MagickColor('white');
    img.alpha(AlphaAction.Remove);
    img.strip();
    let out;
    for (const quality of [76,64,52]) {
      img.quality = quality;
      out = img.write(MagickFormat.Jpeg, data => Buffer.from(data));
      if (out.length <= 180 * 1024) break;
    }
    if (out.length > 180 * 1024) {
      img.resize(Math.max(1, Math.round(img.width * .8)), Math.max(1, Math.round(img.height * .8)));
      out = img.write(MagickFormat.Jpeg, data => Buffer.from(data));
    }
    if (out.length > 300 * 1024) throw new Error('이미지를 더 작게 줄여 다시 업로드해 주세요.');
    const width = img.width;
    const scale = Math.min(1, 160 / img.width);
    img.resize(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
    img.quality = 50;
    const thumb = img.write(MagickFormat.WebP, data => Buffer.from(data));
    return {out, thumb, width};
  });
}
