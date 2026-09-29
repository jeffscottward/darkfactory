import { waitUntil } from "cloudflare:workers"

import { handleAuthRequest } from "./handler.ts"

const handleAuth = (request: Request): Promise<Response> => {
  return handleAuthRequest(request, (task) => waitUntil(task))
}

export const GET = handleAuth
export const POST = handleAuth
