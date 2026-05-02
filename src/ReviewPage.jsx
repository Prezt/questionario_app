// src/ReviewPage.jsx
import { useState, useEffect, useCallback } from 'react'
import './ReviewPage.css'

const AREA_TO_DAY = {
  linguagens: 'd1',
  humanas: 'd1',
  nature: 'd2',
  math: 'd2',
}

const FLAGS_KEY = 'review-flags'

function loadFlags() {
  try {
    return JSON.parse(localStorage.getItem(FLAGS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveFlags(flags) {
  localStorage.setItem(FLAGS_KEY, JSON.stringify(flags))
}

function flagKey(file, questionNumber) {
  return `${file.replace('.json', '')}_${questionNumber}`
}

function pageMapKey(year, area, number) {
  const day = AREA_TO_DAY[area] ?? 'd1'
  return `${year}_${day}_${number}`
}

export default function ReviewPage() {
  return (
    <div className="rp-shell">
      <div className="rp-loading">Loading review tool…</div>
    </div>
  )
}
