import * as path from 'node:path';
import { promises as fs, constants as fs_constants } from 'node:fs';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as cache from '@actions/cache';
import * as common from './common.ts';
import { parseSizeLimitBytes } from './cache-size.ts';
import { errMessage } from './util.ts';

async function main(): Promise<void> {
  try {
    if (!core.getBooleanInput('use-cache')) return;

    const cache_path = common.getZigCachePath();

    let accessible = true;
    try {
      await fs.access(cache_path, fs_constants.R_OK);
    } catch {
      accessible = false;
    }

    if (!accessible) {
      core.info('Zig cache directory is inaccessible; nothing to save');
      return;
    }

    core.info(`Checking size of cache directory at ${cache_path}`);
    const size = await dirSize(cache_path);
    const size_limit = parseSizeLimitBytes(core.getInput('cache-size-limit'));

    if (size_limit !== 0 && size > size_limit) {
      core.info(`Cache directory reached ${size} bytes, exceeding limit of ${size_limit} bytes; clearing cache`);
      // We can't programmatically delete the old cache entries, so save an empty
      // directory instead by clearing its contents before the save call.
      await rmDirContents(cache_path);
    } else {
      core.info(`Cache directory is ${size} bytes, within limit of ${size_limit || 'unlimited'} bytes; keeping intact`);
    }

    const prefix = await common.getCachePrefix();
    const name = `${prefix}${github.context.runId}-${github.context.runAttempt}`;
    core.info(`Saving Zig cache with key '${name}'`);
    await cache.saveCache([cache_path], name);
  } catch (err) {
    core.setFailed(errMessage(err));
  }
}

async function dirSize(dir_path: string): Promise<number> {
  try {
    let total = 0;
    for (const ent of await fs.readdir(dir_path, { withFileTypes: true, recursive: true })) {
      if (ent.isFile()) {
        const p = path.join(ent.parentPath, ent.name);
        try {
          const stat = await fs.stat(p);
          total += stat.size;
        } catch (err) {
          core.warning(`Failed to stat ${p}: ${err}`);
        }
      }
    }
    return total;
  } catch (err) {
    core.warning(`Failed to compute size of '${dir_path}': ${err}`);
    return 0;
  }
}

async function rmDirContents(dir: string): Promise<void> {
  const entries = await fs.readdir(dir);
  await Promise.all(entries.map(e => fs.rm(path.join(dir, e), { recursive: true, force: true })));
}

void main();
