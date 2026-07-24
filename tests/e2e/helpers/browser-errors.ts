import { createHmac, randomBytes } from "node:crypto";
import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MAX_ALLOWED_RULES = 128;
const MAX_ERROR_NAME_LENGTH = 64;
const MAX_MESSAGE_LENGTH = 16 * 1024;
const MAX_METHOD_LENGTH = 16;
const MAX_OBSERVATIONS = 128;
const MAX_PATHNAME_LENGTH = 2048;
const MAX_STACK_LENGTH = 64 * 1024;
const MAX_STACK_LINES = 64;
const MAX_URL_LENGTH = 4096;
const OBSERVATION_LIMIT_FAILURE = "Browser error observation limit exceeded";
const OVERSIZED_CONSOLE_FAILURE = "Unexpected oversized console error";
const OVERSIZED_PAGE_FAILURE = "Unexpected oversized page error";
const INVALID_HTTP_METADATA_FAILURE = "Unexpected HTTP response metadata";
const INVALID_BROWSER_METADATA_FAILURE = "Unexpected browser error metadata";
const HTTP_RESOURCE_ERROR_PATTERN =
  /^Failed to load resource: the server responded with a status of ([45]\d{2})(?: \([^)]*\))?$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/gu;
const URL_PATTERN = /\bhttps?:\/\/[^\s]+/giu;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const BEARER_PATTERN = /\bBearer\s+\S+/giu;
const SENSITIVE_PAIR_PATTERN =
  /\b(authorization|cookie|password|passcode|token|secret|api[_-]?key|session)\s*[:=]\s*[^\s,;]+/giu;
const QUOTED_VALUE_PATTERN = /(["'])[^"'\r\n]*\1/gu;
const LONG_IDENTIFIER_PATTERN = /\b[A-Z0-9_-]{16,}\b/giu;
const STACK_LOCATION_PATTERN =
  /((?:https?|file):\/\/[^)\s]+?|\/[^)\s]+?):(\d+)(?::\d+)?\)?$/u;
const STATIC_CLIENT_PATH_PREFIXES = [
  "/apps/web/",
  "/assets/",
  "/packages/",
  "/src/",
  "/_next/static/",
] as const;

export type BrowserErrorCategory =
  | "chunk-loading"
  | "client-error-boundary"
  | "framework-router-cancellation"
  | "module-loading"
  | "navigation-fetch-abort"
  | "orpc-deserialization"
  | "orpc-response-format"
  | "orpc-response-parse"
  | "react-dispatcher"
  | "react-hydration"
  | "react-invalid-hook"
  | "runtime-reference"
  | "runtime-type"
  | "unhandled-promise"
  | "unknown";

export type BrowserErrorRouteTemplate =
  | "/"
  | "/account"
  | "/account/[section]"
  | "/admin"
  | "/admin/users"
  | "/admin/users/[userId]"
  | "/auth/[route]"
  | "/dashboard"
  | "/features/[route]"
  | "/public/[route]"
  | "/unknown";

type BrowserErrorName =
  | "AggregateError"
  | "ConsoleError"
  | "DOMException"
  | "Error"
  | "RangeError"
  | "ReferenceError"
  | "SyntaxError"
  | "TypeError"
  | "UnknownError";

type BrowserErrorModuleFamily =
  | "account-address"
  | "account-gateway"
  | "account-preferences"
  | "account-profile"
  | "account-security"
  | "framework-router"
  | "orpc-client"
  | "other-app"
  | "other-dependency"
  | "react-runtime";

type BrowserErrorDiagnostic = Readonly<{
  category: BrowserErrorCategory;
  fingerprint: string;
  name: BrowserErrorName;
  route: BrowserErrorRouteTemplate;
  source?: `${BrowserErrorModuleFamily}:${number}`;
}>;

type BrowserErrorDiagnosticInput = Readonly<{
  errorName?: string;
  kind: "console" | "page";
  message: string;
  pathname: string;
  stack?: string;
}>;

