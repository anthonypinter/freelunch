import { supabase } from './supabase.js'

const SUGGESTED_TOPPINGS = [
  'Ketchup', 'Mustard', 'Relish', 'Onions', 'Sauerkraut', 'Chili',
  'Cheese', 'Jalapeños', 'Pickle', 'Tomato', 'Sport Peppers', 'Celery Salt',
  'Bacon', 'Coleslaw',
]
const MAX_TOPPINGS = 20

const dropZone    = document.getElementById('drop-zone')
const fileInput   = document.getElementById('photo-input')
const preview     = document.getElementById('photo-preview')
const previewImg  = document.getElementById('preview-img')
const removeBtn   = document.getElementById('remove-photo')
const nameInput   = document.getElementById('dog-name')
const toppingBox  = document.getElementById('topping-box')
const toppingIn   = document.getElementById('topping-input')
const suggestions = document.getElementById('topping-suggestions')
const form        = document.getElementById('submit-form')
const submitBtn   = document.getElementById('submit-btn')
const msgBox      = document.getElementById('form-message')

let session      = null
let selectedFile = null
let toppings     = []

// ── Auth guard ────────────────────────────────────────────────────────────────

async function init() {
  const { data: { session: s } } = await supabase.auth.getSession()
  if (!s) { window.location.href = 'login.html?next=submit.html'; return }
  session = s

  renderToppings()
}

// ── Photo selection ───────────────────────────────────────────────────────────

dropZone.addEventListener('click', () => fileInput.click())

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault()
  dropZone.classList.add('drag-over')
})
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
dropZone.addEventListener('drop', (e) => {
  e.preventDefault()
  dropZone.classList.remove('drag-over')
  const file = e.dataTransfer.files[0]
  if (file) setFile(file)
})

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setFile(fileInput.files[0])
})

removeBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  clearFile()
})

function setFile(file) {
  if (!file.type.startsWith('image/')) {
    showMessage('Please select an image file.', 'error')
    return
  }
  selectedFile = file
  const url = URL.createObjectURL(file)
  previewImg.src = url
  dropZone.hidden = true
  preview.hidden  = false
  clearMessage()
}

function clearFile() {
  selectedFile = null
  fileInput.value = ''
  previewImg.src  = ''
  preview.hidden  = true
  dropZone.hidden = false
}

// ── Toppings ──────────────────────────────────────────────────────────────────

toppingBox.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remove]')
  if (btn) removeTopping(Number(btn.dataset.remove))
  toppingIn.focus()
})

toppingIn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addTopping(toppingIn.value)
  } else if (e.key === 'Backspace' && !toppingIn.value && toppings.length) {
    removeTopping(toppings.length - 1)
  }
})

// Commit whatever's half-typed when the field loses focus (e.g. tapping Submit)
toppingIn.addEventListener('blur', () => {
  if (toppingIn.value.trim()) addTopping(toppingIn.value)
})

suggestions.addEventListener('click', (e) => {
  const btn = e.target.closest('.suggestion-btn')
  if (!btn) return
  const idx = indexOfTopping(btn.dataset.topping)
  if (idx === -1) addTopping(btn.dataset.topping)
  else removeTopping(idx)
})

function addTopping(raw) {
  const topping = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  toppingIn.value = ''
  if (!topping || indexOfTopping(topping) !== -1) return
  if (toppings.length >= MAX_TOPPINGS) {
    showMessage(`That's a lot of toppings. ${MAX_TOPPINGS} max!`, 'error')
    return
  }
  toppings.push(topping)
  clearMessage()
  renderToppings()
}

function removeTopping(idx) {
  toppings.splice(idx, 1)
  renderToppings()
}

function indexOfTopping(topping) {
  return toppings.findIndex(t => t.toLowerCase() === topping.toLowerCase())
}

function renderToppings() {
  toppingBox.querySelectorAll('.topping-chip').forEach(chip => chip.remove())
  toppings.forEach((t, i) => {
    const chip = document.createElement('span')
    chip.className = 'topping-chip'
    chip.innerHTML = `${escapeHtml(t)}<button type="button" data-remove="${i}" aria-label="Remove ${escapeHtml(t)}">×</button>`
    toppingBox.insertBefore(chip, toppingIn)
  })
  toppingIn.placeholder = toppings.length ? 'Add another…' : 'Type a topping, press Enter'

  suggestions.innerHTML = SUGGESTED_TOPPINGS.map(t => `
    <button type="button" class="suggestion-btn ${indexOfTopping(t) !== -1 ? 'added' : ''}"
            data-topping="${escapeHtml(t)}">${escapeHtml(t)}</button>
  `).join('')
}

// ── Submit ────────────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  clearMessage()

  if (toppingIn.value.trim()) addTopping(toppingIn.value)

  if (!selectedFile) { showMessage('Please add a photo of your dog.', 'error'); return }
  if (!toppings.length) { showMessage('Please add at least one topping.', 'error'); return }

  setLoading(true)

  try {
    const ext  = selectedFile.name.split('.').pop()
    const path = `public/${session.user.id}-${Date.now()}.${ext}`

    const { data: file, error: uploadError } = await supabase.storage
      .from('hotdog-photos')
      .upload(path, selectedFile, { upsert: false })

    if (uploadError) throw uploadError

    const { data: { publicUrl: photoUrl } } = supabase.storage
      .from('hotdog-photos')
      .getPublicUrl(file.path)

    const { error: insertError } = await supabase.from('hotdogs').insert({
      user_id:   session.user.id,
      name:      nameInput.value.trim() || null,
      toppings,
      photo_url: photoUrl,
    })

    if (insertError) throw insertError

    showMessage('Dog submitted! Let the judging begin.', 'success')
    nameInput.value = ''
    toppings = []
    renderToppings()
    clearFile()

    setTimeout(() => { window.location.href = 'index.html' }, 1500)

  } catch (err) {
    showMessage(err.message, 'error')
  } finally {
    setLoading(false)
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function showMessage(msg, type) {
  msgBox.textContent = msg
  msgBox.className   = `form-message ${type}`
  msgBox.hidden      = false
}
function clearMessage() {
  msgBox.hidden = true
}
function setLoading(on) {
  submitBtn.disabled    = on
  submitBtn.textContent = on ? 'Submitting…' : 'Submit This Dog'
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

document.addEventListener('DOMContentLoaded', init)

// ── Sign out ──────────────────────────────────────────────────────────────────

document.getElementById('signout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = 'login.html'
})
