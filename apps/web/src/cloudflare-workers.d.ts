declare module "cloudflare:workers" {
  export function waitUntil(task: Promise<unknown>): void;
}
