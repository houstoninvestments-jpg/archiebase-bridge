
const examples = {
  furniture: { title: 'Furniture repair quote', questions: ['What piece needs work?', 'Approximate dimensions', 'What would you like repaired?', 'City and preferred timing'] },
  auto: { title: 'Auto detailing quote', questions: ['Year, make and model', 'Interior, exterior or both?', 'What needs extra attention?', 'City and preferred timing'] },
  yard: { title: 'Yard care quote', questions: ['What work needs doing?', 'Approximate area', 'Any access issues?', 'City and preferred timing'] }
};
const get = id => document.getElementById(id);
let kind = 'furniture';
function clearResult() {
  get('result').hidden = true;
  get('copied').textContent = '';
}
document.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => {
  kind = button.dataset.kind;
  document.querySelectorAll('[data-kind]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  get('ticket-title').textContent = examples[kind].title;
  get('prompts').replaceChildren(...examples[kind].questions.map(question => {
    const li = document.createElement('li');
    li.textContent = question;
    return li;
  }));
  clearResult();
}));
get('make').addEventListener('click', () => {
  const form = get('maker');
  form.hidden = !form.hidden;
  get('make').setAttribute('aria-expanded', String(!form.hidden));
  if (!form.hidden) get('dest').focus();
});
get('dest').addEventListener('input', clearResult);
get('maker').addEventListener('submit', event => {
  event.preventDefault();
  const example = examples[kind];
  const address = get('dest').value.trim().split('@').map(encodeURIComponent).join('@');
  const body = ['Hello, I’d like a quote.', ...example.questions, 'I can attach photos here before sending.'].join('\r\n\r\n');
  const url = 'mailto:' + address + '?subject=' + encodeURIComponent(example.title) + '&body=' + encodeURIComponent(body);
  get('trylink').href = url;
  get('urlout').value = url;
  get('result').hidden = false;
  get('copied').textContent = '';
});
get('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(get('urlout').value);
    get('copied').textContent = ' Copied.';
  } catch {
    get('urlout').select();
    get('copied').textContent = ' Link selected. Use your device’s Copy command.';
  }
});
const request = get('request');
let topic = 'Free first fix';
document.querySelectorAll('[data-topic]').forEach(link => link.addEventListener('click', () => {
  topic = link.dataset.topic;
  if (!get('message').value.trim()) get('message').value = topic + ' for my business: ';
  get('message').focus({preventScroll:true});
}));
request.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(request);
  const button = request.querySelector('button');
  const status = get('formstatus');
  button.disabled = true;
  status.textContent = 'Sending…';
  try {
    const response = await fetch('/api/contact', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      name:data.get('name'), business:data.get('business'), email:data.get('email'), website:data.get('website'), issue:topic,
      message:data.get('message') + (data.get('site') ? '\nWebsite: ' + data.get('site') : '')
    })});
    const reply = await response.json();
    if (!response.ok || !reply.ok) throw new Error();
    status.textContent = 'Your request was sent. I’ll reply by email.';
    request.reset();
    topic = 'Free first fix';
  } catch {
    status.textContent = 'Your request could not be sent. Your details are still here so you can try again.';
  } finally {
    button.disabled = false;
  }
});

const projectButtons = Array.from(document.querySelectorAll('[data-sheet]'));
const stories = Array.from(document.querySelectorAll('[data-story]'));
const stage = document.querySelector('.platen');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function openProject(selected) {
  if (selected.getAttribute('aria-pressed') === 'true') return;
  for (const button of projectButtons) {
    const active = button === selected;
    button.setAttribute('aria-pressed', String(active));
    const sheet = get(button.dataset.sheet);
    sheet.hidden = !active;
    if (active && !reduceMotion.matches) {
      sheet.animate([
        {opacity:0.15, transform:'translate(18px,12px) rotate(3deg)'},
        {opacity:1, transform:'translate(0,0) rotate(-1deg)'}
      ], {duration:370, easing:'cubic-bezier(.19,.8,.2,1)'});
    }
  }
  for (const story of stories) story.hidden = story.dataset.story !== selected.dataset.sheet;
  stage.dataset.active = selected.dataset.sheet;
}
for (const button of projectButtons) {
  button.addEventListener('click', () => openProject(button));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const index = (projectButtons.indexOf(button) + direction + projectButtons.length) % projectButtons.length;
    projectButtons[index].focus();
    openProject(projectButtons[index]);
  });
}
