import { getCredentialsByUsername } from "@/lib/services/user-service";
import {
  hashesMatch,
  isSha256Hex,
  jsonError,
  readJsonBody,
  readString,
} from "@/lib/http";

const INVALID_CREDENTIALS = "Invalid username or password";
const DUMMY_HASH = "0".repeat(64);

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) {
    return jsonError(400, "Invalid request body");
  }

  const username = readString(body, "username");
  const passwordHash = readString(body, "passwordHash");

  if (!username || !passwordHash) {
    return jsonError(400, "Username and password hash are required");
  }
  if (!isSha256Hex(passwordHash)) {
    return jsonError(400, "Invalid password hash");
  }

  try {
    const credentials = await getCredentialsByUsername(username);
    const storedHash = credentials?.passwordHash ?? DUMMY_HASH;
    const passwordOk = hashesMatch(storedHash, passwordHash);

    if (!credentials || !passwordOk) {
      return jsonError(401, INVALID_CREDENTIALS);
    }

    return Response.json(credentials.user, { status: 200 });
  } catch {
    return jsonError(500, "Unable to log in");
  }
}
