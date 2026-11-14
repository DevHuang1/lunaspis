/**
 * ============================================================================
 * INTERFELLAS ZERO-DEPENDENCY S3-COMPATIBLE STORAGE ENGINE
 * ============================================================================
 * Implements Amazon AWS Signature Version 4 (SigV4) using Node.js built-in
 * crypto and fetch modules (no external npm dependencies required).
 * Fully compatible with Railway Object Storage Buckets (Tigris), AWS S3,
 * Cloudflare R2, MinIO, and other S3-compatible providers.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

class StorageEngine {
  constructor() {
    this.endpoint = (process.env.AWS_ENDPOINT_URL || "https://t3.storageapi.dev").replace(/\/+$/, "");
    this.bucket = process.env.AWS_S3_BUCKET_NAME || "";
    this.region = process.env.AWS_DEFAULT_REGION || "auto";
    this.accessKey = process.env.AWS_ACCESS_KEY_ID || "";
    this.secretKey = process.env.AWS_SECRET_ACCESS_KEY || "";
  }

  isConfigured() {
    return !!(this.bucket && this.accessKey && this.secretKey);
  }

  _hmac(key, string) {
    return crypto.createHmac("sha256", key).update(string, "utf8").digest();
  }

  _hash(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  _getSigningKey(dateStamp) {
    const kDate = this._hmac("AWS4" + this.secretKey, dateStamp);
    const kRegion = this._hmac(kDate, this.region);
    const kService = this._hmac(kRegion, "s3");
    return this._hmac(kService, "aws4_request");
  }

  _buildRequest(method, objectKey, payloadBuffer = Buffer.alloc(0), contentType = null) {
    const cleanKey = objectKey.replace(/^\/+/, "");
    const parsedEndpoint = new URL(this.endpoint);
    
    // Virtual host style: <bucket>.<endpoint_host>
    // If endpoint already contains bucket or IP, fallback to path-style
    let host = `${this.bucket}.${parsedEndpoint.host}`;
    let canonicalUri = `/${cleanKey}`;
    let requestUrl = `${parsedEndpoint.protocol}//${host}${canonicalUri}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8); // YYYYMMDD
    const payloadHash = this._hash(payloadBuffer);

    const headers = {
      "host": host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    };

    if (contentType) {
      headers["content-type"] = contentType;
    }

    // Canonical Headers (sorted alphabetically)
    const headerKeys = Object.keys(headers).sort();
    const canonicalHeaders = headerKeys.map((k) => `${k}:${headers[k]}\n`).join("");
    const signedHeaders = headerKeys.join(";");

    const canonicalRequest = [
      method.toUpperCase(),
      canonicalUri,
      "", // Query string
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join("\n");

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      this._hash(canonicalRequest)
    ].join("\n");

    const signingKey = this._getSigningKey(dateStamp);
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

    headers["Authorization"] = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      url: requestUrl,
      headers
    };
  }

  /**
   * Checks if an object exists in the S3 bucket using HTTP HEAD.
   */
  async hasObject(objectKey) {
    if (!this.isConfigured()) return false;

    try {
      const { url, headers } = this._buildRequest("HEAD", objectKey);
      const res = await fetch(url, { method: "HEAD", headers });
      return res.status === 200;
    } catch (err) {
      return false;
    }
  }

  /**
   * Downloads an object from the S3 bucket.
   * Returns a Node.js ReadableStream, or null if 404 / not found.
   */
  async getObject(objectKey) {
    if (!this.isConfigured()) return null;

    try {
      const { url, headers } = this._buildRequest("GET", objectKey);
      const res = await fetch(url, { method: "GET", headers });

      if (res.status === 404) return null;
      if (!res.ok) {
        console.warn(`[STORAGE] S3 GET ${objectKey} failed with HTTP ${res.status}`);
        return null;
      }

      return {
        body: res.body,
        contentType: res.headers.get("content-type") || "model/gltf-binary",
        contentLength: res.headers.get("content-length")
      };
    } catch (err) {
      console.warn(`[STORAGE] S3 GET error for ${objectKey}:`, err.message);
      return null;
    }
  }

  /**
   * Uploads an object buffer to the S3 bucket.
   */
  async putObject(objectKey, buffer, contentType = "application/octet-stream") {
    if (!this.isConfigured()) {
      throw new Error("Railway Object Storage credentials not configured.");
    }

    const { url, headers } = this._buildRequest("PUT", objectKey, buffer, contentType);
    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: buffer
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`S3 PUT ${objectKey} failed HTTP ${res.status}: ${errText}`);
    }

    return true;
  }
}

module.exports = new StorageEngine();
