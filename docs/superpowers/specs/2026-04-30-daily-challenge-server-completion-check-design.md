# Daily Challenge Server-Side Completion Check Design

**Date:** 2026-04-30  
**Scope:** On home page load, proactively fetch the daily challenge status from the server and show the completed banner immediately if the user has already completed today's challenge.

---

## Problem

`dailyChallengeResult` is initialized to `null` on every page load. The API check (`GET /api/daily-challenge`) only happens when the user **clicks** the "Desafio Diário" button. This means:

- On refresh, the button appears even if the user already completed today's challenge
- After login, the button appears even if the user already completed today's challenge
- The completed state only persists within a single browser session

## Solution

Add a `useEffect` in `src/App.jsx` that fires whenever `phase` becomes `'home'` and `token` is set. It calls the existing `GET /api/daily-challenge` endpoint (which already returns `completed` if the user has done today's challenge) and pre-populates `dailyChallengeResult` if so.

---

## Design

### File changed

**Modify:** `src/App.jsx` — add one `useEffect` near the other effects that depend on `phase`.

### Effect

```js
useEffect(() => {
  if (phase !== 'home' || !token) return
  fetch('/api/daily-challenge', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.json())
    .then(data => {
      if (data.completed) {
        setDailyChallengeResult({ score: data.completed.score, total: data.completed.total })
      }
    })
    .catch(() => {})
}, [phase, token])
```

### Behavior

- **Fires on:** every transition to `phase === 'home'` — initial page load/restore, after login, after finishing a quiz
- **If completed:** sets `dailyChallengeResult` → banner shows immediately, button hidden
- **If not completed:** `data.completed` is `null`, nothing changes, button shows normally
- **On error:** silently ignored (`.catch(() => {})`) — same pattern used elsewhere in the app

### What does NOT change

- `GET /api/daily-challenge` API — already returns `{ date, questions, completed }` where `completed` is `null` or `{ score, total, elapsed_secs, completed_at }`
- `dailyChallengeResult` state shape — `{ score, total }` unchanged
- The completed banner UI — reused as-is
- The `startDailyChallenge` function — its own internal check remains (redundant but harmless)
- The "just completed" path (line ~1257) — still sets from local state; consistent with server since both reflect the same submission
