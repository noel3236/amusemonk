---
name: product
description: amusemonk features by screen, what each changed for users and admins, and the known product limits
metadata:
  type: project
---

# amusemonk: product

Users are merchants on the payment platform who need to pay many bank accounts at once (INR, Indian IFSC). Before
amusemonk they had no portal of their own; amusemonk turns a spreadsheet into individually tracked, idempotent payouts
and is also where they manage their payout API key and 2FA. Screens and routes: CONTEXT.md §8.

## Features (as built by 2026-10-30)

### Sign-in (`/login`)
Email + password, then a 6-digit OTP step if the gateway account has 2FA. Same credentials as the gateway; no
separate amusemonk account. Inactive gateway accounts are refused with a clear message.

### Overview (`/dashboard`)
- First visit with no key: two-step onboarding (Step 1 "Connect a gateway API key", generated right there with an
  authenticator code; Step 2 "Upload a payout file"); if 2FA is off it first asks the user to turn it on.
- With a key: tiles **Available balance** (last stored snapshot with its "as of" time, the key id, Manage → Profile),
  **Waiting for you**, **In progress**, **Paid today**; files needing confirmation; recent files. Auto-refreshes every
  20 s while payouts are in flight. The balance shown is the snapshot the worker/ingest last stored, not a live call.

### Files (`/files`)
- **Upload File** opens one modal: choose file → either a **problems table** (rejected: every error at once, row,
  column, rule, message) or a **review** (balance, look-alike warning, first 100 rows) → **Confirm Payment** /
  **Cancel File**. Closing the modal leaves the file waiting for confirmation.
- Two views: **Files** (filters: name, status, dates, amount, row count, only files with failed payouts) and
  **Rejected uploads** (each with an `errors.csv` report).
- A sample CSV is downloadable (`/files/sample.csv`, dated today IST).
- What it changed: a bad file is refused whole with a fixable error list instead of half-paying; nothing reaches the
  gateway until the user confirms; an accidental re-upload of the same batch under new references is flagged.

### File detail (`/files/[id]`)
- One header row: file meta, **Download** menu (status CSV with UTR, gateway payout id, codes, attempts, last update in
  IST; the original uploaded bytes), Cancel and Confirm while waiting.
- Payout rows with filters and tiles; per payout **Fetch status** (asks the gateway now) and **Raw** (the gateway's
  latest status JSON and every initiate request/response). Live refresh every 3 s while paying.

### Payouts (`/payouts`)
Every payout across files: search by reference, account, beneficiary, UTR, gateway id, IFSC or failure reason;
status chips (In progress / Paid / Failed / Cancelled) with counts; gateway status, file and date filters (Updated,
Uploaded, Settled); amount range; Raw; 50 per page.

### Profile (`/profile`)
- Payout API key: **Generate and Connect Key** with a 2FA code (payouts-only scope, any IP, stored encrypted; nobody,
  admins included, can read the secret); Revoke.
- Every key on the gateway account, labelled **In use** / **Made by amusemonk**; Delete stray keys with a 2FA code
  (warns when amusemonk didn't make it).
- Turn 2FA on (QR + setup key) or off; change the gateway password; gateway account details.

### Admin (`/admin`, super_admin only; others get 404)
- **Files**: every user's files, status filter, read-only detail, **Reject** with a reason before confirmation.
- **Users**: amusemonk users, their API key, Revoke (local disconnect only, D-24), per-user **Limits**.
- **Rules**: always-on (locked), configurable (on/off + settings) and custom rules (column must/must-not match a regex;
  allow-only/block list); every change audited.

### Everywhere
- Time-zone picker in the header (India, UTC, Singapore, Dubai; default IST); hover any time for UTC + relative.
- Copy button on every amount, name, file name, reference, UTR and id.
- Tables: sticky header, pin columns left, drag/arrow-key column reorder, remembered per table in the browser; totals
  row for money lists. Filters live in the URL.
- Light (Sandstone) and dark (Night) themes. Desktop-first.

### Landing page (`amusemonk.com`)
Static marketing page: "Upload a payout file. We pay every row once." Four-step how-it-works, a "built so a payout
can't go out twice" section, and **Try the demo** (a client-side simulation in USD; it never talks to an environment).
No login, no country mentioned.

## Upload rules users meet (defaults from migrations 0002/0010)
Exact column set (`client_reference_id, bank_account, ifsc_code, inr_amount, transaction_date, beneficiary_name`);
valid formats (reference `^[A-Za-z0-9_-]{8,64}$`, 9–18 digit account, IFSC `^[A-Z]{4}0[A-Z0-9]{6}$`, positive amount
≤2 decimals, real date, name); reference used once forever per user; same account+IFSC+amount+date paid once.
Configurable: file ≤5 MB (hard cap 20 MB), ≤5,000 rows, new file name, new bytes, new rows, look-alike warning (30 days),
₹1.00–₹2,00,000 per payout, file total ≤₹1,00,00,000, enough balance (balance − in-flight), date not future and ≤7 days
old (IST), ≤10 payouts per account per file.

## Known limits
- **Insufficient balance at send time burns the reference** (D-18): the payout fails and needs a new file with new
  ids. The upload and Confirm balance checks make this rare.
- **Two identical payments (account, IFSC, amount, date) can't be paid** even under different references (D-3).
- Status arrives by polling (30 s, backing off to 10 min per row); no webhooks (D-31). Succeeded payouts are re-polled
  daily for 3 days in case they turn into refunds.
- One active key per user; admin Revoke doesn't disable the key at the gateway (D-24).
- Sub-users of one gateway merchant can't both use amusemonk (D-41).
- INR only; XLSX reads the first sheet only; any extra or missing column rejects the file; an empty row in the middle
  rejects; error lists are capped at 500 per upload.
- Cancel/reject only before confirmation; after that nothing can stop a payout in-app (admin cancel of PENDING rows
  was proposed, not built: CONTEXT §11 Q3).
- Only one upload per user is checked at a time (BUSY after 30 s).
- Prods (`fintech`, `galaxy`) never launched; sandbox ran 2026-10-29..2026-11-12; nothing runs now (D-48).

Related: [[how-it-works]], [[open-work]], [[feedback-ui-density]].
