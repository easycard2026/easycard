import { describe, expect, it } from "vitest";
import { USERNAME_DOMAIN, loginName, tempPassword, toLoginEmail, validUsername } from "./users";

describe("users", () => {
  it("maps usernames to internal emails and back", () => {
    expect(toLoginEmail(" Somchai ")).toBe(`somchai@${USERNAME_DOMAIN}`);
    expect(toLoginEmail("A@B.com")).toBe("a@b.com");
    expect(loginName(`somchai@${USERNAME_DOMAIN}`)).toBe("somchai");
    expect(loginName("a@b.com")).toBe("a@b.com");
  });
  it("validates usernames", () => {
    expect(validUsername("somchai.k")).toBe(true);
    expect(validUsername("ab")).toBe(false);
    expect(validUsername("สมชาย")).toBe(false);
    expect(validUsername("a@b.co")).toBe(true);
  });
  it("makes 10-char temp passwords", () => {
    expect(tempPassword()).toMatch(/^[A-Za-z2-9]{10}$/);
  });
});
