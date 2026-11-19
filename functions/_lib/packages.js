// What each laboratory package includes, taken from the clinic's flyers. The price comes from the services list
// (editable in the staff console); this file holds the descriptions. `base` means "everything in that package, plus".

const PROCESS = ['Registration', 'Clinical assessment', 'Laboratory testing', 'Doctor review', 'Personalised health advice'];
const IMPORTANT = 'These packages are general health assessments. Additional tests may be recommended by your doctor based on your age, medical history, symptoms and risk factors. Not all tests are necessary for everyone.';
const IMPORTANT_WOMEN = 'These packages are general health assessments. Additional tests or screening (for example, mammography) may be recommended by your doctor based on your age, medical history, symptoms and risk factors. Not all tests are necessary for everyone.';
const MEN_NOTES = ['Fasting: 8 to 12 hours', 'Report ready within 24 to 48 hours', 'Drink water and keep hydrated', 'Confidential and professional care'];
const WOMEN_BEFORE = ['Please fast for 8 to 12 hours for most tests unless advised otherwise.', 'Drink plenty of water.', 'Bring a list of your medications and your medical history.'];
const t = (name, flag) => (flag ? { name, flag: true } : { name });

const MEN_WHO = [
  { band: 'Men 18 to 39', text: 'Establish a health baseline and detect risks early.' },
  { band: 'Men 40 and over', text: 'Focus on cardiovascular, metabolic and prostate health.' },
  { band: 'Men 50 and over', text: 'More comprehensive screening for age-related conditions and overall wellness.' }
];
const WOMEN_WHO = [
  { band: 'Women 18 to 29', text: 'Establish a health baseline and detect risks early.' },
  { band: 'Women 30 to 39', text: 'Focus on hormonal, metabolic and reproductive health.' },
  { band: 'Women 40 and over', text: 'More comprehensive screening for age-related conditions and overall wellness.' }
];

export const DETAILS = {
  'On-call kidney or renal function test': {
    summary: 'Laboratory tests used to assess kidney function and electrolyte balance.',
    // Prices on the clinic's flyer, in pesewas (GH\u20B5 1 = 100). They add up to GH\u20B5910; the on-call package price is set in the services list.
    priceBasis: 'clinic',
    tests: [
      { name: 'BUE and creatinine', note: 'Measures waste products to assess kidney function.', price: 18000 },
      { name: 'Sodium', note: 'Checks the sodium level in the blood.', price: 4000 },
      { name: 'Potassium', note: 'Checks the potassium level in the blood.', price: 14000 },
      { name: 'Chloride', note: 'Checks the chloride level in the blood.', price: 4000 },
      { name: 'Bicarbonate', note: 'Helps assess acid-base balance.', price: 4000 },
      { name: 'Urine albumin to creatinine ratio (UACR)', note: 'Detects early signs of kidney damage.', price: 18000 },
      { name: 'Urine protein to creatinine ratio (UPCR)', note: 'Measures protein loss in the urine.', price: 18000 },
      { name: 'Full blood count', note: 'Checks blood cells and helps evaluate overall health.', price: 11000 }
    ]
  },

  "On-call men's essential check-up": {
    summary: 'Designed to assess your overall health, detect hidden risks early and help you live a longer, healthier life. Early detection, better health.',
    tests: [t('Full blood count (FBC)'), t('Fasting blood glucose'), t('Kidney function (BUE and creatinine)'), t('Liver function test (LFT)'), t('Lipid profile'), t('Urine R/E'), t('Total PSA (prostate screening)', true)],
    footnote: '* PSA depends on your age and risk, and may be recommended by your doctor.',
    who: MEN_WHO, important: IMPORTANT, notes: MEN_NOTES, process: PROCESS
  },
  "On-call men's complete health check-up": {
    base: "On-call men's essential check-up",
    summary: 'Everything in the Men’s essential check-up, plus more tests for diabetes, infections, uric acid, calcium and vitamin D.',
    tests: [t('HbA1c'), t('Hepatitis B surface antigen'), t('Hepatitis C antibody'), t('HIV 1 and 2 (Ag/Ab)'), t('Uric acid'), t('Calcium (corrected)'), t('Vitamin D3')],
    footnote: '* PSA depends on your age and risk, and may be recommended by your doctor.',
    who: MEN_WHO, important: IMPORTANT, notes: MEN_NOTES, process: PROCESS
  },
  "On-call men's executive health check": {
    base: "On-call men's complete health check-up",
    summary: 'Everything in the Men’s complete health check, plus testosterone, vitamin B12 and stool tests.',
    tests: [t('Total testosterone'), t('H. pylori stool antigen'), t('Stool occult blood'), t('Vitamin B12')],
    footnote: '* PSA depends on your age and risk, and may be recommended by your doctor.',
    who: MEN_WHO, important: IMPORTANT, notes: MEN_NOTES, process: PROCESS
  },

  "On-call women's essential check-up": {
    summary: 'Designed to support every stage of a woman’s life, detect hidden risks early and help you live a longer, healthier life. Early detection, better health.',
    tests: [t('Full blood count (FBC)'), t('Fasting blood glucose'), t('Kidney function (BUE and creatinine)'), t('Liver function test (LFT)'), t('Lipid profile'), t('Urine R/E'), t('Thyroid stimulating hormone (TSH)'),
      t('Urine pregnancy test', true), t('Hepatitis B surface antigen', true), t('HIV 1 and 2 (Ag/Ab)', true), t('Pap smear (conventional cervical screening), included')],
    footnote: '* As recommended by your doctor and based on your age and risk.',
    who: WOMEN_WHO, important: IMPORTANT_WOMEN, before: WOMEN_BEFORE, process: PROCESS
  },
  "On-call women's complete health check": {
    base: "On-call women's essential check-up",
    summary: 'Everything in the Women’s essential check-up, plus a fuller thyroid profile, iron, vitamins and a clinical breast examination.',
    tests: [t('HbA1c'), t('Hepatitis C antibody'), t('Calcium (corrected)'), t('Vitamin D3'), t('Iron'), t('Vitamin B12'), t('Thyroid profile (TSH, free T3, free T4)'), t('Breast examination (clinical)', true)],
    footnote: '* As recommended by your doctor and based on your age and risk.',
    who: WOMEN_WHO, important: IMPORTANT_WOMEN, before: WOMEN_BEFORE, process: PROCESS
  },
  "On-call women's executive health check": {
    base: "On-call women's complete health check",
    summary: 'Everything in the Women’s complete health check, plus mammography, stool occult blood and a full set of reproductive hormones. Vitamin D3 is repeated only if it has not been done.',
    tests: [t('Mammography', true), t('Stool occult blood'), t('Estradiol (E2)'), t('FSH'), t('LH'), t('Prolactin')],
    footnote: '* As recommended by your doctor and based on your age and risk.',
    who: WOMEN_WHO, important: IMPORTANT_WOMEN, before: WOMEN_BEFORE, process: PROCESS
  },

  "Women's fertility assessment": {
    summary: 'Designed for women planning pregnancy or seeking an evaluation of fertility concerns.',
    tests: [t('AMH (anti-Müllerian hormone)'), t('FSH'), t('LH'), t('Estradiol (E2)'), t('Progesterone'), t('Prolactin'), t('Thyroid function test (TSH, T3, T4)')],
    alsoIncludes: ['Fertility-focused doctor consultation', 'Menstrual and reproductive health assessment', 'Personalised fertility advice'],
    before: WOMEN_BEFORE, process: PROCESS
  },
  "Couples fertility assessment": {
    base: "Women's fertility assessment",
    summary: 'A comprehensive fertility evaluation for both partners to support informed decisions and better outcomes. It includes everything in the Women’s fertility assessment, plus a semen analysis for the male partner.',
    tests: [t('Semen analysis (for the male partner)')],
    alsoIncludes: ['Couple-focused consultation', 'Assessment of both partners', 'Personalised fertility plan and next steps'],
    before: WOMEN_BEFORE, process: PROCESS
  }
};

