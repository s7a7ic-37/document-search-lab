import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_QUERY_LENGTH, search } from "../web/search.mjs";

const read = name => JSON.parse(readFileSync(new URL("../web/" + name, import.meta.url), "utf8"));
const report = read("evaluation.json");
const index = read("search-index.json");

test("browser search returns the offline Python ranks and eight-place scores for every case", () => {
  for (const sample of report.cases) {
    assert.deepEqual(search(sample.question, index), sample.rankings, sample.id);
  }
});

test("case, punctuation and repeated terms are supported in new searches", () => {
  const searchText = "restore the booking register register";
  const rankings = search(searchText, index);
  assert.equal(rankings.keyword[0].id, "F01");
  assert.deepEqual(search("RESTORE, the BOOKING REGISTER register?", index), rankings);
  assert.ok(rankings.semantic.length);
});

test("empty and unseen terms return no matches, and long queries are rejected", () => {
  const noResults = { keyword: [], semantic: [] };
  assert.deepEqual(search("", index), noResults);
  assert.deepEqual(search("unknownxyz __proto__ constructor toString", index), noResults);
  assert.throws(() => search("a".repeat(MAX_QUERY_LENGTH + 1), index), RangeError);
});
