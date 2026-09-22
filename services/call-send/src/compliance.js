// Voice-compliance helpers: number validation and the best-effort
// time-of-day guard (calls only between 08:00 and 21:00 recipient-local).
//
// The timezone mapping covers NANP (+1) area codes via a built-in table.
// It is BEST-EFFORT, not authoritative: area codes cross timezone borders,
// overlays change, and non-NANP numbers cannot be mapped at all. When the
// timezone is unknown the guard records 'unknown' and allows the draft —
// the human reviewer is the final gate, and production needs a complete
// numbering-plan / LRN lookup (see TERMS-DILIGENCE.md).

// Strict E.164: + followed by 1–15 digits, first digit non-zero.
export const E164 = /^\+[1-9]\d{7,14}$/;

// Obviously non-dialable patterns agents should never submit. The
// 555-01XX block is the NANP-reserved fictional range: any area code +
// exchange 555 + a subscriber number starting with 01.
const FAKE_PATTERNS = [
  { test: n => /^1?\d{3}55501\d{2}$/.test(n.replace(/\D/g, '')), why: 'fictional 555-01XX range' },
  { test: n => { const d = n.replace(/\D/g, '').slice(-7); return d.length === 7 && new Set(d).size === 1; }, why: 'repeated digits' },
];

export function validatePhoneNumber(raw) {
  const number = String(raw || '').trim().replace(/[\s\-().]/g, '');
  if (!E164.test(number))
    throw Object.assign(new Error('Enter the destination phone number in E.164 format, e.g. +15551234567.'), { status: 400 });
  for (const { test, why } of FAKE_PATTERNS)
    if (test(number)) throw Object.assign(new Error(`That phone number looks invalid (${why}). Check the number and try again.`), { status: 400 });
  return number;
}

