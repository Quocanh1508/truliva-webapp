/**
 * Nén hình ảnh tại client sử dụng HTML5 Canvas và URL.createObjectURL (siêu tốc, tiết kiệm RAM)
 * @param file Đối tượng File ảnh gốc
 * @param maxWidth Chiều rộng tối đa (mặc định 1280)
 * @param maxHeight Chiều cao tối đa (mặc định 1280)
 * @param quality Chất lượng nén từ 0.1 đến 1.0 (mặc định 0.65)
 * @returns Trả về File đã nén (định dạng JPEG) hoặc File gốc nếu có lỗi/không phải ảnh
 */
export async function compressImage(
  file: File,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.65
): Promise<File> {
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|bmp)$/i.test(file.name);
  if (!isImage) {
    return file;
  }

  // Bỏ qua nếu ảnh quá nhỏ (dưới 200KB thì đã tối ưu)
  if (file.size < 200 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      return resolve(file);
    }

    const img = new Image();
    img.src = objectUrl;

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Tính toán lại kích thước dựa trên giới hạn maxWidth/maxHeight tỷ lệ thuận
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          return resolve(file);
        }

        // Vẽ ảnh lên canvas theo kích thước mới
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(objectUrl);

        // Đổ dữ liệu canvas thành Blob định dạng JPEG với chất lượng nén mong muốn
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return resolve(file);
            }
            const compressedName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            const compressedFile = new File([blob], compressedName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
  });
}
