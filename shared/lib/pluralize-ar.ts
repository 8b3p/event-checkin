export type ArabicPluralForms = {
  one: string;
  two: string;
  few: string;
  many: string;
};

/**
 * Arabic numeral-noun agreement: 1 and 2 use standalone one/dual phrases
 * (the word itself carries the count, so no number is prefixed); 3-10 use
 * the plural form with the number prefixed; 11+ (and 0, and round
 * hundreds) revert to the singular-with-tanwin "many" form, still with the
 * number prefixed — the `% 100` check re-applies the 3-10 few-form inside
 * each hundred (e.g. 103 behaves like 3).
 */
export function pluralizeAr(n: number, forms: ArabicPluralForms): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;

  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}
