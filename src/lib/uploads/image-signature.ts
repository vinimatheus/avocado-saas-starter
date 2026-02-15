const IMAGE_SIGNATURE_BYTES = 12;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const GIF87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;
const WEBP_RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const;

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

function startsWithSignature(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }

  return signature.every((value, index) => bytes[index] === value);
}

export async function detectImageMimeTypeBySignature(
  file: File,
): Promise<SupportedImageMimeType | null> {
  const header = new Uint8Array(
    await file.slice(0, IMAGE_SIGNATURE_BYTES).arrayBuffer(),
  );

  if (startsWithSignature(header, PNG_SIGNATURE)) {
    return "image/png";
  }

  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    startsWithSignature(header, WEBP_RIFF_SIGNATURE) &&
    header.length >= IMAGE_SIGNATURE_BYTES &&
    startsWithSignature(header.slice(8), WEBP_WEBP_SIGNATURE)
  ) {
    return "image/webp";
  }

  if (
    startsWithSignature(header, GIF87A_SIGNATURE) ||
    startsWithSignature(header, GIF89A_SIGNATURE)
  ) {
    return "image/gif";
  }

  return null;
}
