# Sample Outputs

Pre-generated artifacts from a live run of the system. Reviewers can read these without running the system.

## Reading order

1. **`01-extracted-fields.json`** — Structured fields extracted by the LLM from `01-clean-complaint.pdf` after OCR: document type, parties (plaintiffs, defendants, counsel), and key dates in ISO 8601 format. Shows the field extraction step works correctly on a clean legal complaint.

2. **`02-initial-draft.md`** — The five-section Case Fact Summary generated on the first pass, before any operator edits. Citations use real `[c:UUID]` markers referencing chunk IDs in the `chunks` table. Per-section grounding scores shown.

3. **`03-edits-applied.json`** — The operator edits submitted to `POST /edit` across the first two edit-loop iterations. Each entry shows: section, edit classification, signal score, whether the edit was promoted to the exemplar pool, and the before/after preview.

4. **`04-improved-draft.md`** — The final draft generated after three edit-loop iterations, with exemplars and style preferences injected. Compare against `02-initial-draft.md` to see learned patterns applied.

5. **`05-evaluation-summary.md`** — Grounding precision and edit-loop convergence numbers for this document. References the full eval run in `eval/results/run-003.md`.

## Walkthrough transcripts

Full end-to-end terminal output for each sample, captured via `npm run demo`:

- **`01-clean-walkthrough.txt`** — Clean text PDF (pdfplumber_text strategy, 100% OCR confidence)
- **`02-scanned-walkthrough.txt`** — Text PDF simulating a court notice (pdfplumber_text)
- **`03-lowquality-walkthrough.txt`** — Text PDF simulating a low-quality contract (pdfplumber_text)

The image-only variants (`02-scanned-notice-IMG.pdf`, `03-low-quality-contract-IMG.pdf`) exercise the `tesseract_image` OCR fallback path. Run `npm run demo -- --all` to see the full comparison including both strategies in the aggregate table.

## Reproducing

```bash
cp .env.example .env  # fill in OPENAI_API_KEY
docker compose up --build -d
npm run demo -- --file samples/inputs/01-clean-complaint.pdf
```
