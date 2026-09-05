import sharp from "sharp";

export const WEBP_QUALITY = 82;

export async function encodePhotoWebp(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "none" })
    .rotate()
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();
}
