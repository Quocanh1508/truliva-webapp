/**
 * Nén hình ảnh tại client sử dụng HTML5 Canvas
 * @param file Đối tượng File ảnh gốc
 * @param maxWidth Chiều rộng tối đa (mặc định 1280)
 * @param maxHeight Chiều cao tối đa (mặc định 1280)
 * @param quality Chất lượng nén từ 0.1 đến 1.0 (mặc định 0.7)
 * @returns Trả về File đã nén (định dạng JPEG) hoặc File gốc nếu có lỗi/không phải ảnh
 */
export async function compressImage(
  file: File,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.7
): Promise<File> {
  // Bỏ qua nếu không phải là định dạng hình ảnh
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // Bỏ qua nếu ảnh quá nhỏ (dưới 300KB thì không cần nén thêm)
  if (file.size < 300 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

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

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(file); // Fallback nếu trình duyệt không hỗ trợ Context 2D
        }

        // Vẽ ảnh lên canvas theo kích thước mới
        ctx.drawImage(img, 0, 0, width, height);

        // Đổ dữ liệu canvas thành Blob định dạng JPEG với chất lượng nén mong muốn
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return resolve(file);
            }
            // Tạo đối tượng File mới (đổi đuôi mở rộng thành .jpg)
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
      };
      img.onerror = () => {
        resolve(file); // Fallback nếu không load được ảnh
      };
    };
    reader.onerror = () => {
      resolve(file); // Fallback nếu không đọc được file
    };
  });
}