// --- Best-effort NANP area code -> IANA timezone ---------------------------
// Major metro area codes only. Absent code => unknown, never a guess.
const AREA_CODE_TZ = {
  // US Eastern
  '202': 'America/New_York', '203': 'America/New_York', '207': 'America/New_York',
  '212': 'America/New_York', '215': 'America/New_York', '267': 'America/New_York',
  '302': 'America/New_York', '304': 'America/New_York', '305': 'America/New_York',
  '315': 'America/New_York', '321': 'America/New_York', '332': 'America/New_York',
  '347': 'America/New_York', '352': 'America/New_York', '386': 'America/New_York',
  '401': 'America/New_York', '404': 'America/New_York', '407': 'America/New_York',
  '410': 'America/New_York', '412': 'America/New_York', '413': 'America/New_York',
  '419': 'America/New_York', '434': 'America/New_York', '440': 'America/New_York',
  '470': 'America/New_York', '478': 'America/New_York', '484': 'America/New_York',
  '516': 'America/New_York', '518': 'America/New_York', '540': 'America/New_York',
  '561': 'America/New_York', '567': 'America/New_York', '571': 'America/New_York',
  '585': 'America/New_York', '603': 'America/New_York', '607': 'America/New_York',
  '609': 'America/New_York', '610': 'America/New_York', '617': 'America/New_York',
  '631': 'America/New_York', '646': 'America/New_York', '681': 'America/New_York',
  '703': 'America/New_York', '704': 'America/New_York', '706': 'America/New_York',
  '716': 'America/New_York', '717': 'America/New_York', '724': 'America/New_York',
  '727': 'America/New_York', '732': 'America/New_York', '740': 'America/New_York',
  '754': 'America/New_York', '757': 'America/New_York', '762': 'America/New_York',
  '770': 'America/New_York', '786': 'America/New_York', '802': 'America/New_York',
  '803': 'America/New_York', '804': 'America/New_York', '813': 'America/New_York',
  '828': 'America/New_York', '843': 'America/New_York', '845': 'America/New_York',
  '848': 'America/New_York', '856': 'America/New_York', '857': 'America/New_York',
  '860': 'America/New_York', '864': 'America/New_York', '865': 'America/New_York',
  '878': 'America/New_York', '904': 'America/New_York', '908': 'America/New_York',
  '912': 'America/New_York', '914': 'America/New_York', '917': 'America/New_York',
  '919': 'America/New_York', '929': 'America/New_York', '934': 'America/New_York',
  '941': 'America/New_York', '954': 'America/New_York', '959': 'America/New_York',
  '973': 'America/New_York', '980': 'America/New_York', '984': 'America/New_York',
  '201': 'America/New_York', '551': 'America/New_York', '570': 'America/New_York',
  '272': 'America/New_York', '234': 'America/New_York', '330': 'America/New_York',
  '216': 'America/New_York', '614': 'America/New_York', '380': 'America/New_York',
  '513': 'America/New_York', '937': 'America/New_York', '229': 'America/New_York',
  '239': 'America/New_York', '689': 'America/New_York', '276': 'America/New_York',
  '423': 'America/New_York', '502': 'America/New_York', '859': 'America/New_York',
  '317': 'America/New_York', '765': 'America/New_York', '812': 'America/New_York',
  '930': 'America/New_York', '260': 'America/Chicago', '219': 'America/Chicago',
  // US Central
  '205': 'America/Chicago', '210': 'America/Chicago', '214': 'America/Chicago',
  '251': 'America/Chicago', '256': 'America/Chicago', '270': 'America/Chicago',
  '312': 'America/Chicago', '314': 'America/Chicago', '316': 'America/Chicago',
  '318': 'America/Chicago', '334': 'America/Chicago', '346': 'America/Chicago',
  '361': 'America/Chicago', '402': 'America/Chicago', '405': 'America/Chicago',
  '409': 'America/Chicago', '469': 'America/Chicago', '479': 'America/Chicago',
  '501': 'America/Chicago', '504': 'America/Chicago', '512': 'America/Chicago',
  '515': 'America/Chicago', '531': 'America/Chicago', '539': 'America/Chicago',
  '601': 'America/Chicago', '615': 'America/Chicago', '620': 'America/Chicago',
  '629': 'America/Chicago', '636': 'America/Chicago', '651': 'America/Chicago',
  '660': 'America/Chicago', '662': 'America/Chicago', '682': 'America/Chicago',
  '713': 'America/Chicago', '726': 'America/Chicago', '731': 'America/Chicago',
  '737': 'America/Chicago', '769': 'America/Chicago', '773': 'America/Chicago',
  '785': 'America/Chicago', '815': 'America/Chicago', '817': 'America/Chicago',
  '830': 'America/Chicago', '832': 'America/Chicago', '847': 'America/Chicago',
  '850': 'America/Chicago', '872': 'America/Chicago', '901': 'America/Chicago',
  '903': 'America/Chicago', '913': 'America/Chicago', '915': 'America/Chicago',
  '918': 'America/Chicago', '920': 'America/Chicago', '931': 'America/Chicago',
  '936': 'America/Chicago', '938': 'America/Chicago', '945': 'America/Chicago',
  '956': 'America/Chicago', '972': 'America/Chicago', '979': 'America/Chicago',
  '985': 'America/Chicago', '228': 'America/Chicago', '225': 'America/Chicago',
  '337': 'America/Chicago', '281': 'America/Chicago', '870': 'America/Chicago',
  '262': 'America/Chicago', '414': 'America/Chicago', '608': 'America/Chicago',
  '715': 'America/Chicago', '612': 'America/Chicago', '763': 'America/Chicago',
  '952': 'America/Chicago', '218': 'America/Chicago', '320': 'America/Chicago',
  '507': 'America/Chicago', '319': 'America/Chicago', '563': 'America/Chicago',
  '641': 'America/Chicago', '712': 'America/Chicago', '573': 'America/Chicago',
  '816': 'America/Chicago', '417': 'America/Chicago',
  '580': 'America/Chicago', '940': 'America/Chicago',
  '430': 'America/Chicago',
  // US Mountain / Arizona (no DST)
  '303': 'America/Denver', '720': 'America/Denver',
  '505': 'America/Denver', '575': 'America/Denver', '801': 'America/Denver',
  '385': 'America/Denver', '208': 'America/Denver', '986': 'America/Denver',
  '406': 'America/Denver', '307': 'America/Denver', '970': 'America/Denver',
  '719': 'America/Denver', '435': 'America/Denver',
  '602': 'America/Phoenix', '480': 'America/Phoenix', '623': 'America/Phoenix',
  '928': 'America/Phoenix',
  // US Pacific
  '206': 'America/Los_Angeles', '213': 'America/Los_Angeles', '310': 'America/Los_Angeles',
  '323': 'America/Los_Angeles', '360': 'America/Los_Angeles', '415': 'America/Los_Angeles',
  '424': 'America/Los_Angeles', '425': 'America/Los_Angeles', '503': 'America/Los_Angeles',
  '509': 'America/Los_Angeles', '530': 'America/Los_Angeles', '541': 'America/Los_Angeles',
  '559': 'America/Los_Angeles', '562': 'America/Los_Angeles', '619': 'America/Los_Angeles',
  '626': 'America/Los_Angeles', '628': 'America/Los_Angeles', '650': 'America/Los_Angeles',
  '657': 'America/Los_Angeles', '661': 'America/Los_Angeles', '669': 'America/Los_Angeles',
  '702': 'America/Los_Angeles', '707': 'America/Los_Angeles', '714': 'America/Los_Angeles',
  '725': 'America/Los_Angeles', '747': 'America/Los_Angeles', '775': 'America/Los_Angeles',
  '805': 'America/Los_Angeles', '818': 'America/Los_Angeles', '831': 'America/Los_Angeles',
  '858': 'America/Los_Angeles', '909': 'America/Los_Angeles', '916': 'America/Los_Angeles',
  '925': 'America/Los_Angeles', '949': 'America/Los_Angeles', '951': 'America/Los_Angeles',
  '971': 'America/Los_Angeles', '209': 'America/Los_Angeles', '279': 'America/Los_Angeles',
  '442': 'America/Los_Angeles', '564': 'America/Los_Angeles',
  // Alaska / Hawaii / territories
  '907': 'America/Anchorage', '808': 'Pacific/Honolulu',
  '787': 'America/Puerto_Rico', '939': 'America/Puerto_Rico',
  '340': 'America/St_Thomas', '671': 'Pacific/Guam',
  // Canada
  '416': 'America/Toronto', '647': 'America/Toronto', '437': 'America/Toronto',
  '905': 'America/Toronto', '289': 'America/Toronto', '365': 'America/Toronto',
  '613': 'America/Toronto', '343': 'America/Toronto', '705': 'America/Toronto',
  '249': 'America/Toronto', '519': 'America/Toronto', '226': 'America/Toronto',
  '548': 'America/Toronto', '807': 'America/Toronto', '418': 'America/Toronto',
  '581': 'America/Toronto', '819': 'America/Toronto', '873': 'America/Toronto',
  '514': 'America/Toronto', '438': 'America/Toronto',
  '604': 'America/Vancouver', '778': 'America/Vancouver', '236': 'America/Vancouver',
  '250': 'America/Vancouver',
  '403': 'America/Edmonton', '587': 'America/Edmonton', '825': 'America/Edmonton',
  '780': 'America/Edmonton',
  '204': 'America/Winnipeg', '431': 'America/Winnipeg',
  '306': 'America/Regina', '639': 'America/Regina',
  '902': 'America/Halifax', '782': 'America/Halifax',
  '506': 'America/Moncton', '709': 'America/St_Johns',
  '867': 'America/Yellowknife',
};

