import { describe, it, expect } from "vitest";
import { partLines, diffLineStats } from "@/lib/diff-stats";

const part = (value: string, kind: "added" | "removed" | "same" = "same") => ({
  value,
  added: kind === "added",
  removed: kind === "removed",
});

describe("partLines", () => {
  it("sondaki satır sonunu boş satır saymaz", () => {
    expect(partLines("a\nb\n")).toEqual(["a", "b"]);
  });
  it("sonu satır sonu olmayan parçayı korur", () => {
    expect(partLines("a\nb")).toEqual(["a", "b"]);
    expect(partLines("tek")).toEqual(["tek"]);
  });
  it("gerçek boş satırları korur", () => {
    expect(partLines("a\n\nb\n")).toEqual(["a", "", "b"]);
  });
});

describe("diffLineStats", () => {
  it("eklenen ve silinen satırları sayar, değişmeyenleri saymaz", () => {
    const parts = [part("Kalem,Tutar\n"), part("x,1\ny,2\n", "removed"), part("x,3\ny,6\nz,9\n", "added")];
    expect(diffLineStats(parts)).toEqual({ added: 3, removed: 2 });
  });
  it("aynı içerikte sıfır döner", () => {
    expect(diffLineStats([part("a\nb\n")])).toEqual({ added: 0, removed: 0 });
  });
});
