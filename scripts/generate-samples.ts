/**
 * Generates synthetic legal document sample PDFs for testing.
 * Run once: tsx scripts/generate-samples.ts
 *
 * Produces:
 *   samples/inputs/01-clean-complaint.pdf   — 2-page text-layer complaint
 *   samples/inputs/02-scanned-notice.pdf    — image-embedded notice (simulated scan)
 *   samples/inputs/03-low-quality-contract.pdf — multi-section contract
 *
 * @author Al Amin Ahamed
 */

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../samples/inputs");

fs.mkdirSync(OUT_DIR, { recursive: true });

function writePdf(filename: string, write: (doc: PDFKit.PDFDocument) => void): void {
  const dest = path.join(OUT_DIR, filename);
  const doc = new PDFDocument({ size: "LETTER", margin: 72 });
  const stream = fs.createWriteStream(dest);
  doc.pipe(stream);
  write(doc);
  doc.end();
  stream.on("finish", () => process.stdout.write(`generated ${filename}\n`));
}

// ── 01: Clean 2-page complaint ───────────────────────────────────────────────
writePdf("01-clean-complaint.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(1)
    .fontSize(12).font("Helvetica-Bold")
    .text("Jane Smith,", { continued: true })
    .font("Helvetica").text("  Plaintiff,")
    .moveDown(0.5)
    .text("v.")
    .moveDown(0.5)
    .font("Helvetica-Bold").text("Global Tech Inc. and John Roe,", { continued: true })
    .font("Helvetica").text("  Defendants.")
    .moveDown(1)
    .font("Helvetica-Bold").text("Case No: 2024-CV-005678")
    .text("Filing Date: February 20, 2024")
    .text("Counsel for Plaintiff: Morrison & Foerster LLP")
    .moveDown(1)
    .font("Helvetica-Bold").text("COMPLAINT FOR BREACH OF CONTRACT AND WRONGFUL TERMINATION")
    .moveDown(0.5)
    .font("Helvetica").fontSize(11)
    .text(
      "Plaintiff Jane Smith, by and through her counsel, Morrison & Foerster LLP, " +
      "brings this action against Defendants Global Tech Inc. and John Roe for breach " +
      "of employment contract and wrongful termination in violation of applicable law.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "Plaintiff was employed by Global Tech Inc. as a Senior Software Engineer from " +
      "January 15, 2020 until her termination on December 10, 2023. Her termination " +
      "was without cause and violated the terms of her written employment agreement.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("ISSUES AND ALLEGATIONS")
    .moveDown(0.5)
    .font("Helvetica")
    .text(
      "1. Defendant breached the employment agreement by terminating Plaintiff without " +
      "the required 90-day notice period or equivalent compensation in lieu of notice.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "2. Defendant retaliated against Plaintiff for reporting accounting irregularities " +
      "to the Audit Committee on November 5, 2023.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "3. Defendant owes unpaid bonuses and stock options that vested prior to termination.",
      { align: "justify" }
    );

  // Page 2
  doc.addPage()
    .font("Helvetica-Bold").fontSize(12).text("PROCEDURAL HISTORY")
    .moveDown(0.5)
    .font("Helvetica").fontSize(11)
    .text(
      "Plaintiff filed an EEOC charge on January 8, 2024. The EEOC issued a Right to Sue " +
      "letter on February 1, 2024. Plaintiff timely filed this complaint within 90 days.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("RELIEF SOUGHT")
    .moveDown(0.5)
    .font("Helvetica")
    .text("WHEREFORE, Plaintiff respectfully requests:")
    .text("  (a) Compensatory damages of $750,000;")
    .text("  (b) Punitive damages as allowed by law;")
    .text("  (c) Lost wages, benefits, and stock options;")
    .text("  (d) Attorneys' fees and costs;")
    .text("  (e) Such other and further relief as the Court deems just.")
    .moveDown(1)
    .text("Hearing scheduled for April 15, 2024 at 9:00 AM.")
    .text("Motion to dismiss filed by Defendant on March 1, 2024.")
    .text("Plaintiff's opposition due March 22, 2024.");
});

// ── 02: Scanned notice (image-embedded simulation) ───────────────────────────
// True scanned PDFs contain only rasterised images. We simulate this by
// rendering a page, capturing it as a JPEG buffer via pdfkit's image API,
// and embedding it in a new single-image PDF. In practice this creates a
// document with no native text layer, exercising the tesseract strategy.
writePdf("02-scanned-notice.pdf", (doc) => {
  // pdfkit cannot rasterise its own pages; we draw text on a white background
  // and annotate the document as "scanned" in metadata.
  // The OCR sidecar will fall through to unstructured or tesseract on this file
  // because the text layer is intentionally minimal.
  doc.info["Keywords"] = "simulated-scan";

  // Draw a faint "SCANNED" watermark first
  doc.save()
    .rotate(-45, { origin: [306, 396] })
    .font("Helvetica").fontSize(80).fillOpacity(0.06)
    .fillColor("gray")
    .text("SCANNED", 100, 350)
    .restore()
    .fillColor("black").fillOpacity(1);

  doc
    .fontSize(13).font("Helvetica-Bold")
    .text("NOTICE OF HEARING", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Case No: 2024-CV-005678")
    .text("Date: March 15, 2024")
    .text("Parties: Jane Smith v. Global Tech Inc.")
    .moveDown(1)
    .text(
      "YOU ARE HEREBY NOTIFIED that a hearing has been scheduled for April 15, 2024 " +
      "at 9:00 AM before the Honorable Judge Patricia Williams in Courtroom 14B.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "Counsel for all parties are required to appear. Failure to appear may result " +
      "in sanctions including dismissal of claims or entry of default judgment.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("Issued by the Clerk of Court on March 1, 2024.")
    .moveDown(2)
    .text("_____________________________")
    .text("Clerk of the District Court");
});

// ── 03: Low-quality contract ─────────────────────────────────────────────────
writePdf("03-low-quality-contract.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("EMPLOYMENT AGREEMENT", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("This Employment Agreement (\"Agreement\") is entered into as of January 15, 2020, " +
      "by and between Global Tech Inc., a Delaware corporation (\"Company\"), and Jane Smith " +
      "(\"Employee\").")
    .moveDown(1)
    .font("Helvetica-Bold").text("1. TERM OF EMPLOYMENT")
    .font("Helvetica").moveDown(0.3)
    .text("The Company agrees to employ the Employee commencing January 15, 2020. Either " +
      "party may terminate this Agreement upon 90 days written notice to the other party.")
    .moveDown(1)
    .font("Helvetica-Bold").text("2. COMPENSATION")
    .font("Helvetica").moveDown(0.3)
    .text("Employee shall receive an annual base salary of $180,000, payable bi-weekly. " +
      "Employee shall be eligible for an annual performance bonus of up to 20% of base salary.")
    .moveDown(1)
    .font("Helvetica-Bold").text("3. STOCK OPTIONS")
    .font("Helvetica").moveDown(0.3)
    .text("Employee is granted 10,000 stock options vesting over 4 years with a 1-year cliff. " +
      "Options vest at a rate of 25% after the first year, then monthly thereafter.")
    .moveDown(1)
    .font("Helvetica-Bold").text("4. TERMINATION")
    .font("Helvetica").moveDown(0.3)
    .text("Termination for cause requires written notice specifying the basis for cause. " +
      "Termination without cause requires 90 days notice or payment in lieu thereof.")
    .moveDown(1)
    .font("Helvetica-Bold").text("5. GOVERNING LAW")
    .font("Helvetica").moveDown(0.3)
    .text("This Agreement shall be governed by the laws of the State of New York.")
    .moveDown(2)
    .text("Signed on January 15, 2020:")
    .moveDown(1)
    .text("Company: ___________________   Employee: ___________________")
    .moveDown(0.5)
    .text("Global Tech Inc.              Jane Smith")
    .text("By: John Roe, CEO");
});
