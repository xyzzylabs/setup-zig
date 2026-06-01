import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as cache from '@actions/cache';
import * as exec from '@actions/exec';
import * as common from './common.ts';
import * as minisign from './minisign.ts';
import { raceThenFallback, AllAttemptsFailedError } from './race.ts';
import { withRetry, TransientError } from './retry.ts';
import { withSource } from './source-tag.ts';
import { errMessage, requireEnv } from './util.ts';
import pkg from '../package.json' with { type: 'json' };

const MINISIGN_KEY = 'RWSGOq2NVecA2UPNdBUZykf1CCb147pkmdtYxgb3Ti+JO/wCYvhbAb/U';
const CANONICAL_DEV = 'https://ziglang.org/builds';
const CANONICAL_RELEASE = 'https://ziglang.org/download';

const MIRRORS_URL = 'https://ziglang.org/download/community-mirrors.txt';
const MIRRORS_LIST_CACHE_KEY = `setup-zig-mirrors-${pkg.version}`;
const MIRRORS_LIST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MIRROR_TIMEOUT_MS = 30_000;
const MIRROR_LIST_TIMEOUT_MS = 5_000;
const MIRROR_RACE_SIZE = 3;
const SOURCE_TAG = `setup-zig/${pkg.version}`;

interface MirrorAttempt {
  mirror: string;
  ms: number;
  status: string;
}

interface DownloadResult {
  tarball_path: string;
  mirror_used: string;
}

async function downloadFromMirror(mirror: string, tarball_filename: string): Promise<string> {
  // Retry only the fetch leg once on transient failures (5xx, abort, network
  // resets). Signature/verification failures are deterministic and never retried.
  const tarball_url = withSource(`${mirror}/${tarball_filename}`, SOURCE_TAG);
  const sig_url = withSource(`${mirror}/${tarball_filename}.minisig`, SOURCE_TAG);

  const { tarball_path, sig_data } = await withRetry(async () => {
    const path = await tc.downloadTool(tarball_url);
    const resp = await fetch(sig_url, { signal: AbortSignal.timeout(MIRROR_TIMEOUT_MS) });
    if (!resp.ok) {
      throw new TransientError(`signature fetch failed (HTTP ${resp.status}) for '${sig_url}'`);
    }
    return { tarball_path: path, sig_data: Buffer.from(await resp.arrayBuffer()) };
  });

  const key = await minisign.parseKey(MINISIGN_KEY);
  const signature = minisign.parseSignature(sig_data);
  if (!await minisign.verifySignatureStream(key, signature, tarball_path)) {
    throw new Error(`signature verification failed for '${mirror}/${tarball_filename}'`);
  }

  const match = /^timestamp:\d+\s+file:([^\s]+)\s+hashed$/.exec(signature.trusted_comment.toString());
  if (match === null || match[1] !== tarball_filename) {
    throw new Error(`filename verification failed for '${mirror}/${tarball_filename}'`);
  }

  await fs.writeFile(`${tarball_path}.minisig`, sig_data);
  return tarball_path;
}

async function verifyCachedTarball(tarball_path: string): Promise<boolean> {
  const sig_path = `${tarball_path}.minisig`;
  let sig_data: Buffer;
  try {
    sig_data = await fs.readFile(sig_path);
  } catch {
    core.warning(`Cached tarball at ${tarball_path} has no .minisig sidecar; re-downloading`);
    return false;
  }
  const key = await minisign.parseKey(MINISIGN_KEY);
  let signature: minisign.ParsedSignature;
  try {
    signature = minisign.parseSignature(sig_data);
  } catch (err) {
    const msg = errMessage(err);
    core.warning(`Cached signature is malformed: ${msg}; re-downloading`);
    return false;
  }
  return await minisign.verifySignatureStream(key, signature, tarball_path);
}

function rejectOfficialMirrorOverride(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return;
  }
  if (parsed.host.toLowerCase() === 'ziglang.org') {
    throw new Error("'https://ziglang.org' cannot be used as mirror override; see README.md");
  }
}

async function loadFallbackMirrors(): Promise<string[]> {
  const file = path.join(import.meta.dirname, '..', 'data', 'fallback-mirrors.json');
  const text = await fs.readFile(file, 'utf8');
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || !parsed.every((s): s is string => typeof s === 'string')) {
    throw new Error(`Malformed ${file}: expected an array of strings`);
  }
  return parsed;
}

