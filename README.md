# MediSync AI

The fictional Indian hospital training dataset is documented in [docs/seed/WORKFLOW-GUIDE.md](docs/seed/WORKFLOW-GUIDE.md). Local login credentials are in **docs/seed/ACCOUNTS.local.md** (git-ignored). [OPERATIONAL-RECORDS.md](docs/seed/OPERATIONAL-RECORDS.md) lists the database-backed appointments, prescriptions, inventory, beds, invoices and receipts; [RECORD-MAP.md](docs/seed/RECORD-MAP.md) maps patients and cases.

MediSync is an Angular frontend with an Express API, PostgreSQL workflow records, MongoDB observations/audit history, and an optional Python RAG service.

## Run locally

Install dependencies at the root, backend, and frontend with npm install. Configure backend/.env using the existing example/configuration; do not commit credentials. PostgreSQL and MongoDB must be available.

From the repository root:

    npm run dev

Frontend: http://localhost:4200
API: http://localhost:3000

The root launcher starts both services. The optional AI service is started separately with npm run start-rag and needs its own Python dependencies and model configuration.

## Existing database upgrades

    npm run migrate --prefix backend

The API also applies this additive migration on startup. It creates missing workflow tables, adds bed-to-case links, and preserves existing records. Previously occupied beds without an admission case receive a clearly marked imported case; the original admission date is unknown. Legacy Mongo consultation notes are imported idempotently when a patient and doctor can be resolved within one hospital. Unresolvable records remain in MongoDB; no patient/case relationship is guessed.

Do not run setup-db or seed to upgrade an existing database. Setup is an intentional destructive rebuild and refuses to run without RESET_DATABASE=true.

## Connected workflows

- Patient booking: choose provider, date, available time and visit type. Submission creates a Requested appointment and a case. The patient can track its status or cancel it.
- Reception/provider review: accept or reject requests, check in a confirmed patient on the scheduled date, and open the linked case. Providers start consultations from checked-in appointments.
- Consultation: save chief complaint, diagnosis, clinical notes and optional medication. Completion, notes, prescription and case timeline are committed together. Repeating the same completion does not duplicate a prescription.
- Laboratory: the provider specifies the test and specimen for a case; staff collect the sample, then record results. The results appear in the case and patient records.
- Inpatient care: allocate an available bed to a registered patient and active provider. Allocation creates an IPD case and nursing admission task. The bed details link to that admission. Discharge clears the bed assignment and sends it for cleaning; sanitation completion makes it available. Legacy reservations can be released before allocation.
- Pharmacy: enter received inventory batches and unit prices, select quantities against a pending prescription, then dispense. Stock reduction, batch records, an itemized invoice and prescription status are one transaction. Expired batches and insufficient stock are rejected.
- Billing: administrators can add explicit itemized case charges and record receipts. A payment changes the invoice balance, not the clinical case state. Patients can inspect their own invoices, charges and receipts.
- Dashboards: each role sees database-backed counts, relevant work and case activity. Patient views are restricted to their own records; hospital data is scoped on the API.

Patient identity (patient ID/UHID), encounter identity (case ID/case number), appointment ID, prescription ID, bed ID and invoice ID are distinct. Case details bring their related records together. Display names and queue tokens are not used as record identifiers.

## Validation

    npm run build --prefix frontend
    npm test --prefix frontend -- --watch=false
    npm run test:workflows --prefix backend

The backend suite creates a uniquely named disposable schema in the configured PostgreSQL database and removes only that schema afterward. It covers booking conflicts, approval permissions, hospital isolation, consultation idempotency, lab transitions, admission/discharge, stock overselling, dispensing invoices, receipts and dashboard endpoints. Mongo audit writing is stubbed in this SQL integration suite.

## Current boundaries

Booking currently uses half-hour slots from 09:00 to 17:00 in the API server's local timezone, with provider availability and booked-slot checks. Configurable hospital calendars, holidays and provider shifts are not implemented.

Online payments and external supplier ordering are not connected. Billing records receipts entered by hospital staff; reorder actions create internal requests only. No SMS/email delivery is implied by an appointment status change.

The optional AI/OCR features require their external services; the core hospital workflows do not depend on them. This update verifies the local application, not a production deployment or clinical decision-support validation.
