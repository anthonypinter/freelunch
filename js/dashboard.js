import { supabase } from './supabase.js'

const NO_PHOTO_ICON = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="m4 17 5-5 3.5 3.5L17 10l3 4"/></svg>'
const HEART_ICON     = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>'

const CAROUSEL_INTERVAL_MS  = 5000   // advance slide every 5s
const LEADERBOARD_CYCLE_MS  = 10000  // cycle period tab every 10s
const DATA_REFRESH_MS       = 120000 // re-fetch data every 2 min

// ── Live clock ────────────────────────────────────────────────────────────────

function initClock() {
  const el = document.getElementById('live-clock')
  const tick = () => {
    el.textContent = new Date().toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    })
      .replace(/,/g, '')
      .replace(/\bat\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
  tick()
  setInterval(tick, 30000)
}

// ── Total meal count ──────────────────────────────────────────────────────────

async function loadTotalCount() {
  const { count } = await supabase
    .from('meals')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')

  const el = document.getElementById('total-count')
  if (count != null) el.textContent = `${count.toLocaleString()} meal${count !== 1 ? 's' : ''} logged`
}

// ── Carousel ──────────────────────────────────────────────────────────────────

let carouselItems  = []
let carouselIndex  = 0
let carouselTimer  = null

async function loadCarousel() {
  const { data: meals } = await supabase
    .from('meals')
    .select(`
      id, description, how_to_get, photo_url, created_at,
      profiles:user_id ( display_name, username, avatar_url )
    `)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(12)

  if (!meals?.length) {
    document.querySelector('.carousel-wrapper').innerHTML =
      '<p class="empty-state">No meals logged yet.</p>'
    return
  }

  const { data: counts } = await supabase
    .from('meal_vote_counts')
    .select('meal_id, score')
    .in('meal_id', meals.map(m => m.id))

  const scoreMap = new Map((counts || []).map(c => [c.meal_id, c.score]))

  carouselItems = meals.map(meal => ({ ...meal, score: scoreMap.get(meal.id) || 0 }))
  renderCarousel()
  startCarousel()
}

function renderCarousel() {
  document.getElementById('carousel-track').innerHTML = carouselItems.map((meal, i) => {
    const profile = meal.profiles || {}
    const name     = profile.display_name ? escapeHtml(profile.display_name) : 'Anonymous'
    const handle   = profile.username     ? `@${escapeHtml(profile.username)}` : ''
    const avatar   = profile.avatar_url
      ? `<img src="${escapeHtml(profile.avatar_url)}" alt="${name}" class="user-avatar">`
      : `<span class="user-avatar user-avatar-fallback">${name.charAt(0).toUpperCase()}</span>`

    return `
      <div class="carousel-slide ${i === 0 ? 'active' : ''}">
        ${meal.photo_url
          ? `<img src="${escapeHtml(meal.photo_url)}" alt="${escapeHtml(meal.description)}" loading="lazy">`
          : `<div class="carousel-no-photo"><span>${NO_PHOTO_ICON}</span></div>`}
        <div class="carousel-vote-badge ${meal.score < 0 ? 'negative' : ''}">
          ${HEART_ICON}<span>${meal.score}</span>
        </div>
        <div class="carousel-caption">
          <p class="carousel-desc">${escapeHtml(meal.description)}</p>
          ${meal.how_to_get ? `<p class="carousel-how">${escapeHtml(meal.how_to_get)}</p>` : ''}
          <div class="carousel-user">
            ${avatar}
            <div class="carousel-user-info">
              <span class="user-name">${name}</span>
              ${handle ? `<span class="user-handle">${handle}</span>` : ''}
            </div>
            <span class="carousel-time">${timeAgo(meal.created_at)}</span>
          </div>
        </div>
      </div>
    `
  }).join('')
}

function goToSlide(index) {
  const slides = document.querySelectorAll('.carousel-slide')
  if (!slides.length) return
  slides[carouselIndex]?.classList.remove('active')
  carouselIndex = ((index % carouselItems.length) + carouselItems.length) % carouselItems.length
  slides[carouselIndex]?.classList.add('active')
}

