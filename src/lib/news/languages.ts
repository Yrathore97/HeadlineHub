/** News-content languages the site offers. This is NOT interface translation -
 *  the UI chrome stays English; only the headlines change language.
 *
 *  These codes are what NewsData.io advertises for India. Which of them
 *  actually return results has NOT yet been verified against the live API;
 *  a language that returns nothing must be removed rather than left in to
 *  disappoint. */
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
];

const CODES = new Set(LANGUAGES.map((l) => l.code));

export function isValidLanguage(code: unknown): code is string {
  return typeof code === 'string' && CODES.has(code);
}
