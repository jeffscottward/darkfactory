// What: Test stub for next/navigation (vinext provides it only inside the app build). Tests override it with vi.mock.
// Used by: vitest.config.ts resolve.alias.
// See: apps/web/src/test/next-link.tsx (same idea for next/link).
export const usePathname = (): string | null => null;
export const useRouter = () => ({
  back: () => undefined,
  push: () => undefined,
  refresh: () => undefined,
  replace: () => undefined,
});
export const redirect = (url: string): never => {
  throw new Error(`NEXT_REDIRECT ${url}`);
};
export const notFound = (): never => {
  throw new Error("NEXT_NOT_FOUND");
};
