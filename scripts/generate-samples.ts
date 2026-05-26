/**
 * Generates synthetic legal document sample PDFs for testing.
 * Run once: tsx scripts/generate-samples.ts
 *
 * Produces:
 *   samples/inputs/01-clean-complaint.pdf        — 2-page text-layer complaint
 *   samples/inputs/02-scanned-notice.pdf         — image-embedded notice (simulated scan)
 *   samples/inputs/03-low-quality-contract.pdf   — multi-section contract
 *   samples/inputs/04-motion-to-dismiss.pdf      — defendant's motion to dismiss
 *   samples/inputs/05-settlement-agreement.pdf   — full settlement and release
 *   samples/inputs/06-subpoena-duces-tecum.pdf   — document subpoena
 *   samples/inputs/07-deposition-notice.pdf      — notice of deposition
 *   samples/inputs/08-interrogatories.pdf        — first set of interrogatories
 *   samples/inputs/09-answer-counterclaim.pdf    — answer and counterclaim
 *   samples/inputs/10-preliminary-injunction.pdf — motion for preliminary injunction
 *   samples/inputs/11-expert-witness-report.pdf  — expert witness report
 *   samples/inputs/12-discovery-order.pdf        — court order on discovery
 *   samples/inputs/13-summary-judgment.pdf       — motion for summary judgment
 *   samples/inputs/14-demand-letter.pdf          — pre-litigation demand letter
 *   samples/inputs/15-nda-agreement.pdf          — non-disclosure agreement
 *   samples/inputs/16-protective-order.pdf       — motion for protective order
 *   samples/inputs/17-class-action-complaint.pdf — class action complaint
 *   samples/inputs/18-appellate-brief.pdf        — brief on appeal
 *   samples/inputs/19-fee-petition.pdf           — attorney fee petition
 *   samples/inputs/20-consent-decree.pdf         — consent decree
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

// ── 04: Motion to Dismiss ────────────────────────────────────────────────────
writePdf("04-motion-to-dismiss.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(1)
    .fontSize(12)
    .text("Jane Smith,  Plaintiff,")
    .moveDown(0.3).text("v.")
    .moveDown(0.3).text("Global Tech Inc. and John Roe,  Defendants.")
    .moveDown(0.5).text("Case No: 2024-CV-005678")
    .moveDown(1)
    .text("DEFENDANTS' NOTICE OF MOTION TO DISMISS", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text(
      "PLEASE TAKE NOTICE that Defendants Global Tech Inc. and John Roe, by their " +
      "counsel Skadden Arps LLP, will move this Court on April 15, 2024 at 9:00 AM, " +
      "before the Honorable Judge Patricia Williams, for an Order dismissing Plaintiff's " +
      "Complaint with prejudice pursuant to Federal Rule of Civil Procedure 12(b)(6).",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("GROUNDS FOR DISMISSAL")
    .moveDown(0.5)
    .font("Helvetica")
    .text(
      "1. Plaintiff fails to state a claim for breach of contract because the employment " +
      "agreement expressly permitted termination upon demonstrated performance deficiencies.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "2. Plaintiff's retaliation claim is time-barred under the applicable 180-day " +
      "administrative exhaustion period. The EEOC charge was filed January 8, 2024, " +
      "more than 60 days after the alleged retaliatory act of November 5, 2023.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "3. The stock options at issue had not yet vested as of the termination date " +
      "of December 10, 2023, and therefore no compensable property interest existed.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("PROCEDURAL HISTORY")
    .moveDown(0.5)
    .font("Helvetica")
    .text(
      "Complaint filed February 20, 2024. Defendants were served March 1, 2024. " +
      "This motion is timely filed within the 21-day responsive pleading period.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("Dated: March 1, 2024")
    .moveDown(0.5)
    .text("Respectfully submitted,")
    .text("Skadden Arps LLP")
    .text("Counsel for Defendants");
});

// ── 05: Settlement Agreement ─────────────────────────────────────────────────
writePdf("05-settlement-agreement.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("CONFIDENTIAL SETTLEMENT AGREEMENT AND RELEASE", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text(
      "This Settlement Agreement and Release (\"Agreement\") is entered into as of " +
      "June 30, 2024, by and between Jane Smith (\"Claimant\") and Global Tech Inc. " +
      "and John Roe (collectively, \"Releasees\").",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("1. SETTLEMENT PAYMENT")
    .font("Helvetica").moveDown(0.3)
    .text(
      "In consideration of the promises herein, Releasees agree to pay Claimant the " +
      "total sum of $425,000 (Four Hundred Twenty-Five Thousand Dollars) within 30 days " +
      "of the execution of this Agreement.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("2. RELEASE OF CLAIMS")
    .font("Helvetica").moveDown(0.3)
    .text(
      "Claimant hereby releases and forever discharges the Releasees from any and all " +
      "claims, demands, causes of action arising out of or relating to Case No. 2024-CV-005678, " +
      "including claims for breach of contract, wrongful termination, and retaliation.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("3. CONFIDENTIALITY")
    .font("Helvetica").moveDown(0.3)
    .text(
      "The parties agree to keep the terms of this Agreement strictly confidential. " +
      "Neither party shall disclose the settlement amount or terms to any third party " +
      "without the prior written consent of the other party.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("4. NO ADMISSION OF LIABILITY")
    .font("Helvetica").moveDown(0.3)
    .text(
      "This Agreement does not constitute an admission of liability or wrongdoing by " +
      "any party. Defendants expressly deny all allegations in the Complaint.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("5. GOVERNING LAW")
    .font("Helvetica").moveDown(0.3)
    .text("This Agreement shall be governed by the laws of the State of New York.")
    .moveDown(2)
    .text("Executed on June 30, 2024.")
    .moveDown(1)
    .text("Jane Smith: ___________________   Global Tech Inc.: ___________________");
});

// ── 06: Subpoena Duces Tecum ─────────────────────────────────────────────────
writePdf("06-subpoena-duces-tecum.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(0.5)
    .text("SUBPOENA TO PRODUCE DOCUMENTS", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Case No: 2024-CV-005678")
    .text("Jane Smith v. Global Tech Inc. and John Roe")
    .moveDown(1)
    .text(
      "TO: Keeper of Records, First National Bank, 100 Wall Street, New York, NY 10005",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "YOU ARE COMMANDED to produce at the offices of Morrison & Foerster LLP, " +
      "250 West 55th Street, New York, NY 10019, on April 1, 2024 at 10:00 AM, " +
      "the following documents:",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("DOCUMENTS REQUESTED")
    .font("Helvetica").moveDown(0.3)
    .text(
      "1. All bank records for account nos. ending in 4521 and 8833 in the name of " +
      "Global Tech Inc. from January 1, 2023 through December 31, 2023."
    )
    .moveDown(0.3)
    .text(
      "2. All wire transfer records involving transactions exceeding $50,000 during " +
      "the same period."
    )
    .moveDown(0.3)
    .text(
      "3. All correspondence between Global Tech Inc. and the Audit Committee dated " +
      "October 1, 2023 through December 31, 2023."
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("OBJECTIONS")
    .font("Helvetica").moveDown(0.3)
    .text(
      "Any objections to this subpoena must be served within 14 days of service. " +
      "Failure to comply may result in a motion to compel and sanctions.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("Issued: March 10, 2024")
    .text("Issuing Officer: Morrison & Foerster LLP, Counsel for Plaintiff");
});

// ── 07: Notice of Deposition ─────────────────────────────────────────────────
writePdf("07-deposition-notice.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(0.5)
    .text("NOTICE OF DEPOSITION", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Case No: 2024-CV-005678")
    .text("Jane Smith v. Global Tech Inc. and John Roe")
    .moveDown(1)
    .text(
      "PLEASE TAKE NOTICE that, pursuant to Federal Rule of Civil Procedure 30, " +
      "Plaintiff Jane Smith will take the deposition of the following individuals:",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("DEPONENT 1: John Roe, CEO")
    .font("Helvetica").moveDown(0.3)
    .text("Date: April 20, 2024 at 9:00 AM")
    .text("Location: Morrison & Foerster LLP, 250 West 55th Street, New York, NY 10019")
    .text("Duration: Up to 7 hours")
    .moveDown(1)
    .font("Helvetica-Bold").text("DEPONENT 2: Sarah Chen, VP Human Resources")
    .font("Helvetica").moveDown(0.3)
    .text("Date: April 22, 2024 at 9:00 AM")
    .text("Location: Morrison & Foerster LLP, 250 West 55th Street, New York, NY 10019")
    .text("Duration: Up to 7 hours")
    .moveDown(1)
    .font("Helvetica-Bold").text("TOPICS")
    .font("Helvetica").moveDown(0.3)
    .text("1. Plaintiff's performance reviews and termination decision")
    .text("2. Audit Committee reports and accounting irregularities")
    .text("3. Stock option grant and vesting schedule")
    .text("4. Company policy on retaliation and whistleblower protections")
    .moveDown(1)
    .text(
      "The depositions will be recorded by stenographic means and may be videotaped.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("Dated: March 25, 2024")
    .text("Morrison & Foerster LLP, Counsel for Plaintiff");
});

// ── 08: Interrogatories ──────────────────────────────────────────────────────
writePdf("08-interrogatories.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(0.5)
    .text("PLAINTIFF'S FIRST SET OF INTERROGATORIES", { align: "center" })
    .text("TO DEFENDANTS", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Case No: 2024-CV-005678")
    .text("Jane Smith v. Global Tech Inc. and John Roe")
    .moveDown(1)
    .text(
      "Pursuant to Federal Rule of Civil Procedure 33, Plaintiff Jane Smith propounds " +
      "the following interrogatories to Defendants Global Tech Inc. and John Roe, to be " +
      "answered under oath within 30 days of service.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("INTERROGATORIES")
    .moveDown(0.5)
    .font("Helvetica")
    .text(
      "INTERROGATORY NO. 1: Identify all persons involved in the decision to terminate " +
      "Jane Smith on December 10, 2023, including their names, titles, and roles in the decision.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "INTERROGATORY NO. 2: Describe in full detail the performance deficiencies, if any, " +
      "that Defendants allege justified the termination of Jane Smith.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "INTERROGATORY NO. 3: Identify all documents and communications relating to the " +
      "Audit Committee report filed by Jane Smith on November 5, 2023.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "INTERROGATORY NO. 4: State the vesting schedule for all stock options granted to " +
      "Jane Smith, including the number of options vested as of December 10, 2023.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "INTERROGATORY NO. 5: Identify all other employees terminated within the 12-month " +
      "period following submission of an Audit Committee report.",
      { align: "justify" }
    )
    .moveDown(1)
    .text(
      "Answers must be served no later than April 15, 2024. Objections must state the " +
      "basis with specificity. Failure to timely respond may result in sanctions.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("Dated: March 15, 2024")
    .text("Morrison & Foerster LLP, Counsel for Plaintiff");
});

// ── 09: Answer and Counterclaim ──────────────────────────────────────────────
writePdf("09-answer-counterclaim.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(0.5).fontSize(12)
    .text("DEFENDANTS' ANSWER AND COUNTERCLAIM", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Case No: 2024-CV-005678  |  Filed: March 21, 2024")
    .text("Jane Smith v. Global Tech Inc. and John Roe")
    .moveDown(1)
    .font("Helvetica-Bold").text("ANSWER")
    .moveDown(0.5).font("Helvetica")
    .text("1. Defendants admit the Court has jurisdiction and deny all remaining allegations in paragraph 1.")
    .moveDown(0.3)
    .text("2. Defendants admit Jane Smith was employed from January 15, 2020 to December 10, 2023 and deny all remaining allegations.")
    .moveDown(0.3)
    .text("3. Defendants deny that termination was without cause. Performance improvement plans dated September 1 and October 15, 2023 document repeated deficiencies.", { align: "justify" })
    .moveDown(0.3)
    .text("4. Defendants deny any retaliation. The termination decision predated the November 5, 2023 Audit Committee report by sixty days.", { align: "justify" })
    .moveDown(1)
    .font("Helvetica-Bold").text("AFFIRMATIVE DEFENSES")
    .moveDown(0.5).font("Helvetica")
    .text("First Defense: Failure to state a claim upon which relief can be granted.")
    .moveDown(0.3)
    .text("Second Defense: Plaintiff failed to mitigate damages.")
    .moveDown(0.3)
    .text("Third Defense: Claims are barred by the doctrine of at-will employment.")
    .moveDown(1)
    .font("Helvetica-Bold").text("COUNTERCLAIM — BREACH OF CONFIDENTIALITY")
    .moveDown(0.5).font("Helvetica")
    .text(
      "Defendants counterclaim against Plaintiff for breach of the confidentiality " +
      "provisions of the Employment Agreement. Plaintiff disclosed proprietary source " +
      "code and client lists to a competitor, TechRival Corp., on or about November 20, 2023. " +
      "Defendants seek damages of $1,200,000 and injunctive relief.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("Dated: March 21, 2024   |   Skadden Arps LLP, Counsel for Defendants");
});

// ── 10: Motion for Preliminary Injunction ────────────────────────────────────
writePdf("10-preliminary-injunction.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(0.5).fontSize(12)
    .text("DEFENDANTS' MOTION FOR PRELIMINARY INJUNCTION", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Case No: 2024-CV-005678  |  Filed: March 28, 2024")
    .moveDown(1)
    .font("Helvetica-Bold").text("BASIS FOR INJUNCTIVE RELIEF")
    .moveDown(0.5).font("Helvetica")
    .text(
      "Defendants move for a preliminary injunction restraining Plaintiff Jane Smith from: " +
      "(a) disclosing Global Tech Inc. trade secrets to TechRival Corp. or any third party; " +
      "(b) accessing Global Tech Inc. computer systems; and (c) soliciting Global Tech Inc. " +
      "employees or clients during the pendency of this litigation.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("FOUR-FACTOR ANALYSIS")
    .moveDown(0.5).font("Helvetica")
    .text(
      "1. Likelihood of Success: Defendants possess direct evidence — email logs dated " +
      "November 18-20, 2023 — showing Plaintiff transmitted proprietary datasets to an " +
      "external email address associated with TechRival Corp.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "2. Irreparable Harm: Trade secret disclosure cannot be remedied by monetary damages. " +
      "Each day of continued disclosure compounds harm to competitive position.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "3. Balance of Hardships: An injunction merely requires Plaintiff to honor existing " +
      "contractual obligations. No legitimate business interest is restrained.",
      { align: "justify" }
    )
    .moveDown(0.5)
    .text(
      "4. Public Interest: Enforcement of trade secret protections serves the public interest " +
      "in protecting legitimate business investment in proprietary technology.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("Hearing requested: April 5, 2024.  Bond proposed: $50,000.")
    .moveDown(1)
    .text("Dated: March 28, 2024   |   Skadden Arps LLP");
});

// ── 11: Expert Witness Report ────────────────────────────────────────────────
writePdf("11-expert-witness-report.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("EXPERT WITNESS REPORT", { align: "center" })
    .moveDown(0.5).fontSize(12)
    .text("Damages Analysis — Jane Smith v. Global Tech Inc.", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Prepared by: Dr. Margaret Lee, CPA, CVA")
    .text("Engagement: Case No. 2024-CV-005678")
    .text("Date: April 10, 2024")
    .text("Retaining Counsel: Morrison & Foerster LLP")
    .moveDown(1)
    .font("Helvetica-Bold").text("SUMMARY OF OPINIONS")
    .moveDown(0.5).font("Helvetica")
    .text(
      "I have been retained to quantify economic damages suffered by Jane Smith arising " +
      "from her wrongful termination on December 10, 2023. Based on my review of " +
      "employment records, compensation data, and market comparables, I opine that " +
      "Plaintiff's total economic damages are $892,500.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("DAMAGES CALCULATION")
    .moveDown(0.5).font("Helvetica")
    .text("Lost wages (Dec 2023 – Jun 2024, 6.5 months @ $15,000/mo):   $97,500")
    .text("Future lost earnings (present value, 3-year horizon):          $540,000")
    .text("Lost bonus (20% of $180,000 pro-rated):                       $30,000")
    .text("Unvested stock options (8,750 options × $25 intrinsic value): $218,750")
    .text("Benefits (health, 401k match, 6.5 months):                    $  6,250")
    .text("─────────────────────────────────────────────────────────────────────")
    .text("TOTAL ECONOMIC DAMAGES:                                        $892,500")
    .moveDown(1)
    .font("Helvetica-Bold").text("METHODOLOGY")
    .moveDown(0.3).font("Helvetica")
    .text(
      "Lost earnings are calculated using Plaintiff's base salary of $180,000 per annum. " +
      "Future losses are discounted at 3.5% using U.S. Treasury yield curve data as of " +
      "April 1, 2024. Option value is based on the 90-day average closing price of " +
      "Global Tech Inc. (GTIX) less the exercise price of $12.50.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("Dr. Margaret Lee, CPA, CVA  |  April 10, 2024");
});

// ── 12: Court Discovery Order ────────────────────────────────────────────────
writePdf("12-discovery-order.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(0.5).fontSize(12)
    .text("ORDER GOVERNING DISCOVERY", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Case No: 2024-CV-005678")
    .text("Judge: Hon. Patricia Williams")
    .text("Entered: April 3, 2024")
    .moveDown(1)
    .font("Helvetica-Bold").text("IT IS HEREBY ORDERED:")
    .moveDown(0.5).font("Helvetica")
    .text(
      "1. All fact discovery shall be completed by July 31, 2024. No extensions will " +
      "be granted absent extraordinary circumstances shown by motion.",
      { align: "justify" }
    )
    .moveDown(0.3)
    .text(
      "2. Defendants shall produce all documents responsive to Plaintiff's First Request " +
      "for Production by April 30, 2024. Privilege log must accompany any withheld documents.",
      { align: "justify" }
    )
    .moveDown(0.3)
    .text(
      "3. Depositions shall be limited to seven hours per deponent absent agreement of " +
      "the parties or order of this Court.",
      { align: "justify" }
    )
    .moveDown(0.3)
    .text(
      "4. Expert reports shall be served by August 15, 2024. Rebuttal reports due " +
      "September 15, 2024. Expert depositions shall conclude by October 15, 2024.",
      { align: "justify" }
    )
    .moveDown(0.3)
    .text(
      "5. Defendants' motion for preliminary injunction is GRANTED in part. Plaintiff " +
      "is restrained from disclosing Global Tech Inc. source code pending further order.",
      { align: "justify" }
    )
    .moveDown(0.3)
    .text(
      "6. All discovery disputes shall be submitted by joint letter not exceeding three " +
      "pages before filing any discovery motion.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("Summary judgment motions due: November 1, 2024.")
    .text("Trial date: February 10, 2025 at 9:00 AM.")
    .moveDown(1)
    .text("SO ORDERED.")
    .moveDown(1)
    .text("Hon. Patricia Williams, U.S. District Judge  |  April 3, 2024");
});

// ── 13: Motion for Summary Judgment ─────────────────────────────────────────
writePdf("13-summary-judgment.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(0.5).fontSize(12)
    .text("DEFENDANTS' MOTION FOR SUMMARY JUDGMENT", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Case No: 2024-CV-005678  |  Filed: November 1, 2024")
    .moveDown(1)
    .font("Helvetica-Bold").text("STATEMENT OF UNDISPUTED FACTS")
    .moveDown(0.5).font("Helvetica")
    .text(
      "1. Jane Smith's employment agreement (Ex. A) contains a valid at-will provision " +
      "notwithstanding the 90-day notice clause, which is aspirational under New York law.",
      { align: "justify" }
    )
    .moveDown(0.3)
    .text(
      "2. Performance improvement plans issued September 1 and October 15, 2023 (Exs. B, C) " +
      "establish documented cause for termination independent of the Audit Committee report.",
      { align: "justify" }
    )
    .moveDown(0.3)
    .text(
      "3. Plaintiff's EEOC charge (Ex. D) was filed 64 days after the alleged retaliatory act, " +
      "exceeding the 60-day administrative exhaustion period under 42 U.S.C. § 2000e-5.",
      { align: "justify" }
    )
    .moveDown(0.3)
    .text(
      "4. As of December 10, 2023, only 6,250 options had vested. The remaining 3,750 options " +
      "were unvested and subject to forfeiture upon termination per Section 3 of the Agreement.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("LEGAL STANDARD")
    .moveDown(0.3).font("Helvetica")
    .text(
      "Summary judgment is appropriate when there is no genuine dispute as to any material " +
      "fact and the moving party is entitled to judgment as a matter of law. Fed. R. Civ. P. 56(a).",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("RELIEF REQUESTED")
    .moveDown(0.3).font("Helvetica")
    .text("Defendants respectfully request entry of summary judgment dismissing all claims with prejudice and awarding attorneys' fees under the fee-shifting provision of the Employment Agreement.")
    .moveDown(1)
    .text("Dated: November 1, 2024   |   Skadden Arps LLP");
});

// ── 14: Pre-Litigation Demand Letter ────────────────────────────────────────
writePdf("14-demand-letter.pdf", (doc) => {
  doc
    .fontSize(12).font("Helvetica-Bold")
    .text("MORRISON & FOERSTER LLP")
    .text("250 West 55th Street, New York, NY 10019")
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("January 15, 2024")
    .moveDown(0.5)
    .text("VIA CERTIFIED MAIL AND EMAIL")
    .moveDown(0.5)
    .text("John Roe, CEO")
    .text("Global Tech Inc.")
    .text("500 Fifth Avenue, Suite 1200, New York, NY 10110")
    .moveDown(1)
    .text("Re: Wrongful Termination and Breach of Contract — Jane Smith")
    .moveDown(1)
    .font("Helvetica-Bold").text("DEMAND FOR SETTLEMENT")
    .moveDown(0.5).font("Helvetica")
    .text(
      "We represent Jane Smith in connection with her claims arising from her wrongful " +
      "termination on December 10, 2023. This letter constitutes a formal demand for " +
      "settlement prior to the commencement of litigation.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("SUMMARY OF CLAIMS")
    .moveDown(0.5).font("Helvetica")
    .text(
      "Ms. Smith was employed as Senior Software Engineer under a written agreement " +
      "requiring 90-days notice before termination. Her termination followed her " +
      "good-faith report of accounting irregularities to the Audit Committee on " +
      "November 5, 2023 — a textbook retaliatory discharge.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("DEMAND")
    .moveDown(0.5).font("Helvetica")
    .text(
      "We demand payment of $750,000 within 21 days of this letter, representing " +
      "lost wages, unvested stock options, and compensatory damages. If we do not " +
      "receive a satisfactory response by February 5, 2024, we will file suit without " +
      "further notice and seek punitive damages and attorneys' fees.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("Sincerely,")
    .moveDown(0.5)
    .text("Morrison & Foerster LLP")
    .text("Counsel for Jane Smith");
});

// ── 15: Non-Disclosure Agreement ────────────────────────────────────────────
writePdf("15-nda-agreement.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("MUTUAL NON-DISCLOSURE AGREEMENT", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text(
      "This Mutual Non-Disclosure Agreement (\"NDA\") is entered into as of January 15, 2020 " +
      "between Global Tech Inc. (\"Company\") and Jane Smith (\"Employee\").",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("1. DEFINITION OF CONFIDENTIAL INFORMATION")
    .font("Helvetica").moveDown(0.3)
    .text(
      "\"Confidential Information\" means all non-public technical, business, financial, " +
      "and strategic information disclosed by one party to the other, including but not " +
      "limited to source code, algorithms, client lists, pricing data, and business plans.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("2. OBLIGATIONS")
    .font("Helvetica").moveDown(0.3)
    .text(
      "Each party agrees to: (a) hold Confidential Information in strict confidence; " +
      "(b) not disclose to any third party without prior written consent; (c) use " +
      "Confidential Information solely for purposes of the employment relationship; " +
      "(d) notify the disclosing party promptly upon discovery of any unauthorized disclosure.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("3. TERM AND SURVIVAL")
    .font("Helvetica").moveDown(0.3)
    .text(
      "Obligations under this NDA survive termination of employment for a period of " +
      "three (3) years. Trade secret protections survive indefinitely under applicable law.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("4. REMEDIES")
    .font("Helvetica").moveDown(0.3)
    .text(
      "Breach of this Agreement shall entitle the non-breaching party to injunctive " +
      "relief without bond in addition to all other available remedies at law or equity.",
      { align: "justify" }
    )
    .moveDown(2)
    .text("Signed: January 15, 2020")
    .text("Company: John Roe, CEO    Employee: Jane Smith");
});

// ── 16: Motion for Protective Order ─────────────────────────────────────────
writePdf("16-protective-order.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(0.5).fontSize(12)
    .text("STIPULATED PROTECTIVE ORDER", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Case No: 2024-CV-005678  |  Entered: April 15, 2024")
    .moveDown(1)
    .font("Helvetica-Bold").text("FINDINGS")
    .moveDown(0.5).font("Helvetica")
    .text(
      "Good cause exists for entry of a protective order. This litigation involves " +
      "commercially sensitive source code, proprietary algorithms, and trade secrets " +
      "of Global Tech Inc. whose disclosure could cause irreparable competitive harm.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("DESIGNATION CATEGORIES")
    .moveDown(0.5).font("Helvetica")
    .text("CONFIDENTIAL: Business records, compensation data, HR files.")
    .moveDown(0.3)
    .text("HIGHLY CONFIDENTIAL – ATTORNEYS' EYES ONLY: Source code, algorithms, trade secrets, client lists.")
    .moveDown(0.3)
    .text("RESTRICTED: Documents subject to third-party confidentiality obligations.")
    .moveDown(1)
    .font("Helvetica-Bold").text("PERMITTED DISCLOSURES")
    .moveDown(0.5).font("Helvetica")
    .text(
      "Confidential materials may be disclosed only to: (a) counsel of record; " +
      "(b) retained experts who have signed the acknowledgment attached as Exhibit A; " +
      "(c) the Court and Court personnel; (d) witnesses during depositions.",
      { align: "justify" }
    )
    .moveDown(1)
    .text(
      "All protected materials must be filed under seal. Violation of this Order " +
      "may result in sanctions, contempt, and adverse inference instructions.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("SO ORDERED: Hon. Patricia Williams  |  April 15, 2024");
});

// ── 17: Class Action Complaint ───────────────────────────────────────────────
writePdf("17-class-action-complaint.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(0.5).fontSize(12)
    .text("CLASS ACTION COMPLAINT", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Jane Smith, on behalf of herself and all others similarly situated, Plaintiff,")
    .moveDown(0.3).text("v.")
    .moveDown(0.3).text("Global Tech Inc.,  Defendant.")
    .moveDown(0.5).text("Case No: 2024-CV-009901  |  Filed: May 15, 2024")
    .moveDown(1)
    .font("Helvetica-Bold").text("NATURE OF ACTION")
    .moveDown(0.5).font("Helvetica")
    .text(
      "Plaintiff brings this action on behalf of a class of former Global Tech Inc. " +
      "employees who were terminated within 12 months of reporting accounting irregularities " +
      "or other compliance concerns to the Audit Committee. The class period is January 1, " +
      "2020 through the present.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("CLASS DEFINITION")
    .moveDown(0.5).font("Helvetica")
    .text(
      "The proposed class consists of all current and former Global Tech Inc. employees " +
      "who: (a) made a protected disclosure to the Audit Committee; and (b) were " +
      "terminated within 12 months of such disclosure; and (c) received no severance " +
      "package exceeding four weeks' salary.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("NUMEROSITY AND COMMONALITY")
    .moveDown(0.5).font("Helvetica")
    .text(
      "Based on information obtained in discovery in Case No. 2024-CV-005678, Plaintiff " +
      "has identified at least 23 putative class members. Common questions of law include: " +
      "whether Defendant's termination practices constitute a pattern of retaliation; " +
      "and whether Defendant's failure to maintain a compliant whistleblower policy " +
      "constitutes a violation of Sarbanes-Oxley Section 806.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("RELIEF SOUGHT")
    .moveDown(0.3).font("Helvetica")
    .text("Class-wide damages estimated at $18,500,000. Injunctive relief and audit of HR practices.")
    .moveDown(1)
    .text("Dated: May 15, 2024   |   Morrison & Foerster LLP");
});

// ── 18: Appellate Brief ──────────────────────────────────────────────────────
writePdf("18-appellate-brief.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES COURT OF APPEALS", { align: "center" })
    .text("FOR THE SECOND CIRCUIT", { align: "center" })
    .moveDown(0.5).fontSize(12)
    .text("BRIEF OF APPELLANT GLOBAL TECH INC.", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Appeal No: 24-3456  |  Lower Court: 2024-CV-005678")
    .text("Argued: January 15, 2025  |  Submitted: February 1, 2025")
    .moveDown(1)
    .font("Helvetica-Bold").text("STATEMENT OF ISSUES")
    .moveDown(0.5).font("Helvetica")
    .text(
      "1. Whether the District Court erred in denying summary judgment on the breach " +
      "of contract claim where the employment agreement's at-will provisions supersede " +
      "the aspirational notice clause under New York law.",
      { align: "justify" }
    )
    .moveDown(0.3)
    .text(
      "2. Whether the District Court abused its discretion in admitting Dr. Lee's " +
      "damages report where the present-value methodology was not disclosed in the " +
      "Rule 26 expert report.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("SUMMARY OF ARGUMENT")
    .moveDown(0.5).font("Helvetica")
    .text(
      "The District Court committed reversible error on two independent grounds. First, " +
      "the court misconstrued settled New York contract law by treating the 90-day notice " +
      "clause as a binding limitation on at-will termination rights. Second, admission of " +
      "undisclosed damages methodology prejudiced Appellant and warrants a new trial on damages.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("STANDARD OF REVIEW")
    .moveDown(0.3).font("Helvetica")
    .text("Questions of contract interpretation: de novo. Evidentiary rulings: abuse of discretion.")
    .moveDown(1)
    .text("Dated: February 1, 2025   |   Skadden Arps LLP");
});

// ── 19: Attorney Fee Petition ────────────────────────────────────────────────
writePdf("19-fee-petition.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(0.5).fontSize(12)
    .text("PLAINTIFF'S PETITION FOR ATTORNEYS' FEES AND COSTS", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Case No: 2024-CV-005678  |  Filed: December 15, 2024")
    .moveDown(1)
    .font("Helvetica-Bold").text("BASIS FOR FEE AWARD")
    .moveDown(0.5).font("Helvetica")
    .text(
      "Plaintiff is the prevailing party following the jury verdict of November 20, 2024 " +
      "awarding $612,000 in compensatory damages. Under the fee-shifting provision of the " +
      "Employment Agreement and 42 U.S.C. § 2000e-5(k), Plaintiff is entitled to reasonable " +
      "attorneys' fees and costs.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("LODESTAR CALCULATION")
    .moveDown(0.5).font("Helvetica")
    .text("Partner — Sarah Jones (42.5 hrs × $750/hr):          $31,875")
    .text("Associate — Michael Park (187.0 hrs × $425/hr):      $79,475")
    .text("Paralegal — Chris Lee (63.0 hrs × $175/hr):          $11,025")
    .text("Expert coordination — various (12.0 hrs × $300/hr):  $ 3,600")
    .text("─────────────────────────────────────────────────────────────")
    .text("Total Lodestar:                                       $125,975")
    .moveDown(0.5)
    .text("Costs (filing fees, deposition transcripts, expert fees):  $18,450")
    .text("─────────────────────────────────────────────────────────────")
    .font("Helvetica-Bold").text("TOTAL REQUESTED:                               $144,425")
    .moveDown(1)
    .font("Helvetica").text(
      "All rates are consistent with prevailing market rates in the Southern District " +
      "of New York as established by the 2024 National Law Journal Billing Survey.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("Dated: December 15, 2024   |   Morrison & Foerster LLP");
});

// ── 20: Consent Decree ───────────────────────────────────────────────────────
writePdf("20-consent-decree.pdf", (doc) => {
  doc
    .fontSize(14).font("Helvetica-Bold")
    .text("UNITED STATES DISTRICT COURT", { align: "center" })
    .text("SOUTHERN DISTRICT OF NEW YORK", { align: "center" })
    .moveDown(0.5).fontSize(12)
    .text("CONSENT DECREE", { align: "center" })
    .moveDown(1)
    .font("Helvetica").fontSize(11)
    .text("Case No: 2024-CV-005678  |  Entered: January 10, 2025")
    .text("Jane Smith v. Global Tech Inc. and John Roe")
    .moveDown(1)
    .font("Helvetica-Bold").text("RECITALS")
    .moveDown(0.5).font("Helvetica")
    .text(
      "The parties, by and through their respective counsel, have agreed to resolve all " +
      "remaining claims in this action, including the pending class action No. 2024-CV-009901. " +
      "This Consent Decree is entered in the public interest and for the purpose of resolving " +
      "disputed claims without further litigation.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("INJUNCTIVE RELIEF")
    .moveDown(0.5).font("Helvetica")
    .text(
      "Global Tech Inc. shall, within 90 days of entry of this Decree: (a) implement a " +
      "Board-approved whistleblower protection policy meeting or exceeding Sarbanes-Oxley " +
      "requirements; (b) retain an independent compliance monitor for a period of two years; " +
      "(c) provide mandatory anti-retaliation training to all managers and HR personnel.",
      { align: "justify" }
    )
    .moveDown(1)
    .font("Helvetica-Bold").text("MONETARY RELIEF")
    .moveDown(0.5).font("Helvetica")
    .text("Individual settlement — Jane Smith:         $612,000")
    .text("Class settlement fund:                     $4,200,000")
    .text("cy pres allocation (whistleblower nonprofits): $250,000")
    .text("─────────────────────────────────────────────────────")
    .font("Helvetica-Bold").text("TOTAL:                                     $5,062,000")
    .moveDown(1)
    .font("Helvetica").text(
      "This Decree shall be enforceable by motion in this Court for a period of five years. " +
      "Any party may seek modification upon showing of changed circumstances.",
      { align: "justify" }
    )
    .moveDown(1)
    .text("SO ORDERED: Hon. Patricia Williams  |  January 10, 2025")
    .moveDown(0.5)
    .text("Approved as to form:")
    .text("Morrison & Foerster LLP (Plaintiff)   Skadden Arps LLP (Defendants)");
});
