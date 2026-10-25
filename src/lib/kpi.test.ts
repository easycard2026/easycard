import { describe, expect, it } from "vitest";
import { grade, itemScore, itemsFor, monthRange, shiftMonth, totalScore } from "./kpi";

describe("itemScore", () => {
  it("higher is better", () => {
    expect(itemScore(100, 80, "higher")).toBe(80);
    expect(itemScore(100, 100, "higher")).toBe(100);
    expect(itemScore(100, 200, "higher")).toBe(120); // ไม่เกิน 120
    expect(itemScore(3, 1, "higher")).toBe(33.3);
    expect(itemScore(0, 0, "higher")).toBe(100);
  });
  it("lower is better", () => {
    expect(itemScore(5, 10, "lower")).toBe(50);
    expect(itemScore(5, 5, "lower")).toBe(100);
    expect(itemScore(5, 0, "lower")).toBe(120);
    expect(itemScore(0, 2, "lower")).toBe(0);
  });
});

describe("totalScore", () => {
  it("weights and skips unscored", () => {
    expect(totalScore([{ weight: 3, score: 100 }, { weight: 1, score: 60 }])).toBe(90);
    expect(totalScore([{ weight: 1, score: 80 }, { weight: 5, score: null }])).toBe(80);
    expect(totalScore([{ weight: 1, score: null }])).toBeNull();
    expect(totalScore([])).toBeNull();
  });
});

describe("grade", () => {
  it("bands", () => {
    expect(grade(null).tone).toBe("gray");
    expect(grade(105).label).toBe("ดีเยี่ยม");
    expect(grade(85).label).toBe("ดี");
    expect(grade(60).label).toBe("พอใช้");
    expect(grade(59.9).label).toBe("ต้องปรับปรุง");
  });
});

describe("itemsFor", () => {
  const items = [
    { id: "all", position_id: null, employee_id: null },
    { id: "sales", position_id: "p1", employee_id: null },
    { id: "it", position_id: "p2", employee_id: null },
    { id: "me", position_id: null, employee_id: "e1" },
    { id: "other", position_id: null, employee_id: "e2" },
  ];
  it("picks global, own position and own items", () => {
    expect(itemsFor(items, { id: "e1", position_id: "p1" }).map((i) => i.id)).toEqual(["all", "sales", "me"]);
    expect(itemsFor(items, { id: "e3", position_id: null }).map((i) => i.id)).toEqual(["all"]);
  });
});

describe("months", () => {
  it("ranges", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
