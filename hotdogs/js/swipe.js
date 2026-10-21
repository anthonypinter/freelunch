import { supabase } from './supabase.js'

const SWIPE_THRESHOLD = 110   // px of horizontal drag that counts as a vote
const VISIBLE_CARDS   = 3     // cards rendered in the stack at once

const deckArea  = document.getElementById('deck-area')
const swipeUi   = document.getElementById('swipe-ui')
const deckEl    = document.getElementById('deck')
const dogsLeft  = document.getElementById('dogs-left')
const yumBtn    = document.getElementById('yum-btn')
const nopeBtn   = document.getElementById('nope-btn')

let session = null
let deck    = []    // dogs this user hasn't voted on yet; deck[0] is the top card

// ── Auth (optional — logged-out visitors see the leaderboard and a sign-in prompt) ──

async function init() {
  const { data: { session: s } } = await supabase.auth.getSession()
  session = s

  document.getElementById('login-nav-link').hidden = !!session
  document.getElementById('signout-btn').hidden    = !session

  yumBtn.addEventListener('click', () => swipeTop(1))
  nopeBtn.addEventListener('click', () => swipeTop(-1))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') swipeTop(1)
    if (e.key === 'ArrowLeft')  swipeTop(-1)
  })

  if (!session) {
    showMessage(
      'Judge the Dogs',
      'Sign in to swipe on hot dogs from around campus. Right if you\'d eat it, left if you wouldn\'t.',
      '<a href="login.html?next=index.html" class="cta-btn">Sign In to Swipe</a>'
    )
    await loadTopDogs()
    return
  }

  await loadDeck()
}

// ── Load dogs this user hasn't swiped on ──────────────────────────────────────

async function loadDeck() {
  const { data: dogs, error } = await supabase
    .from('hotdogs')
    .select(`
      id, name, toppings, photo_url, created_at, user_id,
      profiles:user_id ( display_name, username, avatar_url )
    `)
    .neq('user_id', session.user.id)
    .order('created_at', { ascending: false })

  if (error) {
    showMessage('Something Went Wrong', 'We couldn\'t load the dogs. Try refreshing the page.', '')
    return
  }

  const { data: myVotes } = await supabase
    .from('hotdog_votes')
    .select('hotdog_id')
    .eq('user_id', session.user.id)

  const voted = new Set((myVotes || []).map(v => v.hotdog_id))
  deck = shuffle((dogs || []).filter(d => !voted.has(d.id)))

  if (!deck.length) { await showOutOfDogs(); return }

  deckArea.hidden = true
  swipeUi.hidden  = false
  syncDeck()
}

// ── Deck rendering ────────────────────────────────────────────────────────────

// Keep the DOM in step with the first few dogs in `deck`, reusing existing
// card elements so images don't reload as cards move up the stack.
function syncDeck() {
  const visible = deck.slice(0, VISIBLE_CARDS)
  const keep    = new Set(visible.map(d => d.id))

  deckEl.querySelectorAll('.dog-card:not(.flying)').forEach(card => {
    if (!keep.has(card.dataset.id)) card.remove()
  })

  visible.forEach((dog, pos) => {
    let card = deckEl.querySelector(`.dog-card[data-id="${dog.id}"]:not(.flying)`)
    if (!card) {
      card = createCard(dog)
      deckEl.prepend(card)  // new cards slide in underneath the existing stack
    }
    card.dataset.pos = pos
  })

  dogsLeft.textContent = `${deck.length} ${deck.length === 1 ? 'dog' : 'dogs'} left`
  yumBtn.disabled  = !deck.length
  nopeBtn.disabled = !deck.length
}

function createCard(dog) {
  const profile = dog.profiles || {}
  const name    = profile.display_name ? escapeHtml(profile.display_name) : 'Anonymous'
  const avatar  = profile.avatar_url
    ? `<img src="${escapeHtml(profile.avatar_url)}" alt="${name}" class="user-avatar">`
    : `<span class="user-avatar user-avatar-fallback">${name.charAt(0).toUpperCase()}</span>`

  const card = document.createElement('div')
  card.className  = 'dog-card'
  card.dataset.id = dog.id
  card.innerHTML  = `
    <div class="dog-photo">
      <img src="${escapeHtml(dog.photo_url)}" alt="${escapeHtml(dog.name || 'Hot dog')}" draggable="false">
      <span class="stamp yum">YUM</span>
      <span class="stamp nope">NOPE</span>
    </div>
    <div class="dog-info">
      ${dog.name ? `<p class="dog-name">${escapeHtml(dog.name)}</p>` : ''}
      <div class="topping-list">
        ${dog.toppings.map(t => `<span class="topping-chip">${escapeHtml(t)}</span>`).join('')}
      </div>
      <div class="dog-user">
        ${avatar}
        <span class="dog-user-name">${name}</span>
        <span class="dog-time">${timeAgo(dog.created_at)}</span>
      </div>
    </div>
  `
  attachDrag(card)
  return card
}

