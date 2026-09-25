"""Build the marketing presentation. Requires reportlab; no network or private data."""
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/pdf/remindocr-marketing-features.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)
W, H = 960, 540
INK, GREEN, MUTED = "#12352C", "#18865D", "#53675F"
slides = [
    ("Know what expires next.\nHave time to act.", "Document tracking and email reminders for everyday business.", [
        ("Bring the paperwork together", "Contracts, certificates, permits and the dates that need your attention."),
        ("Turn dates into follow-up", "Review important details, schedule reminders and see what is coming next."),
    ]),
    ("One workflow, from document to renewal", "Less time searching for dates. More time to prepare.", [
        ("01  Collect", "Upload a document or import eligible attachments from a connected Gmail account."),
        ("02  Review", "OCR and AI help extract details. Check the client, document information and dates."),
        ("03  Track", "Keep records linked and see upcoming expiry dates in your dashboard."),
        ("04  Follow up", "Configure email reminders, review delivery state and export reports."),
    ]),
    ("Capture documents and useful details", "Intake and extraction features", [
        ("Browser uploads and Gmail", "Bring in supported documents and email attachments; upload and Gmail imports share the plan allowance."),
        ("Text, scans and images", "PDF parsing and OCR, with Hebrew and English support. The pipeline also includes Word, Excel and text parsers."),
        ("Assisted extraction", "Extract business details and dates, then review and correct values before relying on them."),
        ("Visible processing", "Background jobs, processing status, retries and duplicate detection help manage imports."),
    ]),
    ("Keep documents connected to the work", "Document and contract management", [
        ("Find the source", "Search and filter documents, access original files and open related business records."),
        ("Maintain contract records", "Create, edit and clone records; associate clients and source documents with the relevant dates."),
        ("Store and export", "Configured object storage keeps source files available; eligible accounts can export to Google Drive."),
        ("Track what needs attention", "Review expiry dates, upcoming renewals and duplicate report numbers in the relevant workflows."),
    ]),
    ("Give every important date a next step", "Reminders and notifications", [
        ("Advance email reminders", "Configure reminders around important dates and send client reminders using reusable email templates."),
        ("Delivery visibility", "Review reminder records and delivery state to support follow-up."),
        ("Upcoming-date view", "Use dashboard summaries and the expiry calendar to plan the next period."),
        ("Connected notifications", "In-app read/unread notifications; configured browser push and Business Google Calendar integration."),
    ]),
    ("See the business context", "Clients, dashboard and account tools", [
        ("Client records", "Maintain contact information and relationships to documents and contracts."),
        ("Operational dashboard", "See document and client summaries, pending work, recent activity and upcoming expiries."),
        ("Search and preferences", "Search business records, filter lists and manage profile, business and notification settings."),
        ("Account access", "Google and email sign-in, email verification and account-recovery flows."),
    ]),
    ("Make recurring work easier to repeat", "Tasks, templates and business identity", [
        ("Follow-up tasks", "Create, list and update tasks alongside the document workflow."),
        ("Document templates", "Maintain reusable document templates, with AI-assisted generation from text."),
        ("Email templates", "Edit reusable messages, preview variables and reminder emails, and use test-email workflows."),
        ("Your business materials", "Upload a business logo and template assets; import structured reminder tables through the supported workflow."),
    ]),
    ("Turn records into useful reports", "Reporting and invoice features", [
        ("Export and share", "Excel exports and monthly report download/email workflows on eligible plans."),
        ("Contract reporting", "Monthly contract PDF reports and linked source records for follow-up."),
        ("Invoice and receipt records", "Review and edit extracted fields, organize vendor categories and merge vendors."),
        ("Expense visibility", "Monthly expense analysis and six-month report emails. Business adds extended Gmail invoice-history import."),
    ]),
    ("Specialist tools when your work needs them", "Inspection and equipment workflows", [
        ("Equipment register", "Manage categories, inspection history and linked reports. Equipment category is separate from a machine's name."),
        ("Manual inspections and PDFs", "Create inspection records and generate report PDFs using configurable print templates."),
        ("Spreadsheet intake", "Import equipment lists with a preview and confirmation step; review duplicate report numbers."),
        ("Field work", "Business includes equipment photos and checklists. Digital supports manual workflows without imports or AI."),
    ]),
    ("Connect the services you already use", "Availability depends on the plan and configured accounts.", [
        ("Gmail", "Connect email accounts, search eligible history and process imports in the background."),
        ("Google Drive", "Export documents through the connected account on eligible plans."),
        ("Google Calendar", "Synchronize relevant dates on Business with a connected Google account."),
        ("Email and optional channels", "Email reminders use the configured provider. Browser push and WhatsApp require separate configuration and availability checks."),
    ]),
    ("Choose the workflow that fits", "English-market list prices for new subscriptions", "plans"),
    ("Know the limits before you start", "Plan details that matter", [
        ("Trial: try the document workflow", "30 days, no credit card, 20 imports total; 2 users and 2 connected email accounts. Calendar and field work are excluded."),
        ("Basic: regular document intake", "50 imports per month, OCR/AI, storage/Drive, reminders and reports; 2 users and 2 email accounts."),
        ("Business: broader coverage", "Unlimited catalog imports/users/email accounts; Calendar and field work; 24-month inspection and 36-month invoice Gmail history."),
        ("Digital: manual inspection work", "2 users, manual records, generated PDFs, reminders and reports. No imports, connected email accounts, AI or file-storage entitlement."),
    ]),
    ("Behind the customer workflow", "Administrator and optional capabilities", [
        ("Account administration", "User and plan controls, feature configuration and operational settings."),
        ("Processing operations", "Background-job controls and diagnostics for imports, storage and delivery."),
        ("Outreach tools", "SEED lead management, campaigns and unsubscribe scanning are administrator tools, separate from the core customer offer."),
        ("Configured modules", "WhatsApp queue/provider integration and optional services require setup; confirm availability before including them in a proposal."),
    ]),
    ("Show the value in five minutes", "A practical demonstration using sample business data", [
        ("Start with a real use case", "Upload a sample service agreement or certificate and review the extracted customer and expiry date."),
        ("Make the next step visible", "Open the linked record, set a reminder schedule and show the upcoming-expiry dashboard."),
        ("Close the loop", "Preview the reminder email and export a report. Add Drive or Business Calendar if connected."),
        ("Start a trial", "Visit remindocr.com/en for the document-tracking workflow and current plan information."),
    ]),
    ("Feature coverage and product notes", "Product snapshot: 25 September 2026", [
        ("Core coverage", "Documents, OCR/AI, contracts, dates, clients, reminders, notifications, dashboards, search, reports and account tools."),
        ("Extended coverage", "Invoices/expenses, equipment/inspections, print templates, field work, Google integrations and administrator operations."),
        ("Availability and accuracy", "Plans, feature flags and connected services govern access. Review extracted values. No guaranteed extraction accuracy, regulatory certification or native e-signature claim is made."),
        ("Source of truth", "Repository inventory: docs/marketing/features.md. Pricing catalog v2026-09-23; runtime tier gates, feature definitions and route implementations reviewed for this edition."),
    ]),
]

