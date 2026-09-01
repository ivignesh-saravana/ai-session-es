import {
  createUser,
  UserAlreadyExistsError,
} from "@/lib/services/user-service";
import {
  isEmail,
  isSha256Hex,
  jsonError,
  readJsonBody,
  readString,
} from "@/lib/http";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) {
    return jsonError(400, "Invalid request body");
  }

  const firstName = readString(body, "firstName");
  const lastName = readString(body, "lastName");
  const username = readString(body, "username");
  const email = readString(body, "email");
  const passwordHash = readString(body, "passwordHash");

  if (!firstName || !lastName || !username || !email || !passwordHash) {
    return jsonError(400, "All fields are required");
  }
  if (!isEmail(email)) {
    return jsonError(400, "Invalid email");
  }
  if (!isSha256Hex(passwordHash)) {
    return jsonError(400, "Invalid password hash");
  }

  try {
    const user = await createUser({
      firstName,
      lastName,
      username,
      email,
      passwordHash,
    });
    return Response.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof UserAlreadyExistsError) {
      return jsonError(409, error.message);
    }
    return jsonError(500, "Unable to register");
  }
}
