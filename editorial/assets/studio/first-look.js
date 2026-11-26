const panel = document.querySelector('#first-look');
const form = panel.querySelector('form');
const input = form.elements.message;
const thread = panel.querySelector('.kit-thread');
const status = form.querySelector('[role="status"]');
const submit = form.querySelector('[type="submit"]');
const handoff = form.querySelector('.ai-handoff');
const reset = form.querySelector('.ai-reset');
const note = document.querySelector('#message');
const history = [];
let lastAdded = '';

function openLinkedPanel() {
  if (location.hash === '#first-look') panel.open = true;
}
openLinkedPanel();
window.addEventListener('hashchange', openLinkedPanel);

function addTurn(speaker, content) {
  const line = document.createElement('p');
  const label = document.createElement('strong');
  label.textContent = speaker;
  line.append(label, document.createTextNode(content));
  thread.append(line);
  thread.scrollTop = thread.scrollHeight;
  return line;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content || submit.disabled) return;
  const question = {role:'user',content};
  const pending = addTurn('You', content);
  submit.disabled = true;
  input.readOnly = true;
  reset.disabled = true;
  handoff.disabled = true;
  status.textContent = 'Kit is thinking…';
  try {
    const response = await fetch('/api/first-look', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({messages:[...history.slice(-16),question]}),
      signal:AbortSignal.timeout(55000)
    });
    if (!response.ok) throw new Error();
    const {reply} = await response.json();
    if (typeof reply !== 'string' || !reply.trim()) throw new Error();
    history.push(question,{role:'assistant',content:reply});
    addTurn('Kit',reply);
    input.value = '';
    status.textContent = '';
  } catch {
    pending.remove();
    status.textContent = 'Kit couldn’t answer that time. Your message is still here to retry or add to your note.';
  } finally {
    submit.disabled = false;
    input.readOnly = false;
    handoff.disabled = false;
    reset.disabled = false;
    handoff.hidden = false;
    reset.hidden = false;
    if (panel.open && form.contains(document.activeElement)) input.focus({preventScroll:true});
  }
});

handoff.addEventListener('click', () => {
  const goals = history.filter(turn => turn.role === 'user');
  if (input.value.trim()) goals.push({content:input.value.trim()});
  const latestReply = history.at(-1)?.content;
  const parts = [...new Set([goals[0]?.content, goals.at(-1)?.content].filter(Boolean))];
  if (latestReply) parts.push('Kit suggested: '+latestReply);
  const draft = parts.join('\n\n');
  if (draft && draft !== lastAdded) {
    const prefix = note.value.trim() ? note.value.trim()+'\n\n' : '';
    const free = note.maxLength - prefix.length;
    if (free < 60) {
      status.textContent = 'Your note is full. Shorten it before adding this conversation.';
      return;
    }
    note.value = prefix + (draft.length > free ? draft.slice(0,free-1)+'…' : draft);
    lastAdded = draft;
  }
  location.hash = 'contact-form';
  note.focus();
});

reset.addEventListener('click', () => {
  history.length = 0;
  while (thread.children.length > 1) thread.lastElementChild.remove();
  form.reset();
  status.textContent = '';
  reset.hidden = true;
  handoff.hidden = true;
  input.focus();
});
