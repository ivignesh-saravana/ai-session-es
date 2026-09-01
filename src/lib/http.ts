import { NextResponse } from "next/server";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function hashesMatch(stored: string, provided: string): boolean {
  if (stored.length !== provided.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < stored.length; i += 1) {
    mismatch |= stored.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}
