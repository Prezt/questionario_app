import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const root = process.cwd();
const pubFile = `${root}/public/linguagens_enem_2019.json`;
const distFile = `${root}/dist/linguagens_enem_2019.json`;
const pubCtx = `${root}/public/contexts.json`;
const distCtx = `${root}/dist/contexts.json`;

// New / changed contextId wiring on questions
const ctxUpdates = {
  10: { contextId: 'enem_2019_linguagens_q10_ctx1' },
  12: { contextIds: ['enem_2019_linguagens_q12_ctx1', 'enem_2019_linguagens_q12_q36_ctx1'], removeContextId: true },
  17: { contextId: 'enem_2019_linguagens_q17_ctx1' },
  26: { contextIds: ['enem_2019_linguagens_q26_ctx1', 'enem_2019_linguagens_q26_ctx2'] },
  36: { contextIds: ['enem_2019_linguagens_q36_ctx1', 'enem_2019_linguagens_q36_ctx2'] },
  43: { contextId: 'enem_2019_linguagens_q43_ctx1' },
};

function patchQuestions(arr) {
  const seen = {};
  for (const q of arr) {
    // Track number occurrences (q1-q5 appear twice for en+es)
    const n = q.number;
    seen[n] = (seen[n] ?? 0) + 1;

    // Skip context updates for the language-variant duplicate entries (q1-q5).
    // The wiring updates apply only to questions 6+.
    if (n >= 6 && ctxUpdates[n]) {
      const u = ctxUpdates[n];
      if (u.removeContextId) delete q.contextId;
      if (u.contextId) q.contextId = u.contextId;
      if (u.contextIds) {
        q.contextIds = u.contextIds;
        delete q.contextId;
      }
    }

    // Mark all questions for manual review
    q.review = true;
  }
  return arr;
}

const pubData = JSON.parse(readFileSync(pubFile, 'utf8'));
const patched = patchQuestions(pubData);
const out = JSON.stringify(patched, null, 2) + '\n';
writeFileSync(pubFile, out);
writeFileSync(distFile, out);

// Sync contexts.json to dist (public was already edited via Edit tool)
const ctx = readFileSync(pubCtx, 'utf8');
writeFileSync(distCtx, ctx);

console.log(`Updated ${patched.length} questions in linguagens_enem_2019.json`);
console.log('Synced public/contexts.json → dist/contexts.json');
