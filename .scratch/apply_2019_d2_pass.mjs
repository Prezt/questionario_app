import { readFileSync, writeFileSync } from 'node:fs';

const root = process.cwd();
const files = [
  { pub: `${root}/public/math_enem_2019.json`, dist: `${root}/dist/math_enem_2019.json`, label: 'math' },
  { pub: `${root}/public/nature_enem_2019.json`, dist: `${root}/dist/nature_enem_2019.json`, label: 'nature' },
];

let total = 0;
for (const { pub, dist, label } of files) {
  const arr = JSON.parse(readFileSync(pub, 'utf8'));
  for (const q of arr) {
    // q118 nature: image now lives in context, remove from question
    if (label === 'nature' && q.number === 118) {
      q.images = [];
    }
    q.review = true;
  }
  const out = JSON.stringify(arr, null, 2) + '\n';
  writeFileSync(pub, out);
  writeFileSync(dist, out);
  total += arr.length;
  console.log(`${label}: ${arr.length} questions, all-review:`, arr.every(q => q.review));
}

// Sync contexts.json to dist
const ctx = readFileSync(`${root}/public/contexts.json`, 'utf8');
writeFileSync(`${root}/dist/contexts.json`, ctx);

console.log(`Total D2 questions marked review:true: ${total}`);
console.log('contexts.json synced to dist');