export function timezoneForNumber(number) {
  if (!number.startsWith('+1')) return null;
  const digits = number.replace(/\D/g, '');
  const area = digits.slice(1, 4);
  return AREA_CODE_TZ[area] || null;
}

function hourInZone(timeZone, at = Date.now()) {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', hour12: false,
  }).format(new Date(at));
  return Number(hour) % 24;
}

// Calling window: 08:00–21:00 recipient-local. Returns:
//   { ok: true,  hour, timeZone }                       — inside the window
//   { ok: false, hour, timeZone, reason }              — outside the window
//   { ok: true,  hour: null, timeZone: null, unknown } — cannot be determined
export function checkCallingWindow(number, at = Date.now()) {
  const timeZone = timezoneForNumber(number);
  if (!timeZone) return { ok: true, hour: null, timeZone: null, unknown: true };
  const hour = hourInZone(timeZone, at);
  if (hour >= 8 && hour < 21) return { ok: true, hour, timeZone };
  return { ok: false, hour, timeZone,
    reason: `It is ${String(hour).padStart(2, '0')}:00 for ${number}. Calls are only placed between 08:00 and 21:00 recipient-local time.` };
}

// Fixed disclosure spoken at the start of every call, before the script.
export const DISCLOSURE =
  'Hi, this is an automated call placed through CallSend on behalf of a CallSend user. ';
