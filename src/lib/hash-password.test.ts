import { describe, expect, it } from "vitest";
import { hashPassword } from "./hash-password";

describe("hashPassword", () => {
  it("returns the FIPS SHA-256 hex digest for a known plaintext", async () => {
    const digest = await hashPassword("abc");
    expect(digest).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[a-f0-9]+$/);
  });

  it("returns the same hash for the same input", async () => {
    expect(await hashPassword("secret")).toBe(await hashPassword("secret"));
  });

  it("returns different hashes for different inputs", async () => {
    expect(await hashPassword("one")).not.toBe(await hashPassword("two"));
  });

  it("never returns the plaintext", async () => {
    const plaintext = "testpass123";
    expect(await hashPassword(plaintext)).not.toBe(plaintext);
  });
});
