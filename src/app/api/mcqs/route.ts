import {
  createMcq,
  listMcqs,
  McqValidationError,
} from "@/lib/services/mcq-service";
import { jsonError, readJsonBody } from "@/lib/http";
import { parseMcqInput } from "@/lib/mcq-http";

export async function GET(_request: Request) {
  try {
    const mcqs = await listMcqs();
    return Response.json({ mcqs }, { status: 200 });
  } catch {
    return jsonError(500, "Unable to list questions");
  }
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) {
    return jsonError(400, "Invalid request body");
  }

  const input = parseMcqInput(body);
  if (!input) {
    return jsonError(400, "Invalid question payload");
  }

  try {
    const mcq = await createMcq(input);
    return Response.json(mcq, { status: 201 });
  } catch (error) {
    if (error instanceof McqValidationError) {
      return jsonError(400, error.message);
    }
    return jsonError(500, "Unable to create question");
  }
}
