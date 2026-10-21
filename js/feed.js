import { supabase } from './supabase.js'

const NO_PHOTO_ICON = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="m4 17 5-5 3.5 3.5L17 10l3 4"/></svg>'
const UP_ICON        = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
const DOWN_ICON       = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>'

let session   = null
let meals     = []          // approved meals, each annotated with .score and .myVote (1, -1, or 0)
let sortMode  = 'recent'    // 'recent' | 'loved'

// ── Auth (optional — feed is viewable while logged out) ────────────────────────

async function init() {
  const { data: { session: s } } = await supabase.auth.getSession()
  session = s

  document.getElementById('login-nav-link').hidden = !!session
  document.getElementById('profile-nav-link').hidden = !session

  document.getElementById('sort-recent').addEventListener('click', () => setSort('recent'))
  document.getElementById('sort-loved').addEventListener('click', () => setSort('loved'))

  await loadFeed()
}

function setSort(mode) {
  if (mode === sortMode) return
  sortMode = mode
  document.getElementById('sort-recent').classList.toggle('active', mode === 'recent')
  document.getElementById('sort-loved').classList.toggle('active', mode === 'loved')
  renderGrid()
}

// ── Load meals + votes ───────────────────────────────────────────────────────

async function loadFeed() {
  const grid = document.getElementById('meals-grid')
  grid.innerHTML = '<p class="loading-msg">Loading meals…</p>'

  const { data: mealRows, error } = await supabase
    .from('meals')
    .select(`
      id, description, how_to_get, photo_url, created_at,
      profiles:user_id ( display_name, username, avatar_url )
    `)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  if (error || !mealRows?.length) {
    grid.innerHTML = '<p class="empty-msg">No meals logged yet. <a href="submit.html">Log the first one!</a></p>'
    return
  }

  const { data: counts } = await supabase
    .from('meal_vote_counts')
    .select('meal_id, score')

  const scoreMap = new Map((counts || []).map(c => [c.meal_id, c.score]))

  let myVoteMap = new Map()
  if (session) {
    const { data: myVotes } = await supabase
      .from('meal_votes')
      .select('meal_id, value')
      .eq('user_id', session.user.id)
    myVoteMap = new Map((myVotes || []).map(v => [v.meal_id, v.value]))
  }

  meals = mealRows.map(meal => ({
    ...meal,
    score:  scoreMap.get(meal.id) || 0,
    myVote: myVoteMap.get(meal.id) || 0,
  }))

  renderGrid()
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderGrid() {
  const grid = document.getElementById('meals-grid')
  const ordered = [...meals].sort((a, b) => sortMode === 'loved'
    ? b.score - a.score || new Date(b.created_at) - new Date(a.created_at)
    : new Date(b.created_at) - new Date(a.created_at))

  grid.innerHTML = ordered.map(meal => renderCard(meal)).join('')

  grid.querySelectorAll('.vote-arrow').forEach(btn =>
    btn.addEventListener('click', () => castVote(btn.dataset.id, Number(btn.dataset.dir)))
  )
}

function renderCard(meal) {
  const profile = meal.profiles || {}
  const name    = profile.display_name ? escapeHtml(profile.display_name) : 'Anonymous'
  const avatar  = profile.avatar_url
    ? `<img src="${escapeHtml(profile.avatar_url)}" alt="${name}" class="user-avatar">`
    : `<span class="user-avatar user-avatar-fallback">${name.charAt(0).toUpperCase()}</span>`

  return `
    <div class="meal-card" data-id="${meal.id}">
      <div class="meal-photo">
        ${meal.photo_url
          ? `<img src="${escapeHtml(meal.photo_url)}" alt="${escapeHtml(meal.description)}" loading="lazy">`
          : `<span class="meal-no-photo">${NO_PHOTO_ICON}</span>`}
      </div>
      <div class="meal-info">
        <p class="meal-desc">${escapeHtml(meal.description)}</p>
        ${meal.how_to_get ? `<p class="meal-how">${escapeHtml(meal.how_to_get)}</p>` : ''}
        <div class="meal-user">
          ${avatar}
          <span class="meal-user-name">${name}</span>
          <span class="meal-time">${timeAgo(meal.created_at)}</span>
        </div>
        <div class="meal-footer">
          ${renderVoteGroup(meal)}
        </div>
      </div>
    </div>
  `
}

function renderVoteGroup(meal) {
  return `
    <div class="vote-group" data-id="${meal.id}">
      <button class="vote-arrow up ${meal.myVote === 1 ? 'active' : ''}" data-id="${meal.id}" data-dir="1" aria-pressed="${meal.myVote === 1}" aria-label="Upvote">
        ${UP_ICON}
      </button>
      <span class="vote-score">${meal.score}</span>
      <button class="vote-arrow down ${meal.myVote === -1 ? 'active' : ''}" data-id="${meal.id}" data-dir="-1" aria-pressed="${meal.myVote === -1}" aria-label="Downvote">
        ${DOWN_ICON}
      </button>
    </div>
  `
}

// ── Voting ────────────────────────────────────────────────────────────────────

async function castVote(mealId, dir) {
  if (!session) { window.location.href = 'login.html'; return }

  const meal = meals.find(m => m.id === mealId)
  if (!meal) return

  const group = document.querySelector(`.vote-group[data-id="${mealId}"]`)
  group.querySelectorAll('.vote-arrow').forEach(b => { b.disabled = true })

  const prevVote = meal.myVote
  const nextVote = prevVote === dir ? 0 : dir  // clicking the active direction again removes the vote

  meal.score  += nextVote - prevVote
  meal.myVote  = nextVote
  updateVoteGroup(group, meal)

  const { error } = nextVote === 0
    ? await supabase.from('meal_votes').delete().eq('meal_id', mealId).eq('user_id', session.user.id)
    : await supabase.from('meal_votes').upsert(
        { meal_id: mealId, user_id: session.user.id, value: nextVote },
        { onConflict: 'meal_id,user_id' }
      )

  if (error) {
    meal.score  += prevVote - nextVote
    meal.myVote  = prevVote
    updateVoteGroup(group, meal)
  }

  group.querySelectorAll('.vote-arrow').forEach(b => { b.disabled = false })
}

function updateVoteGroup(group, meal) {
  const up   = group.querySelector('.vote-arrow.up')
  const down = group.querySelector('.vote-arrow.down')
  up.classList.toggle('active', meal.myVote === 1)
  up.setAttribute('aria-pressed', meal.myVote === 1)
  down.classList.toggle('active', meal.myVote === -1)
  down.setAttribute('aria-pressed', meal.myVote === -1)
  group.querySelector('.vote-score').textContent = meal.score
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function timeAgo(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

document.addEventListener('DOMContentLoaded', init)