// ── Dragging ──────────────────────────────────────────────────────────────────

function attachDrag(card) {
  let startX = 0, startY = 0, dx = 0, dy = 0, pointerId = null

  card.addEventListener('pointerdown', (e) => {
    if (card.dataset.pos !== '0' || pointerId !== null) return
    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    dx = dy = 0
    card.setPointerCapture(pointerId)
    card.classList.add('dragging')
  })

  card.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return
    dx = e.clientX - startX
    dy = e.clientY - startY
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.06}deg)`
    card.style.setProperty('--yum',  Math.max(0, Math.min(1,  dx / SWIPE_THRESHOLD)))
    card.style.setProperty('--nope', Math.max(0, Math.min(1, -dx / SWIPE_THRESHOLD)))
  })

  const release = (e, cancelled) => {
    if (e.pointerId !== pointerId) return
    pointerId = null
    card.classList.remove('dragging')
    if (!cancelled && Math.abs(dx) >= SWIPE_THRESHOLD) {
      swipeTop(Math.sign(dx), dy)
    } else {
      card.style.transform = ''
      card.style.setProperty('--yum', 0)
      card.style.setProperty('--nope', 0)
    }
  }
  card.addEventListener('pointerup', (e) => release(e, false))
  card.addEventListener('pointercancel', (e) => release(e, true))  // e.g. the browser took over for a vertical scroll
}

// ── Voting ────────────────────────────────────────────────────────────────────

// dir: 1 = yum (right), -1 = nope (left)
function swipeTop(dir, dy = 0) {
  if (!session || !deck.length) return
  const card = deckEl.querySelector('.dog-card[data-pos="0"]:not(.flying)')
  if (!card) return

  const dog = deck.shift()

  card.classList.add('flying')
  card.style.setProperty(dir > 0 ? '--yum' : '--nope', 1)
  card.style.transform = `translate(${dir * window.innerWidth}px, ${dy}px) rotate(${dir * 30}deg)`
  setTimeout(() => card.remove(), 400)

  syncDeck()
  recordVote(dog, dir)

  if (!deck.length) setTimeout(showOutOfDogs, 400)
}

async function recordVote(dog, dir) {
  const { error } = await supabase.from('hotdog_votes').upsert(
    { hotdog_id: dog.id, user_id: session.user.id, value: dir },
    { onConflict: 'hotdog_id,user_id' }
  )

  if (error) {
    // Put the dog back on top so the vote can be retried
    deck.unshift(dog)
    deckArea.hidden = true
    swipeUi.hidden  = false
    document.getElementById('top-dogs').hidden = true
    syncDeck()
    showToast('Couldn\'t save that swipe. Try again.')
  }
}

// ── End states ────────────────────────────────────────────────────────────────

async function showOutOfDogs() {
  if (deck.length) return  // a failed vote put a dog back in the meantime
  dogsLeft.textContent = ''
  showMessage(
    'You\'ve Judged Every Dog',
    'Check back later for fresh dogs, or submit one of your own.',
    '<a href="submit.html" class="cta-btn">Submit a Dog</a>'
  )
  await loadTopDogs()
}

function showMessage(title, body, actionHtml) {
  swipeUi.hidden  = true
  deckArea.hidden = false
  deckArea.style.width = '100%'
  deckArea.innerHTML = `
    <div class="deck-message">
      <h2>${title}</h2>
      <p>${body}</p>
      ${actionHtml}
    </div>
  `
}

async function loadTopDogs() {
  const { data: dogs, error } = await supabase
    .from('hotdog_leaderboard')
    .select('id, name, toppings, photo_url, display_name, yums, nopes, score')
    .limit(5)

  if (error || !dogs?.length) return

  document.getElementById('top-dog-list').innerHTML = dogs.map((dog, i) => `
    <li class="top-dog-row">
      <span class="top-dog-rank">${i + 1}</span>
      <img class="top-dog-thumb" src="${escapeHtml(dog.photo_url)}" alt="" loading="lazy">
      <div class="top-dog-text">
        <p class="top-dog-name">${escapeHtml(dog.name || `${dog.display_name || 'Anonymous'}'s dog`)}</p>
        <p class="top-dog-toppings">${dog.toppings.map(escapeHtml).join(', ')}</p>
      </div>
      <div class="top-dog-score">
        ${dog.score > 0 ? '+' : ''}${dog.score}
        <small>${dog.yums} yum · ${dog.nopes} nope</small>
      </div>
    </li>
  `).join('')
  document.getElementById('top-dogs').hidden = false
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showToast(msg) {
  const toast = document.createElement('div')
  toast.className   = 'toast'
  toast.textContent = msg
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 3000)
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
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

// ── Sign out ──────────────────────────────────────────────────────────────────

document.getElementById('signout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = 'login.html'
})
