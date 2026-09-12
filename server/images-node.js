import sharp from 'sharp';
export async function optimize(buffer) {
  if (buffer.length > 15 * 1024 * 1024) throw new Error('15MB 이하 이미지를 선택해 주세요.');
  let out;
  for (const [width, height, quality] of [[1080,1350,76],[1080,1350,64],[1080,1350,52],[864,1080,52]]) {
    out = await sharp(buffer, { limitInputPixels: 16000000 }).rotate()
      .resize({ width, height, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= 180 * 1024) break;
  }
  if (out.length > 300 * 1024) throw new Error('이미지를 더 작게 줄여 다시 업로드해 주세요.');
  const thumb = await sharp(out).resize({ width: 160, withoutEnlargement: true }).webp({ quality: 50 }).toBuffer();
  return { out, thumb, width: (await sharp(out).metadata()).width };
}
