// Freezing explanations into JSON files requires write access to the
// public/ folder, which is read-only on Vercel. Run the freeze locally
// from `npm run dev` (where the local API server has filesystem access)
// or via the CLI: `node scripts/freeze-explanations.js`.
export default function handler(_req, res) {
  res.status(501).json({
    error: 'Freeze indisponível em produção. Rode localmente: npm run dev e clique de novo, ou node scripts/freeze-explanations.js.',
  })
}
