import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { z } from 'zod';

// Matches the web client (web/src/components/TeamForm.jsx): logos are stored as
// PNG data URLs no bigger than LOGO_SIZE on a side, so they fit on the row.
const LOGO_SIZE = 128;

export const logo = z
  .string()
  .nullable()
  .optional()
  .describe(
    'Logo image: an http(s) URL, a local file path, or a data URL (png, jpeg, webp, gif, svg, or an ico with PNG images, such as most favicons). ' +
      `It is downsized to fit ${LOGO_SIZE}px and stored as a PNG. Pass null to remove the logo.`
  );

async function readSource(source) {
  const dataUrl = source.match(/^data:image\/[\w.+-]+;base64,(.*)$/s);
  if (dataUrl) return Buffer.from(dataUrl[1], 'base64');
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`could not fetch logo (${res.status}): ${source}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(source);
}

// sharp can't read .ico, but sites often only publish a favicon.ico. Modern ones
// carry their large sizes as embedded PNGs, so use the largest of those.
function unwrapIco(buffer) {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return buffer;
  let best = null;
  for (let i = 0; i < buffer.readUInt16LE(4); i++) {
    const entry = 6 + 16 * i;
    const width = buffer[entry] || 256;
    const size = buffer.readUInt32LE(entry + 8);
    const offset = buffer.readUInt32LE(entry + 12);
    const frame = buffer.subarray(offset, offset + size);
    if (frame.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) && (!best || width > best.width)) {
      best = { width, frame };
    }
  }
  if (!best) throw new Error('could not read logo: this .ico has no PNG images; use a png, jpeg, webp, gif or svg');
  return best.frame;
}

// Turns a logo argument into what the API stores. undefined (leave as is) and
// null (remove) pass through.
export async function toLogo(source) {
  if (source == null) return source;
  const image = await sharp(unwrapIco(await readSource(source)))
    .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
    .catch((err) => {
      throw new Error(`could not read logo as an image: ${err.message}`);
    });
  return `data:image/png;base64,${image.toString('base64')}`;
}
