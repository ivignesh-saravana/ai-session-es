import {
  deleteMcq,
  getMcqById,
  McqNotFoundError,
  McqValidationError,
  updateMcq,
} from "@/lib/services/mcq-service";
import { jsonError, readJsonBody } from "@/lib/http";
import { parseMcqInput } from "@/lib/mcq-http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const mcq = await getMcqById(id);
    if (!mcq) {
      return jsonError(404, "Question not found");
    }
    return Response.json(mcq, { status: 200 });
  } catch {
    return jsonError(500, "Unable to load question");
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const body = await readJsonBody(request);
  if (!body) {
    return jsonError(400, "Invalid request body");
  }

  const input = parseMcqInput(body);
  if (!input) {
    return jsonError(400, "Invalid question payload");
  }

  try {
    const { id } = await context.params;
    const mcq = await updateMcq(id, input);
    return Response.json(mcq, { status: 200 });
  } catch (error) {
    if (error instanceof McqValidationError) {
      return jsonError(400, error.message);
    }
    if (error instanceof McqNotFoundError) {
      return jsonError(404, "Question not found");
    }
    return jsonError(500, "Unable to update question");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const existing = await getMcqById(id);
    if (!existing) {
      return jsonError(404, "Question not found");
    }
    await deleteMcq(id);
    return Response.json({ ok: true }, { status: 200 });
  } catch {
    return jsonError(500, "Unable to delete question");
  }
}
