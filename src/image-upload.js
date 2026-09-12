export async function prepareImage(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('PNG, JPEG, WebP 이미지만 선택해 주세요.');
  if (file.size > 15 * 1024 * 1024) throw new Error('15MB 이하 이미지를 선택해 주세요.');
  const image = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1080 / image.width, 1350 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    let result;
    for (const quality of [.8,.68,.55]) {
      result = canvas.toDataURL('image/jpeg', quality);
      if (result.length * .75 <= 300 * 1024) break;
    }
    return result;
  } finally { image.close(); }
}
