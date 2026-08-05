/** News-content languages the site offers. This is NOT interface translation -
 *  the UI chrome stays English; only the headlines change language.
 *
 *  Every code here is verified against the live NewsData.io API to return
 *  real results - see PROGRESS.md for verification dates. A language that
 *  stops returning results must be removed rather than left in to disappoint.
 *
 *  Requested-but-rejected (checked 2026-08-06, all 22 Eighth Schedule
 *  languages considered): Bodo, Dogri, Kashmiri, Konkani, Maithili, Manipuri,
 *  Sanskrit, Santali are not recognised by NewsData.io's language database at
 *  all ("language you provided does not exist"). Sindhi (`sd`) IS a
 *  recognised code but returns zero results across every category tested -
 *  excluded for the same "don't advertise what isn't there" reason. Nepali
 *  (`ne`) is recognised and does return results, so it's included below. */
export interface Language {
  code: string;
  name: string;
}

export const DEFAULT_LANGUAGE = 'en';

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिंदी (Hindi)' },
  { code: 'bn', name: 'বাংলা (Bengali)' },
  { code: 'mr', name: 'मराठी (Marathi)' },
  { code: 'te', name: 'తెలుగు (Telugu)' },
  { code: 'ta', name: 'தமிழ் (Tamil)' },
  { code: 'gu', name: 'ગુજરાતી (Gujarati)' },
  { code: 'kn', name: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ml', name: 'മലയാളം (Malayalam)' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'or', name: 'ଓଡ଼ିଆ (Odia)' },
  { code: 'as', name: 'অসমীয়া (Assamese)' },
  { code: 'ur', name: 'اردو (Urdu)' },
  { code: 'ne', name: 'नेपाली (Nepali)' },
];

const CODES = new Set(LANGUAGES.map((l) => l.code));

export function isValidLanguage(code: unknown): code is string {
  return typeof code === 'string' && CODES.has(code);
}
