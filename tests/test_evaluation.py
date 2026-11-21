import json
import unittest

from numpy.testing import assert_allclose

from build_eval import ROOT, build_report, evaluate, export_index, fit_documents, measure, rank


class EvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = build_report()
        cls.questions = {case["id"]: case for case in cls.report["cases"]}

    def test_scores_use_first_expected_and_all_expected(self):
        results = [{"id": "A"}, {"id": "B"}, {"id": "C"}]
        self.assertEqual(measure(results, ["B", "D"]), {"hits": 1, "recall": 0.5, "reciprocal_rank": 0.5})
        self.assertEqual(measure([], ["B"]), {"hits": 0, "recall": 0, "reciprocal_rank": 0})

    def test_ranking_keeps_three_positive_results_and_breaks_ties_by_id(self):
        documents = [{"id": doc} for doc in ("B", "A", "C", "D", "E")]
        self.assertEqual([row["id"] for row in rank(documents, [0.5, 0.5, -0.1, 0.6, 0.1])], ["D", "A", "B"])

    def test_rejects_unknown_or_duplicate_relevance_labels(self):
        for expected in ([], ["A01", "A01"], ["X99"]):
            with self.subTest(expected=expected), self.assertRaisesRegex(ValueError, "Invalid relevance labels"):
                evaluate(self.report["documents"], [{**self.questions["Q01"], "expected": expected}])

    def test_each_method_leads_on_a_real_sample_and_unseen_words_have_no_results(self):
        paraphrase = self.questions["Q03"]["metrics"]
        self.assertGreater(paraphrase["semantic"]["reciprocal_rank"], paraphrase["keyword"]["reciprocal_rank"])
        exact = self.questions["Q09"]["metrics"]
        self.assertGreater(exact["keyword"]["reciprocal_rank"], exact["semantic"]["reciprocal_rank"])
        self.assertEqual(self.questions["Q07"]["rankings"], {"keyword": [], "semantic": []})

    def test_published_report_matches_the_offline_build(self):
        published = json.loads((ROOT / "web/evaluation.json").read_text(encoding="utf-8"))
        self.assertEqual(published, self.report)

    def test_exported_browser_index_matches_the_fitted_models(self):
        documents = self.report["documents"]
        actual = json.loads((ROOT / "web/search-index.json").read_text(encoding="utf-8"))
        fitted = export_index(documents, fit_documents(documents))
        for field in ("document_ids", "stop_words", "top_k"):
            self.assertEqual(actual[field], fitted[field])
        assert_allclose(actual["document_topics"], fitted["document_topics"], atol=1e-12, rtol=0)
        self.assertEqual(actual["vocabulary"].keys(), fitted["vocabulary"].keys())
        for term, entry in fitted["vocabulary"].items():
            indexed = actual["vocabulary"][term]
            self.assertAlmostEqual(indexed["idf"], entry["idf"], places=12)
            assert_allclose(indexed["projection"], entry["projection"], atol=1e-12, rtol=0)
            assert_allclose(indexed["postings"], entry["postings"], atol=1e-12, rtol=0)


if __name__ == "__main__":
    unittest.main()
