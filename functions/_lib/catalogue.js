// ---------------------------------------------------------------------------
// PRICE LIST. Amounts are in pesewas (100 pesewas = GH₵1.00).
//
// !! The amounts below are PLACEHOLDERS for testing. Replace them with your real
// !! fees, then set PRICES_CONFIRMED=true in Cloudflare. Until then no invoice can
// !! be paid and no invoice is created automatically for patients.
//
// billing:
//   'fixed' – we know our fee, so an invoice is created straight away.
//   'quote' – the price depends on a provider, so staff build the invoice
//             (suggested lines below are pre-filled in the admin page).
//   'none'  – no charge, staff just call the person back.
// ---------------------------------------------------------------------------
export const CURRENCY = 'GHS';
export const SYMBOL = 'GH₵';

const GHS = (cedis) => Math.round(cedis * 100);
const HOME_NOTE = 'includes a lab or nurse technician for blood samples if needed';
const home = (label, cedis) => ({ label, billing: 'fixed', category: 'Home and private consultations', lines: [{ description: `${label}, ${HOME_NOTE}`.slice(0, 120), amount: GHS(cedis) }] });
const lab = (label, cedis) => ({ label, billing: 'fixed', category: 'Laboratory services', lines: [{ description: label, amount: GHS(cedis) }] });

export const SERVICES = {
  // Prices supplied by the business, in Ghana cedis.
  // Home and private consultations by our medical licensed team. Each comes with a lab or nurse technician to take blood samples as may be required.
  'GP consult (home)': home('GP consult (home)', 800),
  'Cardiac specialist consult (home)': home('Cardiac specialist consult (home)', 2500),
  'Urologist consult (private or home)': home('Urologist consult (private or home)', 2000),
  'Nephrologist service (private or home)': home('Nephrologist service (private or home)', 2000),
  'Hematologist consult (private or home)': home('Hematologist consult (private or home)', 2000),
  'Gynecologist consult (private or home)': home('Gynecologist consult (private or home)', 2000),
  'Physician specialist (private or home)': home('Physician specialist (private or home)', 1500),
  'Psychiatrist consult (private or home)': home('Psychiatrist consult (private or home)', 3000),
  'Dialysis services': { label: 'On-call dialysis treatment (anytime)', billing: 'fixed', category: 'Home and private consultations', lines: [{ description: 'On-call dialysis treatment (anytime)', amount: GHS(2000) }] },

  // Laboratory services. Each comes with the option of subscribing to consult a related specialist in our catalogue for test review and advice.
  'On-call kidney or renal function test': lab('On-call kidney or renal function test', 1274),
  "On-call men's essential check-up": lab("On-call men's essential check-up", 2016),
  "On-call men's complete health check-up": lab("On-call men's complete health check-up", 3598),
  "On-call men's executive health check": lab("On-call men's executive health check", 4123),
  "On-call women's essential check-up": lab("On-call women's essential check-up", 3290),
  "On-call women's complete health check": lab("On-call women's complete health check", 6118),
  "On-call women's executive health check": lab("On-call women's executive health check", 7189),
  "Women's fertility assessment": lab("Women's fertility assessment", 3213),
  "Couples fertility assessment": lab("Couples fertility assessment", 3521),

  // No price supplied yet, so staff confirm the price and issue the invoice.
  'Specialist appointment': { label: 'Specialist appointment (other specialties)', billing: 'quote', lines: [{ description: 'Specialist appointment coordination', amount: 0 }] },
  'Hospital admission assistance': { label: 'Hospital admission assistance', billing: 'quote', lines: [{ description: 'Hospital admission assistance', amount: 0 }] },
  'Insurance claims assistance': { label: 'Insurance claims assistance', billing: 'quote', lines: [{ description: 'Insurance claims assistance (administrative fee)', amount: 0 }] },
  'Home nursing': { label: 'Home nursing', billing: 'quote',
    lines: [{ description: 'Home nursing (according to duration)', amount: 0 }] },
  'MRI or CT scan': { label: 'MRI or CT scan booking', billing: 'quote',
    lines: [{ description: 'Coordination fee', amount: 0 }, { description: 'Scan fee (provider charge)', amount: 0 }] },
  'Laboratory tests': { label: 'Other laboratory tests', billing: 'quote',
    lines: [{ description: 'Laboratory tests (provider charge)', amount: 0 }] },
  'Ambulance coordination': { label: 'Ambulance coordination', billing: 'quote',
    lines: [{ description: 'Coordination fee', amount: 0 }, { description: 'Ambulance transport (provider charge)', amount: 0 }] },
  'Second medical opinion': { label: 'Second medical opinion coordination', billing: 'quote',
    lines: [{ description: 'Second medical opinion coordination', amount: 0 }] },

  'Medical advice on where to go': { label: 'Advice on where to go', billing: 'none', lines: [] }
};

export function formatMoney(pesewas) {
  const v = (pesewas / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return SYMBOL + v;
}
