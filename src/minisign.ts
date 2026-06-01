import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { pipeline } from 'node:stream/promises';

export interface ParsedKey {
  id: Buffer;
  key: crypto.webcrypto.CryptoKey;
}

export interface ParsedSignature {
  algorithm: Buffer;
  key_id: Buffer;
  signature: Buffer;
  trusted_comment: Buffer;
  global_signature: Buffer;
}

export async function parseKey(key_str: string): Promise<ParsedKey> {
  const key_info = Buffer.from(key_str, 'base64');
  const id = key_info.subarray(2, 10);
  const key = key_info.subarray(10);
  if (key.byteLength !== 32) {
    throw new Error('invalid public key given');
  }
  return {
    id,
    key: await crypto.subtle.importKey('raw', key, 'Ed25519', false, ['verify']),
  };
}

export function parseSignature(sig_buf: Buffer): ParsedSignature {
  const untrusted_header = Buffer.from('untrusted comment: ');
  const trusted_header = Buffer.from('trusted comment: ');

  if (!sig_buf.subarray(0, untrusted_header.byteLength).equals(untrusted_header)) {
    throw new Error('invalid minisign signature: bad untrusted comment header');
  }
  sig_buf = sig_buf.subarray(untrusted_header.byteLength);

  let nl = sig_buf.indexOf('\n');
  if (nl === -1) throw new Error('invalid minisign signature: truncated untrusted comment');
  sig_buf = sig_buf.subarray(nl + 1);

  nl = sig_buf.indexOf('\n');
  if (nl === -1) throw new Error('invalid minisign signature: truncated signature info');
  const sig_info = Buffer.from(sig_buf.subarray(0, nl).toString(), 'base64');
  sig_buf = sig_buf.subarray(nl + 1);

  const algorithm = sig_info.subarray(0, 2);
  const key_id = sig_info.subarray(2, 10);
  const signature = sig_info.subarray(10);

  if (!sig_buf.subarray(0, trusted_header.byteLength).equals(trusted_header)) {
    throw new Error('invalid minisign signature: bad trusted comment header');
  }
  sig_buf = sig_buf.subarray(trusted_header.byteLength);

  nl = sig_buf.indexOf('\n');
  if (nl === -1) throw new Error('invalid minisign signature: truncated trusted comment');
  const trusted_comment = sig_buf.subarray(0, nl);
  sig_buf = sig_buf.subarray(nl + 1);

  let global_sig_end = sig_buf.indexOf('\n');
  if (global_sig_end === -1) global_sig_end = sig_buf.length;
  const global_sig = Buffer.from(sig_buf.subarray(0, global_sig_end).toString(), 'base64');
  sig_buf = sig_buf.subarray(Math.min(global_sig_end + 1, sig_buf.length));

  while (sig_buf.length && (sig_buf[0] === 0x0a || sig_buf[0] === 0x0d || sig_buf[0] === 0x20)) {
    sig_buf = sig_buf.subarray(1);
  }
  if (sig_buf.length !== 0) {
    throw new Error('invalid minisign signature: trailing bytes');
  }

  return { algorithm, key_id, signature, trusted_comment, global_signature: global_sig };
}

export async function verifySignatureStream(
  pubkey: ParsedKey,
  signature: ParsedSignature,
  tarball_path: string,
): Promise<boolean> {
  if (!signature.key_id.equals(pubkey.id)) return false;

  let signed_content: Buffer;
  if (signature.algorithm.equals(Buffer.from('ED'))) {
    const hash = crypto.createHash('BLAKE2b512');
    await pipeline(fs.createReadStream(tarball_path), hash);
    signed_content = hash.digest();
  } else if (signature.algorithm.equals(Buffer.from('Ed'))) {
    signed_content = await fs.promises.readFile(tarball_path);
  } else {
    return false;
  }

  if (!await crypto.subtle.verify('Ed25519', pubkey.key, signature.signature, signed_content)) {
    return false;
  }

  const global_signed = Buffer.concat([signature.signature, signature.trusted_comment]);
  return await crypto.subtle.verify('Ed25519', pubkey.key, signature.global_signature, global_signed);
}

// In-memory verification, kept for tests against small fixtures.
export async function verifySignature(
  pubkey: ParsedKey,
  signature: ParsedSignature,
  file_content: Buffer,
): Promise<boolean> {
  if (!signature.key_id.equals(pubkey.id)) return false;

  let signed_content: Buffer;
  if (signature.algorithm.equals(Buffer.from('ED'))) {
    const hash = crypto.createHash('BLAKE2b512');
    hash.update(file_content);
    signed_content = hash.digest();
  } else if (signature.algorithm.equals(Buffer.from('Ed'))) {
    signed_content = file_content;
  } else {
    return false;
  }

  if (!await crypto.subtle.verify('Ed25519', pubkey.key, signature.signature, signed_content)) {
    return false;
  }

  const global_signed = Buffer.concat([signature.signature, signature.trusted_comment]);
  return await crypto.subtle.verify('Ed25519', pubkey.key, signature.global_signature, global_signed);
}
