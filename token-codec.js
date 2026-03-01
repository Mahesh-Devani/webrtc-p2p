/**
 * token-codec.js — Encode / decode signaling tokens.
 *
 * Tokens are base64url‑encoded JSON payloads containing:
 *   { type, sdp, candidates[], ts, v }
 *
 * "v" is a codec version for forward compatibility.
 */

'use strict';

export const TokenCodec = (() => {
  const VERSION = 2; // version 2 indicates compression is used
  const PREFIX = 'P2P2-'; // human‑recognisable prefix

  /**
   * Encode an object into a shareable token string.
   * @param {'offer'|'answer'|'ice'} type
   * @param {RTCSessionDescription|null} sdp
   * @param {RTCIceCandidate[]} candidates
   * @returns {Promise<string>}
   */
  async function encode(type, sdp, candidates = []) {
    const payload = {
      v: VERSION,
      t: type,
      ts: Date.now(),
      s: sdp ? { type: sdp.type, sdp: sdp.sdp } : null,
      c: candidates.map(c => c.candidate),
    };

    // Convert JSON to stream
    const jsonString = JSON.stringify(payload);
    const textEncoder = new TextEncoder();
    const uncompressedData = textEncoder.encode(jsonString);

    // Compress using pako (global via CDN) with max compression level
    let compressedBytes;
    try {
      compressedBytes = pako.deflate(uncompressedData, { level: 9 });
    } catch (err) {
      throw new Error(`Compression failed: ${err.message}`);
    }

    const binary = String.fromCharCode.apply(null, compressedBytes);
    const b64 = btoa(binary);
    // base64url: replace +/ with -_ and strip padding
    const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return PREFIX + b64url;
  }

  /**
   * Decode a token string back into its payload.
   * @param {string} token
   * @returns {Promise<{ type: string, sdp: RTCSessionDescriptionInit|null, candidates: RTCIceCandidateInit[], ts: number }>}
   * @throws {Error} on invalid input
   */
  async function decode(token) {
    if (typeof token !== 'string') throw new Error('Token must be a string.');
    token = token.trim();
    if (!token.startsWith(PREFIX)) {
      // Fallback for v1 tokens
      if (token.startsWith('P2P1-')) {
        return decodeV1(token);
      }
      throw new Error('Invalid token format — missing prefix.');
    }

    let b64url = token.slice(PREFIX.length);
    // restore base64 from base64url
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';

    let compressedBytes;
    try {
      const binaryStr = atob(b64);
      compressedBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        compressedBytes[i] = binaryStr.charCodeAt(i);
      }
    } catch {
      throw new Error('Token decoding failed — corrupted data.');
    }

    // Decompress using pako
    let jsonString;
    try {
      const decompressedBytes = pako.inflate(compressedBytes);
      const textDecoder = new TextDecoder();
      jsonString = textDecoder.decode(decompressedBytes);
    } catch (e) {
      throw new Error('Decompression failed. Ensure pako is loaded.');
    }

    let payload;
    try {
      payload = JSON.parse(jsonString);
    } catch {
      throw new Error('Token contains invalid JSON.');
    }

    if (payload.v !== VERSION) {
      throw new Error(`Unsupported token version (got ${payload.v}, expected ${VERSION}).`);
    }
    if (!['offer', 'answer', 'ice'].includes(payload.t)) {
      throw new Error(`Unknown token type: "${payload.t}".`);
    }
    return {
      type: payload.t,
      sdp: payload.s,
      candidates: Array.isArray(payload.c)
        ? payload.c.map(c => typeof c === 'string'
          ? { candidate: c, sdpMid: '0', sdpMLineIndex: 0 }
          : c // Backwards-compatible with old tokens that stored full objects
        )
        : [],
      ts: payload.ts,
    };
  }

  function decodeV1(token) {
    const PREFIX1 = 'P2P1-';
    let b64url = token.slice(PREFIX1.length);
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    let json;
    try {
      json = decodeURIComponent(escape(atob(b64)));
    } catch {
      throw new Error('Token decoding failed — corrupted data.');
    }
    let payload;
    try {
      payload = JSON.parse(json);
    } catch {
      throw new Error('Token contains invalid JSON.');
    }
    return {
      type: payload.t,
      sdp: payload.s,
      candidates: Array.isArray(payload.c) ? payload.c : [],
      ts: payload.ts,
    };
  }

  return { encode, decode };
})();
