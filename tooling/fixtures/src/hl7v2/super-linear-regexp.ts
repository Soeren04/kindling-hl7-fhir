export function isRepeatedA(input: string): boolean {
  return /^(?:a+)+$/.test(input);
}
