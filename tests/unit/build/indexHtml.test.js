// tests/unit/build/indexHtml.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The page of the web app names its encoding and its mode itself. A server
 * that sends JavaScript without a charset (nginx as in the Dockerfile, a file
 * opened from disk) otherwise decodes the bundle as windows-1252, and a regular
 * expression with Unicode ranges in it stops the app with a blank page
 * (found 2026-11-09 by opening the web app of the published package).
 */
const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'index.html'), 'utf8');

describe('app/index.html', () => {
  it('starts with the doctype, so the browser renders in standards mode', () => {
    expect(html.trimStart().slice(0, 15).toLowerCase()).toBe('<!doctype html>');
  });

  it('declares UTF-8 within the first 1024 bytes', () => {
    expect(Buffer.from(html, 'utf8').subarray(0, 1024).toString('utf8')).toMatch(/<meta\s+charset="utf-8"\s*\/?>/i);
  });
});
