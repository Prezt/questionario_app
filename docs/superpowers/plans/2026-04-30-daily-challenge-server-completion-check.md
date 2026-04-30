# Daily Challenge Server-Side Completion Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the daily challenge completed banner immediately on home page load by fetching completion status from the server, instead of waiting for the user to click the button.

**Architecture:** Add one `useEffect` to `src/App.jsx` that fires on every `phase === 'home'` transition. It calls the existing `GET /api/daily-challenge` endpoint (which already returns `completed` if the user has done today's challenge) and sets `dailyChallengeResult` if so. No API changes needed.

**Tech Stack:** React 19, `fetch`, existing `dailyChallengeResult` state and banner UI.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/App.jsx` | **Modify** | Add `useEffect` after line 474 (session-restore effect) |

---

## Task 1: Add the completion-check effect

**Files:**
- Modify: `src/App.jsx` — insert after line 474

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n "Restore session on mount" src/App.jsx
```

Expected output: one line around line 465 — `// Restore session on mount`. The new effect goes **after** the closing `}, [])` of that effect (around line 474).

- [ ] **Step 2: Read the surrounding context to confirm**

Read lines 464–480 of `src/App.jsx` to verify the structure looks like:

```js
  // Restore session on mount
  useEffect(() => {
    const saved = localStorage.getItem('user')
    const savedToken = localStorage.getItem('token')
    if (saved && savedToken) {
      setUser(JSON.parse(saved))
      setToken(savedToken)
      setPhase('home')
    }
  }, [])

  const questionIndex = useMemo(...)
```

- [ ] **Step 3: Insert the new effect**

After the `}, [])` that closes the session-restore effect (and before the `const questionIndex = useMemo(...)` line), insert:

```js
  // Check daily challenge completion status on home load
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

The result should look like:

```js
  // Restore session on mount
  useEffect(() => {
    const saved = localStorage.getItem('user')
    const savedToken = localStorage.getItem('token')
    if (saved && savedToken) {
      setUser(JSON.parse(saved))
      setToken(savedToken)
      setPhase('home')
    }
  }, [])

  // Check daily challenge completion status on home load
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

  const questionIndex = useMemo(...)
```

- [ ] **Step 4: Build to verify no errors**

```bash
npm run build
```

Expected: build completes successfully with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: check daily challenge completion from server on home load"
```

---

## Task 2: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test fresh load after completing**

  1. Complete today's daily challenge
  2. Note the score shown in the banner
  3. Refresh the page (F5 / Cmd+R)

Expected: the "Desafio de hoje concluído! X/Y corretas" banner appears immediately on home — no button click required.

- [ ] **Step 3: Test fresh load without completing**

  1. Log in as a user who has NOT completed today's challenge (or use a different account)
  2. Load the home page

Expected: the "★ Desafio Diário" button appears normally.

- [ ] **Step 4: Test after login**

  1. Log out
  2. Log back in as a user who already completed today's challenge

Expected: the completed banner appears immediately after login, without clicking the button.