async function fetchMirrorList(): Promise<string[]> {
  const cache_path = path.join(process.env['RUNNER_TEMP'] || os.tmpdir(), 'setup-zig-mirrors.txt');
  try {
    if (await cache.restoreCache([cache_path], MIRRORS_LIST_CACHE_KEY)) {
      const stat = await fs.stat(cache_path);
      if (Date.now() - stat.mtimeMs < MIRRORS_LIST_CACHE_TTL_MS) {
        const list = (await fs.readFile(cache_path, 'utf8')).split('\n').filter(Boolean);
        if (list.length) {
          core.info(`Using cached mirror list (${list.length} entries)`);
          return list;
        }
      }
    }
  } catch (err) {
    const msg = errMessage(err);
    core.info(`Mirror list cache miss: ${msg}`);
  }

  try {
    const resp = await fetch(MIRRORS_URL, { signal: AbortSignal.timeout(MIRROR_LIST_TIMEOUT_MS) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const list = text.split('\n').map(s => s.trim()).filter(Boolean);
    if (!list.length) throw new Error('mirror list response was empty');
    await fs.writeFile(cache_path, list.join('\n'));
    try {
      await cache.saveCache([cache_path], MIRRORS_LIST_CACHE_KEY);
    } catch (err) {
      const msg = errMessage(err);
      core.info(`Could not save mirror list cache: ${msg}`);
    }
    return list;
  } catch (err) {
    const msg = errMessage(err);
    core.warning(`Failed to fetch mirror list (${msg}); using bundled fallback`);
    return await loadFallbackMirrors();
  }
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}

async function downloadTarball(tarball_filename: string, attempt_log: MirrorAttempt[]): Promise<DownloadResult> {
  const preferred_mirror = core.getInput('mirror');
  if (preferred_mirror) {
    rejectOfficialMirrorOverride(preferred_mirror);
    core.info(`Using mirror override: ${preferred_mirror}`);
    const t0 = Date.now();
    try {
      const tarball_path = await downloadFromMirror(preferred_mirror, tarball_filename);
      attempt_log.push({ mirror: preferred_mirror, ms: Date.now() - t0, status: 'ok' });
      return { tarball_path, mirror_used: preferred_mirror };
    } catch (err) {
      const msg = errMessage(err);
      attempt_log.push({ mirror: preferred_mirror, ms: Date.now() - t0, status: `fail: ${msg}` });
      throw err;
    }
  }

  const mirrors = shuffleInPlace(await fetchMirrorList());
  core.info(`Available mirrors (${mirrors.length}): ${mirrors.join(', ')}`);

  const race_log: { item: string; ms: number; status: string }[] = [];
  try {
    const { winner } = await raceThenFallback(
      mirrors,
      MIRROR_RACE_SIZE,
      async (mirror) => {
        const tarball_path = await downloadFromMirror(mirror, tarball_filename);
        return { tarball_path, mirror_used: mirror };
      },
      race_log,
    );
    pushOutcomesToAttemptLog(race_log, attempt_log);
    return winner;
  } catch (err) {
    pushOutcomesToAttemptLog(race_log, attempt_log);
    if (!(err instanceof AllAttemptsFailedError)) throw err;
  }

  // Last resort: official site.
  const version_match = /\d+\.\d+\.\d+(-dev\.\d+\+[0-9a-f]+)?/.exec(tarball_filename);
  if (!version_match) {
    throw new AllAttemptsFailedError(`could not extract version from '${tarball_filename}'`);
  }
  const zig_version = version_match[0];
  const canonical = zig_version.includes('-dev') ? CANONICAL_DEV : `${CANONICAL_RELEASE}/${zig_version}`;
  core.info(`Attempting official: ${canonical}`);
  const t0 = Date.now();
  const tarball_path = await downloadFromMirror(canonical, tarball_filename);
  attempt_log.push({ mirror: canonical, ms: Date.now() - t0, status: 'ok' });
  return { tarball_path, mirror_used: canonical };
}

function pushOutcomesToAttemptLog(
  outcomes: { item: string; ms: number; status: string }[],
  attempt_log: MirrorAttempt[],
): void {
  for (const o of outcomes) {
    attempt_log.push({ mirror: o.item, ms: o.ms, status: o.status });
  }
}

async function retrieveTarball(
  tarball_name: string,
  tarball_ext: string,
  attempt_log: MirrorAttempt[],
): Promise<DownloadResult> {
  const cache_key = `setup-zig-tarball-${tarball_name}`;
  const tarball_basename = `${tarball_name}${tarball_ext}`;
  const tarball_cache_path = path.join(requireEnv('RUNNER_TEMP'), tarball_basename);
  const sig_cache_path = `${tarball_cache_path}.minisig`;

  if (await cache.restoreCache([tarball_cache_path, sig_cache_path], cache_key)) {
    if (await verifyCachedTarball(tarball_cache_path)) {
      core.info('Cache hit and signature verified');
      return { tarball_path: tarball_cache_path, mirror_used: 'cache' };
    }
    core.warning('Cached tarball failed signature verification; re-downloading');
    try { await fs.unlink(tarball_cache_path); } catch { /* ignore */ }
    try { await fs.unlink(sig_cache_path); } catch { /* ignore */ }
  }

  core.info(`Cache miss. Fetching Zig ${await common.getVersion()}`);
  const { tarball_path, mirror_used } = await downloadTarball(tarball_basename, attempt_log);
  await fs.copyFile(tarball_path, tarball_cache_path);
  await fs.copyFile(`${tarball_path}.minisig`, sig_cache_path);
  await cache.saveCache([tarball_cache_path, sig_cache_path], cache_key);
  return { tarball_path: tarball_cache_path, mirror_used };
}

function resolveUseToolCache(raw: string): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === '') return process.env['RUNNER_ENVIRONMENT'] !== 'github-hosted';
  throw new Error("Invalid 'use-tool-cache' value. Valid values: 'true', 'false'");
}

