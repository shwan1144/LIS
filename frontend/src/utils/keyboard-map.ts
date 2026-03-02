const ARABIC_KURDISH_TO_ENGLISH_KEY_MAP: Record<string, string> = {
  // Standard Arabic layout (physical key mapping to EN QWERTY)
  '\u0636': 'q',
  '\u0635': 'w',
  '\u062b': 'e',
  '\u0642': 'r',
  '\u0641': 't',
  '\u063a': 'y',
  '\u0639': 'u',
  '\u0647': 'i',
  '\u062e': 'o',
  '\u062d': 'p',
  '\u062c': '[',
  '\u062f': ']',

  '\u0634': 'a',
  '\u0633': 's',
  '\u064a': 'd',
  '\u0628': 'f',
  '\u0644': 'g',
  '\u0627': 'h',
  '\u062a': 'j',
  '\u0646': 'k',
  '\u0645': 'l',
  '\u0643': ';',
  '\u0637': "'",

  '\u0626': 'z',
  '\u0621': 'x',
  '\u0624': 'c',
  '\u0631': 'v',
  '\u0649': 'n',
  '\u0629': 'm',
  '\u0648': ',',
  '\u0632': '.',
  '\u0638': '/',

  // Common Persian/Kurdish forms and extra letters
  '\u06cc': 'd', // Farsi yeh
  '\u06a9': ';', // Keheh
  '\u06c1': 'i', // Heh goal
  '\u06d5': 'm', // Ae
  '\u067e': '\\', // Peh
  '\u0686': '[', // Tcheh
  '\u06af': ']', // Gaf
  '\u0698': 'e', // Jeh
  '\u06c6': 'r', // Oe
  '\u06d0': 'd', // E
  '\u06ce': 'd', // Yeh with small v
  '\u06b5': 'l', // Lam with small v
  '\u06be': 'h', // Do chashmi heh
};

const ARABIC_LAM_ALEF_FORMS = /(?:\u0644\u0627|\ufefb|\ufef7|\ufef5|\ufef9)/g;

export function mapKeyboardToEnglish(input: string): string {
  if (!input) return input;

  const normalized = input.replace(ARABIC_LAM_ALEF_FORMS, 'b');
  return Array.from(normalized)
    .map((char) => ARABIC_KURDISH_TO_ENGLISH_KEY_MAP[char] ?? char)
    .join('');
}

export function buildKeyboardSearchVariants(input: string): string[] {
  const raw = input.trim().toLowerCase();
  if (!raw) return [];

  const mapped = mapKeyboardToEnglish(raw).toLowerCase();
  return mapped && mapped !== raw ? [raw, mapped] : [raw];
}
