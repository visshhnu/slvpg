// ===== Image compression helper =====
// Resizes and compresses a photo client-side before it's sent to the server,
// so a 5MB phone photo becomes ~100-250KB before it ever touches the database.

function compressImageFile(file, maxDimension = 1000, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

// Wires up a file input + preview + hidden data-url field. Call once per upload slot.
// fileInputId: <input type=file>, previewId: <img> to show the result, dataFieldName: used to stash the data url on the element's dataset.
function wireImageUpload(fileInputId, previewId, onReady) {
  const input = document.getElementById(fileInputId);
  if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      showToast('Processing photo…');
      const dataUrl = await compressImageFile(file);
      const preview = document.getElementById(previewId);
      if (preview) {
        preview.src = dataUrl;
        preview.classList.remove('hidden');
      }
      onReady(dataUrl);
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}
