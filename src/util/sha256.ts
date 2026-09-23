import { toUint8Array, type BinaryInput } from "./base64";

/** Lower-case hex SHA-256 through Web Crypto (browsers, Node 18+, React Native with a polyfill). */
export async function sha256Hex(data: BinaryInput): Promise<string> {
  const bytes = toUint8Array(data);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
