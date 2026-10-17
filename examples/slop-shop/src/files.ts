/** Encodes a plain-text receipt for the download link. */
export function encodeReceipt(text: string): string {
  return new Buffer(text).toString('base64');
}
