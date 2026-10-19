const fileInput = document.querySelector('#billFile');
const dropzone = document.querySelector('#dropzone');
const fileChip = document.querySelector('#fileChip');
const fileName = document.querySelector('#fileName');
const messages = document.querySelector('#messages');
const form = document.querySelector('#chatForm');
const question = document.querySelector('#question');
const sendButton = document.querySelector('#sendButton');
const promiseInput = document.querySelector('#promise');
const lineCard = document.querySelector('#lineCard');
const lineSummary = document.querySelector('#lineSummary');
const history = [];
let selectedFile = null;
let toastTimer;
let databaseReady = false;
let currentUser = null;
let activeConversationId = null;
let allowAutoRestore = true;
let authMode = 'signup';
let accountFormOpen = false;

function toast(text) {
  const el = document.querySelector('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    credentials: 'same-origin'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function setFile(file) {
  if (!file) return;
  const supported = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!supported.includes(file.type)) return toast('Choose a PDF, JPG, PNG, or WebP file.');
  if (file.size > 3 * 1024 * 1024) return toast('This MVP accepts files up to 3 MB.');
  selectedFile = file;
  fileName.textContent = file.name;
  document.querySelector('.file-type').textContent = file.type === 'application/pdf' ? 'PDF' : 'IMG';
  fileChip.classList.remove('hidden');
  dropzone.classList.add('hidden');
  toast('Bill added. Ask a question to start reviewing it.');
}

fileInput.addEventListener('change', event => setFile(event.target.files[0]));
document.querySelector('#removeFile').addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  fileChip.classList.add('hidden');
  dropzone.classList.remove('hidden');
});
['dragenter', 'dragover'].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.remove('dragging'); }));
dropzone.addEventListener('drop', event => setFile(event.dataTransfer.files[0]));

