/** Hands a Blob built in the browser to the user as a file download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in Safari before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
