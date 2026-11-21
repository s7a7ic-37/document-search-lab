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

  const panels = methods.map(({ key, title, hint }) => {
    const panel = element("section", "", "panel");
    panel.setAttribute("aria-label", title);
    const list = element("ol", "", "ranked");
    const ranking = record.rankings[key];
    const hits = record.metrics[key].hits;
    panel.append(element("h2", title), element("p", hint, "muted"),
      element("p", hits + " of " + record.expected.length + " expected found", "missed"));
    ranking.forEach(({ id, score }, rank) => {
      const doc = documents.get(id);
      const item = document.createElement("li");
      const label = element("p", String(rank + 1) + ". " + id + " · Similarity " + score.toFixed(3), "result-label");
      if (record.expected.includes(id)) label.append(element("span", "Expected", "match"));
      item.append(label, element("h3", doc.title), element("p", doc.text, "result-text"));
      list.append(item);
    });
    if (ranking.length) panel.append(list);
    else panel.append(element("p", "No positive matches.", "muted"));
    const missed = record.expected.filter((id) => !ranking.some((row) => row.id === id));
    if (missed.length) panel.append(element("p", "Missing: " + missed.join(", "), "missed"));
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
  if (firstDifference) questionSelect.value = firstDifference.id;
  questionSelect.addEventListener("change", () => renderCase(cases.get(questionSelect.value), documents));
  renderCase(cases.get(questionSelect.value), documents);
  byId("report").hidden = false;
  byId("load-state").hidden = true;
} catch {
  byId("load-state").textContent = "The search report could not be loaded. Refresh this page to try again.";
}