// A package with everything it builds on, in order. Tests that are new in this package are marked `added`.
export function detailsFor(key) {
  const d = DETAILS[key];
  if (!d) return null;
  const chain = [];
  for (let k = key; k && DETAILS[k]; k = DETAILS[k].base) chain.unshift(k);
  const tests = [];
  chain.forEach((k, i) => {
    for (const x of DETAILS[k].tests) {
      if (tests.some((y) => y.name === x.name)) continue; // listed on the flyer under more than one package: show it once
      tests.push({ ...x, added: i === chain.length - 1 && chain.length > 1 });
    }
  });
  const also = [];
  for (const k of chain) for (const a of DETAILS[k].alsoIncludes || []) if (!also.includes(a)) also.push(a);
  const base = d.base ? { key: d.base } : null;
  return {
    summary: d.summary, priceBasis: d.priceBasis || null, tests, also, footnote: d.footnote || null, who: d.who || null, important: d.important || null, notes: d.notes || null,
    before: d.before || null, process: d.process || null, base
  };
}

// What comes with a private or home service, shown on the invoice (supplied by the business).
const HOME_PACKAGE = {
  intro: 'Our private and home-based services are delivered by our team of licensed medical professionals. The service package includes:',
  items: ['A qualified laboratory technician or nurse to collect blood samples, where necessary.']
};
const HOME_SERVICES = new Set([
  'GP consult (home)', 'Cardiac specialist consult (home)', 'Urologist consult (private or home)', 'Nephrologist service (private or home)',
  'Hematologist consult (private or home)', 'Gynecologist consult (private or home)', 'Physician specialist (private or home)',
  'Psychiatrist consult (private or home)', 'Dialysis services'
]);
export const packageFor = (service) => (HOME_SERVICES.has(service) ? HOME_PACKAGE : null);

// Where the consultation happens. 'choose' = the patient must say private or home; 'home' = home visit only.
const VISIT_CHOOSE = new Set(['Urologist consult (private or home)', 'Nephrologist service (private or home)', 'Hematologist consult (private or home)', 'Gynecologist consult (private or home)', 'Physician specialist (private or home)', 'Psychiatrist consult (private or home)']);
const VISIT_HOME = new Set(['GP consult (home)', 'Cardiac specialist consult (home)']);
export const visitMode = (service) => (VISIT_CHOOSE.has(service) ? 'choose' : VISIT_HOME.has(service) ? 'home' : null);
export const VISIT_LABEL = { home: 'Home visit', private: 'Private consultation' };
// "Urologist consult (private or home)" becomes "Urologist consult (home)" or "(private)" once the patient has chosen.
export const lineLabel = (label, visit) => (visit === 'home' || visit === 'private' ? label.replace(/\(private or home\)/i, `(${visit})`) : label);
