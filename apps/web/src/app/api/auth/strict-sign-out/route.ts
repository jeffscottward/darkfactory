import { waitUntil } from "cloudflare:workers"

import { handleStrictSignOutRequest } from "./handler.ts"

export const POST = (request: Request): Promise<Response> => {
  return handleStrictSignOutRequest(request, (task) => waitUntil(task))
}
