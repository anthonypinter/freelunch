import { supabase } from './supabase.js'

let session = null
let profile = null

// ── Auth guard ────────────────────────────────────────────────────────────────

async function init() {
  const { data: { session: s } } = await supabase.auth.getSession()
  if (!s) { window.location.href = 'login.html'; return }
  session = s
  await Promise.all([loadProfile(), loadStats(), loadMeals()])
}

// ── Profile ───────────────────────────────────────────────────────────────────

async function loadProfile() {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, username, avatar_url')
    .eq('id', session.user.id)
    .single()

  profile = data || {}
  renderProfile()
}

function renderProfile() {
  document.getElementById('profile-name').textContent =
    profile.display_name || 'Anonymous'
  document.getElementById('profile-handle').textContent =
    profile.username ? `@${profile.username}` : session.user.email
  setAvatarEl(document.getElementById('profile-avatar'), profile)
}

function setAvatarEl(el, p) {
  const name = (p?.display_name || 'A').charAt(0).toUpperCase()
  if (p?.avatar_url) {
    el.innerHTML = `<img src="${escapeHtml(p.avatar_url)}" alt="Avatar">`
  } else {
    el.textContent = name
  }
}

// ── Avatar upload ─────────────────────────────────────────────────────────────

document.getElementById('avatar-input').addEventListener('change', async (e) => {
  const file = e.target.files[0]
  if (!file) return
  if (!file.type.startsWith('image/')) { alert('Please select an image.'); return }

  const btn = document.getElementById('change-avatar-btn')
  btn.textContent = 'Uploading…'
  btn.disabled    = true

  try {
    const ext  = file.name.split('.').pop()
    const path = `avatars/${session.user.id}.${ext}`

    const { data: uploaded, error: upErr } = await supabase.storage
      .from('meal-photos')
      .upload(path, file, { upsert: true })

    if (upErr) throw upErr

    const { data: { publicUrl } } = supabase.storage
      .from('meal-photos')
      .getPublicUrl(uploaded.path)

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', session.user.id)

    if (updateErr) throw updateErr

    profile.avatar_url = publicUrl
    setAvatarEl(document.getElementById('profile-avatar'), profile)

  } catch (err) {
    alert(err.message)
  } finally {
    btn.textContent = 'Change photo'
    btn.disabled    = false
  }
})

document.getElementById('change-avatar-btn').addEventListener('click', () => {
  document.getElementById('avatar-input').click()
})

// ── Stats ─────────────────────────────────────────────────────────────────────

async function loadStats() {
  const uid = session.user.id

  const [totalRes, weeklyRes, monthlyRes] = await Promise.all([
    supabase.from('meals').select('*', { count: 'exact', head: true }).eq('user_id', uid),
    supabase.from('leaderboard_weekly').select('meal_count').eq('user_id', uid).single(),
    supabase.from('leaderboard_monthly').select('meal_count').eq('user_id', uid).single(),
  ])

  document.getElementById('stat-total').textContent   = totalRes.count   ?? 0
  document.getElementById('stat-weekly').textContent  = weeklyRes.data?.meal_count  ?? 0
  document.getElementById('stat-monthly').textContent = monthlyRes.data?.meal_count ?? 0
}

// ── Meals grid ────────────────────────────────────────────────────────────────

async function loadMeals() {
  const grid = document.getElementById('meals-grid')
  grid.innerHTML = '<p class="loading-msg">Loading meals…</p>'

  const { data: meals, error } = await supabase
    .from('meals')
    .select('id, description, photo_url, created_at, status')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })

  if (error || !meals?.length) {
    grid.innerHTML = '<p class="empty-msg">No meals logged yet. <a href="submit.html">Log your first one!</a></p>'
    return
  }

  grid.innerHTML = meals.map(meal => `
    <div class="meal-card" data-id="${meal.id}">
      <div class="meal-photo">
        ${meal.photo_url
          ? `<img src="${escapeHtml(meal.photo_url)}" alt="${escapeHtml(meal.description)}" loading="lazy">`
          : `<span class="meal-no-photo">🍽</span>`}
      </div>
      <div class="meal-info">
        ${statusBadge(meal.status)}
        <p class="meal-desc">${escapeHtml(meal.description)}</p>
        <p class="meal-date">${formatDate(meal.created_at)}</p>
        <button class="delete-btn" data-id="${meal.id}">Delete</button>
      </div>
    </div>
  `).join('')

  grid.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteMeal(btn.dataset.id))
  })
}

async function deleteMeal(id) {
  if (!confirm('Delete this meal?')) return

  const { error } = await supabase.from('meals').delete().eq('id', id)
  if (error) { alert(error.message); return }

  document.querySelector(`.meal-card[data-id="${id}"]`)?.remove()

  const remaining = document.querySelectorAll('.meal-card').length
  if (!remaining) {
    document.getElementById('meals-grid').innerHTML =
      '<p class="empty-msg">No meals logged yet. <a href="submit.html">Log your first one!</a></p>'
  }

  // Update total count
  const totalEl = document.getElementById('stat-total')
  totalEl.textContent = Math.max(0, parseInt(totalEl.textContent) - 1)
}

// ── Sign out ──────────────────────────────────────────────────────────────────

document.getElementById('signout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = 'login.html'
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status) {
  if (status === 'pending')  return '<span class="status-badge status-pending">Pending review</span>'
  if (status === 'rejected') return '<span class="status-badge status-rejected">Rejected</span>'
  return ''
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

document.addEventListener('DOMContentLoaded', init)
