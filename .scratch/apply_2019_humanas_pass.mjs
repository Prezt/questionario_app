import { readFileSync, writeFileSync } from 'node:fs';

const root = process.cwd();
const pubFile = `${root}/public/humanas_enem_2019.json`;
const distFile = `${root}/dist/humanas_enem_2019.json`;
const pubCtx = `${root}/public/contexts.json`;
const distCtx = `${root}/dist/contexts.json`;

const arr = JSON.parse(readFileSync(pubFile, 'utf8'));

for (const q of arr) {
  // q59: remove image from question, add contextId, strip [Figura:...] placeholder from text
  if (q.number === 59) {
    q.images = [];
    q.contextId = 'enem_2019_humanas_q59_ctx1';
    q.text = q.text.replace(/\s*\[Figura:[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // q77: move intro paragraph to context (already done), strip leading paragraph + [Figura:...] from question text
  if (q.number === 77) {
    q.images = [];
    q.contextId = 'enem_2019_humanas_q77_ctx1';
    // Keep only the final question stem
    q.text = 'A manifestação artística expressa na imagem apresentada no texto integra um movimento contemporâneo de';
  }
  // q85: strip leading [Figura:...] from text, remove image, add contextId
  if (q.number === 85) {
    q.images = [];
    q.contextId = 'enem_2019_humanas_q85_ctx1';
    q.text = q.text.replace(/^\s*\[Figura:[^\]]*\]\s*\n*/, '').trim();
  }

  q.review = true;
}

const out = JSON.stringify(arr, null, 2) + '\n';
writeFileSync(pubFile, out);
writeFileSync(distFile, out);

// Sync contexts.json to dist
writeFileSync(distCtx, readFileSync(pubCtx, 'utf8'));

console.log(`Updated ${arr.length} humanas questions`);
console.log('q59 text:', arr.find(q => q.number === 59).text);
console.log('q77 text:', arr.find(q => q.number === 77).text);
console.log('q85 text:', arr.find(q => q.number === 85).text);
