# תסקל 2.0 — features they sell that we don’t

**Updated:** 2026-08-27  
**Sources (public only, no product login):** [taskalgen2](https://sheeta.co.il/taskalgen2/), [taskal2](https://sheeta.co.il/taskal2/), [support](https://sheeta.co.il/support/)

Sheeta’s Taskal is the incumbent office CRM for Israeli certified inspectors. RemindOCR already covers OCR ingest, Gmail, Drive, and expiry email. This note lists what Taskal sells that we do not — ranked by how much it would help an inspector leave them.

Do not copy the whole CRM. Their pitch is office automation (calendar, billing, WhatsApp, sub-inspectors). Our edge is ingesting existing PDFs with OCR/AI and Gmail. Keep that, then close the office-workflow gaps inspectors feel every day.

---

## What they sell that we don’t — build these first

| # | Feature | What Taskal does | Why add it |
|---|---------|------------------|------------|
| 1 | **WhatsApp + SMS** | Sends from the system, not only email | Clients ignore email. Inspectors already live in WhatsApp. |
| 2 | **Google Calendar + scheduling** | Syncs the work diary; auto-places upcoming inspections | Our calendar is expiry pills, not a day planner. |
| 3 | **Invoice from the inspection** | Each report gets a matching invoice; collection is automatic | We import supplier invoices. They bill the client for the job. |
| 4 | **Send to all stakeholders** | One click to client, service company, and work supervisor | We email the client. Offices need CC lists per report. |
| 5 | **Field app: renew in seconds** | Native mobile, 12 templates, renew even with many defects | `שטח` is a light checklist. The job is on-site, on the phone. |
| 6 | **Sub-inspectors / office team** | Extra certified inspectors, calendar colors, numbering, commissions | Business plan allows users, but not a real office roster. |
| 7 | **Statutory template pack** | 12 Ministry-of-Labor types: elevators, pressure vessels, tower cranes, lifting machines | We have a print editor. They ship the legal forms. |
| 8 | **Defects table + Excel export** | Categorized defects; combined defects report to Excel | Clients and safety officers want one defects workbook, not 40 PDFs. |

**Suggested sequence:** WhatsApp/SMS on existing reminders → multi-recipient send of the PDF → calendar + renew/clone → bill the client from the inspection → field app depth → statutory templates and defects Excel.

---

## Next (medium)

| Feature | What Taskal does | Why add it |
|---------|------------------|------------|
| Kaspi / Invoice4U | Accounting sync; invoice closes when paid | Debt status today is manual on imported invoices. |
| Auto debt chase | Alert on open debt; mark paid when the sum due hits zero | Their money pitch: nothing falls between the chairs. |
| Price lists per customer | Rates by facility group; line-item template on the invoice | Needed once we bill from inspections. |
| Facility groups + contacts | Per client: lifting vs elevators, each with its own contact | Big clients have different people per equipment type. |
| Custom report builder | Users invent their own reports, not only monthly packs | We have monthly DOCX/XLSX. They sell a report generator. |
| Bulk duplicate / renew | Clone many inspections; unfreeze batches; 15-second renew | Annual renewals are most of the office load. |
| Combined PDF pack | Download many reports as one file, with sort order | Service companies ask for one packet per site visit. |
| Extra recipients + filename rules | CC list per inspection; custom PDF filename pattern | Small, but every office has a naming convention. |

## Later (only if customers ask)

- Elevator / site cards (dedicated client-facility screens)
- Postal vouchers, partner office costs, VAT in/out reports

---

## Already in RemindOCR

| Capability | RemindOCR today | Taskal overlap |
|------------|-----------------|----------------|
| OCR + AI ingest | Upload PDF/image, extract client, dates, equipment, reminders | Not their pitch — this is our wedge |
| Gmail import | Pull inspection PDFs and invoices from mail | They send mail out; we also ingest mail in |
| Expiry email reminders | 90/60/30-day emails, grouped per client, templates | They add WhatsApp/SMS on top |
| Clients + equipment | CRUD, merge, Excel import, inspection history | Theirs is deeper (groups, price lists, last inspector) |
| Print templates | Layout + Excel editors, draft, PDF, signature | They ship 12 statutory forms ready-made |
| Drive backup | RemindOCR folder, invoices vs inspections | They emphasize Google Calendar, not Drive |
| Monthly reports | DOCX/XLSX, schedule, send | They also advertise daily/weekly + a builder |
| Web app + PWA | Hebrew RTL product, installable | They sell a dedicated field app |
| Engineer profile | Inspector number, sequence, branding, signature | They add multi-inspector numbering and calendar colors |

---

## How Taskal is packaged

**Office CRM.** Inspections, invoices, calendar, sub-inspectors, and collection in one place. Modular: pay only for modules used. Help sections: ניהול תסקירים, כספים, לקוחות, מכונות הרמה, יומן דיגיטלי, תסקירי שטח.

**Field + legal.** Mobile app that renews a report in ~15 seconds. Templates claimed to match Ministry of Labor rules. Privacy Amendment 13 called out on the site. Types named: מכונות הרמה, אביזרים, מעליות, מיכלי לחץ, עגורני צריח.
