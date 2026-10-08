export async function load(): Promise<string> {
  return Promise.resolve("loaded");
}

export function start(): void {
  load();
}
