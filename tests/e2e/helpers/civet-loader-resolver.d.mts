export type CivetResolveResult = Readonly<{
  format?: string;
  shortCircuit?: boolean;
  url: string;
}>;

export type CivetResolveContext = Readonly<{
  parentURL?: string;
}>;

export type CivetNextResolve = (
  specifier: string,
  context: CivetResolveContext
) => Promise<CivetResolveResult>;

export type CivetResolveHook = (
  specifier: string,
  context: CivetResolveContext,
  nextResolve: CivetNextResolve
) => Promise<CivetResolveResult>;

export function createCivetResolve(
  options: Readonly<{
    allowedSourceRoots: readonly string[];
    resolve: CivetResolveHook;
  }>
): Promise<CivetResolveHook>;
