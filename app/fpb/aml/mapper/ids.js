import { newGuid } from './environment';

/**
 * IDs as the C# mapper writes them: new ones in the "B" format ({...}), and
 * the name-based ones of FpbJsonToCaex (DeriveSubProcessId,
 * DeriveBoundaryStateId): SHA-1 over UTF-8, the first 16 bytes with version 5
 * and the RFC 4122 variant, formatted as `new Guid(bytes).ToString("B")`.
 *
 * `new Guid(byte[])` reads the first three fields little endian, so the text
 * takes bytes 3 2 1 0, 5 4, 7 6, then 8 9, then 10 to 15. SHA-1 is computed
 * here synchronously: crypto.subtle only offers it as a promise.
 */

/** Guid.NewGuid().ToString("B") */
export function newId() {
  return newGuid().toString('B');
}

/** SHA-1 of a byte array, synchronous (FIPS 180-4) */
export function sha1(bytes) {
  const length = bytes.length;
  const words = new Uint32Array((((length + 8) >> 6) + 1) * 16);
  for (let i = 0; i < length; i++) {
    words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }
  words[length >> 2] |= 0x80 << (24 - (length % 4) * 8);
  const bits = length * 8;
  words[words.length - 1] = bits >>> 0;
  words[words.length - 2] = Math.floor(bits / 0x100000000);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let block = 0; block < words.length; block += 16) {
    for (let t = 0; t < 16; t++) {
      w[t] = words[block + t];
    }
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w[t] = (x << 1) | (x >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t++) {
      let f;
      let k;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  [h0, h1, h2, h3, h4].forEach((h, i) => {
    out[i * 4] = h >>> 24;
    out[i * 4 + 1] = (h >>> 16) & 0xff;
    out[i * 4 + 2] = (h >>> 8) & 0xff;
    out[i * 4 + 3] = h & 0xff;
  });
  return out;
}

const hex = (b) => b.toString(16).padStart(2, '0');

/** `new Guid(bytes).ToString("B")` for 16 bytes */
export function dotNetGuidFromBytes(bytes) {
  const pick = (indices) => indices.map((i) => hex(bytes[i])).join('');
  return '{' + [
    pick([3, 2, 1, 0]),
    pick([5, 4]),
    pick([7, 6]),
    pick([8, 9]),
    pick([10, 11, 12, 13, 14, 15])
  ].join('-') + '}';
}

/** Version-5 style GUID from SHA-1 over the UTF-8 of `name`, as in FpbJsonToCaex */
export function nameBasedId(name) {
  const hash = sha1(new TextEncoder().encode(name));
  const bytes = hash.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return dotNetGuidFromBytes(bytes);
}

/** DeriveSubProcessId: the sub-process of a parent process operator */
export function deriveSubProcessId(parentPoBareId) {
  if (!parentPoBareId) {
    return newId();
  }
  return nameBasedId('fpd-subprocess-of:' + parentPoBareId);
}

/** DeriveBoundaryStateId: the sub-process copy of a boundary state */
export function deriveBoundaryStateId(sharedStateBareId, subProcessBareId) {
  if (!sharedStateBareId) {
    return newId();
  }
  // C# concatenates null as the empty string
  return nameBasedId('fpd-boundary-state:' + sharedStateBareId + '@' + (subProcessBareId ?? ''));
}
