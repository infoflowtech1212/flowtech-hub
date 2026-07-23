/**
 * Read an image File and return a downscaled data URI, so uploaded logos/banners
 * stay small (they're stored inline and served under the app's strict CSP, which
 * allows data: images). PNG/SVG keep transparency; others become JPEG.
 */
export function fileToDataUri(file: File, maxDim = 512, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be loaded.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas is not supported in this browser.'));
        ctx.drawImage(img, 0, 0, w, h);
        const keepAlpha = file.type === 'image/png' || file.type === 'image/svg+xml' || file.type === 'image/webp';
        try {
          resolve(canvas.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', quality));
        } catch {
          reject(new Error('Could not process that image.'));
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
