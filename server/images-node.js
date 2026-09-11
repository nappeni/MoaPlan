import sharp from 'sharp';
export async function optimize(buffer) {
  let out;
  for (const q of [85, 78, 70]) {
    out = await sharp(buffer, { limitInputPixels: 40000000 })
      .rotate()
      .resize({ width: 1080, height: 1350, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: q, mozjpeg: true })
      .toBuffer();
    if (out.length <= 500 * 1024) break;
  }
  const thumb = await sharp(out).resize({ width: 320 }).webp({ quality: 65 }).toBuffer();
  return { out, thumb, width: (await sharp(out).metadata()).width };
}
