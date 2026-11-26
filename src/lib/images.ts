// Pasted or dropped pictures are made smaller before they go into a note or a mail:
// phone photos are often 4–10 MB, which is too much for either.

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** A data: URL no wider or taller than `max` pixels. GIFs and small files are kept as they are. */
export async function shrinkImage(file: Blob, max = 1600): Promise<string> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return readAsDataUrl(file)
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return readAsDataUrl(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size < 400_000) {
    bitmap.close()
    return readAsDataUrl(file)
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // Keep transparency for PNGs (screenshots, logos); photos become JPEG.
  return file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85)
}
