// Barcodes, away from the camera so the rules can be reasoned about (and tested)
// on their own. Two of them, and they are the whole feature:
//
//   1. What a scanned code means once it is cleaned up.
//   2. That one packet in front of the lens is ONE scan.

/**
 * A code as everything else should see it. A scanner pads its read — leading
 * spaces, a trailing newline it types like a keyboard would — so the same
 * packet can arrive as `8901234`, ` 8901234` or `8901234\n` and must not become
 * three different items. Case and inner spacing are left alone: Code 39 prints
 * both, and they are part of the code the supplier assigned.
 *
 * An empty result means the read was junk. Callers treat that as "no barcode",
 * never as a match — otherwise every item with a blank barcode would answer to
 * a misread.
 */
export function normaliseBarcode(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

export interface ScanLock {
  /** The code on the first good read, then null until {@link ScanLock.reset}. */
  accept(raw: string | null | undefined): string | null;
  reset(): void;
}

/**
 * A code held in front of the lens is decoded on EVERY camera frame, so the
 * scanner's callback fires dozens of times a second for what the shopkeeper
 * thinks of as one scan — fifty duplicate lines on a bill, or fifty navigations.
 * The first good read shuts the door; only reopening the scanner (`reset`)
 * opens it again, which is exactly the moment the shop means "scan the next one".
 *
 * A junk read is not a scan and does not lock anything, so a bad frame cannot
 * swallow the real code that arrives a frame later.
 */
export function createScanLock(): ScanLock {
  let locked = false;
  return {
    accept(raw) {
      if (locked) return null;
      const code = normaliseBarcode(raw);
      if (!code) return null;
      locked = true;
      return code;
    },
    reset() {
      locked = false;
    },
  };
}
