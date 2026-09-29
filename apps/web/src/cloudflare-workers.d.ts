declare module "cloudflare:workers" {
  export function waitUntil(task: Promise<unknown>): void;
  export const env: Readonly<Record<string, unknown>>;
}
