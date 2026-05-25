const tagsArea = document.getElementById('tags-area');
const passwordInput = document.getElementById('admin-password');
const saveButton = document.getElementById('save-button');
const statusMsg = document.getElementById('status-msg');

function setStatus(text, kind) {
  statusMsg.textContent = text;
  statusMsg.className = 'settings-status' + (kind ? ' settings-status-' + kind : '');
}

async function loadTags() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('load failed');
    const { tags } = await res.json();
    tagsArea.value = (tags || []).join('\n');
  } catch (e) {
    setStatus('Could not load current tags. You can still type a list and save.', 'error');
  }
}

saveButton.addEventListener('click', async () => {
  const tags = tagsArea.value
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  if (tags.length === 0) {
    setStatus('Please keep at least one tag.', 'error');
    return;
  }
  if (!passwordInput.value) {
    setStatus('Please enter the admin password.', 'error');
    passwordInput.focus();
    return;
  }

  saveButton.disabled = true;
  setStatus('Saving…', '');

  try {
    const res = await fetch('/api/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value, tags }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      tagsArea.value = (data.tags || tags).join('\n');
      setStatus('Saved! The new tags are now live on the upload page.', 'ok');
    } else if (res.status === 401) {
      setStatus('Wrong password. Please try again.', 'error');
    } else if (res.status === 503) {
      setStatus(data.error || 'Admin password is not set up yet.', 'error');
    } else {
      setStatus(data.error || 'Could not save. Please try again.', 'error');
    }
  } catch (e) {
    setStatus('Could not connect. Check your internet and try again.', 'error');
  } finally {
    saveButton.disabled = false;
  }
});

loadTags();
