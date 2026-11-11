(() => {
  const socket = io({ autoConnect: false });
  const messages = document.querySelector('#messages');
  const form = document.querySelector('#chatForm');
  const input = document.querySelector('#messageInput');
  const dialog = document.querySelector('#nameDialog');
  const usernameInput = document.querySelector('#usernameInput');
  const passwordInput = document.querySelector('#passwordInput');
  const authError = document.querySelector('#authError');
  const toast = document.querySelector('#toast');
  const colors = ['#7b72d8', '#ed8a68', '#4eaa8b', '#d66b9e', '#5d8fce', '#bd8b45'];
  let user = null; let registering = true; let toastTimer;
  const escape = (value) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const timeLabel = (date) => new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date(date));
  const showToast = (text) => { toast.textContent = text; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000); };

  function addMessage(message) {
    document.querySelector('.loading')?.remove();
    document.querySelector('.room-empty')?.remove();
    const mine = message.author === user?.username;
    const row = document.createElement('article'); row.className = `message-row ${mine ? 'mine' : ''}`;
    const color = mine ? user.color : colors[(message.author.charCodeAt(0) || 0) % colors.length];
    row.innerHTML = `${mine ? '' : `<div class="person-avatar" style="--avatar:${color}">${escape(initials(message.author))}</div>`}<div class="message-content">${mine ? '' : `<div class="author">${escape(message.author)}</div>`}<div class="message-bubble">${escape(message.text).replace(/\n/g, '<br>')}</div><time>${timeLabel(message.createdAt)}</time></div>`;
    messages.appendChild(row); messages.scrollTop = messages.scrollHeight;
    document.querySelector('#lastPreview').textContent = `${mine ? 'You: ' : `${message.author}: `}${message.text}`;
    document.querySelector('#lastTime').textContent = timeLabel(message.createdAt);
  }
  async function loadHistory() {
    try {
      const response = await fetch('/api/messages'); if (!response.ok) throw new Error();
      const history = await response.json(); document.querySelector('.loading')?.remove();
      if (!history.length) { const empty = document.createElement('div'); empty.className = 'room-empty'; empty.innerHTML = '<div>✦</div><strong>It’s quiet in here…</strong><span>Be the first to say hello.</span>'; messages.appendChild(empty); }
      else history.forEach(addMessage);
    } catch { showToast('Could not load chat history. Refresh to try again.'); }
  }
  function enterChat(account) {
    user = { ...account, color: colors[Math.floor(Math.random() * colors.length)] };
    document.querySelector('#myAvatar').textContent = initials(user.username);
    document.querySelector('#myAvatar').style.background = user.color;
    dialog.close(); socket.connect(); loadHistory();
  }
  async function checkLogin() {
    try { const response = await fetch('/api/auth/me'); if (!response.ok) throw new Error(); enterChat(await response.json()); }
    catch { dialog.showModal(); setTimeout(() => usernameInput.focus(), 50); }
  }
  checkLogin();

  document.querySelector('#authSwitch').addEventListener('click', () => {
    registering = !registering;
    document.querySelector('#authTitle').textContent = registering ? 'Create your account' : 'Welcome back';
    document.querySelector('#authSubmit').innerHTML = `${registering ? 'Create account' : 'Log in'} <span>→</span>`;
    document.querySelector('#authSwitch').textContent = registering ? 'Already have an account? Log in' : 'New here? Create an account';
    passwordInput.autocomplete = registering ? 'new-password' : 'current-password'; authError.textContent = '';
  });
  document.querySelector('#authForm').addEventListener('submit', async (event) => {
    event.preventDefault(); authError.textContent = '';
    const button = document.querySelector('#authSubmit'); button.disabled = true;
    try {
      const response = await fetch(`/api/auth/${registering ? 'register' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not sign in.');
      passwordInput.value = ''; enterChat(result);
    } catch (error) { authError.textContent = error.message || 'Could not connect. Please try again.'; }
    finally { button.disabled = false; }
  });
  document.querySelector('#logoutButton').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' }); socket.disconnect(); user = null;
    messages.innerHTML = '<div class="day-divider"><span>TODAY</span></div><div class="loading">Bringing the room to life<span> · · ·</span></div>';
    usernameInput.value = ''; passwordInput.value = ''; registering = false;
    document.querySelector('#authTitle').textContent = 'Welcome back';
    document.querySelector('#authSubmit').innerHTML = 'Log in <span>→</span>';
    document.querySelector('#authSwitch').textContent = 'New here? Create an account';
    dialog.showModal();
  });
  form.addEventListener('submit', (event) => { event.preventDefault(); const text = input.value.trim(); if (!text || !user) return; socket.emit('chat:message', text); input.value = ''; input.style.height = 'auto'; input.focus(); });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
  socket.on('chat:message', addMessage); socket.on('chat:error', showToast);
  socket.on('connect_error', () => { showToast('Chat connection lost. Please log in again.'); });
  socket.on('chat:notice', (notice) => { const line = document.createElement('div'); line.className = 'notice'; line.textContent = notice.text; messages.appendChild(line); messages.scrollTop = messages.scrollHeight; });
  document.querySelector('#dismissWelcome').addEventListener('click', (event) => event.currentTarget.closest('.welcome-banner').remove());
  document.querySelector('#searchInput').addEventListener('input', (event) => { const query = event.target.value.toLowerCase(); document.querySelectorAll('.message-row').forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(query); }); });
})();
