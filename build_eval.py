"""Generate the static report from authored documents and fixed relevance labels."""

import argparse
import json
from pathlib import Path
from statistics import mean

from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from threadpoolctl import threadpool_limits

ROOT = Path(__file__).resolve().parent
TOP_K = 3


def rank(documents, scores):
    matches = [{"id": doc["id"], "score": round(float(score), 8)}
               for doc, score in zip(documents, scores, strict=True) if score > 1e-8]
    return sorted(matches, key=lambda item: (-item["score"], item["id"]))[:TOP_K]


def measure(results, expected):
    hits = [position for position, item in enumerate(results, 1) if item["id"] in expected]
    return {"hits": len(hits), "recall": len(hits) / len(expected), "reciprocal_rank": 1 / hits[0] if hits else 0}


def evaluate(documents, questions):
    ids = {doc["id"] for doc in documents}
    if len(ids) != len(documents) or len(ids) < 3:
        raise ValueError("Provide at least three documents with different IDs.")
    if not questions or len({q["id"] for q in questions}) != len(questions):
        raise ValueError("Provide questions with distinct IDs.")
    for question in questions:
        expected = question["expected"]
        if not expected or len(set(expected)) != len(expected) or not set(expected) <= ids:
            raise ValueError(f"Invalid relevance labels for {question['id']}.")

    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
    document_terms = vectorizer.fit_transform([doc["title"] + "\n" + doc["text"] for doc in documents])
    question_terms = vectorizer.transform([question["question"] for question in questions])
    components = min(7, document_terms.shape[0] - 1, document_terms.shape[1] - 1)
    topics = TruncatedSVD(n_components=components, random_state=21, n_iter=15)
    with threadpool_limits(limits=1):
        document_topics = topics.fit_transform(document_terms)
        question_topics = topics.transform(question_terms)

    terms_scores = cosine_similarity(question_terms, document_terms)
    topics_scores = cosine_similarity(question_topics, document_topics)
    cases = []
    for index, question in enumerate(questions):
        rankings = {
            "keyword": rank(documents, terms_scores[index]),
            "semantic": rank(documents, topics_scores[index]),
        }
        metrics = {name: measure(results, question["expected"]) for name, results in rankings.items()}
        cases.append({**question, "rankings": rankings, "metrics": metrics})

    summary = {
        method: {"recall": mean(case["metrics"][method]["recall"] for case in cases),
                 "mrr": mean(case["metrics"][method]["reciprocal_rank"] for case in cases)}
        for method in ("keyword", "semantic")
    }
    return {"top_k": TOP_K, "components": components, "documents": documents, "cases": cases, "summary": summary}


def build_report():
    documents = json.loads((ROOT / "data/documents.json").read_text(encoding="utf-8"))
    questions = json.loads((ROOT / "data/questions.json").read_text(encoding="utf-8"))
    return evaluate(documents, questions)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "web/evaluation.json")
    args = parser.parse_args()
    args.output.write_text(json.dumps(build_report(), ensure_ascii=False, allow_nan=False, indent=2) + "\n", encoding="utf-8")
