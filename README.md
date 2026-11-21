# Document Search Lab

Compare keyword and semantic search on 18 fictional museum procedures using 10 questions with expected documents. The dashboard shows both methods’ first three results, the expected procedures they missed and the evaluation scores. You can also rank the same procedures using your own question, processed on your device.

[Open the dashboard](https://search-lab.artemislab.co.uk/)

## Run locally

Use Python 3.13 and Node 24. Install the Python requirements in a virtual environment.

    python -m pip install -r requirements.txt
    python build_eval.py
    python -m unittest discover -s tests -v
    node --test tests/search.test.mjs
    python -m http.server 4189 --bind 127.0.0.1 --directory web

Open http://127.0.0.1:4189. The bundled report is static, so serving the dashboard does not need a Python service.

## Evaluation

The documents and expected answers are in the data folder. The build fits TF-IDF on the document text alone, then compares cosine similarity in the original term space and a seven-dimensional topic space learned with [truncated SVD](https://scikit-learn.org/stable/modules/generated/sklearn.decomposition.TruncatedSVD.html). Both methods use the same three-result cutoff.

Recall is the share of expected documents in the three results. Reciprocal rank is the inverse rank of the first expected document, or zero if it is absent. The report averages each measure over questions. Similarity scores are specific to each method and are not probabilities.

Each result shows up to three indexed terms shared with the question, ordered by their contribution to the keyword score. Semantic search can also find results with no shared terms.

This small authored set includes exact wording, paraphrases and words that are absent from the collection. The results describe this set only. The evaluation runs offline with scikit-learn and does not call a language model.

The build also exports the vocabulary, term weights and SVD projection for browser searches. The page fetches this fixed index on first use and keeps question text in memory. The browser reproduces the Python ranks and scores to eight decimal places on the ten sample questions. Visitor questions do not change the benchmark or receive relevance labels.
