import { describe, expect, it } from "vitest";
import { serviceLength } from "./format";

describe("serviceLength", () => {
  it("years and months", () => {
    expect(serviceLength("2024-07-15", "2026-10-24")).toBe("2 ปี 3 เดือน");
    expect(serviceLength("2024-10-25", "2026-10-24")).toBe("1 ปี 11 เดือน");
    expect(serviceLength("2025-10-24", "2026-10-24")).toBe("1 ปี");
    expect(serviceLength("2026-08-24", "2026-10-24")).toBe("2 เดือน");
  });
  it("under a month", () => {
    expect(serviceLength("2026-10-14", "2026-10-24")).toBe("10 วัน");
  });
});