c = canvas.Canvas(str(OUT), pagesize=(W, H))
c.setTitle("RemindOCR | Marketing feature presentation")
c.setAuthor("RemindOCR")

def paragraph(text, x, top, width, size=17, color=INK, bold=False):
    style = ParagraphStyle("copy", fontName="Helvetica-Bold" if bold else "Helvetica",
                           fontSize=size, leading=size * 1.35, textColor=HexColor(color))
    p = Paragraph(escape(text).replace("\n", "<br/>"), style)
    _, height = p.wrap(width, H)
    if top - height < 48:
        raise ValueError(f"Text overflows: {text}")
    p.drawOn(c, x, top - height)
    return height

for n, (title, subtitle, items) in enumerate(slides, 1):
    c.setFillColor(HexColor("#F8FBF8")); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(HexColor(GREEN)); c.rect(0, H-8, W, 8, fill=1, stroke=0)
    paragraph("RemindOCR", 48, 501, 300, 16, GREEN, True)
    title_height = paragraph(title, 48, 452, 864, 35 if n == 1 else 29, INK, True)
    subtitle_top = 452 - title_height - 13
    paragraph(subtitle, 48, subtitle_top, 864, 17, MUTED)
    if items == "plans":
        xs = [48, 268, 488, 708]
        for x, name, price, summary in zip(xs, ["Trial", "Digital", "Basic", "Business"],
                ["$0", "$45", "$75", "$119"],
                ["30 days\n20 imports total", "Per month\nManual workflows", "Per month\n50 imports / month", "Per month\nUnlimited imports"]):
            paragraph(name, x, 325, 198, 22, GREEN, True)
            paragraph(price, x, 278, 198, 39, INK, True)
            paragraph(summary, x, 212, 198, 17, MUTED)
        paragraph("Prices and subscription terms are confirmed before payment. Existing subscriptions follow agreed terms. Upload and Gmail imports share the quota.", 48, 118, 864, 14, MUTED)
    elif n == 1:
        for i, (heading, body) in enumerate(items):
            x = 48 + i * 450
            paragraph(heading, x, 240, 405, 21, GREEN, True)
            paragraph(body, x, 199, 405, 19)
        paragraph("remindocr.com/en", 48, 86, 500, 17, GREEN, True)
    else:
        for i, (heading, body) in enumerate(items):
            x = 48 + (i % 2) * 450
            y = 326 - (i // 2) * 137
            paragraph(heading, x, y, 402, 19, GREEN, True)
            paragraph(body, x, y - 35, 402, 16)
    c.setStrokeColor(HexColor("#D8E5DC")); c.line(48, 39, 912, 39)
    c.setFillColor(HexColor(MUTED)); c.setFont("Helvetica", 10)
    c.drawString(48, 23, "RemindOCR  |  Product overview  |  September 2026")
    c.drawRightString(912, 23, f"{n:02d} / {len(slides):02d}")
    c.showPage()
c.save()
print(OUT)
