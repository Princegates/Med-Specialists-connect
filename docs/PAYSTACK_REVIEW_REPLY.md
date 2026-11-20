# Reply to Paystack's business review (draft)

Fill in the one item still in [square brackets] before sending (your name and phone). Everything else describes what the platform does today.

---

Subject: Re: Your Paystack request: privacy and payment processes (MEDs Specialists Connect)

Hello Paystack team,

Thank you for reviewing our account. Here are our answers. Our website is https://www.medspecialistconnect.com and our privacy notice is at https://www.medspecialistconnect.com/privacy (disclaimer: https://www.medspecialistconnect.com/disclaimer).

About us: MEDs Specialists Connect is a healthcare concierge in Accra, Ghana. We do not treat patients ourselves. We help people reach the right specialist, home-care service, laboratory or hospital, and we bill a service fee for that.

**1. What sensitive health information do we collect, and why?**
Through our website request form we collect: the person's name and phone number, an optional email address, the service they want (for example a home doctor visit or a laboratory package), who it is for, how urgent it is, their area, the best time to call, and an optional free-text note. That note and the service chosen can reveal a health condition, so we treat all of it as sensitive. Through WhatsApp and phone we receive only what the person chooses to tell us; we ask people not to send full medical records.
We use this only to call the person back, arrange the care they asked for, and invoice them. We do not use it for advertising and we do not sell it. The person agrees to this on the form, and we record that agreement and the version of the notice.

**2. What security measures do we use?**
- In transit: the whole site is served over HTTPS with HSTS and a strict content-security policy; it loads no third-party scripts.
- At rest: data is held in a Cloudflare D1 database, which Cloudflare encrypts at rest. Our own secrets (such as payment keys) are additionally encrypted by the application.
- Access: staff have individual accounts with a password plus a second step (an authenticator app or a phone passkey), roles that limit who can see health details, automatic sign-out after 20 minutes idle, and sign-in lock-out after repeated wrong passwords.
- Accountability: every change, and every time a staff member opens a patient record, is written to a tamper-evident audit log.
- Minimal exposure: our internal emails about a new request contain only the case number and the service, not the person's name, phone or health note. Invoice and tracking links cannot be guessed, show no health details, and are not stored on shared devices.
- Payments are verified on our server and never trusted from the browser (see 4).
We also keep a written security and privacy checklist and are working through the remaining items: completing our registration with the Data Protection Commission, signing data-processing agreements with our vendors, and a written breach procedure.

**3. Are we subject to HIPAA or GDPR?**
We operate in Ghana and are governed by the Data Protection Act, 2012 (Act 843). HIPAA applies to US covered entities and their business associates; we are neither. We use the HIPAA Security Rule as an internal benchmark for our technical safeguards. GDPR does not apply directly, as we serve patients in Ghana. To meet Act 843 we: publish a privacy notice; record consent; collect only what we need; limit access by role; can export, correct or anonymise a person's data on request; keep an audit log; and our registration with the Data Protection Commission as a data controller is in progress. Our contact for data protection is info@medspecialistconnect.com.

**4. Our payment flow**
1. The customer sends a care request on our website. For services with a fixed fee, or once our team confirms a price, we issue an invoice. Prices are shown only on the invoice.
2. The customer opens their private invoice link (a long random address) and presses "Pay now".
3. Our server creates a Paystack transaction for the exact invoice amount in GHS and sends the customer to Paystack's hosted payment page. They can pay by Mobile Money, card or bank transfer, as enabled on our Paystack account.
4. Card and Mobile Money details are entered only on Paystack. We never see or store them.
5. What we send to Paystack: the customer's email (or a placeholder address if they gave none), the amount, the currency, and our invoice number. We send no health information.
6. When payment completes, Paystack sends us a signed webhook (HMAC-SHA512) and we also verify the transaction directly with Paystack. We only mark the invoice paid if the amount and currency match the invoice. A repeated webhook changes nothing. The customer then receives a receipt.

**5. KYC and due diligence on the clinics and hospitals we work with**
Before we refer anyone to a clinic, laboratory or hospital, our network manager checks that the facility holds a valid licence from the Health Facilities Regulatory Agency (HeFRA). We record each licence in our provider register with the issuing body, licence number and expiry date, and mark it verified or not. Our system flags licences that are about to expire, and it will not let staff propose a provider whose licence is missing or expired unless a supervisor overrides it with a recorded reason.
Our customer pays us the full invoice through Paystack. Our invoice covers the consultant's professional fee together with nursing care and the laboratory technician, and we then pay the consultant. [Confirm this is how it works.]

**Documents**
- Privacy notice: https://www.medspecialistconnect.com/privacy
- Disclaimer and terms: https://www.medspecialistconnect.com/disclaimer
- Our business registration documents were sent with our application.

Please tell us if you need anything else. Thank you.

Kind regards,
[Name, role, phone]

---

## Notes for you (do not send)
- Only claim what is true. Your Data Protection Commission registration is still in progress, so the reply says so. Do not say it is complete.
- Do not send the internal `docs/HIPAA_READINESS.md`. It lists gaps; Paystack only needs the privacy notice and this summary.
- The call-back, referral and contact forms are delivered through a form service (Web3Forms), as the privacy notice says. We plan to move them to our own backend.
- The reply names only the licence check you confirmed (HeFRA). If you also check individual doctors' registrations (for example with the Medical and Dental Council), add that sentence only if you really do.
- Paystack may ask whether you collect money on behalf of the consultants. The reply says the customer pays you and you pay the consultant. Make sure that matches how you really work.
