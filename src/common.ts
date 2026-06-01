import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { parseTopLevelStruct } from './zon.ts';
import {
  parseZigVersionsIndex,
  parseMachVersionsIndex,
  lookupMachVersion,
} from './schema.ts';
import { errMessage, isErrnoException } from './util.ts';

const VERSIONS_JSON = 'https://ziglang.org/download/index.json';
const MACH_VERSIONS_JSON = 'https://pkg.machengine.org/zig/index.json';

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  dev: number | null;
}

let _cached_version: string | null = null;

export async function getVersion(): Promise<string> {
  if (_cached_version != null) return _cached_version;

  let raw = core.getInput('version');
  if (raw === '') {
    raw = await readVersionFromFile(core.getInput('zig-version-file'));
  }
  if (raw === '') {
    raw = await readVersionFromBuildZon();
  }
  if (raw === '') {
    raw = 'latest';
  }

  if (raw === 'master') {
    _cached_version = await getMasterVersion();
  } else if (raw === 'latest') {
    _cached_version = await getLatestVersion();
  } else if (raw.includes('mach')) {
    _cached_version = await getMachVersion(raw);
  } else {
    _cached_version = raw;
  }
  return _cached_version;
}

async function readVersionFromFile(file_path: string): Promise<string> {
  if (!file_path) return '';
  try {
    const contents = (await fs.promises.readFile(file_path, 'utf8')).trim();
    if (!contents) {
      core.warning(`'zig-version-file' ${file_path} is empty`);
      return '';
    }
    // Accept either a plain version string or a single-line `zig <version>` entry
    // as written by mise / asdf in `.tool-versions`.
    const tool_versions_match = /^\s*zig\s+([^\s#]+)/m.exec(contents);
    if (tool_versions_match && tool_versions_match[1]) return tool_versions_match[1];
    return contents.replace(/^["']|["']$/g, '');
  } catch (err) {
    throw new Error(`Failed to read 'zig-version-file' ${file_path}: ${errMessage(err)}`);
  }
}

async function readVersionFromBuildZon(): Promise<string> {
  try {
    const text = await fs.promises.readFile('build.zig.zon', 'utf8');
    const parsed = parseTopLevelStruct(text);
    if (parsed['mach_zig_version']) return await getMachVersion(parsed['mach_zig_version']);
    if (parsed['minimum_zig_version']) return parsed['minimum_zig_version'];
    core.info('Failed to find `mach_zig_version` or `minimum_zig_version` in build.zig.zon (using latest)');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return '';
    core.info(`Failed to read build.zig.zon (using latest): ${errMessage(err)}`);
  }
  return '';
}

async function getMachVersion(raw: string): Promise<string> {
  const json = await fetchJsonWithTimeout(MACH_VERSIONS_JSON, 8000);
  const map = parseMachVersionsIndex(json, MACH_VERSIONS_JSON);
  return lookupMachVersion(map, raw, MACH_VERSIONS_JSON);
}

async function getMasterVersion(): Promise<string> {
  const json = await fetchJsonWithTimeout(VERSIONS_JSON, 8000);
  return parseZigVersionsIndex(json, VERSIONS_JSON).master.version;
}

async function getLatestVersion(): Promise<string> {
  const json = await fetchJsonWithTimeout(VERSIONS_JSON, 8000);
  const index = parseZigVersionsIndex(json, VERSIONS_JSON);
  let latest: string | null = null;
  let latest_parts: [number, number, number] | null = null;
  for (const version of index.releases.keys()) {
    const parts = parseReleaseVersion(version);
    if (!parts) continue;
    if (!latest_parts || compareReleaseParts(parts, latest_parts) > 0) {
      latest = version;
      latest_parts = parts;
    }
  }
  if (!latest) {
    throw new Error(`No release versions found in ${VERSIONS_JSON}`);
  }
  return latest;
}

function parseReleaseVersion(s: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (!m) return null;
  const [, major, minor, patch] = m;
  if (major === undefined || minor === undefined || patch === undefined) return null;
  return [Number(major), Number(minor), Number(patch)];
}

function compareReleaseParts(a: [number, number, number], b: [number, number, number]): number {
  return (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
}

async function fetchJsonWithTimeout(url: string, timeout_ms: number): Promise<unknown> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeout_ms) });
  if (!resp.ok) {
    throw new Error(`Fetch ${url} failed: HTTP ${resp.status}`);
  }
  return await resp.json();
}

export async function getTarballName(): Promise<string> {
  const version = await getVersion();

  // Keys here are exactly the values Node's `os.arch()` can return. Note:
  // Node does not support mips64/mips64el at the runtime level, so those
  // Zig targets are deliberately absent.
  const arch_map: Partial<Record<NodeJS.Architecture, string>> = {
    arm: 'arm',
    arm64: 'aarch64',
    loong64: 'loongarch64',
    mips: 'mips',
    mipsel: 'mipsel',
    ppc64: 'powerpc64',
    riscv64: 'riscv64',
    s390x: 's390x',
    ia32: 'x86',
    x64: 'x86_64',
  };
  let arch = arch_map[os.arch()];
  if (!arch) {
    throw new Error(`Unsupported host arch '${os.arch()}'`);
  }

  // Node's build system drops the ppc64le-ness on its way to os.arch(); recover it.
  if (arch === 'powerpc64' && os.endianness() === 'LE') {
    arch = 'powerpc64le';
  }
  // Before 0.15.1, Zig used 'armv7a' as the arch name for ARM binaries.
  if (arch === 'arm' && versionLessThan(version, '0.15.1')) {
    arch = 'armv7a';
  }

  const platform_map: Partial<Record<NodeJS.Platform, string>> = {
    android: 'android',
    freebsd: 'freebsd',
    sunos: 'illumos',
    linux: 'linux',
    darwin: 'macos',
    netbsd: 'netbsd',
    openbsd: 'openbsd',
    win32: 'windows',
  };
  let platform = platform_map[os.platform()];
  if (!platform) {
    throw new Error(`Unsupported host platform '${os.platform()}'`);
  }

  const libc = core.getInput('libc');
  if (libc) {
    if (platform !== 'linux') {
      throw new Error(`'libc' input is only supported on Linux runners (current: ${platform})`);
    }
    if (libc !== 'glibc' && libc !== 'musl') {
      throw new Error(`Invalid 'libc' value '${libc}'; expected 'glibc' or 'musl'`);
    }
    if (libc === 'musl') platform = 'linux-musl';
  }

  if (versionLessThan(version, '0.15.0-dev.631+9a3540d61') && versionLessThan(version, '0.14.1')) {
    return `zig-${platform}-${arch}-${version}`;
  }
  return `zig-${arch}-${platform}-${version}`;
}

export function versionLessThan(cur_ver: string, min_ver: string): boolean {
  const cur = parseVersion(cur_ver);
  const min = parseVersion(min_ver);
  if (cur === null || min === null) return false;
  const cur_dev = cur.dev === null ? Infinity : cur.dev;
  const min_dev = min.dev === null ? Infinity : min.dev;

  if (cur.major !== min.major) return cur.major < min.major;
  if (cur.minor !== min.minor) return cur.minor < min.minor;
  if (cur.patch !== min.patch) return cur.patch < min.patch;
  return cur_dev < min_dev;
}

export function parseVersion(str: string): ParsedVersion | null {
  const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-dev\.(?<dev>\d+)\+[0-9a-f]*)?$/.exec(str);
  if (match === null || !match.groups) return null;
  const { major, minor, patch, dev } = match.groups;
  // Required groups are populated whenever the regex matches; the explicit
  // checks just satisfy noUncheckedIndexedAccess without an unsafe `!`.
  if (major === undefined || minor === undefined || patch === undefined) return null;
  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10),
    dev: dev === undefined ? null : parseInt(dev, 10),
  };
}

export async function getTarballExt(): Promise<string> {
  return os.platform() === 'win32' ? '.zip' : '.tar.xz';
}

export async function getCachePrefix(): Promise<string> {
  const tarball_name = await getTarballName();
  // Include workflow name as well as job id. In reusable workflows the callee
  // only sees its own job id, so adding the workflow file keeps two distinct
  // callers of the same reusable workflow on separate cache scopes.
  const workflow = (github.context.workflow || '').replaceAll(/[^\w]/g, '_');
  const job = (github.context.job || '').replaceAll(/[^\w]/g, '_');
  const user_key = core.getInput('cache-key');
  return `setup-zig-cache-v1-${workflow}-${job}-${tarball_name}-${user_key}-`;
}

export function getZigCachePath(): string {
  return path.join(process.env['GITHUB_WORKSPACE'] ?? process.cwd(), '.zig-cache');
}

export function resetVersionCacheForTests(): void {
  _cached_version = null;
}
