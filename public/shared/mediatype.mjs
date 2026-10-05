/**
 * The media type a stored blob's bytes declare. OPFS keeps bytes, not
 *  types, and Safari will not play an untyped blob: URL — an iPad
 *  recording (MP4/AAC) saved fine and then never played. Images sniff
 *  either way; audio needs the label. */
export function sniffType(head) {
  const b = head instanceof Uint8Array ? head : new Uint8Array(head);
  const ascii = (from, to) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return "image/heic";
    if (brand === "avif") return "image/avif";
    return "audio/mp4";
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 4) === "RIFF") return ascii(8, 12) === "WAVE" ? "audio/wav" : "image/webp";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 3) === "GIF") return "image/gif";
  return "";
}

/** `data` (a Blob or bytes) as a Blob carrying its sniffed type. */
export const typedBlob = async (data) => {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const type = sniffType(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
  return type ? new Blob([blob], { type }) : blob;
};
