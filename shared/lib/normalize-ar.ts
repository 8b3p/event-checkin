const TASHKEEL = /[ً-ْٰ]/g;
const ALEF_VARIANTS = /[أإآٱ]/g;
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * Folds Arabic spelling variants that Arabic speakers treat as
 * interchangeable when typing — hamza-bearing alefs (أ/إ/آ/ٱ → ا),
 * teh marbuta vs. heh (ة → ه), alef maksura vs. yeh (ى → ي) — strips
 * diacritics (tashkeel), and maps Arabic-Indic digits to Western digits,
 * so guest search matches common name-spelling variants instead of only
 * exact matches.
 */
export function normalizeAr(text: string): string {
  return text
    .replace(TASHKEEL, "")
    .replace(ALEF_VARIANTS, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)))
    .toLowerCase();
}
