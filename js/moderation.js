import { supabase } from './supabase.js'

let pendingCount = 0

// ── Auth + admin guard ────────────────────────────────────────────────────────

async function init() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = 'login.html'; return }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', session.user.id)
    .single()

  if (!profile?.is_admin) { window.location.href = 'index.html'; return }

  await loadQueue()
}

// ── Queue ─────────────────────────────────────────────────────────────────────

async function loadQueue() {
  const grid = document.getElementById('queue-grid')
  grid.innerHTML = '<p class="loading-msg">Loading…</p>'

  const { data: meals, error } = await supabase
    .from('meals')
    .select(`
      id, description, photo_url, created_at,
      profiles:user_id ( display_name, username, avatar_url )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) {
    grid.innerHTML = '<p class="empty-msg">Failed to load queue.</p>'
    return
  }

  pendingCount = meals?.length ?? 0
  updateCountBadge()

  if (!pendingCount) {
    grid.innerHTML = '<p class="empty-msg">No meals pending review. All clear! ✅</p>'
    return
  }

  grid.innerHTML = meals.map(meal => renderCard(meal)).join('')
  grid.querySelectorAll('.approve-btn').forEach(btn =>
    btn.addEventListener('click', () => moderate(btn.dataset.id, 'approved'))
  )
  grid.querySelectorAll('.reject-btn').forEach(btn =>
    btn.addEventListener('click', () => moderate(btn.dataset.id, 'rejected'))
  )
}

function renderCard(meal) {
  const profile  = meal.profiles || {}
  const name     = profile.display_name ? escapeHtml(profile.display_name) : 'Anonymous'
  const handle   = profile.username     ? `@${escapeHtml(profile.username)}` : ''
  const avatar   = profile.avatar_url
    ? `<img src="${escapeHtml(profile.avatar_url)}" alt="${name}" class="mod-avatar">`
    : `<span class="mod-avatar mod-avatar-fallback">${name.charAt(0).toUpperCase()}</span>`

  return `
    <div class="mod-card" data-id="${meal.id}">
      <div class="mod-photo">
        ${meal.photo_url
          ? `<img src="${escapeHtml(meal.photo_url)}" alt="${escapeHtml(meal.description)}" loading="lazy">`
          : `<span class="mod-no-photo">🍽</span>`}
      </div>
      <div class="mod-body">
        <p class="mod-desc">${escapeHtml(meal.description)}</p>
        <div class="mod-user">
          ${avatar}
          <div class="mod-user-info">
            <span class="mod-name">${name}</span>
            ${handle ? `<span class="mod-handle">${handle}</span>` : ''}
          </div>
          <span class="mod-time">${timeAgo(meal.created_at)}</span>
        </div>
        <div class="mod-actions">
          <button class="approve-btn" data-id="${meal.id}">✓ Approve</button>
          <button class="reject-btn"  data-id="${meal.id}">✗ Reject</button>
        </div>
      </div>
    </div>
  `
}

// ── Moderate ──────────────────────────────────────────────────────────────────

async function moderate(id, status) {
  const card    = document.querySelector(`.mod-card[data-id="${id}"]`)
  const buttons = card.querySelectorAll('button')
  buttons.forEach(b => { b.disabled = true })

  const { error } = await supabase
    .from('meals')
    .update({ status })
    .eq('id', id)

  if (error) {
    buttons.forEach(b => { b.disabled = false })
    alert(error.message)
    return
  }

  card.classList.add(status === 'approved' ? 'card-approved' : 'card-rejected')

  setTimeout(() => {
    card.remove()
    pendingCount = Math.max(0, pendingCount - 1)
    updateCountBadge()
    if (!document.querySelector('.mod-card')) {
      document.getElementById('queue-grid').innerHTML =
        '<p class="empty-msg">No meals pending review. All clear! ✅</p>'
    }
  }, 600)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function updateCountBadge() {
  const badge = document.getElementById('pending-badge')
  badge.textContent = pendingCount === 0
    ? 'All clear'
    : `${pendingCount} pending`
  badge.className = `count-badge ${pendingCount === 0 ? 'badge-clear' : 'badge-pending'}`
}

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
