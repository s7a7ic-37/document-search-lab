import { MAX_QUERY_LENGTH, search } from "./search.mjs";

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};

const methods = [
  { key: "keyword", title: "Keyword search", hint: "Ranks results using matching words and short phrases." },
  { key: "semantic", title: "Semantic search", hint: "Ranks results by similarity across learned document topics." },
];

const byId = (id) => document.getElementById(id);
const percent = (value) => new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }).format(value);

function renderCase(record, documents) {
  byId("expected").hidden = false;
  byId("question-note").textContent = "Question " + record.id + " · " + record.expected.length + " expected";
  byId("why").textContent = record.why;
  byId("expected-list").replaceChildren(...record.expected.map((id) => element("li", id + " · " + documents.get(id).title)));
  const { keyword, semantic } = record.metrics;
  let comparison;
  if (keyword.hits !== semantic.hits) {
    comparison = (keyword.hits > semantic.hits ? "Keyword" : "Semantic") + " search found more expected procedures.";
  } else if (keyword.reciprocal_rank !== semantic.reciprocal_rank) {
    comparison = (keyword.reciprocal_rank > semantic.reciprocal_rank ? "Keyword" : "Semantic") + " search ranked the first expected procedure higher.";
  } else if (keyword.hits === 0) {
    comparison = "Neither method found an expected procedure in its first three results.";
  } else {
    comparison = "Both methods found " + keyword.hits + " of " + record.expected.length + " expected at the same first-match rank.";
  }
  byId("comparison").textContent = comparison;
  renderRankings(record.rankings, documents, record);
}

function renderRankings(rankings, documents, record) {
  const panels = methods.map(({ key, title, hint }) => {
    const panel = element("section", "", "panel");
    panel.setAttribute("aria-label", title);
    const list = element("ol", "", "ranked");
    const ranking = rankings[key];
    panel.append(element("h2", title), element("p", hint, "muted"));
    if (record) {
      panel.append(element("p", record.metrics[key].hits + " of " + record.expected.length + " expected found", "missed"));
    }
    ranking.forEach(({ id, score, shared_terms }, rank) => {
      const doc = documents.get(id);
      const item = document.createElement("li");
      const label = element("p", String(rank + 1) + ". " + id + " · Similarity " + score.toFixed(3), "result-label");
      if (record?.expected.includes(id)) label.append(element("span", "Expected", "match"));
      item.append(label, element("h3", doc.title), element("p", doc.text, "result-text"));
      if (shared_terms) item.append(element("p", shared_terms.length
        ? "Shared indexed terms: " + shared_terms.join(", ")
        : "No shared indexed terms", "muted"));
      list.append(item);
    });
    if (ranking.length) panel.append(list);
    else panel.append(element("p", "No positive matches.", "muted"));
    const missed = record?.expected.filter((id) => !ranking.some((row) => row.id === id));
    if (missed?.length) panel.append(element("p", "Missing: " + missed.join(", "), "missed"));
    return panel;
  });
  byId("results").replaceChildren(...panels);
}

try {
  const response = await fetch("/evaluation.json", { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("No published report");
  const report = await response.json();
  const documents = new Map(report.documents.map((doc) => [doc.id, doc]));
  const cases = new Map(report.cases.map((record) => [record.id, record]));
  const questionSelect = byId("question");
  byId("evaluated").textContent = report.cases.length + " judged questions · " + documents.size + " procedures";
  for (const { key, title } of methods) {
    const row = document.createElement("tr");
    const method = element("th", title);
    method.scope = "row";
    row.append(method, element("td", percent(report.summary[key].recall)), element("td", report.summary[key].mrr.toFixed(2)));
    byId("summary-rows").append(row);
  }
  for (const record of report.cases) {
    const option = element("option", record.question);
    option.value = record.id;
    questionSelect.append(option);
  }
  const firstDifference = report.cases.find(({ metrics }) => metrics.keyword.reciprocal_rank !== metrics.semantic.reciprocal_rank);
  questionSelect.value = (firstDifference || report.cases[0]).id;
  questionSelect.addEventListener("change", () => renderCase(cases.get(questionSelect.value), documents));
  renderCase(cases.get(questionSelect.value), documents);

  let index;
  const query = byId("query");
  const submit = byId("search");
  const feedback = byId("query-feedback");
  query.maxLength = MAX_QUERY_LENGTH;
  byId("own-question").addEventListener("submit", async event => {
    event.preventDefault();
    if (submit.getAttribute("aria-disabled") === "true") return;
    const text = query.value.trim();
    if (!text || text.length > MAX_QUERY_LENGTH) {
      feedback.hidden = false;
      feedback.textContent = "Enter a question of up to " + MAX_QUERY_LENGTH + " characters.";
      return;
    }
    feedback.hidden = true;
    submit.setAttribute("aria-disabled", "true");
    questionSelect.disabled = query.readOnly = true;
    try {
      if (!index) {
        feedback.hidden = false;
        feedback.textContent = "Loading the search index…";
        const response = await fetch("/search-index.json", { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error("Search index is unavailable");
        index = await response.json();
      }
      const rankings = search(text, index);
      renderRankings(rankings, documents);
      questionSelect.value = "";
      byId("question-note").textContent = "Your question · ranked on this device";
      byId("expected").hidden = true;
      byId("comparison").textContent = rankings.keyword.length || rankings.semantic.length
        ? "Your question has no judged labels. Compare the rankings below."
        : "No indexed words matched. Try terms from the museum procedures.";
      feedback.hidden = true;
    } catch {
      index = undefined;
      feedback.hidden = false;
      feedback.textContent = "Could not load the search index. Try again.";
    } finally {
      submit.removeAttribute("aria-disabled");
      questionSelect.disabled = query.readOnly = false;
    }
  });

  byId("report").hidden = false;
  byId("load-state").hidden = true;
} catch {
  byId("load-state").textContent = "The search report could not be loaded. Refresh this page to try again.";
}
