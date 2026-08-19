import { formatBits, gfMul, qrMatrix, qrSvg, reedSolomon, upiPayload, utf8Bytes } from '@/utils/qr';

// A QR code that does not scan is worse than no QR code — the customer stands
// at the counter with a phone that will not take the money. There is no library
// behind this one, so the maths is checked here from first principles rather
// than trusted.

describe('GF(256) arithmetic', () => {
  it('has 1 as its identity and 0 as its annihilator', () => {
    for (const a of [1, 2, 87, 255]) {
      expect(gfMul(a, 1)).toBe(a);
      expect(gfMul(a, 0)).toBe(0);
      expect(gfMul(0, a)).toBe(0);
    }
  });

  it('is commutative and associative', () => {
    const vals = [1, 3, 17, 90, 200, 255];
    for (const a of vals) {
      for (const b of vals) {
        expect(gfMul(a, b)).toBe(gfMul(b, a));
        for (const c of vals) {
          expect(gfMul(gfMul(a, b), c)).toBe(gfMul(a, gfMul(b, c)));
        }
      }
    }
  });

  it('stays inside the field', () => {
    for (let a = 0; a < 256; a += 1) {
      for (const b of [2, 29, 133, 255]) {
        const p = gfMul(a, b);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('Reed–Solomon', () => {
  // The defining property, and the one that actually proves it: a codeword is
  // data followed by its remainder, so dividing the whole thing by the same
  // generator must leave nothing behind. If the remainder were wrong by a
  // single byte this would not hold.
  it('produces a codeword that divides cleanly', () => {
    for (const degree of [10, 16, 18, 22, 24, 26]) {
      const data = Array.from({ length: 30 }, (_, i) => (i * 37 + 11) % 256);
      const ec = reedSolomon(data, degree);
      expect(ec).toHaveLength(degree);
      expect(reedSolomon([...data, ...ec], degree)).toEqual(new Array(degree).fill(0));
    }
  });

  it('gives all-zero data an all-zero remainder', () => {
    expect(reedSolomon([0, 0, 0, 0], 10)).toEqual(new Array(10).fill(0));
  });

  it('changes the remainder when any byte of the data changes', () => {
    const a = reedSolomon([1, 2, 3, 4, 5], 10);
    const b = reedSolomon([1, 2, 3, 4, 6], 10);
    expect(a).not.toEqual(b);
  });
});

describe('format information', () => {
  // The 15 bits are a BCH codeword, so every valid one differs from every other
  // in at least 7 places — that is what lets a scanner read it off a damaged
  // symbol. Checking the distance checks the polynomial.
  it('keeps all eight masks far apart', () => {
    const all = [0, 1, 2, 3, 4, 5, 6, 7].map(formatBits);
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        let diff = 0;
        for (let bit = 0; bit < 15; bit += 1) {
          if (((all[i] >>> bit) & 1) !== ((all[j] >>> bit) & 1)) diff += 1;
        }
        expect(diff).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('fits in fifteen bits', () => {
    for (let mask = 0; mask < 8; mask += 1) {
      expect(formatBits(mask)).toBeLessThan(1 << 15);
      expect(formatBits(mask)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('utf8Bytes', () => {
  it('leaves plain ASCII alone', () => {
    expect(utf8Bytes('Hi')).toEqual([72, 105]);
  });

  it('encodes Tamil as three bytes a character', () => {
    // தமிழ் on a bill is not a hypothetical for this app.
    expect(utf8Bytes('த')).toEqual([0xe0, 0xae, 0xa4]);
  });
});

describe('qrMatrix', () => {
  const matrix = qrMatrix('upi://pay?pa=shop@okaxis&pn=Benesys%20Stores&cu=INR');

  it('is square, and a legal QR size', () => {
    expect(matrix.length).toBe(matrix[0].length);
    expect((matrix.length - 17) % 4).toBe(0);
  });

  it('carries a finder pattern in three corners and not the fourth', () => {
    const n = matrix.length;
    const finderAt = (r: number, c: number) =>
      matrix[r][c] &&
      matrix[r + 6][c] &&
      matrix[r][c + 6] &&
      matrix[r + 3][c + 3] &&
      !matrix[r + 1][c + 1] &&
      !matrix[r + 5][c + 5];
    expect(finderAt(0, 0)).toBe(true);
    expect(finderAt(0, n - 7)).toBe(true);
    expect(finderAt(n - 7, 0)).toBe(true);
    // The bottom-right corner is data; a finder there would confuse orientation.
    expect(finderAt(n - 7, n - 7)).toBe(false);
  });

  it('alternates along both timing patterns', () => {
    const n = matrix.length;
    for (let i = 8; i < n - 8; i += 1) {
      expect(matrix[6][i]).toBe(i % 2 === 0);
      expect(matrix[i][6]).toBe(i % 2 === 0);
    }
  });

  it('always sets the dark module', () => {
    // Fixed by the standard at (4·version + 9, 8); a light one there is a
    // symbol no scanner will accept.
    expect(matrix[matrix.length - 8][8]).toBe(true);
  });

  it('grows a version at a time as the payload grows', () => {
    const small = qrMatrix('a'.repeat(10));
    const big = qrMatrix('a'.repeat(200));
    expect(big.length).toBeGreaterThan(small.length);
    expect(small.length).toBe(21); // version 1
  });

  it('is deterministic — the same bill prints the same code twice', () => {
    expect(qrMatrix('upi://pay?pa=x@y&cu=INR')).toEqual(qrMatrix('upi://pay?pa=x@y&cu=INR'));
  });

  it('refuses a payload it cannot hold rather than printing a broken code', () => {
    expect(() => qrMatrix('x'.repeat(500))).toThrow(/too long/i);
  });
});

describe('qrSvg', () => {
  it('renders a self-contained svg with a quiet zone', () => {
    const svg = qrSvg('upi://pay?pa=x@y&cu=INR', 120);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="120"');
    // 25 modules for this payload (version 2), plus 4 of quiet zone each side.
    expect(qrMatrix('upi://pay?pa=x@y&cu=INR').length).toBe(25);
    expect(svg).toContain('viewBox="0 0 33 33"');
    // Nothing to fetch: the printed bill has to work with the phone offline.
    expect(svg).not.toContain('href');
    expect(svg).not.toContain('<image');
  });

  it('scales to whatever the page has room for', () => {
    expect(qrSvg('upi://pay?pa=x@y&cu=INR', 64)).toContain('width="64"');
  });
});

describe('upiPayload', () => {
  it('builds what a UPI app expects', () => {
    expect(upiPayload({ vpa: 'shop@okaxis', name: 'Benesys Stores' })).toBe(
      'upi://pay?pa=shop%40okaxis&pn=Benesys%20Stores&cu=INR',
    );
  });

  it('states the amount in rupees, two decimals', () => {
    const url = upiPayload({ vpa: 'a@b', name: 'S', amount: 35400 });
    expect(url).toContain('am=354.00');
  });

  it('leaves the amount out when there is none to ask for', () => {
    expect(upiPayload({ vpa: 'a@b', name: 'S', amount: 0 })).not.toContain('am=');
  });

  it('escapes a note so an & in it cannot break the link', () => {
    const url = upiPayload({ vpa: 'a@b', name: 'S', note: 'INV/1 & 2' });
    expect(url).toContain('tn=INV%2F1%20%26%202');
  });
});