function addMessage(text, role, withSuggestions = false) {
  const row = document.createElement('div');
  row.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'Y' : 'B';
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap';
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = role === 'user' ? 'YOU · NOW' : 'BILLSHIELD · REVIEW';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrap.append(meta, bubble);
  if (withSuggestions) {
    const suggestions = document.createElement('div');
    suggestions.className = 'suggestions';
    for (const [label, prompt] of [['Explain a line', 'Can you explain a line on this bill?'], ['Check the maths', 'Can you check whether these totals add up?']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.prompt = prompt;
      button.textContent = label;
      button.addEventListener('click', () => {
        question.value = prompt;
        question.focus();
        question.dispatchEvent(new Event('input'));
      });
      suggestions.append(button);
    }
    wrap.append(suggestions);
  }
  row.append(avatar, wrap);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

function resetConversationView() {
  messages.replaceChildren();
  history.length = 0;
  activeConversationId = null;
  promiseInput.value = '';
  lineCard.classList.add('hidden');
  addMessage('Add your bill and what you expected. I’ll help you follow the line items, explain unfamiliar wording, and check arithmetic. If the statement doesn’t contain enough evidence, I’ll say so.', 'assistant', true);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function showLineCard(text) {
  const amountMatches = [...text.matchAll(/(?:₹|Rs\.?\s?)([\d,]+(?:\.\d{1,2})?)/g)].map(match => match[0]);
  if (!amountMatches.length) return;
  lineSummary.textContent = `Amounts mentioned in the latest explanation: ${[...new Set(amountMatches)].join(' · ')}\nCheck each figure against the bill before relying on it.`;
  lineCard.classList.remove('hidden');
}

function setAuthView(user) {
  currentUser = user || null;
  const authForm = document.querySelector('#authForm');
  const accountToggle = document.querySelector('#accountToggle');
  const signOutButton = document.querySelector('#signOutButton');
  const list = document.querySelector('#conversationList');
  const copy = document.querySelector('#accountCopy');
  const status = document.querySelector('#privacyStatus');
  const guestBanner = document.querySelector('#authRequiredBanner');
  const authenticated = Boolean(currentUser);
  guestBanner.classList.toggle('hidden', authenticated);
  guestBanner.textContent = databaseReady
    ? 'Guest review is ready. Your conversation stays in this browser session and is not saved. Sign in to keep review history privately.'
    : 'Guest review is ready. Reviews will not be saved, and account sign-in is temporarily unavailable.';
  if (currentUser) {
    accountFormOpen = false;
    authForm.classList.add('hidden');
    accountToggle.classList.add('hidden');
    signOutButton.classList.remove('hidden');
    list.classList.remove('hidden');
    copy.textContent = currentUser.email || 'Signed in';
    status.textContent = 'Private history enabled';
    loadConversationList();
  } else {
    signOutButton.classList.add('hidden');
    list.classList.add('hidden');
    accountToggle.classList.toggle('hidden', !databaseReady);
    accountToggle.textContent = accountFormOpen ? 'Close sign in' : 'Sign in or create account';
    authForm.classList.toggle('hidden', !databaseReady || !accountFormOpen);
    copy.textContent = databaseReady
      ? 'Guest review is available. Sign in or create an account to save private history.'
      : 'Guest review is available. Account storage is not connected, so reviews will not be saved.';
    status.textContent = 'Guest review · not saved';
    list.replaceChildren();
  }
}

document.querySelector('#accountToggle').addEventListener('click', () => {
  accountFormOpen = !accountFormOpen;
  document.querySelector('#authForm').classList.toggle('hidden', !accountFormOpen);
  document.querySelector('#accountToggle').textContent = accountFormOpen ? 'Close sign in' : 'Sign in or create account';
  if (accountFormOpen) document.querySelector('#authEmail').focus();
});

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  document.querySelector('#signupMode').classList.toggle('active', signup);
  document.querySelector('#loginMode').classList.toggle('active', !signup);
  document.querySelector('#signupMode').setAttribute('aria-pressed', String(signup));
  document.querySelector('#loginMode').setAttribute('aria-pressed', String(!signup));
  document.querySelector('#authNameLabel').classList.toggle('hidden', !signup);
  document.querySelector('#authName').classList.toggle('hidden', !signup);
  document.querySelector('#authName').required = false;
  document.querySelector('#authEmail').autocomplete = signup ? 'email' : 'username';
  const password = document.querySelector('#authPassword');
  password.autocomplete = signup ? 'new-password' : 'current-password';
  password.placeholder = signup ? 'At least 8 characters' : 'Your password';
  document.querySelector('#authButton').textContent = signup ? 'Create account' : 'Sign in';
  document.querySelector('#authHelp').textContent = signup
    ? 'Use your email as your BillShield ID. No confirmation email is sent. Keep your password safe; password recovery is not enabled yet.'
    : 'Sign in with the email ID and password you registered.';
  if (!currentUser) document.querySelector('#accountCopy').textContent = signup
    ? 'Guest review is available. Create an account to keep bill reviews private and available next time.'
    : 'Guest review is available. Sign in to return to your saved bill reviews.';
}

async function loadConversationList() {
  if (!databaseReady || !currentUser) return;
  const list = document.querySelector('#conversationList');
  let data;
  try {
    ({ data } = await apiRequest('/api/data?resource=conversations'));
  } catch (error) {
    console.error('Could not load saved conversations:', error.message);
    document.querySelector('#accountCopy').textContent = 'History storage is not ready yet. Apply the database setup, then reload.';
    return;
  }
  list.replaceChildren();
  if (!data.length) {
    const empty = document.createElement('span');
    empty.className = 'conversation-empty';
    empty.textContent = 'Saved reviews will appear here.';
    list.append(empty);
    return;
  }
  for (const item of data) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'saved-conversation';
    button.textContent = item.title || 'Bill review';
    button.title = button.textContent;
    button.classList.toggle('selected', item.id === activeConversationId);
    button.addEventListener('click', () => openConversation(item.id));
    list.append(button);
  }
  if (allowAutoRestore && !activeConversationId && history.length === 0 && data.length) {
    allowAutoRestore = false;
    await openConversation(data[0].id);
  }
}

async function openConversation(id) {
  let conversation;
  let data;
  try {
    ({ data: conversation } = await apiRequest(`/api/data?resource=conversation&id=${encodeURIComponent(id)}`));
    ({ data } = await apiRequest(`/api/data?resource=messages&id=${encodeURIComponent(id)}`));
  } catch (error) {
    return toast(error.message || 'Could not open that saved review.');
  }
  activeConversationId = id;
  history.splice(0, history.length, ...data.map(({ role, content }) => ({ role, content })));
  messages.replaceChildren();
  for (const item of data) addMessage(item.content, item.role);
  if (!data.length) addMessage('This saved review has no messages yet.', 'assistant');
  promiseInput.value = conversation.context || '';
  selectedFile = null;
  fileInput.value = '';
  fileChip.classList.add('hidden');
  dropzone.classList.remove('hidden');
  lineCard.classList.add('hidden');
  const note = document.createElement('div');
  note.className = 'saved-file-note';
  note.textContent = 'Conversation restored. Bill files are not stored; upload the statement again if a new question depends on it.';
  messages.prepend(note);
  loadConversationList();
  question.focus();
}

async function ensureConversation(firstQuestion) {
  if (!currentUser || activeConversationId) return activeConversationId;
  const title = firstQuestion.trim().replace(/\s+/g, ' ').slice(0, 72) || 'Bill review';
  const { data } = await apiRequest('/api/data', {
    method: 'POST', body: JSON.stringify({ action: 'createConversation', title, context: promiseInput.value.trim().slice(0, 3000) })
  });
  activeConversationId = data.id;
  loadConversationList();
  return activeConversationId;
}

async function saveMessage(role, content, firstQuestion = '') {
  if (!currentUser || !databaseReady) return false;
  const id = await ensureConversation(firstQuestion);
  await apiRequest('/api/data', {
    method: 'POST', body: JSON.stringify({
      action: 'saveMessage', conversationId: id, role, content: content.slice(0, 6000),
      context: promiseInput.value.trim().slice(0, 3000)
    })
  });
  return true;
}

document.querySelector('#authForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!databaseReady) return toast('Account storage is not configured yet.');
  const email = document.querySelector('#authEmail').value.trim();
  const displayName = document.querySelector('#authName').value.trim();
  const password = document.querySelector('#authPassword').value;
  const button = document.querySelector('#authButton');
  button.disabled = true;
  try {
    const result = await apiRequest('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ action: authMode, email, password, displayName })
    });
    setAuthView(result.user);
    document.querySelector('#authPassword').value = '';
    toast(authMode === 'signup' ? 'Account created. Your private history is ready.' : 'Signed in. Your private history is ready.');
  } catch (error) {
    console.error('Account authentication error:', error.message);
    toast(error.message || 'Could not create the account. Check your email and password.');
  } finally {
    button.disabled = false;
  }
});
document.querySelector('#signupMode').addEventListener('click', () => setAuthMode('signup'));
document.querySelector('#loginMode').addEventListener('click', () => setAuthMode('login'));

