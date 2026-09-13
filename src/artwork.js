function lines(ctx, text, width) {
  const result = [];
  for (const paragraph of String(text || '').split('\n')) {
    let line = '';
    for (const ch of paragraph) {
      if (ctx.measureText(line + ch).width > width && line) {
        result.push(line);
        line = ch;
      } else line += ch;
    }
    result.push(line);
  }
  return result;
}
export async function drawCard(canvas, slide, settings, index, total, background, activity) {
  await document.fonts.ready;
  canvas.width = 1080;
  canvas.height = 1350;
  const c = canvas.getContext('2d');
  const color = /^#[0-9a-f]{6}$/i.test(settings.color) ? settings.color : '#155f55';
  c.fillStyle = color;
  c.fillRect(0, 0, 1080, 1350);
  let lightBackground = false;
  if (background) {
    const img = new Image();
    img.src = background;
    await img.decode();
    const scale = Math.max(1080 / img.width, 1350 / img.height);
    c.drawImage(
      img,
      (1080 - img.width * scale) / 2,
      (1350 - img.height * scale) / 2,
      img.width * scale,
      img.height * scale,
    );
    // Read a small sample of the rendered background without tinting the artwork.
    const sample = document.createElement('canvas');
    sample.width = 24;
    sample.height = 30;
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    sampleContext.drawImage(canvas, 0, 0, 24, 30);
    const pixels = sampleContext.getImageData(0, 0, 24, 30).data;
    let brightness = 0;
    for (let i = 0; i < pixels.length; i += 4)
      brightness += pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
    lightBackground = brightness / (pixels.length / 4) > 150;
  } else {
    c.strokeStyle = '#ffffff18';
    c.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.arc(1050, 200, 160 + i * 95, 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = '#ffffff07';
    c.beginPath();
    c.arc(1080, 1350, 450, 0, Math.PI * 2);
    c.fill();
  }
  const foreground = lightBackground ? '#173d34' : '#ffffff';
  const secondary = lightBackground ? '#34584e' : '#d4e0d8';
  const accent = lightBackground ? '#155f55' : '#e1eea2';
  // A narrow text outline protects letters over illustration details, without
  // placing a colored veil across the whole image.
  const text = (value, x, y) => {
    if (background) {
      c.save();
      c.strokeStyle = lightBackground ? '#ffffff' : '#102e26';
      c.lineWidth = 4;
      c.lineJoin = 'round';
      c.strokeText(value, x, y);
      c.restore();
    }
    c.fillText(value, x, y);
  };
  const cover = slide.role === 'cover';
  c.fillStyle = accent;
  c.font = '600 28px "Noto Sans KR", sans-serif';
  if (settings.logoId) {
    const logo = new Image();
    logo.src = '/api/logo/content?v=' + settings.logoId;
    await logo.decode();
    // Reserve a readable brand area; preserve wide and square logo proportions.
    const ratio = Math.min((cover ? 360 : 280) / logo.width, (cover ? 180 : 120) / logo.height);
    c.drawImage(logo, 76, 66, logo.width * ratio, logo.height * ratio);
  } else {
    text(settings.name || 'MoaPlan', 76, 104);
  }
  c.textAlign = 'right';
  c.fillStyle = secondary;
  c.font = '400 23px "Noto Sans KR", sans-serif';
  text(
    String(index + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0'),
    1004,
    104,
  );
  c.textAlign = 'left';
  let titleSize = cover ? 92 : 76,
    titleLines;
  do {
    c.font = '800 ' + titleSize + 'px "Noto Sans KR", sans-serif';
    titleLines = lines(c, slide.title, 920);
    if (titleLines.length <= 4) break;
    titleSize -= 4;
  } while (titleSize >= 40);
  c.fillStyle = foreground;
  let y = cover ? 430 : settings.logoId ? 310 : 260;
  for (const line of titleLines) {
    text(line, 76, y);
    y += titleSize * 1.4;
  }
  y += 55;
  c.fillStyle = accent;
  c.fillRect(76, y, 64, 5);
  y += 75;
  let size = 35,
    bodyLines;
  do {
    c.font = '400 ' + size + 'px "Noto Sans KR", sans-serif';
    bodyLines = lines(c, slide.body, 920);
    if (y + bodyLines.length * size * 1.7 < 1170) break;
    size -= 1;
  } while (size >= 25);
  if (y + bodyLines.length * size * 1.7 >= 1170)
    throw new Error('한 장의 내용이 너무 많습니다. 문구를 줄이거나 장을 추가해 주세요.');
  c.fillStyle = foreground;
  for (const line of bodyLines) {
    text(line, 76, y);
    y += size * 1.7;
  }
  c.strokeStyle = lightBackground ? '#173d3430' : '#ffffff30';
  c.beginPath();
  c.moveTo(76, 1230);
  c.lineTo(1004, 1230);
  c.stroke();
  c.font = '400 23px "Noto Sans KR", sans-serif';
  c.fillStyle = secondary;
  text(
    activity.startDate
      ? activity.startDate.replaceAll('-', '.') + '  ' + activity.startTime
      : '함께할 여러분을 기다립니다',
    76,
    1288,
  );
  c.textAlign = 'right';
  text(activity.kind === 'organization' ? '단체 소개' : '활동 참가 안내', 1004, 1288);
  c.textAlign = 'left';
  return canvas;
}
export async function cardData(slide, settings, index, total, background, activity) {
  const canvas = document.createElement('canvas');
  await drawCard(canvas, slide, settings, index, total, background, activity);
  return canvas.toDataURL('image/jpeg', 0.78);
}
