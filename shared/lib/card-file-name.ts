/**
 * Guest names are free text. A `/` would turn into a folder inside the bulk ZIP,
 * and `\ : * ? " < > |` make Windows refuse to extract the file at all.
 */
export function cardFileName(guest: { name: string; code: string }): string {
  const clean = guest.name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "");

  return `${clean || "دعوة"}-${guest.code}.png`;
}
