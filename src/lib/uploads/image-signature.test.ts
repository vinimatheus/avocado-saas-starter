import { describe, expect, it } from "vitest";

import { detectImageMimeTypeBySignature } from "@/lib/uploads/image-signature";

function buildFile(bytes: number[], type = "application/octet-stream"): File {
  return new File([new Uint8Array(bytes)], "file.bin", { type });
}

describe("detectImageMimeTypeBySignature", () => {
  it("detecta PNG por assinatura binaria", async () => {
    const png = buildFile(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d],
      "image/png",
    );

    await expect(detectImageMimeTypeBySignature(png)).resolves.toBe("image/png");
  });

  it("detecta JPEG por assinatura binaria", async () => {
    const jpeg = buildFile([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], "image/jpeg");

    await expect(detectImageMimeTypeBySignature(jpeg)).resolves.toBe("image/jpeg");
  });

  it("detecta GIF por assinatura binaria", async () => {
    const gif = buildFile([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00], "image/gif");

    await expect(detectImageMimeTypeBySignature(gif)).resolves.toBe("image/gif");
  });

  it("detecta WEBP por assinatura binaria", async () => {
    const webp = buildFile(
      [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
      "image/webp",
    );

    await expect(detectImageMimeTypeBySignature(webp)).resolves.toBe("image/webp");
  });

  it("rejeita arquivo sem assinatura valida de imagem", async () => {
    const invalid = buildFile([0x48, 0x65, 0x6c, 0x6c, 0x6f], "image/png");

    await expect(detectImageMimeTypeBySignature(invalid)).resolves.toBeNull();
  });
});
