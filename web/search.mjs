export const MAX_QUERY_LENGTH = 240;

function rank(documentIds, scores, shared, limit) {
  return scores.flatMap((score, i) => score > 1e-8
    ? [{ id: documentIds[i], score: Number(score.toFixed(8)), shared_terms: shared[i] }]
    : []
  ).sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id, "en")).slice(0, limit);
}

export function search(query, index) {
  if (query.length > MAX_QUERY_LENGTH) throw new RangeError("Question exceeds 240 characters.");
  const stopWords = new Set(index.stop_words);
  // scikit-learn's default analyser takes words with at least two word characters, ignoring English stop words.
  const tokens = (query.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []).filter(word => !stopWords.has(word));
  const counts = new Map();
  function count(term) {
    if (Object.hasOwn(index.vocabulary, term)) counts.set(term, (counts.get(term) || 0) + 1);
  }
  for (let i = 0; i < tokens.length; i++) {
    count(tokens[i]);
    if (i > 0) count(tokens[i - 1] + " " + tokens[i]);
  }
  if (!counts.size) return { keyword: [], semantic: [] };

  const weights = [...counts].map(([term, frequency]) => {
    const entry = index.vocabulary[term];
    return { term, entry, weight: (1 + Math.log(frequency)) * entry.idf };
  });
  const length = Math.hypot(...weights.map(item => item.weight));
  const lexical = index.document_ids.map(() => 0);
  const overlap = index.document_ids.map(() => []);
  const projected = index.document_topics[0].map(() => 0);
  for (const { term, entry, weight } of weights) {
    const normalised = weight / length;
    for (const [row, value] of entry.postings) {
      const contribution = normalised * value;
      lexical[row] += contribution;
      overlap[row].push({ term, contribution: Number(contribution.toFixed(10)) });
    }
    entry.projection.forEach((value, component) => { projected[component] += normalised * value; });
  }

  const topicLength = Math.hypot(...projected);
  const semantic = index.document_topics.map(vector => topicLength
    ? vector.reduce((sum, value, i) => sum + value * projected[i], 0) / topicLength
    : 0);
  const shared = overlap.map(terms => terms.sort((a, b) => b.contribution - a.contribution || (a.term < b.term ? -1 : 1))
    .slice(0, 3).map(({ term }) => term));
  return {
    keyword: rank(index.document_ids, lexical, shared, index.top_k),
    semantic: rank(index.document_ids, semantic, shared, index.top_k),
  };
}
