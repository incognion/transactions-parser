#!/usr/bin/env node

import { parseFile } from '../index.js';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);

if (!args.length) {
  console.error('Usage: transactions-parser <file1> [file2 ...]');
  console.error('       parse-transactions <file1> [file2 ...]');
  process.exit(1);
}

const resultsPerFile = [];

args.forEach(f => {
  const full = path.resolve(process.cwd(), f);
  if (!fs.existsSync(full)) {
    console.error(`File not found: ${f}`);
    return;
  }
  
  const txt = fs.readFileSync(full, 'utf8');
  const parsed = parseFile(txt, path.basename(f));
  resultsPerFile.push({ [path.basename(f)]: parsed });
});

console.log(JSON.stringify(resultsPerFile, null, 2));
