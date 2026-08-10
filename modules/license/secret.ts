// ─────────────────────────────────────────────────────────────────────────────
// THE VENDOR SECRET. Change this and every key ever issued stops working.
//
// It must match, character for character, the SECRET constant in tools/keygen.html
// — the two files are the two halves of the same lock. Keep keygen.html off any
// client's machine; anyone holding both the secret and the generator can mint
// licences for themselves.
//
// This is the same trade-off the VFP build has always made: the secret ships
// inside the program, so the lock stops casual copying, not a determined
// reverse-engineer. What it does buy is a per-device, time-limited install that
// works with no server and no internet — which is the actual requirement.
//
// Split into pieces so the whole string never appears in the JS bundle as one
// searchable literal (the VFP GetSecret() does exactly this with CHR() calls).
// ─────────────────────────────────────────────────────────────────────────────

const PARTS = [
  String.fromCharCode(66, 101, 78, 101),
  'Sy5',
  String.fromCharCode(115, 64),
  '2026',
  String.fromCharCode(33, 107, 77),
  '#Secure',
];

export const LICENSE_SECRET = PARTS.join('');
