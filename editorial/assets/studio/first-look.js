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
const mic = form.querySelector('.kit-mic');
const tools = form.querySelector('.kit-voice-tools');
const cancel = form.querySelector('.kit-cancel');
const player = form.querySelector('.kit-audio');
let voiceNext = false;
let recording = null;
let audioUrl = '';
let playbackGeneration = 0;

function clearPlayback() {
  playbackGeneration++;
  player.pause();
  player.removeAttribute('src');
  player.hidden = true;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = '';
}

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
  const voice = voiceNext;
  voiceNext = false;
  clearPlayback();
  const playback = playbackGeneration;
  mic.disabled = true;
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
      body:JSON.stringify({messages:[...history.slice(-16),question],voice}),
      signal:AbortSignal.timeout(65000)
    });
    if (!response.ok) throw new Error();
    const {reply,audio} = await response.json();
    if (typeof reply !== 'string' || !reply.trim()) throw new Error();
    history.push(question,{role:'assistant',content:reply});
    addTurn('Kit',reply);
    input.value = '';
    status.textContent = '';
    if (voice && playback === playbackGeneration && panel.open) {
      if (audio) {
        const bytes = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
        audioUrl = URL.createObjectURL(new Blob([bytes], {type:'audio/mpeg'}));
        player.src = audioUrl;
        player.hidden = false;
        try { await player.play(); } catch { status.textContent = 'Press play to hear Kit.'; }
      } else {
        status.textContent = 'Kit’s reply is above. Voice playback is unavailable right now.';
      }
    }
  } catch {
    pending.remove();
    status.textContent = 'Kit couldn’t answer that time. Your message is still here to retry or add to your note.';
  } finally {
    mic.disabled = false;
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
  clearPlayback();
  history.length = 0;
  while (thread.children.length > 1) thread.lastElementChild.remove();
  form.reset();
  status.textContent = '';
  reset.hidden = true;
  handoff.hidden = true;
  input.focus();
});

// A fixed PCM format gives the server an exact duration before it requests transcription.
function encodeRecording(chunks, frames) {
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const tag = (start, text) => [...text].forEach((c, i) => view.setUint8(start + i, c.charCodeAt(0)));
  tag(0,'RIFF'); view.setUint32(4,buffer.byteLength - 8,true); tag(8,'WAVE');
  tag(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
  view.setUint16(22,1,true); view.setUint32(24,16000,true); view.setUint32(28,32000,true);
  view.setUint16(32,2,true); view.setUint16(34,16,true); tag(36,'data');
  view.setUint32(40,frames * 2,true);
  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const clamped = Math.max(-1,Math.min(1,sample));
      view.setInt16(offset,clamped * (clamped < 0 ? 32768 : 32767),true);
      offset += 2;
    }
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}

function release(session) {
  clearTimeout(session.timer);
  session.stream?.getTracks().forEach(track => track.stop());
  session.node?.disconnect();
  if (session.context && session.context.state !== 'closed') session.context.close().catch(() => {});
}

function unlockRecorder() {
  mic.textContent = 'Talk to Kit';
  mic.disabled = false;
  cancel.hidden = true;
  submit.disabled = false;
  reset.disabled = false;
  handoff.disabled = false;
  input.readOnly = false;
}

async function endRecording(send) {
  const session = recording;
  if (!session) return;
  release(session);
  session.capturing = false;
  if (!send || session.frames < 1600) {
    recording = null;
    session.abort.abort();
    unlockRecorder();
    status.textContent = send ? 'That was too short. Try again when you’re ready.' : '';
    return;
  }
  mic.disabled = true;
  status.textContent = 'Listening to your question…';
  try {
    const response = await fetch('/api/kit-voice', {
      method:'POST', headers:{'Content-Type':'application/json'},
      signal:AbortSignal.any([session.abort.signal,AbortSignal.timeout(25000)]),
      body:JSON.stringify({recording:encodeRecording(session.chunks,session.frames)})
    });
    const data = await response.json();
    if (!response.ok || !data.transcript) throw Error(data.error || 'Voice is unavailable. You can still type to Kit.');
    if (recording !== session) return;
    recording = null;
    unlockRecorder();
    input.value = data.transcript;
    voiceNext = true;
    form.requestSubmit();
  } catch (error) {
    if (recording !== session) return;
    recording = null;
    unlockRecorder();
    status.textContent = error.message.startsWith('Voice') || error.message.startsWith('Try') ? error.message : 'That recording didn’t go through. Try again or type your question.';
  }
}

mic.addEventListener('click', async () => {
  if (recording?.capturing) return endRecording(true);
  if (recording || submit.disabled) return;
  if (input.value.trim()) {
    status.textContent = 'Send or clear your typed draft before recording.';
    return;
  }
  clearPlayback();
  const session = {frames:0,chunks:[],abort:new AbortController()};
  recording = session;
  mic.disabled = true;
  submit.disabled = true;
  reset.disabled = true;
  handoff.disabled = true;
  input.readOnly = true;
  cancel.hidden = false;
  status.textContent = 'Opening your microphone…';
  try {
    session.context = new AudioContext({sampleRate:16000});
    await session.context.resume();
    if (recording !== session) return;
    session.stream = await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true},video:false});
    if (recording !== session) return release(session);
    await session.context.audioWorklet.addModule('/assets/studio/kit-recorder.js');
    if (recording !== session) return;
    session.node = new AudioWorkletNode(session.context,'kit-recorder');
    session.node.port.onmessage = ({data}) => {
      if (recording !== session || !session.capturing) return;
      const count = Math.min(data.length,400000-session.frames);
      session.chunks.push(data.subarray(0,count));
      session.frames += count;
      if (session.frames === 400000) endRecording(true);
    };
    session.context.createMediaStreamSource(session.stream).connect(session.node);
    session.node.connect(session.context.destination);
    session.capturing = true;
    session.timer = setTimeout(() => endRecording(true),25000);
    mic.textContent = 'Send recording';
    mic.disabled = false;
    status.textContent = 'Listening. Tap Send recording when you’re done.';
  } catch (error) {
    if (recording !== session) return;
    await endRecording(false);
    status.textContent = error.name === 'NotAllowedError' ? 'Your microphone is off. You can allow it in your browser or type here.' : 'Your microphone couldn’t start. You can type here.';
  }
});

cancel.addEventListener('click', () => endRecording(false));
function leaveVoice() {
  if (recording) endRecording(false);
  clearPlayback();
}
panel.addEventListener('toggle', () => { if (!panel.open) leaveVoice(); });
window.addEventListener('pagehide',leaveVoice);
if (window.AudioContext && window.AudioWorkletNode && navigator.mediaDevices?.getUserMedia) {
  const checkVoice = async () => {
    if (!panel.open) return;
    panel.removeEventListener('toggle',checkVoice);
    try {
      const response = await fetch('/api/kit-voice',{cache:'no-store'});
      if (response.ok && (await response.json()).enabled) mic.hidden = tools.hidden = false;
    } catch {}
  };
  panel.addEventListener('toggle',checkVoice);
  checkVoice();
}
