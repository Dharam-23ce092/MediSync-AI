# Zydus training dataset

These are realistic, fictional Indian identities and synthetic clinical records, not real patient data. The requested @zydus.com addresses are local login identifiers only. No email is sent and no real hospital affiliation is claimed.

## Accounts and configuration

Open **ACCOUNTS.local.md** in this folder for every staff/patient login and its unique generated password. It is intentionally git-ignored. Authentication uses database records and bcrypt verification only. Old aliases, shared master passwords and quick-login buttons have been removed. Sign out of old sessions.

Hospital: ZYD-AHD, Zydus Ahmedabad — Training Hospital, Ahmedabad, Gujarat. Eight departments; 13 staff accounts; 16 patients; four doctors; 16 beds; 12 inventory batches. RECORD-MAP.md lists IDs, encounter scenarios and inventory. manifest.json records the actual seed date and dataset version.

Booking currently uses 09:00–17:00 half-hour slots in the server timezone. Run the backend in Asia/Kolkata for this dataset. Online payment and external supplier integrations remain disconnected. Prices and clinical examples are illustrative, not hospital tariffs or treatment guidance.

## Test the connected workflows

| Exercise | Account(s) | Expected result |
| --- | --- | --- |
| New booking | Rahul Patel, then Kavita Shah / Tirth Desai / Dr. Devam Patel | Request an available future slot, approve it, and see the same case reference and Confirmed status in the patient's portal. |
| Start today's consultation | Dr. Rohan Mehta | Arjun Desai and Vivek Mehta are checked in. Open their history, start consultation, order a lab test and finish the note with a prescription. |
| Check-in | Dr. Nidhi Rao or reception | Pooja Shah is Confirmed today. Check in before starting consultation. Kavya Joshi already has an open consultation. |
| Pharmacy | Dharmit Fadadu or Amit Verma | Harsh Patel has a pending prescription. Select a matching unexpired batch, verify quantity and dispense. Stock falls and an itemized invoice appears in the case. |
| Laboratory | Priya Iyer or Sunita Rao | Collect a Received order, enter results for a Collected order, and verify the patient/case result. |
| Nursing | Anita Parmar / Pooja Nair / Bhavika Trivedi | Review tasks, linked admission cases and previous observations; enter actual measurements for a new observation. |
| Admission and discharge | Kavita Shah | Allocate an available bed to an outpatient and select a doctor. Check the new IPD case/task. Discharge, then mark cleaning complete. |
| Billing | Kavita Shah, then the relevant patient | Inspect PAID/PARTIAL/PENDING examples. Record a receipt and check balance and patient-visible receipts. Clinical case state must not change. |
| Stock exceptions | Pharmacy | Atorvastatin is low with an internal reorder request; ORS is out of stock. One Paracetamol batch is expired; a Cetirizine batch expires soon. Expired stock must not dispense. |
| Authentication/privacy | Any patient / doctor | Wrong and old master passwords fail. Patients cannot approve appointments or view another patient's case. Doctors cannot modify another doctor's appointment. |

Each patient has two previous completed encounters. Four patients have active admissions and three observation records each. There is a discharged case, cancelled and declined visits, current work, and tomorrow's bookings. Today/tomorrow refer to the seed date; on a later day use a future booking or explicitly reseed to refresh the scenarios.

## Repeat the reset

Stop the API before resetting to avoid concurrent writes and legacy imports:

    npm.cmd run seed --prefix backend -- --reset
    npm run export:retrieval --prefix backend
    npm run dev

This replaces application data in the configured PostgreSQL database and the six known application Mongo collections. It is refused in production and requires the explicit --reset argument. It generates new passwords and overwrites the local account document. PostgreSQL replacement is transactional; MongoDB is a separate store, so a failure between stores requires rerunning the reset before restarting the API.

## Verification

    npm.cmd run test:seed --prefix backend
    npm.cmd run test:workflows --prefix backend

The seed verification logs into every account, rejects the old password shortcuts, checks seven role dashboards, patient isolation, clinical histories, bed links and accounting/stock consistency. It does not change clinical records; successful logins create audit events. Staff CSV imports now require an explicit password column with at least 10 characters per row; fill the blank sample values before import.

## Preparation for role-aware chat

retrieval.local.jsonl is generated from current database records, not a second frontend fixture. It contains patient profiles, completed clinical notes and completed lab results. Every document has dataset ID, hospital ID, patient ID, patient user ID, source ID, case/provider IDs when applicable, timestamps and sensitivity metadata. No password, hash or token is exported. Regenerate after record changes; invalidate all old embeddings after a reset.

Live authenticated tools should answer schedules, appointment state, stock, tasks, bed occupancy and invoice balances. Historical notes/reports may be embedded for narrative retrieval with source citations. A prompt alone must never grant access:

- Derive user, role and hospital from server authentication.
- Apply hospital and patient/case authorization **before** vector search.
- Patients: their own records. Doctors: authorized patient histories and their own schedules. Nurses: care records/tasks within their authorized assignments. Lab and pharmacy: the records needed for their work. Admin: authorized hospital operations.
- Treat eligible_roles in the export as a proposed policy label, not permission enforcement. Validate policy when implementing chat.
- Never embed ACCOUNTS.local.md, authentication tables, tokens or unrestricted audit logs.
- Cite source record IDs and dates, distinguish synthetic historical data from current state, and do not let retrieved text override tool permissions.

This task prepares records and export metadata. It does not create embeddings or implement the chat system.
