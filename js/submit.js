import { supabase } from './supabase.js'

const dropZone    = document.getElementById('drop-zone')
const fileInput   = document.getElementById('photo-input')
const preview     = document.getElementById('photo-preview')
const previewImg  = document.getElementById('preview-img')
const removeBtn   = document.getElementById('remove-photo')
const descInput   = document.getElementById('description')
const semesterEl  = document.getElementById('semester-name')
const form        = document.getElementById('submit-form')
const submitBtn   = document.getElementById('submit-btn')
const msgBox      = document.getElementById('form-message')

let session         = null
let currentSemester = null
let selectedFile    = null

// ── Auth guard ────────────────────────────────────────────────────────────────

async function init() {
  const { data: { session: s } } = await supabase.auth.getSession()
  if (!s) { window.location.href = 'login.html'; return }
  session = s
  await loadSemester()
}

// ── Current semester ──────────────────────────────────────────────────────────

async function loadSemester() {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('semesters')
    .select('id, name')
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)
    .single()

  if (data) {
    currentSemester = data
    semesterEl.textContent = data.name
  } else {
    semesterEl.textContent = 'No active semester'
  }
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

// ── Submit ────────────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  clearMessage()

  const description = descInput.value.trim()
  if (!description) { showMessage('Please add a description.', 'error'); return }

  setLoading(true)

  try {
    let photoUrl = null

    if (selectedFile) {
      const ext  = selectedFile.name.split('.').pop()
      const path = `public/${session.user.id}-${Date.now()}.${ext}`

      const { data: file, error: uploadError } = await supabase.storage
        .from('meal-photos')
        .upload(path, selectedFile, { upsert: false })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('meal-photos')
        .getPublicUrl(file.path)

      photoUrl = publicUrl
    }

    const { error: insertError } = await supabase.from('meals').insert({
      user_id:     session.user.id,
      description,
      photo_url:   photoUrl,
      semester_id: currentSemester?.id ?? null,
      status:      'pending',
    })

    if (insertError) throw insertError

    showMessage('Meal logged! Nice score.', 'success')
    descInput.value = ''
    clearFile()

    setTimeout(() => { window.location.href = 'profile.html' }, 1500)

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
  submitBtn.textContent = on ? 'Submitting…' : 'Log This Meal'
}

document.addEventListener('DOMContentLoaded', init)
