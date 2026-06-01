import test from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { downloadToTempFile } from '../src/download.ts';
import { TransientError } from '../src/retry.ts';

// The downloader uses RUNNER_TEMP for the destination directory. Tests do
// not run inside an Actions runner, so we point it at the OS temp dir.
process.env['RUNNER_TEMP'] = os.tmpdir();

interface ServerHandle {
  url: string;
  close: () => Promise<void>;
}

function startServer(handler: http.RequestListener): Promise<ServerHandle> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('no address');
      const url = `http://127.0.0.1:${addr.port}`;
      resolve({
        url,
        close: () => new Promise(r => server.close(() => r())),
      });
    });
  });
}

test('downloadToTempFile: streams a body to a fresh file', async () => {
  const payload = Buffer.from('hello zig\n'.repeat(1000));
  const server = await startServer((_req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.end(payload);
  });
  try {
    const dest = await downloadToTempFile({ url: server.url });
    const got = await fs.readFile(dest);
    assert.equal(got.equals(payload), true);
    await fs.unlink(dest);
  } finally {
    await server.close();
  }
});

test('downloadToTempFile: 5xx raises TransientError', async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 503;
    res.end('busy');
  });
  try {
    await assert.rejects(
      downloadToTempFile({ url: server.url }),
      (err: unknown) => err instanceof TransientError && /503/.test((err as Error).message),
    );
  } finally {
    await server.close();
  }
});

test('downloadToTempFile: 4xx raises a non-transient Error', async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 404;
    res.end('nope');
  });
  try {
    await assert.rejects(
      downloadToTempFile({ url: server.url }),
      (err: unknown) => err instanceof Error && !(err instanceof TransientError) && /404/.test(err.message),
    );
  } finally {
    await server.close();
  }
});

test('downloadToTempFile: AbortSignal cancellation removes partial file', async () => {
  // Server that drips one chunk then hangs forever.
  const server = await startServer(async (_req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.write(Buffer.alloc(1024, 'x'));
    // never .end() — let the abort tear it down
  });
  try {
    const controller = new AbortController();
    const downloadPromise = downloadToTempFile({
      url: server.url,
      signal: controller.signal,
      timeoutMs: 5000,
    });
    // Let the response start, then abort.
    await delay(50);
    controller.abort();

    await assert.rejects(downloadPromise);

    // No `setup-zig-*` files should be left behind. We don't know the exact
    // basename (random), so check that no recent ones exist for this test.
    const entries = await fs.readdir(os.tmpdir());
    const orphans = entries.filter(e => e.startsWith('setup-zig-'));
    for (const o of orphans) {
      const p = `${os.tmpdir()}/${o}`;
      const stat = await fs.stat(p).catch(() => null);
      // If the cleanup happened, the file is gone. Tolerate other unrelated
      // stragglers older than this test run.
      if (stat && Date.now() - stat.mtimeMs < 5000) {
        throw new Error(`partial file not cleaned up: ${p}`);
      }
    }
  } finally {
    await server.close();
  }
});

test('downloadToTempFile: timeout fires when server never responds', async () => {
  const server = await startServer(() => {
    // never respond
  });
  try {
    await assert.rejects(
      downloadToTempFile({ url: server.url, timeoutMs: 100 }),
    );
  } finally {
    await server.close();
  }
});
