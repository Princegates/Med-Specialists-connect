# Protecting health information: HIPAA readiness

Date: 18 November 2026. This is a working checklist, not legal advice and not a certificate. Have a lawyer who knows
Ghanaian and (if you serve US clients) US health-privacy law review it before you rely on it.

## The honest starting point
- **HIPAA is a US law.** It binds US "covered entities" (providers, health plans, clearinghouses) and the companies
  that handle their patients' data for them ("business associates"). A Ghanaian business serving patients in Ghana is
  governed by the **Data Protection Act, 2012 (Act 843)**, with the Data Protection Commission as regulator. HIPAA
  becomes a legal duty if you handle protected health information (PHI) for a US covered entity or for US patients on
  their behalf, and a US partner may ask for it in a contract.
- **No software can make a business "HIPAA compliant".** Compliance is mostly what the organisation does: written
  policies, a risk analysis, training, agreements with vendors, and a procedure for when something goes wrong. The
  platform can supply the technical safeguards and the evidence.
- **What we do here:** build the platform to the HIPAA Security Rule's technical standards as a benchmark (which also
  satisfies the spirit of Act 843), and list what is left for the organisation to do.

## Technical safeguards (Security Rule, 45 CFR 164.312) and the platform
| Requirement | Status | Notes |
| --- | --- | --- |
| Unique user identification (164.312(a)(2)(i)) | Done | Every staff member has their own account. No shared logins. |
| Automatic log-off (164.312(a)(2)(iii)) | **Done, new** | Staff are signed out after 20 minutes of no use (Settings, Security: 5 to 120). Enforced by the server as well as the page. |
| Access control by role / minimum necessary (164.312(a)(1), 164.502(b)) | Partly | Roles control who may see health details, enforced on the server. Still open: limit a coordinator to their own and unassigned cases. |
| Emergency access procedure (164.312(a)(2)(ii)) | Open | Write a procedure (who can reach records if the owner is unavailable). The superadmin and owner roles can; document it and the break-glass steps. |
| Encryption at rest (164.312(a)(2)(iv)) | Partly | The database is encrypted at rest by Cloudflare. Secrets are additionally encrypted by the application. Free-text health notes are not individually encrypted yet. |
| Audit controls (164.312(b)) | **Strengthened** | Every change is logged in a tamper-evident chain. **New:** every time a staff member opens a case or client record, who and when is logged (once per ten minutes per record). |
| Integrity (164.312(c)) | Done | The audit chain detects edits and missing entries; payments are verified, never trusted from the browser. |
| Person or entity authentication (164.312(d)) | Done | Password plus authenticator app (required for powerful roles, can be required for everyone), lock-out, one-use codes. |
| Transmission security (164.312(e)) | Done | HTTPS everywhere with HSTS; strict content policy; no third-party scripts. |

## Privacy Rule features (164.500 to 164.534) and the platform
| Requirement | Status |
| --- | --- |
| **Minimum necessary** in email | **Done, new.** Team emails give only the case reference, service, visit type and urgency. A setting (Settings, Email) lets the owner put patient details back in, off by default. |
| Notice of privacy practices | Privacy notice updated on 18 Nov 2026 to describe the real safeguards, payment and email services, and breach handling. Needs legal review. |
| Consent recorded | Done: consent and its version are stored with each request. |
| Patient access to records (164.524) | Partly: staff can produce a data copy for a client. Write who answers, and within what time. |
| Amendment (164.526) | Partly: staff can edit a client. Add a rule for recording a patient's disagreement. |
| Accounting of disclosures (164.528) | Open: when you share a case with a provider, the log records it; add a patient-facing report. |
| Deletion / anonymisation | Done: a client can be anonymised and the action is logged. |
| Retention | Open: decide how long closed cases and notes are kept, then automate the clean-up. |

## Third parties that touch patient information (business associate agreements)
Under HIPAA, a vendor that handles PHI for you needs a signed agreement (a BAA). Act 843 likewise expects a written
contract with any processor. Check each of these with the vendor before real patient data flows:
| Service | What it sees | What to do |
| --- | --- | --- |
| **Cloudflare** (hosting, database) | All stored data | Ask Cloudflare whether a BAA or data-processing agreement is available on your plan. It is commonly limited to enterprise plans. |
| **Email provider** (Resend, Brevo or SendGrid) | Invoices and receipts (name, email, service) | Sign the provider's data-processing terms. Keep health notes out of emails (done by default). |
| **Gmail** (`medspecialistsconnect@gmail.com`, receiving `info@`) | Anything people write to you | A free Gmail account has no BAA. Move to Google Workspace (which offers a BAA) for a mailbox that may hold health information. Tell staff not to forward patient details by email. |
| **Web3Forms** | Call-back, referral, contact forms (and requests when your own system cannot email the team) | No agreement. Move the remaining forms to your own backend and stop using this service for health-related text. |
| **Paystack** | Payment details only | Never send health details in payment metadata. Keep it that way. |
| **WhatsApp / SMS** | Whatever staff and patients type | Do not send diagnoses or results by consumer WhatsApp. Use the business account with a written staff rule. |

## What the organisation must do (the platform cannot do this for you)
1. Name a **privacy and security officer** and register with the Data Protection Commission.
2. Do a written **risk analysis** (what data, where it lives, what could go wrong) and review it every year or after big changes.
3. Write short **policies**: access and sign-off for new staff, leavers (remove access the same day), device use, sending information, retention, patient requests, sanctions for misuse.
4. **Train every staff member** at hiring and yearly; keep a signed record.
5. Sign **agreements with every vendor** above and with every provider you share cases with.
6. A **breach procedure**: who is told, how fast, how patients are told. HIPAA requires notice without unreasonable delay and no later than 60 days; Act 843 expects notice to the Commission and the person as soon as reasonably practicable. Treat 72 hours as your internal target.
7. A **contingency plan**: weekly database export to storage you control, a practised restore, and who does what in an outage.
8. Keep the staff list current: deactivate leavers and review roles every quarter.

## Next code work worth doing (in order)
1. Move the call-back, referral and contact forms to your own backend, and stop sending anything to Web3Forms.
2. Encrypt the free-text health note and case notes individually in the database.
3. Limit coordinators to their own and unassigned cases, with a logged supervisor override.
4. Retention clean-up (scheduled), and a report of who viewed a record, for patient requests.
5. A "sign-in alert" email on a new device, and a list of signed-in devices.
6. Daily audit-chain fingerprint emailed to the owner, to detect anyone rebuilding the log.

## Changed on 18 November 2026
- Idle auto log-off (default 20 minutes) enforced by the server and the console.
- Access log: opening a case or client is recorded.
- Team emails carry no patient details unless the owner switches it on.
- Privacy notice rewritten to describe the real safeguards.
- 296 automated backend checks, including each of the above.
