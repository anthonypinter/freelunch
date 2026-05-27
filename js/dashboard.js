import { supabase } from './supabase.js'

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
  }
  tick()
  setInterval(tick, 30000)
}

// ── Total meal count ──────────────────────────────────────────────────────────

async function loadTotalCount() {
  const { count } = await supabase
    .from('meals')
    .select('*', { count: 'exact', head: true })

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
      id, description, photo_url, created_at,
      profiles:user_id ( display_name, username, avatar_url )
    `)
    .order('created_at', { ascending: false })
    .limit(12)

  if (!meals?.length) {
    document.querySelector('.carousel-wrapper').innerHTML =
      '<p class="empty-state">No meals logged yet.</p>'
    return
  }

  carouselItems = meals
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
          : `<div class="carousel-no-photo"><span>🍽</span></div>`}
        <div class="carousel-caption">
          <p class="carousel-desc">${escapeHtml(meal.description)}</p>
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

  renderDots()
}

function goToSlide(index) {
  const slides = document.querySelectorAll('.carousel-slide')
  if (!slides.length) return
  slides[carouselIndex]?.classList.remove('active')
  carouselIndex = ((index % carouselItems.length) + carouselItems.length) % carouselItems.length
  slides[carouselIndex]?.classList.add('active')
  renderDots()
}

function renderDots() {
  const container = document.getElementById('carousel-dots')
  container.innerHTML = carouselItems.map((_, i) =>
    `<span class="dot ${i === carouselIndex ? 'active' : ''}"></span>`
  ).join('')
}

function startCarousel() {
  clearInterval(carouselTimer)
  carouselTimer = setInterval(() => goToSlide(carouselIndex + 1), CAROUSEL_INTERVAL_MS)
}

function initCarouselButtons() {
  document.getElementById('prev-btn').addEventListener('click', () => {
    goToSlide(carouselIndex - 1); startCarousel()
  })
  document.getElementById('next-btn').addEventListener('click', () => {
    goToSlide(carouselIndex + 1); startCarousel()
  })
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

const PERIODS = [
  { key: 'weekly',   view: 'leaderboard_weekly',   label: 'This Week'    },
  { key: 'monthly',  view: 'leaderboard_monthly',  label: 'This Month'   },
  { key: 'semester', view: 'leaderboard_semester', label: 'This Semester' },
]
let lbPeriodIndex = 0
let lbCache = {}

async function loadLeaderboard(periodIndex) {
  const { view, label } = PERIODS[periodIndex]
  document.getElementById('lb-period-label').textContent = label

  if (lbCache[view]) { renderLeaderboard(lbCache[view]); return }

  document.getElementById('leaderboard-list').innerHTML =
    '<li class="loading-row"><span class="spinner"></span> Loading…</li>'

  const { data } = await supabase.from(view).select('user_id, meal_count').limit(10)

  const entries = (data || []).map((row, i) => ({
    rank: i + 1,
    label: shortId(row.user_id),
    count: row.meal_count,
  }))

  lbCache[view] = entries
  renderLeaderboard(entries)
}

function renderLeaderboard(entries) {
  const list = document.getElementById('leaderboard-list')
  if (!entries.length) {
    list.innerHTML = '<li class="empty-state">No meals logged in this period.</li>'
    return
  }
  list.innerHTML = entries.map(e => `
    <li class="lb-row rank-${e.rank}">
      <span class="lb-rank">${medalFor(e.rank)}</span>
      <span class="lb-name">${escapeHtml(e.label)}</span>
      <span class="lb-count">${e.count}</span>
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
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initClock()
  loadTotalCount()
  loadCarousel()
  initCarouselButtons()
  loadLeaderboard(0)
  startLeaderboardCycle()
  startDataRefresh()
})