document.querySelector('#signOutButton').addEventListener('click', async () => {
  try { await apiRequest('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }); }
  catch (error) { console.error('Sign-out request failed:', error.message); }
  resetConversationView();
  allowAutoRestore = true;
  setAuthView(null);
  toast('Signed out.');
});

const accountReady = (async () => {
  try {
    const { user } = await apiRequest('/api/auth');
    databaseReady = true;
    setAuthView(user);
  } catch (error) {
    console.error('Database setup unavailable:', error.message);
    document.querySelector('#accountCopy').textContent = 'Account storage is not connected. Guest reviews are still available.';
    setAuthView(null);
  }
})();

form.addEventListener('submit', async event => {
  event.preventDefault();
  const text = question.value.trim();
  if (!text) return;
  await accountReady;
  if (!selectedFile && history.length === 0) return toast('Add a bill before asking your first question.');
  const file = selectedFile;
  addMessage(text, 'user');
  history.push({ role: 'user', content: text });
  question.value = '';
  question.style.height = 'auto';
  sendButton.disabled = true;
  const pending = addMessage('I’m reading the bill and checking what information is available…', 'assistant');
  let saved = false;
  try {
    if (currentUser) {
      try {
        await saveMessage('user', text, text);
        saved = true;
      } catch (error) {
        console.error('Could not save your message:', error.message);
        toast('Review is running, but chat history could not be saved. Check that the database setup was applied.');
      }
    }
    const payload = { message: text, history: history.slice(-11, -1), promise: promiseInput.value.trim() };
    if (file) payload.file = { name: file.name, type: file.type, data: await readFileAsDataURL(file) };
    const headers = { 'Content-Type': 'application/json' };
    const response = await fetch('./api/analyze', {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Bill review failed.');
    pending.textContent = result.answer;
    history.push({ role: 'assistant', content: result.answer });
    if (currentUser && saved) {
      try { await saveMessage('assistant', result.answer); }
      catch (error) { console.error('Could not save the review response:', error.message); toast('The response is ready, but could not be added to saved history.'); }
    } else if (!currentUser) toast('Review ready. Sign in if you want to save this conversation.');
    showLineCard(result.answer);
    loadConversationList();
  } catch (error) {
    pending.textContent = error.message || 'Something went wrong. Please try again.';
    if (currentUser && saved) {
      try { await saveMessage('assistant', pending.textContent); } catch { /* Retain the visible error if storage is unavailable. */ }
    }
  } finally {
    sendButton.disabled = false;
    question.focus();
    messages.scrollTop = messages.scrollHeight;
  }
});

question.addEventListener('input', () => { question.style.height = 'auto'; question.style.height = `${Math.min(question.scrollHeight, 100)}px`; });
question.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
document.querySelector('#understoodButton').addEventListener('click', () => { toast('Marked as understood. No message needed.'); lineCard.classList.add('hidden'); });
document.querySelector('#draftButton').addEventListener('click', () => { question.value = 'Help me draft a polite question to the issuer about this line. Do not claim it is an error.'; question.focus(); question.dispatchEvent(new Event('input')); });
document.querySelector('#newReview').addEventListener('click', () => {
  allowAutoRestore = false;
  resetConversationView();
  selectedFile = null;
  fileInput.value = '';
  fileChip.classList.add('hidden');
  dropzone.classList.remove('hidden');
  loadConversationList();
});

document.querySelector('#calculateButton').addEventListener('click', () => {
  const amountText = document.querySelector('#baseAmount').value.trim().replace(/,/g, '');
  const rateText = document.querySelector('#taxRate').value.trim().replace(/,/g, '');
  const amount = Number(amountText);
  const rate = Number(rateText);
  const result = document.querySelector('#calcResult');
  if (!amountText || !rateText || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100) return toast('Enter a valid charge and tax rate.');
  const tax = Math.round((amount * rate / 100 + Number.EPSILON) * 100) / 100;
  result.textContent = `₹${amount.toFixed(2)} × ${rate}% = ₹${tax.toFixed(2)} tax`;
  result.classList.remove('hidden');
});

resetConversationView();
setAuthMode('signup');
