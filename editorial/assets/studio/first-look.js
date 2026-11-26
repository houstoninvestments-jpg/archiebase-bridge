const panel = document.querySelector('#first-look');
function openLinkedPanel() {
  if (location.hash === '#first-look') panel.open = true;
}
openLinkedPanel();
window.addEventListener('hashchange', openLinkedPanel);
const form = panel.querySelector('form');
const goal = form.elements.goal;
const answer = form.elements.answer;
const question = panel.querySelector('.ai-question');
const reply = panel.querySelector('.ai-reply');
const suggestion = panel.querySelector('.ai-suggestion');
const status = panel.querySelector('[role="status"]');
const submit = form.querySelector('button');
const handoff = panel.querySelector('.ai-handoff');
const reset = panel.querySelector('.ai-reset');
const message = document.querySelector('#message');

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  const followUp = !reply.hidden;
  if (!(followUp ? answer : goal).value.trim()) return;
  submit.disabled = true;
  goal.readOnly = true;
  answer.readOnly = true;
  status.textContent = followUp ? 'Thinking through a first step…' : 'Reading your idea…';
  try {
    const response = await fetch('/api/first-look', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(followUp ? {goal:goal.value,question:question.textContent,answer:answer.value} : {goal:goal.value})
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (followUp) {
      if (!data.suggestion) throw new Error();
      suggestion.textContent = data.suggestion;
      suggestion.hidden = false;
      suggestion.focus();
      submit.hidden = true;
      handoff.hidden = false;
    } else {
      if (!data.question) throw new Error();
      question.textContent = data.question;
      reply.hidden = false;
      answer.required = true;
      answer.readOnly = false;
      submit.textContent = 'Show my first step';
      answer.focus();
    }
    status.textContent = '';
    reset.hidden = false;
  } catch {
    status.textContent = 'The AI couldn’t finish this time. Try again, or take your note straight to Aaron.';
    goal.readOnly = followUp;
    answer.readOnly = false;
    handoff.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

let addedDraft = '';
handoff.addEventListener('click', () => {
  const draft = [goal.value.trim(), answer.value.trim(), suggestion.textContent.trim()].filter(Boolean).join('\n\n');
  if (draft && addedDraft !== draft) {
    const combined = [message.value.trim(),draft].filter(Boolean).join('\n\n');
    if (combined.length <= message.maxLength) {
      message.value = combined;
      addedDraft = draft;
    } else {
      status.textContent = 'Your existing note is nearly full. Shorten it before adding this first look.';
      return;
    }
  }
  location.hash = 'contact-form';
  message.focus();
});
reset.addEventListener('click', () => {
  if (submit.disabled) return;
  form.reset(); goal.readOnly = false; answer.readOnly = false; answer.required = false;
  question.textContent = ''; suggestion.textContent = ''; status.textContent = '';
  reply.hidden = true; suggestion.hidden = true; reset.hidden = true; handoff.hidden = true;
  submit.hidden = false; submit.textContent = 'Ask the AI'; goal.focus();
});
