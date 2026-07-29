/**
 * Minimal AWS Signature Version 4 signer — one operation, S3 PUT object.
 *
 * WHY HAND-ROLLED: this repo has 9 production dependencies. `@aws-sdk/client-s3` pulls
 * ~40 packages for a single HTTP PUT, and its signing is buried behind middleware that
 * can't be unit-tested. This is ~60 lines of node:crypto HMAC over a documented string
 * format, it is a PURE function of (request, credentials, clock), and it is verified
 * against AWS's own published test vectors in tests/awsSigV4.test.js.
 *
 * Scope is deliberately narrow: single-chunk PUT with a precomputed body hash, no
 * multipart, no presigned URLs, no STS session tokens. Widen it only with test vectors.
 *
 * Reference: docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
 * @module awsSigV4
 */

import crypto from 'crypto';

const ALGORITHM = 'AWS4-HMAC-SHA256';
const SERVICE = 's3';

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/**
 * RFC 3986 encoding for a single path segment.
 * encodeURIComponent leaves !'()* alone; AWS requires them percent-encoded, and a
 * mismatch here produces a valid-looking request that fails with SignatureDoesNotMatch.
 */
export function uriEncodeSegment(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, c =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Encode an S3 object key:each segment encoded, slashes preserved as separators. */
export function encodeS3Key(key) {
  return String(key).split('/').map(uriEncodeSegment).join('/');
}

/** ISO8601 basic format AWS expects: 20260730T014500Z (and the YYYYMMDD date stamp). */
export function amzDates(now = Date.now()) {
  const iso = new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/**
 * Derive the scoped signing key. Each step narrows the key by date → region → service →
 * request type, which is what makes a leaked signature useless outside its scope.
 */
export function signingKey(secretAccessKey, dateStamp, region) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

/**
 * Sign an S3 PUT. Returns the URL and headers to hand straight to fetch().
 *
 * @param {Object} opts
 * @param {string} opts.bucket @param {string} opts.region @param {string} opts.key
 * @param {Buffer|string} opts.body
 * @param {string} opts.accessKeyId @param {string} opts.secretAccessKey
 * @param {string} [opts.contentType]
 * @param {number} [opts.now] - injectable clock (tests / vectors)
 * @returns {{url: string, headers: Object}} — NEVER contains the secret key
 */
export function signS3Put({ bucket, region, key, body, accessKeyId, secretAccessKey,
                            contentType = 'application/x-ndjson', now = Date.now() }) {
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const canonicalUri = `/${encodeS3Key(key)}`;
  const payloadHash = sha256Hex(body);
  const { amzDate, dateStamp } = amzDates(now);

  // Canonical headers must be lowercase, trimmed, and sorted by name.
  const headers = {
    'content-type': contentType,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort()
    .map(h => `${h}:${String(headers[h]).trim()}\n`).join('');

  const canonicalRequest = [
    'PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash
  ].join('\n');

  const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = crypto.createHmac('sha256', signingKey(secretAccessKey, dateStamp, region))
    .update(stringToSign).digest('hex');

  return {
    url: `https://${host}${canonicalUri}`,
    headers: {
      ...headers,
      Authorization: `${ALGORITHM} Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    },
    // Exposed for tests/debugging only — deliberately NOT the secret or the derived key.
    _canonicalRequest: canonicalRequest,
    _stringToSign: stringToSign
  };
}

/**
 * PUT an object. Throws on non-2xx with the S3 error body (which is XML and genuinely
 * useful — AccessDenied vs NoSuchBucket vs SignatureDoesNotMatch are different fixes).
 */
export async function putObject(opts) {
  const { url, headers } = signS3Put(opts);
  const response = await fetch(url, { method: 'PUT', headers, body: opts.body });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`S3 PUT ${response.status}: ${detail}`);
  }
  return { url, status: response.status };
}