export type ExpectedHttpError = Readonly<{
  method: string;
  pathname: string;
  status: number;
}>;

export type ExpectedBrowserMessage = Readonly<{
  message: string;
  pathname: string;
}>;

type ObservedResponse = Readonly<{
  method: string;
  status: number;
  url: string;
}>;

export type BrowserErrorCollectorOptions = Readonly<{
  sourceOrigin?: string;
}>;

const normalizeMessage = (message: string): string =>
  message
    .normalize("NFKC")
    .replace(CONTROL_CHARACTER_PATTERN, " ")
    .replace(URL_PATTERN, "<url>")
    .replace(EMAIL_PATTERN, "<email>")
    .replace(BEARER_PATTERN, "Bearer <redacted>")
    .replace(SENSITIVE_PAIR_PATTERN, "$1=<redacted>")
    .replace(QUOTED_VALUE_PATTERN, "<quoted>")
    .replace(LONG_IDENTIFIER_PATTERN, "<identifier>")
    .replace(/\s+/gu, " ")
    .trim();

const classifyMessage = (
  message: string,
  errorName: string | undefined
): BrowserErrorCategory => {
  if (
    message ===
    "Cannot parse response body, please check the response body and content-type."
  ) {
    return "orpc-response-parse";
  }
  if (message === "Invalid RPC response format.") {
    return "orpc-response-format";
  }
  if (
    /^Security error: accessing non-existent path during deserialization\. Path segment: .{1,2048}$/u.test(
      message
    )
  ) {
    return "orpc-deserialization";
  }
  if (
    errorName === "AbortError" &&
    [
      "The operation was aborted.",
      "This operation was aborted",
      "The user aborted a request.",
      "signal is aborted without reason",
    ].includes(message)
  ) {
    return "navigation-fetch-abort";
  }
  if (
    (errorName === "NavigationCancelledError" &&
      /^Abort fetching component for route: ".{0,2048}"$/u.test(message)) ||
    /^NEXT_(?:HTTP_ERROR_FALLBACK|NOT_FOUND|REDIRECT)(?:;.*)?$/u.test(message)
  ) {
    return "framework-router-cancellation";
  }
  if (
    message ===
    "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error."
  ) {
    return "client-error-boundary";
  }
  if (
    /cannot read properties of null.*reading\s+["'`]use[A-Z]/iu.test(message)
  ) {
    return "react-dispatcher";
  }
  if (/invalid hook call/iu.test(message)) {
    return "react-invalid-hook";
  }
  if (
    /hydration failed|hydration error|server rendered html.*did not match|text content does not match/iu.test(
      message
    )
  ) {
    return "react-hydration";
  }
  if (/chunkloaderror|loading chunk\b.*failed/iu.test(message)) {
    return "chunk-loading";
  }
  if (
    /failed to fetch dynamically imported module|importing a module script failed|does not provide an export/iu.test(
      message
    )
  ) {
    return "module-loading";
  }
  if (/uncaught\s+\(in promise\)|unhandled promise rejection/iu.test(message)) {
    return "unhandled-promise";
  }
  if (errorName === "TypeError") {
    return "runtime-type";
  }
  if (errorName === "ReferenceError") {
    return "runtime-reference";
  }
  return "unknown";
};

const routeTemplate = (pathname: string): BrowserErrorRouteTemplate => {
  const path = pathname.split(/[?#]/u, 1)[0] ?? "/";
  if (path === "/") {
    return "/";
  }
  if (path === "/dashboard") {
    return "/dashboard";
  }
  if (path === "/account") {
    return "/account";
  }
  if (/^\/account\/[^/]+$/u.test(path)) {
    return "/account/[section]";
  }
  if (path === "/admin") {
    return "/admin";
  }
  if (path === "/admin/users") {
    return "/admin/users";
  }
  if (/^\/admin\/users\/[^/]+$/u.test(path)) {
    return "/admin/users/[userId]";
  }
  if (
    /^\/(?:forgot-password|reset-password|sign-in|sign-up|verify-email)$/u.test(
      path
    )
  ) {
    return "/auth/[route]";
  }
  if (/^\/(?:feature-items|features)(?:\/[^/]+)?$/u.test(path)) {
    return "/features/[route]";
  }
  if (
    /^\/(?:about|contact|legal\/privacy|legal\/terms|privacy|resources|solutions|terms)$/u.test(
      path
    )
  ) {
    return "/public/[route]";
  }
  return "/unknown";
};

const safeErrorName = (
  errorName: string | undefined,
  kind: BrowserErrorDiagnosticInput["kind"]
): BrowserErrorName => {
  switch (errorName) {
    case "AggregateError":
    case "DOMException":
    case "Error":
    case "RangeError":
    case "ReferenceError":
    case "SyntaxError":
    case "TypeError":
      return errorName;
    default:
      return kind === "console" ? "ConsoleError" : "UnknownError";
  }
};

const isWithinRepository = (path: string): boolean => {
  if (!isAbsolute(path)) {
    return false;
  }
  const repositoryRelative = relative(REPOSITORY_ROOT, path);
  return (
    repositoryRelative.length > 0 &&
    repositoryRelative !== ".." &&
    !repositoryRelative.startsWith("../") &&
    !isAbsolute(repositoryRelative)
  );
};

const ACCOUNT_MODULE_FAMILIES = new Map<string, BrowserErrorModuleFamily>([
  ["/components/account/account-client.civet", "account-gateway"],
  ["/components/account/account-client.civet.tsx", "account-gateway"],
  ["/components/account/address-page-client.civet", "account-address"],
  ["/components/account/address-page-client.civet.tsx", "account-address"],
  ["/components/account/preferences-page-client.civet", "account-preferences"],
  [
    "/components/account/preferences-page-client.civet.tsx",
    "account-preferences",
  ],
  ["/components/account/profile-page-client.civet", "account-profile"],
  ["/components/account/profile-page-client.civet.tsx", "account-profile"],
  ["/components/account/security-page-client.civet", "account-security"],
  ["/components/account/security-page-client.civet.tsx", "account-security"],
]);

const sourceModuleFamily = (
  path: string,
  dependency: boolean
): BrowserErrorModuleFamily => {
  const normalizedPath = path.replaceAll("\\", "/");
  for (const [suffix, family] of ACCOUNT_MODULE_FAMILIES) {
    if (normalizedPath.endsWith(suffix)) {
      return family;
    }
  }
  if (
    normalizedPath.includes("/node_modules/@orpc/client/") ||
    normalizedPath.includes("/node_modules/.pnpm/@orpc+client@")
  ) {
    return "orpc-client";
  }
  if (
    normalizedPath.endsWith("/node_modules/vinext/dist/shims/router.js") ||
    normalizedPath.includes("/node_modules/vinext/dist/client/")
  ) {
    return "framework-router";
  }
  if (
    normalizedPath.includes("/node_modules/react/") ||
    normalizedPath.includes("/node_modules/react-dom/") ||
    normalizedPath.includes("/node_modules/.pnpm/react@") ||
    normalizedPath.includes("/node_modules/.pnpm/react-dom@")
  ) {
    return "react-runtime";
  }
  return dependency ? "other-dependency" : "other-app";
};

const repositoryModuleFamily = (path: string): BrowserErrorModuleFamily => {
  const repositoryRelative = relative(REPOSITORY_ROOT, path);
  return sourceModuleFamily(path, repositoryRelative.includes("node_modules/"));
};

const staticModuleFamily = (pathname: string): BrowserErrorModuleFamily =>
  sourceModuleFamily(pathname, pathname.includes("/node_modules/"));

const safeStackSource = (
  stack: string | undefined,
  sourceOrigin: string | undefined
): BrowserErrorDiagnostic["source"] => {
  if (stack === undefined) {
    return undefined;
  }
  let inspectedLines = 0;
  for (const line of stack.split(/\r?\n/u)) {
    inspectedLines += 1;
    if (inspectedLines > MAX_STACK_LINES) {
      return undefined;
    }
    const match = STACK_LOCATION_PATTERN.exec(line.trim());
    if (match === null) {
      continue;
    }
    const rawLocation = match[1];
    const lineNumber = Number(match[2]);
    if (
      rawLocation === undefined ||
      !Number.isSafeInteger(lineNumber) ||
      lineNumber < 1 ||
      lineNumber > 10_000_000
    ) {
      continue;
    }

    let moduleFamily: BrowserErrorModuleFamily | undefined;
    if (/^(?:https?|file):\/\//u.test(rawLocation)) {
      try {
        const sourceUrl = new URL(rawLocation);
        if (
          sourceUrl.username.length > 0 ||
          sourceUrl.password.length > 0 ||
          sourceUrl.search.length > 0 ||
          sourceUrl.hash.length > 0
        ) {
          continue;
        }
        const sourcePath = decodeURIComponent(sourceUrl.pathname);
        if (sourceUrl.protocol === "file:") {
          const filePath = fileURLToPath(sourceUrl);
          if (isWithinRepository(filePath)) {
            moduleFamily = repositoryModuleFamily(filePath);
          }
        } else if (
          sourceOrigin !== undefined &&
          sourceUrl.origin === sourceOrigin &&
          STATIC_CLIENT_PATH_PREFIXES.some((prefix) =>
            sourcePath.startsWith(prefix)
          )
        ) {
          moduleFamily = staticModuleFamily(sourcePath);
        }
      } catch {
        continue;
      }
    } else if (isWithinRepository(rawLocation)) {
      moduleFamily = repositoryModuleFamily(rawLocation);
    }
    if (moduleFamily !== undefined) {
      return `${moduleFamily}:${lineNumber}`;
    }
  }
  return undefined;
};

const createBrowserErrorDiagnostic = (
  input: BrowserErrorDiagnosticInput,
  fingerprintKey: Uint8Array,
  sourceOrigin: string | undefined
): BrowserErrorDiagnostic => {
  const source = safeStackSource(input.stack, sourceOrigin);
  return Object.freeze({
    category: classifyMessage(input.message, input.errorName),
    fingerprint: createHmac("sha256", fingerprintKey)
      .update(normalizeMessage(input.message))
      .digest("hex"),
    name: safeErrorName(input.errorName, input.kind),
    route: routeTemplate(input.pathname),
    ...(source === undefined ? {} : { source }),
  });
};

const formatBrowserErrorDiagnostic = (
  kind: BrowserErrorDiagnosticInput["kind"],
  diagnostic: BrowserErrorDiagnostic
): string => {
  const source =
    diagnostic.source === undefined ? "" : ` source=${diagnostic.source}`;
  return `Unexpected ${kind} error [category=${diagnostic.category} fingerprint=${diagnostic.fingerprint} route=${diagnostic.route} name=${diagnostic.name}${source}]`;
};

const httpRuleKey = (rule: ExpectedHttpError): string =>
  `${rule.status}:${rule.method.toUpperCase()}:${rule.pathname}`;

const messageRuleKey = (rule: ExpectedBrowserMessage): string =>
  `${rule.pathname}:${rule.message}`;

const validateSourceOrigin = (
  sourceOrigin: string | undefined
): string | undefined => {
  if (sourceOrigin === undefined) {
    return undefined;
  }
  if (sourceOrigin.length > MAX_URL_LENGTH) {
    throw new TypeError("Browser error source origin is invalid.");
  }
  let parsed: URL;
  try {
    parsed = new URL(sourceOrigin);
  } catch {
    throw new TypeError("Browser error source origin is invalid.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "darkfactory.localhost" ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.pathname !== "/" ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    parsed.origin !== sourceOrigin
  ) {
    throw new TypeError("Browser error source origin is invalid.");
  }
  return parsed.origin;
};

export class BrowserErrorCollector {
  readonly #allowedRules = new Map<string, ExpectedHttpError>();
  readonly #allowedConsoleErrors = new Set<string>();
  readonly #allowedPageErrors = new Set<string>();
  readonly #allowedResponseCounts = new Map<number, number>();
  readonly #consoleResourceStatuses: number[] = [];
  readonly #failures: string[] = [];
  readonly #fingerprintKey = randomBytes(32);
  readonly #sourceOrigin: string | undefined;
  #allowedRuleCount = 0;
  #observationCount = 0;
  #observationLimitExceeded = false;

  constructor(
    expected: readonly ExpectedHttpError[] = [],
    options: BrowserErrorCollectorOptions = {}
  ) {
    this.#sourceOrigin = validateSourceOrigin(options.sourceOrigin);
    for (const rule of expected) {
      this.allowHttpError(rule);
    }
  }

  allowHttpError(rule: ExpectedHttpError): void {
    if (
      !Number.isInteger(rule.status) ||
      rule.status < 400 ||
      rule.status > 599 ||
      rule.pathname.length === 0 ||
      rule.pathname.length > MAX_PATHNAME_LENGTH ||
      !rule.pathname.startsWith("/") ||
      rule.pathname.includes("?") ||
      rule.pathname.includes("#") ||
      rule.method.length === 0 ||
      rule.method.length > MAX_METHOD_LENGTH ||
      rule.method.trim().length === 0
    ) {
      throw new TypeError(
        "Expected HTTP errors require an exact method, pathname, and 4xx or 5xx status."
      );
    }

    const normalized = Object.freeze({
      method: rule.method.toUpperCase(),
      pathname: rule.pathname,
      status: rule.status,
    });
    const key = httpRuleKey(normalized);
    if (!this.#allowedRules.has(key)) {
      this.#claimAllowedRuleSlot();
    }
    this.#allowedRules.set(key, normalized);
  }

  allowConsoleError(rule: ExpectedBrowserMessage): void {
    const key = this.#validateMessageRule(rule);
    if (!this.#allowedConsoleErrors.has(key)) {
      this.#claimAllowedRuleSlot();
    }
    this.#allowedConsoleErrors.add(key);
  }

  allowPageError(rule: ExpectedBrowserMessage): void {
    const key = this.#validateMessageRule(rule);
    if (!this.#allowedPageErrors.has(key)) {
      this.#claimAllowedRuleSlot();
    }
    this.#allowedPageErrors.add(key);
  }

  recordResponse(response: ObservedResponse): void {
    if (response.status < 400 || response.status > 599) {
      return;
    }
    if (!this.#acceptObservation()) {
      return;
    }
    if (
      response.method.length === 0 ||
      response.method.length > MAX_METHOD_LENGTH ||
      response.url.length === 0 ||
      response.url.length > MAX_URL_LENGTH
    ) {
      this.#failures.push(INVALID_HTTP_METADATA_FAILURE);
      return;
    }

    let url: URL;
    try {
      url = new URL(response.url);
    } catch {
      this.#failures.push(INVALID_HTTP_METADATA_FAILURE);
      return;
    }
    if (url.pathname.length > MAX_PATHNAME_LENGTH) {
      this.#failures.push(INVALID_HTTP_METADATA_FAILURE);
      return;
    }
    const rule: ExpectedHttpError = {
      method: response.method.toUpperCase(),
      pathname: url.pathname,
      status: response.status,
    };
    if (!this.#allowedRules.has(httpRuleKey(rule))) {
      this.#failures.push(`Unexpected HTTP ${response.status} response`);
      return;
    }
    this.#allowedResponseCounts.set(
      response.status,
      (this.#allowedResponseCounts.get(response.status) ?? 0) + 1
    );
  }

  recordConsole(type: string, text: string, pathname = "/"): void {
    if (type !== "error") {
      return;
    }
    if (!this.#acceptObservation()) {
      return;
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      this.#failures.push(OVERSIZED_CONSOLE_FAILURE);
      return;
    }
    if (pathname.length === 0 || pathname.length > MAX_PATHNAME_LENGTH) {
      this.#failures.push(INVALID_BROWSER_METADATA_FAILURE);
      return;
    }

    const resourceMatch = HTTP_RESOURCE_ERROR_PATTERN.exec(text);
    if (resourceMatch !== null) {
      this.#consoleResourceStatuses.push(Number(resourceMatch[1]));
      return;
    }
    if (
      this.#allowedConsoleErrors.has(
        messageRuleKey({ message: text, pathname })
      )
    ) {
      return;
    }
    const diagnostic = createBrowserErrorDiagnostic(
      { kind: "console", message: text, pathname },
      this.#fingerprintKey,
      this.#sourceOrigin
    );
    this.#failures.push(formatBrowserErrorDiagnostic("console", diagnostic));
  }

  recordPageError(error: Error, pathname = "/"): void {
    if (!this.#acceptObservation()) {
      return;
    }
    if (
      error.message.length > MAX_MESSAGE_LENGTH ||
      (error.stack !== undefined && error.stack.length > MAX_STACK_LENGTH)
    ) {
      this.#failures.push(OVERSIZED_PAGE_FAILURE);
      return;
    }
    if (
      pathname.length === 0 ||
      pathname.length > MAX_PATHNAME_LENGTH ||
      error.name.length > MAX_ERROR_NAME_LENGTH
    ) {
      this.#failures.push(INVALID_BROWSER_METADATA_FAILURE);
      return;
    }
    if (
      this.#allowedPageErrors.has(
        messageRuleKey({ message: error.message, pathname })
      )
    ) {
      return;
    }
    const diagnostic = createBrowserErrorDiagnostic(
      {
        errorName: error.name,
        kind: "page",
        message: error.message,
        pathname,
        ...(error.stack === undefined ? {} : { stack: error.stack }),
      },
      this.#fingerprintKey,
      this.#sourceOrigin
    );
    this.#failures.push(formatBrowserErrorDiagnostic("page", diagnostic));
  }

  failures(): readonly string[] {
    const remainingAllowed = new Map(this.#allowedResponseCounts);
    const unexpectedResourceErrors: string[] = [];
    for (const status of this.#consoleResourceStatuses) {
      const count = remainingAllowed.get(status) ?? 0;
      if (count > 0) {
        remainingAllowed.set(status, count - 1);
      } else {
        unexpectedResourceErrors.push(
          `Unexpected HTTP ${status} console resource error`
        );
      }
    }
    return Object.freeze([
      ...this.#failures,
      ...unexpectedResourceErrors,
      ...(this.#observationLimitExceeded ? [OBSERVATION_LIMIT_FAILURE] : []),
    ]);
  }

  #acceptObservation(): boolean {
    if (this.#observationCount >= MAX_OBSERVATIONS) {
      this.#observationLimitExceeded = true;
      return false;
    }
    this.#observationCount += 1;
    return true;
  }

  #claimAllowedRuleSlot(): void {
    if (this.#allowedRuleCount >= MAX_ALLOWED_RULES) {
      throw new RangeError("Browser error allowlist limit exceeded.");
    }
    this.#allowedRuleCount += 1;
  }

  #validateMessageRule(rule: ExpectedBrowserMessage): string {
    if (
      rule.pathname.length === 0 ||
      rule.pathname.length > MAX_PATHNAME_LENGTH ||
      !rule.pathname.startsWith("/") ||
      rule.pathname.includes("?") ||
      rule.pathname.includes("#") ||
      rule.message.length === 0 ||
      rule.message.length > MAX_MESSAGE_LENGTH
    ) {
      throw new TypeError(
        "Expected browser messages require an exact pathname and message."
      );
    }
    return messageRuleKey(rule);
  }
}
