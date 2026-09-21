/** Platform-free base64 over `btoa`/`atob` (no Node `Buffer`). Chunked so large files do not overflow the call stack. */
const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type BinaryInput = Uint8Array | ArrayBuffer;

export function toUint8Array(b: BinaryInput): Uint8Array {
  return b instanceof Uint8Array ? b : new Uint8Array(b);
}