function startCarousel() {
  clearInterval(carouselTimer)
  carouselTimer = setInterval(() => goToSlide(carouselIndex + 1), CAROUSEL_INTERVAL_MS)
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

const PERIODS = [
  { key: 'weekly',   view: 'leaderboard_weekly',   label: 'This Week',     valueColumn: 'meal_count',  emptyMsg: 'No meals logged in this period.',
    format: n => `${n} meal${n !== 1 ? 's' : ''}` },
  { key: 'monthly',  view: 'leaderboard_monthly',  label: 'This Month',    valueColumn: 'meal_count',  emptyMsg: 'No meals logged in this period.',
    format: n => `${n} meal${n !== 1 ? 's' : ''}` },
  { key: 'semester', view: 'leaderboard_semester', label: 'This Semester', valueColumn: 'meal_count',  emptyMsg: 'No meals logged in this period.',
    format: n => `${n} meal${n !== 1 ? 's' : ''}` },
  { key: 'loved',    view: 'leaderboard_loved',    label: 'Most Loved',    valueColumn: 'vote_score',  emptyMsg: 'No votes yet — go love a meal!',
    format: n => `${n > 0 ? '+' : ''}${n} pt${Math.abs(n) !== 1 ? 's' : ''}` },
]
let lbPeriodIndex = 0
let lbCache = {}

async function loadLeaderboard(periodIndex) {
  const { view, label } = PERIODS[periodIndex]
  document.getElementById('lb-period-label').textContent = label

  if (lbCache[view]) { renderLeaderboard(periodIndex, lbCache[view]); return }

  document.getElementById('leaderboard-list').innerHTML =
    '<li class="loading-row"><span class="spinner"></span> Loading…</li>'

  const { valueColumn } = PERIODS[periodIndex]
  const { data } = await supabase.from(view).select(`user_id, display_name, username, ${valueColumn}`).limit(8)

  const entries = (data || []).map((row, i) => ({
    rank: i + 1,
    label: row.display_name || row.username || shortId(row.user_id),
    count: row[valueColumn],
  }))

  lbCache[view] = entries
  renderLeaderboard(periodIndex, entries)
}

function renderLeaderboard(periodIndex, entries) {
  const { format, emptyMsg } = PERIODS[periodIndex]
  const list = document.getElementById('leaderboard-list')
  if (!entries.length) {
    list.innerHTML = `<li class="empty-state">${emptyMsg}</li>`
    return
  }
  list.innerHTML = entries.map(e => `
    <li class="lb-row rank-${e.rank}">
      <span class="lb-rank">${medalFor(e.rank)}</span>
      <span class="lb-name">${escapeHtml(e.label)}</span>
      <span class="lb-count">${format(e.count)}</span>
    </li>
  `).join('')
}

function startLeaderboardCycle() {
  setInterval(() => {
    lbPeriodIndex = (lbPeriodIndex + 1) % PERIODS.length
    loadLeaderboard(lbPeriodIndex)
  }, LEADERBOARD_CYCLE_MS)
}

// ── Periodic data refresh ─────────────────────────────────────────────────────

function startDataRefresh() {
  setInterval(() => {
    lbCache = {}
    loadCarousel()
    loadTotalCount()
    loadLeaderboard(lbPeriodIndex)
  }, DATA_REFRESH_MS)
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

function shortId(uuid) {
  return uuid ? `…${uuid.slice(-6)}` : 'Unknown'
}

function medalFor(rank) {
  const mod100 = rank % 100
  const suffix = (mod100 >= 11 && mod100 <= 13)
    ? 'th'
    : { 1: 'st', 2: 'nd', 3: 'rd' }[rank % 10] || 'th'
  return `${rank}<sup>${suffix}</sup>`
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initClock()
  loadTotalCount()
  loadCarousel()
  loadLeaderboard(0)
  startLeaderboardCycle()
  startDataRefresh()
})
