import {
  handleApiRequest,
  type ApiContext,
} from "@darkfactory/api/server"

export const handleOrpcRequest = (
  request: Request,
  context: ApiContext,
): Promise<Response> => handleApiRequest(request, context)
