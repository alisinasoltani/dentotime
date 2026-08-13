class Sha256 {
  constructor() {
    this.state = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.bytesHashed = 0;
    this.words = new Uint32Array(64);
  }

  update(bytes) {
    this.bytesHashed += bytes.length;
    let offset = 0;
    while (offset < bytes.length) {
      const take = Math.min(64 - this.bufferLength, bytes.length - offset);
      this.buffer.set(bytes.subarray(offset, offset + take), this.bufferLength);
      this.bufferLength += take;
      offset += take;
      if (this.bufferLength === 64) {
        this.process(this.buffer);
        this.bufferLength = 0;
      }
    }
  }

  process(chunk) {
    const w = this.words;
    for (let i = 0; i < 16; i += 1) {
      const j = i * 4;
      w[i] = ((chunk[j] << 24) | (chunk[j + 1] << 16) | (chunk[j + 2] << 8) | chunk[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = (rightRotate(x, 7) ^ rightRotate(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rightRotate(y, 17) ^ rightRotate(y, 19) ^ (y >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = this.state;
    for (let i = 0; i < 64; i += 1) {
      const s1 = (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) >>> 0;
      const choice = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + s1 + choice + K[i] + w[i]) >>> 0;
      const s0 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) >>> 0;
      const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    this.state[0] = (this.state[0] + a) >>> 0;
    this.state[1] = (this.state[1] + b) >>> 0;
    this.state[2] = (this.state[2] + c) >>> 0;
    this.state[3] = (this.state[3] + d) >>> 0;
    this.state[4] = (this.state[4] + e) >>> 0;
    this.state[5] = (this.state[5] + f) >>> 0;
    this.state[6] = (this.state[6] + g) >>> 0;
    this.state[7] = (this.state[7] + h) >>> 0;
  }

  hexDigest() {
    const bytesHashed = this.bytesHashed;
    const finalLength = this.bufferLength < 56 ? 64 : 128;
    const finalBlock = new Uint8Array(finalLength);
    finalBlock.set(this.buffer.subarray(0, this.bufferLength));
    finalBlock[this.bufferLength] = 0x80;
    const bitHigh = Math.floor(bytesHashed / 0x20000000);
    const bitLow = (bytesHashed << 3) >>> 0;
    const view = new DataView(finalBlock.buffer);
    view.setUint32(finalLength - 8, bitHigh, false);
    view.setUint32(finalLength - 4, bitLow, false);
    this.process(finalBlock.subarray(0, 64));
    if (finalLength === 128) this.process(finalBlock.subarray(64));
    return Array.from(this.state, (word) => word.toString(16).padStart(8, '0')).join('');
  }
}

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

self.onmessage = async (event) => {
  const { file, partSize } = event.data;
  try {
    const hasher = new Sha256();
    const parts = [];
    for (let offset = 0, partNumber = 1; offset < file.size; offset += partSize, partNumber += 1) {
      const bytes = new Uint8Array(await file.slice(offset, offset + partSize).arrayBuffer());
      hasher.update(bytes);
      const partDigest = await crypto.subtle.digest('SHA-256', bytes);
      parts.push({
        partNumber,
        size: bytes.byteLength,
        checksumSha256: Array.from(new Uint8Array(partDigest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
      });
      self.postMessage({ type: 'progress', loaded: Math.min(offset + bytes.byteLength, file.size), total: file.size });
    }
    self.postMessage({ type: 'complete', sha256: hasher.hexDigest(), parts });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Hashing failed' });
  }
};
