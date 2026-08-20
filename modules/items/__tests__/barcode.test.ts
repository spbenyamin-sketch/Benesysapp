import { createScanLock, normaliseBarcode } from '@/modules/items/barcode';

// The camera cannot be tested here, and does not need to be. What can quietly
// ruin a shop's day is the two rules underneath it: a code that means the same
// thing however the scanner spat it out, and ONE scan per packet.

describe('normaliseBarcode', () => {
  it('strips what the scanner pads the read with', () => {
    // The same packet, three ways a scanner can hand it over.
    expect(normaliseBarcode('8901234567890')).toBe('8901234567890');
    expect(normaliseBarcode('  8901234567890')).toBe('8901234567890');
    expect(normaliseBarcode('8901234567890\n')).toBe('8901234567890');
  });

  it('leaves the code itself alone', () => {
    // Code 39 prints letters and spaces, and they belong to the supplier's code.
    expect(normaliseBarcode('ABC-123')).toBe('ABC-123');
    expect(normaliseBarcode('AB 12')).toBe('AB 12');
  });

  it('turns nothing at all into an empty code', () => {
    // Empty is the signal for "no barcode" — never a value that can match.
    expect(normaliseBarcode('   ')).toBe('');
    expect(normaliseBarcode(null)).toBe('');
    expect(normaliseBarcode(undefined)).toBe('');
  });
});

describe('createScanLock', () => {
  it('fires once for a packet held in front of the lens', () => {
    const lock = createScanLock();
    // What the camera actually does: the same code, frame after frame.
    const reads = Array.from({ length: 50 }, () => lock.accept('8901234567890'));
    expect(reads.filter((r) => r !== null)).toEqual(['8901234567890']);
  });

  it('normalises the code it lets through', () => {
    expect(createScanLock().accept(' 8901234567890\n')).toBe('8901234567890');
  });

  it('stays shut for a different code until the scanner is reopened', () => {
    // Swapping packets without closing must not add a second item silently.
    const lock = createScanLock();
    expect(lock.accept('111')).toBe('111');
    expect(lock.accept('222')).toBeNull();
    lock.reset();
    expect(lock.accept('222')).toBe('222');
  });

  it('is not spent by a junk frame', () => {
    // A blank read is the lens still focusing, not a scan — the real code
    // arriving a frame later must still get through.
    const lock = createScanLock();
    expect(lock.accept('')).toBeNull();
    expect(lock.accept('   ')).toBeNull();
    expect(lock.accept('8901234567890')).toBe('8901234567890');
  });
});
