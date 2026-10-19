/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * This file is part of Grandmaster 3D.
 *
 * Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version. See the LICENSE file for the full terms.
 */

// Guard: no credentials reach a commit. Runs from .githooks/pre-commit.

import { describe, expect, it } from 'vitest';
import { read, readableFiles } from './repoFiles.ts';

interface Rule {
  readonly name: string;
  readonly pattern: RegExp;
}

const RULES: readonly Rule[] = [
  { name: 'PEM private key block', pattern: /-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----/ },
  { name: 'AWS access key id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Stripe key', pattern: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  {
    name: 'JSON web token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    name: 'assigned secret literal',
    pattern:
      /\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?key|private[_-]?key)\b["']?\s*[:=]\s*["'][^"'\s]{16,}["']/i,
  },
];

const ALLOWED = [
  /\bexample\b/i,
  /\bplaceholder\b/i,
  /\bdummy\b/i,
  /\bfake\b/i,
  /\bredacted\b/i,
  /\bprocess\.env\b/,
  /\bimport\.meta\.env\b/,
] as const;

const SKIP_FILES = [/^tests\/architecture\/secrets\.test\.ts$/, /^package-lock\.json$/] as const;

describe('secret scanning', () => {
  const files = readableFiles().filter((file) => !SKIP_FILES.some((rule) => rule.test(file)));

  it('has files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('finds no credentials in tracked files', () => {
    const findings: string[] = [];
    for (const file of files) {
      read(file)
        .split('\n')
        .forEach((line, index) => {
          if (ALLOWED.some((rule) => rule.test(line))) return;
          for (const rule of RULES) {
            if (rule.pattern.test(line)) findings.push(`${file}:${index + 1} looks like a ${rule.name}`);
          }
        });
    }
    expect(findings, findings.join('\n')).toEqual([]);
  });
});
