import { getMcqForPreview } from "@/lib/services/mcq-service";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const mcq = await getMcqForPreview(id);
    if (!mcq) {
      return jsonError(404, "Question not found");
    }
    return Response.json(mcq, { status: 200 });
  } catch {
    return jsonError(500, "Unable to load preview");
  }
}
