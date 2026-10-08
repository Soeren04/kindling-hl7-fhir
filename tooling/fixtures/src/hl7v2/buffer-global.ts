export function encode(text: string): number {
  return Buffer.from(text).length;
}
