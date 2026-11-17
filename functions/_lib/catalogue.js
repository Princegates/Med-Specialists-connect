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

export const SERVICES = {
  'Specialist appointment': { label: 'Specialist appointment coordination', billing: 'fixed',
    lines: [{ description: 'Specialist appointment coordination', amount: 10000 }] },
  'Insurance claims assistance': { label: 'Insurance claims assistance', billing: 'fixed',
    lines: [{ description: 'Insurance claims assistance (administrative fee)', amount: 10000 }] },
  'Hospital admission assistance': { label: 'Hospital admission assistance', billing: 'fixed',
    lines: [{ description: 'Hospital admission assistance', amount: 15000 }] },

  'Home doctor visit': { label: 'Home doctor visit', billing: 'quote',
    lines: [{ description: 'Coordination fee', amount: 10000 }, { description: 'Doctor fee (provider charge)', amount: 0 }] },
  'Home nursing': { label: 'Home nursing', billing: 'quote',
    lines: [{ description: 'Home nursing (according to duration)', amount: 0 }] },
  'MRI or CT scan': { label: 'MRI or CT scan booking', billing: 'quote',
    lines: [{ description: 'Coordination fee', amount: 10000 }, { description: 'Scan fee (provider charge)', amount: 0 }] },
  'Laboratory tests': { label: 'Laboratory investigations', billing: 'quote',
    lines: [{ description: 'Laboratory tests (provider charge)', amount: 0 }] },
  'Ambulance coordination': { label: 'Ambulance coordination', billing: 'quote',
    lines: [{ description: 'Coordination fee', amount: 10000 }, { description: 'Ambulance transport (provider charge)', amount: 0 }] },
  'Second medical opinion': { label: 'Second medical opinion coordination', billing: 'quote',
    lines: [{ description: 'Second medical opinion coordination', amount: 0 }] },
  'Dialysis services': { label: 'Dialysis services', billing: 'quote',
    lines: [{ description: 'Dialysis services', amount: 0 }] },

  'Medical advice on where to go': { label: 'Advice on where to go', billing: 'none', lines: [] }
};

export function flags(env) {
  return {
    billingEnabled: env.BILLING_ENABLED === 'true' && !!env.DB,
    pricesConfirmed: env.PRICES_CONFIRMED === 'true'
  };
}

export function formatMoney(pesewas) {
  const v = (pesewas / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return SYMBOL + v;
}
