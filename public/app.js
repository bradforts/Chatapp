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
  let user = null; let registering = true; let toastTimer; let currentRoom = 'public'; let roomRequest = 0;
  let activeFilter = 'all';
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
    row.innerHTML = `${mine ? '' : `<div class="person-avatar" style="--avatar:${color}">${escape(initials(message.author))}</div>`}<div class="message-content">${mine ? '' : `<button class="author profile-link" data-username="${escape(message.author)}">${escape(message.author)}</button>`}<div class="message-bubble">${escape(message.text).replace(/\n/g, '<br>')}</div><time>${timeLabel(message.createdAt)}</time></div>`;
    messages.appendChild(row); messages.scrollTop = messages.scrollHeight;
    document.querySelector('#lastPreview').textContent = `${mine ? 'You: ' : `${message.author}: `}${message.text}`;
    document.querySelector('#lastTime').textContent = timeLabel(message.createdAt);
  }
  async function loadHistory(roomId = currentRoom) {
    const requestId = ++roomRequest;
    messages.innerHTML = '<div class="day-divider"><span>TODAY</span></div><div class="loading">Loading messages…</div>';
    try {
      const response = await fetch(`/api/messages?room=${encodeURIComponent(roomId)}`); if (!response.ok) throw new Error();
      const history = await response.json(); if (requestId !== roomRequest) return; document.querySelector('.loading')?.remove();
      if (!history.length) { const empty = document.createElement('div'); empty.className = 'room-empty'; empty.innerHTML = '<div>✦</div><strong>It’s quiet in here…</strong><span>Be the first to say hello.</span>'; messages.appendChild(empty); }
      else history.forEach(addMessage);
    } catch { showToast('Could not load chat history. Refresh to try again.'); }
  }
  async function loadGroups() {
    const response = await fetch('/api/groups'); if (!response.ok) return;
    const groups = await response.json(); const list = document.querySelector('#groupList'); list.replaceChildren();
    document.querySelector('#chatCount').textContent = groups.length;
    for (const group of groups.filter((item) => item.id !== 'public')) {
      const card = document.createElement('button'); card.className = 'conversation'; card.dataset.room = group.id; card.dataset.group = 'true';
      card.innerHTML = `<div class="room-avatar"><span>♧</span></div><div class="conversation-copy"><div class="conversation-title"><strong>${escape(group.name)}</strong></div><div class="conversation-preview">Group chat</div></div>`;
      card.addEventListener('click', () => selectRoom(group)); list.appendChild(card);
    }
    applyChatFilter();
  }
  function applyChatFilter() {
    const cards = [...document.querySelectorAll('.conversation')];
    const visibleCards = cards.filter((card) => {
      if (activeFilter === 'groups') return card.dataset.group === 'true';
      if (activeFilter === 'unread') return card.dataset.unread === 'true';
      return true;
    });
    cards.forEach((card) => { card.hidden = !visibleCards.includes(card); });
    document.querySelector('.section-label').hidden = activeFilter === 'groups' || activeFilter === 'unread';
    const note = document.querySelector('.empty-note');
    note.hidden = visibleCards.length > 0;
    note.textContent = activeFilter === 'unread' ? 'You’re all caught up.' : activeFilter === 'groups' ? 'No group chats yet. Create one to get started.' : 'A little room for good conversations.';
    document.querySelector('#chatCount').textContent = activeFilter === 'unread' ? visibleCards.length : cards.length;
    const unreadCount = cards.filter((card) => card.dataset.unread === 'true').length;
    document.querySelector('[data-filter="unread"] span').textContent = unreadCount;
  }
  function selectRoom(room) {
    currentRoom = room.id;
    document.querySelectorAll('.conversation').forEach((card) => card.classList.toggle('selected', card.id === 'roomCard' ? room.id === 'public' : card.dataset.room === room.id));
    document.querySelector('.room-heading h2').textContent = room.name;
    document.querySelector('.room-heading .subtle').textContent = room.id === 'public' ? '· Public room' : '· Group chat';
    document.querySelector('.welcome-banner').hidden = room.id !== 'public';
    socket.emit('chat:select', room.id); loadHistory(room.id);
  }
  function enterChat(account) {
    user = { ...account, color: colors[Math.floor(Math.random() * colors.length)] };
    document.querySelector('#myAvatar').textContent = initials(user.username);
    document.querySelector('#myAvatar').style.background = user.color;
    dialog.close(); socket.connect(); loadGroups(); selectRoom({ id: 'public', name: 'Good vibes only' });
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
  const profileDialog = document.querySelector('#profileDialog');
  const profileForm = document.querySelector('#profileForm');
  const profileFields = document.querySelector('#profileFields');
  const profileKeys = [['displayName', 'Display name', 40], ['statusMessage', 'Status message', 80], ['bio', 'About', 300], ['location', 'Location', 60], ['website', 'Website', 120]];
  let viewedProfile = null;
  function showProfile(profile, editing = false) {
    viewedProfile = profile;
    document.querySelector('#profileName').textContent = profile.displayName || profile.username;
    document.querySelector('#profileUsername').textContent = `@${profile.username}`;
    document.querySelector('#profileStatus').textContent = profile.statusMessage || '';
    document.querySelector('#profileAvatar').textContent = initials(profile.displayName || profile.username);
    profileFields.innerHTML = profileKeys.map(([key, label, max]) => {
      const value = profile[key] || '';
      return `<label class="profile-field"><span>${label}</span>${editing ? `<input name="${key}" maxlength="${max}" value="${escape(value)}" ${key === 'website' ? 'type="url" placeholder="https://example.com"' : ''}>` : `<div>${key === 'website' && value ? `<a href="${escape(value)}" target="_blank" rel="noopener noreferrer">${escape(value)}</a>` : escape(value) || '<span class="profile-empty">Not set</span>'}</div>`}</label>`;
    }).join('') + `<div class="profile-field"><span>Member since</span><div>${profile.createdAt ? new Intl.DateTimeFormat([], { dateStyle: 'medium' }).format(new Date(profile.createdAt)) : '—'}</div></div>`;
    const own = user && profile.username === user.username;
    document.querySelector('#editProfileButton').hidden = !own || editing;
    document.querySelector('#saveProfileButton').hidden = !own || !editing;
    document.querySelector('#cancelProfile').textContent = editing ? 'Cancel' : 'Close';
    document.querySelector('#profileError').textContent = '';
  }
  async function openProfile(username = user?.username) {
    if (!username) return;
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(username)}`);
      const profile = await response.json(); if (!response.ok) throw new Error(profile.error || 'Could not load profile.');
      showProfile(profile); profileDialog.showModal();
    } catch (error) { showToast(error.message || 'Could not load profile.'); }
  }
  document.querySelector('#myAvatar').addEventListener('click', () => openProfile());
  messages.addEventListener('click', (event) => { const link = event.target.closest('.profile-link'); if (link) openProfile(link.dataset.username); });
  document.querySelector('#closeProfileDialog').addEventListener('click', () => profileDialog.close());
  document.querySelector('#cancelProfile').addEventListener('click', () => { if (document.querySelector('#saveProfileButton').hidden === false) showProfile(viewedProfile); else profileDialog.close(); });
  document.querySelector('#editProfileButton').addEventListener('click', () => showProfile(viewedProfile, true));
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const errorNode = document.querySelector('#profileError'); errorNode.textContent = '';
    const payload = Object.fromEntries(profileKeys.map(([key]) => [key, profileForm.elements.namedItem(key).value]));
    const button = document.querySelector('#saveProfileButton'); button.disabled = true;
    try {
      const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not save profile.');
      user = { ...user, ...result }; document.querySelector('#myAvatar').textContent = initials(user.displayName || user.username);
      showProfile(result); showToast('Profile updated.');
    } catch (error) { errorNode.textContent = error.message || 'Could not save profile.'; }
    finally { button.disabled = false; }
  });
  document.querySelector('#roomCard').addEventListener('click', () => selectRoom({ id: 'public', name: 'Good vibes only' }));
  document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('.filter').forEach((filter) => {
      const selected = filter === button;
      filter.classList.toggle('active', selected);
      filter.setAttribute('aria-pressed', String(selected));
    });
    applyChatFilter();
  }));
  const groupDialog = document.querySelector('#groupDialog');
  const groupForm = document.querySelector('#groupForm');
  const groupNameInput = document.querySelector('#groupNameInput');
  const groupMembersInput = document.querySelector('#groupMembersInput');
  const inviteSuggestions = document.querySelector('#inviteSuggestions');
  const groupError = document.querySelector('#groupError');
  let inviteSearchTimer; let inviteSearchRequest = 0;
  function hideInviteSuggestions() { inviteSuggestions.hidden = true; inviteSuggestions.replaceChildren(); }
  groupMembersInput.addEventListener('input', () => {
    clearTimeout(inviteSearchTimer);
    const requestId = ++inviteSearchRequest;
    const query = groupMembersInput.value.split(',').at(-1).trim();
    if (query.length < 2) { hideInviteSuggestions(); return; }
    inviteSearchTimer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/users?search=${encodeURIComponent(query)}`);
        const profiles = await response.json();
        if (requestId !== inviteSearchRequest) return;
        inviteSuggestions.replaceChildren();
        for (const profile of profiles) {
          const item = document.createElement('div'); item.className = 'invite-suggestion'; item.setAttribute('role', 'option');
          const avatar = document.createElement('span'); avatar.className = 'invite-avatar'; avatar.textContent = initials(profile.displayName || profile.username);
          const details = document.createElement('span'); details.className = 'invite-details';
          const name = document.createElement('strong'); name.textContent = profile.displayName || profile.username;
          const username = document.createElement('span'); username.textContent = `@${profile.username}`;
          const status = document.createElement('small'); status.textContent = profile.statusMessage || profile.bio || 'No status message';
          details.append(name, username, status);
          const actions = document.createElement('span'); actions.className = 'invite-actions';
          const view = document.createElement('button'); view.type = 'button'; view.textContent = 'Profile';
          view.addEventListener('click', (event) => { event.stopPropagation(); openProfile(profile.username); });
          const add = document.createElement('button'); add.type = 'button'; add.textContent = 'Add';
          add.addEventListener('click', () => {
            const names = groupMembersInput.value.split(',').slice(0, -1).map((value) => value.trim()).filter(Boolean);
            if (!names.some((value) => value.toLowerCase() === profile.username.toLowerCase())) names.push(profile.username);
            groupMembersInput.value = `${names.join(', ')}, `; groupMembersInput.focus(); hideInviteSuggestions();
          });
          actions.append(view, add); item.append(avatar, details, actions); inviteSuggestions.append(item);
        }
        inviteSuggestions.hidden = profiles.length === 0;
      } catch { hideInviteSuggestions(); }
    }, 220);
  });
  const closeGroupDialog = () => { groupDialog.close(); groupForm.reset(); groupError.textContent = ''; hideInviteSuggestions(); };
  document.querySelector('#newGroupButton').addEventListener('click', () => {
    groupError.textContent = ''; groupDialog.showModal(); groupNameInput.focus();
  });
  document.querySelector('#closeGroupDialog').addEventListener('click', closeGroupDialog);
  document.querySelector('#cancelGroupDialog').addEventListener('click', closeGroupDialog);
  groupForm.addEventListener('submit', async (event) => {
    event.preventDefault(); groupError.textContent = '';
    const submit = document.querySelector('#createGroupSubmit'); submit.disabled = true;
    try {
      const response = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: groupNameInput.value.trim(), usernames: groupMembersInput.value.split(',').map((value) => value.trim()).filter(Boolean) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not create group.');
      closeGroupDialog(); await loadGroups(); selectRoom(result); showToast('Group chat created.');
    } catch (error) { groupError.textContent = error.message || 'Could not create group. Please try again.'; }
    finally { submit.disabled = false; }
  });
  document.querySelector('#searchInput').addEventListener('input', (event) => { const query = event.target.value.toLowerCase(); document.querySelectorAll('.message-row').forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(query); }); });
})();