async function writeMirrorSummary(
  attempt_log: MirrorAttempt[],
  mirror_used: string | null,
  resolved_version: string,
): Promise<void> {
  try {
    if (!attempt_log.length) return;
    const header: { data: string; header: true }[] = [
      { data: 'Mirror', header: true },
      { data: 'Result', header: true },
      { data: 'Duration', header: true },
    ];
    const rows: ({ data: string; header: true } | string)[][] = [header];
    for (const a of attempt_log) {
      const status = a.mirror === mirror_used ? 'OK (selected)' : a.status;
      rows.push([a.mirror, status, `${a.ms} ms`]);
    }
    await core.summary
      .addHeading(`setup-zig ${resolved_version}`, 3)
      .addTable(rows)
      .write();
  } catch (err) {
    const msg = errMessage(err);
    core.info(`Could not write summary: ${msg}`);
  }
}

async function main(): Promise<void> {
  const attempt_log: MirrorAttempt[] = [];
  let mirror_used: string | null = null;
  let cache_hit = false;
  try {
    const use_tool_cache = resolveUseToolCache(core.getInput('use-tool-cache'));
    core.info(`Using tool-cache: ${use_tool_cache}`);

    const resolved_version = await common.getVersion();
    core.setOutput('zig-version', resolved_version);

    let zig_dir: string | undefined;
    if (use_tool_cache) zig_dir = tc.find('zig', resolved_version);
    if (zig_dir) {
      cache_hit = true;
      mirror_used = 'tool-cache';
      core.info('Using cached Zig installation from tool-cache');
    } else {
      const tarball_name = await common.getTarballName();
      const tarball_ext = await common.getTarballExt();

      core.info(`Fetching ${tarball_name}${tarball_ext}`);
      const fetch_start = Date.now();
      const retrieved = await retrieveTarball(tarball_name, tarball_ext, attempt_log);
      mirror_used = retrieved.mirror_used;
      cache_hit = retrieved.mirror_used === 'cache';
      const tarball_path = retrieved.tarball_path;
      core.info(`Fetch took ${Date.now() - fetch_start} ms`);

      core.info(`Extracting tarball ${tarball_name}${tarball_ext}`);
      const extract_start = Date.now();
      const zig_parent_dir = tarball_ext === '.zip'
        ? await tc.extractZip(tarball_path)
        : await tc.extractTar(tarball_path, undefined, 'xJ');
      core.info(`Extract took ${Date.now() - extract_start} ms`);

      const zig_inner_dir = path.join(zig_parent_dir, tarball_name);
      zig_dir = use_tool_cache
        ? await tc.cacheDir(zig_inner_dir, 'zig', resolved_version)
        : zig_inner_dir;
    }

    core.addPath(zig_dir);
    await core.group('zig version', async () => {
      const out = (await exec.getExecOutput('zig', ['version'])).stdout.trim();
      core.info(`Resolved Zig version ${out}`);
    });

    const cache_path = common.getZigCachePath();
    core.exportVariable('ZIG_GLOBAL_CACHE_DIR', cache_path);
    core.exportVariable('ZIG_LOCAL_CACHE_DIR', cache_path);

    if (core.getBooleanInput('use-cache')) {
      const cache_prefix = await common.getCachePrefix();
      core.info(`Attempting restore of Zig cache with prefix '${cache_prefix}'`);
      const hit = await cache.restoreCache([cache_path], cache_prefix, [cache_prefix]);
      if (hit === undefined) {
        core.info(`Cache miss: leaving Zig cache directory at ${cache_path} unpopulated`);
      } else {
        core.info(`Cache hit (key '${hit}'): populating Zig cache directory at ${cache_path}`);
      }
    }

    core.setOutput('mirror-used', mirror_used ?? 'none');
    core.setOutput('cache-hit', String(cache_hit));
    await writeMirrorSummary(attempt_log, mirror_used, resolved_version);
  } catch (err) {
    core.setOutput('mirror-used', mirror_used ?? 'none');
    core.setOutput('cache-hit', String(cache_hit));
    const msg = errMessage(err);
    core.setFailed(msg);
  }
}

void main();
