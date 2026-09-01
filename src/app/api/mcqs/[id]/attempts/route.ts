import {
  createAttempt,
  McqNotFoundError,
  McqValidationError,
} from "@/lib/services/mcq-service";
import { jsonError, readJsonBody, readString } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const body = await readJsonBody(request);
  if (!body) {
    return jsonError(400, "Invalid request body");
  }

  const choiceId = readString(body, "choiceId");
  if (!choiceId) {
    return jsonError(400, "Choice is required");
  }

  try {
    const { id } = await context.params;
    const attempt = await createAttempt({ mcqId: id, choiceId });
    return Response.json(attempt, { status: 201 });
  } catch (error) {
    if (error instanceof McqValidationError) {
      return jsonError(400, error.message);
    }
    if (error instanceof McqNotFoundError) {
      return jsonError(404, "Question not found");
    }
    return jsonError(500, "Unable to record attempt");
  }
}
