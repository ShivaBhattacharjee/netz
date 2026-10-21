import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreCleaning } from "@/server/evals/score";
import { evalPath, loadSheet } from "./helpers";

type Labels = Parameters<typeof scoreCleaning>[1];
type Scores = Parameters<typeof scoreCleaning>[2];

describe("cleaning accuracy against the labelled eval sets", () => {
  it.each(["small", "medium", "large", "final/1-row", "final/100-rows", "final/1000-rows", "final/10000-rows"])("%s scores 100% on every field", (set) => {
    const { groups } = loadSheet(evalPath(set, "supplier-sheet.csv"));
    const labels = JSON.parse(readFileSync(evalPath(set, "labels.json"), "utf8")) as Labels;
    const scores: Scores = {};
    const notes: string[] = [];
    scoreCleaning(groups, labels, scores, notes);

    expect(notes).toEqual([]);
    for (const [field, score] of Object.entries(scores)) {
      expect(score.correct, field).toBe(score.total);
    }
  });
});
