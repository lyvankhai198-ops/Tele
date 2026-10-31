export async function compactImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) throw Error("Select a PNG/JPG/WebP image up to 4 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    for (const edge of [1000, 750, 500]) {
      const ratio = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("This device could not process the image.");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.5, 0.2]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
        if (blob && blob.size <= 48_000) {
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = () => reject(Error("Could not read the image."));
            reader.readAsDataURL(blob);
          });
        }
      }
    }
    throw Error("The image has too much detail. Crop the relevant area and try again.");
  } finally { bitmap.close(); }
}
