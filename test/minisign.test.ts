import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { parseKey, parseSignature, verifySignature } from '../src/minisign.ts';

interface Fixture {
  pubkey_b64: string;
  sig_buf: Buffer;
  trusted_comment_text: string;
}

// Build a fake minisign keypair + signature blob for the prehashed ("ED") variant.
function makeFixture(
  file_bytes: Buffer,
  opts: { mutateTrustedComment?: boolean } = {},
): Fixture {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  // Raw 32-byte public key (strip DER prefix).
  const raw_pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);

  const algo = Buffer.from('ED');
  const key_id = crypto.randomBytes(8);
  const pubkey_blob = Buffer.concat([algo, key_id, raw_pub]);
  const pubkey_b64 = pubkey_blob.toString('base64');

  // signature = Ed25519(BLAKE2b512(file))
  const file_hash = crypto.createHash('BLAKE2b512').update(file_bytes).digest();
  const signature = crypto.sign(null, file_hash, privateKey);
  assert.equal(signature.length, 64);

  const sig_info = Buffer.concat([algo, key_id, signature]);

  const trusted_comment_text = 'timestamp:1700000000 file:test-tarball hashed';
  const trusted_comment_buf = Buffer.from(trusted_comment_text);

  const global_signed = Buffer.concat([signature, trusted_comment_buf]);
  const global_sig = crypto.sign(null, global_signed, privateKey);

  const final_trusted = opts.mutateTrustedComment ? 'tampered comment' : trusted_comment_text;
  const sig_text =
    `untrusted comment: signature from test\n` +
    sig_info.toString('base64') + '\n' +
    `trusted comment: ${final_trusted}\n` +
    global_sig.toString('base64') + '\n';

  return { pubkey_b64, sig_buf: Buffer.from(sig_text), trusted_comment_text };
}

test('roundtrip: parse + verify a valid signature', async () => {
  const file_bytes = Buffer.from('hello zig world');
  const fx = makeFixture(file_bytes);

  const key = await parseKey(fx.pubkey_b64);
  const sig = parseSignature(fx.sig_buf);

  assert.equal(sig.trusted_comment.toString(), fx.trusted_comment_text);

  assert.equal(await verifySignature(key, sig, file_bytes), true);
});

test('verify fails on file mutation', async () => {
  const file_bytes = Buffer.from('hello zig world');
  const fx = makeFixture(file_bytes);

  const key = await parseKey(fx.pubkey_b64);
  const sig = parseSignature(fx.sig_buf);

  const tampered = Buffer.from('hello rust world');
  assert.equal(await verifySignature(key, sig, tampered), false);
});

test('verify fails on trusted-comment mutation', async () => {
  const file_bytes = Buffer.from('hello zig world');
  const fx = makeFixture(file_bytes, { mutateTrustedComment: true });

  const key = await parseKey(fx.pubkey_b64);
  const sig = parseSignature(fx.sig_buf);

  assert.equal(await verifySignature(key, sig, file_bytes), false);
});

test('parseKey rejects malformed key', async () => {
  await assert.rejects(parseKey('AAAA'), /invalid public key/);
});

test('parseSignature rejects missing untrusted header', () => {
  assert.throws(
    () => parseSignature(Buffer.from('garbage\n')),
    /bad untrusted comment header/,
  );
});
