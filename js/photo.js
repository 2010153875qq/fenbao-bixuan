(function (root) {
  const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif|tiff?)$/i;
  const LONG_EDGE = 2000;

  function isImage(file) {
    const type = String(file && file.type || '').toLowerCase();
    if (type.indexOf('image/') === 0) return true;
    return IMAGE_EXT.test(String(file && file.name || ''));
  }

  function isHeic(file) {
    const type = String(file && file.type || '').toLowerCase();
    const name = String(file && file.name || '').toLowerCase();
    return type.indexOf('heic') >= 0 || type.indexOf('heif') >= 0 || /\.hei[cf]$/.test(name);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('无法加载照片解码')); };
      document.head.appendChild(script);
    });
  }

  async function decodeHeic(file) {
    await loadScript('./vendor/heic2any.min.js');
    if (!root.heic2any) throw new Error('这张 HEIC 照片无法在本机打开，请改存为 JPEG');
    const output = await root.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    return Array.isArray(output) ? output[0] : output;
  }

  async function bitmapFrom(blob) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(blob, { imageOrientation: 'from-image' });
      } catch (error) {
        return createImageBitmap(blob);
      }
    }
    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = function () { resolve(el); };
        el.onerror = function () { reject(new Error('打不开这张照片')); };
        el.src = url;
      });
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function scaledCanvas(source) {
    const width = source.width || source.naturalWidth;
    const height = source.height || source.naturalHeight;
    const long = Math.max(width, height);
    const scale = long > LONG_EDGE ? LONG_EDGE / long : (long < 900 ? Math.min(2, 1400 / long) : 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function inkMap(canvas) {
    const sampleW = Math.min(480, canvas.width);
    const sampleH = Math.max(1, Math.round(canvas.height * (sampleW / canvas.width)));
    const small = document.createElement('canvas');
    small.width = sampleW;
    small.height = sampleH;
    const ctx = small.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, sampleW, sampleH);
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
    const ink = new Uint8Array(sampleW * sampleH);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const y = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
      ink[p] = y < 170 ? 1 : 0;
    }
    return { ink: ink, w: sampleW, h: sampleH };
  }

  function projectionScore(ink, w, h, angle) {
    const rad = angle * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = w / 2;
    const cy = h / 2;
    const rows = new Float64Array(h);
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const dx = x - cx;
        const dy = y - cy;
        const sx = (cx + dx * cos - dy * sin) | 0;
        const sy = (cy + dx * sin + dy * cos) | 0;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        rows[y] += ink[sy * w + sx];
      }
    }
    let total = 0;
    let n = 0;
    for (let y = 0; y < h; y += 2) {
      total += rows[y];
      n += 1;
    }
    const mean = total / (n || 1);
    let variance = 0;
    for (let y = 0; y < h; y += 2) {
      const delta = rows[y] - mean;
      variance += delta * delta;
    }
    return variance;
  }

  function deskew(canvas) {
    const map = inkMap(canvas);
    let best = 0;
    let bestScore = -1;
    let zero = 0;
    for (let angle = -8; angle <= 8; angle += 1) {
      const score = projectionScore(map.ink, map.w, map.h, angle);
      if (angle === 0) zero = score;
      if (score > bestScore) {
        bestScore = score;
        best = angle;
      }
    }
    if (!best || bestScore < zero * 1.12) return canvas;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(best * Math.PI / 180);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  }

  function stretchContrast(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const hist = new Uint32Array(256);
    let samples = 0;
    for (let i = 0; i < data.length; i += 16) {
      const y = (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) | 0;
      hist[y] += 1;
      samples += 1;
    }
    let low = 0;
    let high = 255;
    let seen = 0;
    for (low = 0; low < 255; low += 1) {
      seen += hist[low];
      if (seen > samples * 0.02) break;
    }
    seen = 0;
    for (high = 255; high > low; high -= 1) {
      seen += hist[high];
      if (seen > samples * 0.02) break;
    }
    const span = Math.max(1, high - low);
    for (let i = 0; i < data.length; i += 4) {
      const y = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
      const value = Math.max(0, Math.min(255, ((y - low) * 255) / span));
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  async function toCanvas(file) {
    let blob = file;
    if (isHeic(file)) {
      try {
        blob = await decodeHeic(file);
      } catch (error) {
        blob = file;
      }
    }
    let bitmap;
    try {
      bitmap = await bitmapFrom(blob);
    } catch (error) {
      if (blob === file) throw new Error('打不开这张照片。HEIC 可在本机转成 JPEG 后再试。');
      bitmap = await bitmapFrom(file);
    }
    const canvas = stretchContrast(deskew(scaledCanvas(bitmap)));
    if (bitmap.close) bitmap.close();
    return canvas;
  }

  root.FENBAO_PHOTO = {
    isImage: isImage,
    isHeic: isHeic,
    toCanvas: toCanvas
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
