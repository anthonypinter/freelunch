import { supabase } from './supabase.js'

const form       = document.getElementById('auth-form')
const emailInput = document.getElementById('email')
const passInput  = document.getElementById('password')
const errorBox   = document.getElementById('auth-error')
const submitBtn  = document.getElementById('submit-btn')
const tabs       = document.querySelectorAll('.auth-tab')

// Extra fields only present on the register tab
const nameInput    = document.getElementById('display-name')
const usernameInput= document.getElementById('username')
const confirmInput = document.getElementById('confirm-password')
const nameRow      = document.getElementById('row-name')
const usernameRow  = document.getElementById('row-username')
const confirmRow   = document.getElementById('row-confirm')

let mode = 'signin' // 'signin' | 'register'

// ── Tab switching ─────────────────────────────────────────────────────────────

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    mode = tab.dataset.mode
    tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode))
    const isRegister = mode === 'register'
    nameRow.hidden     = !isRegister
    usernameRow.hidden = !isRegister
    confirmRow.hidden  = !isRegister
    submitBtn.textContent = isRegister ? 'Create Account' : 'Sign In'
    clearError()
  })
})

// ── Form submit ───────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  clearError()
  setLoading(true)

  const email    = emailInput.value.trim()
  const password = passInput.value

  try {
    if (mode === 'signin') {
      await signIn(email, password)
    } else {
      await register(email, password)
    }
  } catch (err) {
    showError(err.message)
  } finally {
    setLoading(false)
  }
})

async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  window.location.href = 'profile.html'
}

async function register(email, password) {
  const displayName = nameInput.value.trim()
  const username    = usernameInput.value.trim().toLowerCase().replace(/\s+/g, '')
  const confirm     = confirmInput.value

  if (!displayName)       throw new Error('Please enter your name.')
  if (!username)          throw new Error('Please choose a username.')
  if (password !== confirm) throw new Error('Passwords do not match.')
  if (password.length < 6) throw new Error('Password must be at least 6 characters.')

  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error

  // Insert profile row
  if (data.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: data.user.id, display_name: displayName, username })
    if (profileError && profileError.code !== '23505') throw profileError
  }

  showSuccess('Account created! Check your email to confirm, then sign in.')
  switchToSignIn()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showError(msg) {
  errorBox.textContent = msg
  errorBox.hidden = false
  errorBox.className = 'auth-message error'
}

function showSuccess(msg) {
  errorBox.textContent = msg
  errorBox.hidden = false
  errorBox.className = 'auth-message success'
}

function clearError() {
  errorBox.hidden = true
  errorBox.textContent = ''
}

function setLoading(on) {
  submitBtn.disabled = on
  submitBtn.textContent = on
    ? (mode === 'register' ? 'Creating…' : 'Signing in…')
    : (mode === 'register' ? 'Create Account' : 'Sign In')
}

function switchToSignIn() {
  const signinTab = document.querySelector('[data-mode="signin"]')
  signinTab?.click()
}

// ── Redirect if already logged in ─────────────────────────────────────────────

supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) window.location.href = 'index.html'
})
