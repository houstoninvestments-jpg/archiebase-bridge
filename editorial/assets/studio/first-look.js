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
let call = null;
let typing = false;

const contactForm = note.form;
const options = document.querySelector('.reach-options');
const voiceRoute = '#kit-voice';
const voiceSupported = Boolean(window.AudioContext && window.AudioWorkletNode && navigator.mediaDevices?.getUserMedia);
let view = '';
let lastVoiceCheck = 0;

async function chooseRoute(hash, moveFocus) {
  const chat = hash === '#first-look' || hash === voiceRoute;
  const direct = hash === '#contact-form';
  if (call && hash !== voiceRoute) endVoice();
  view = hash;
  panel.open = chat;
  panel.hidden = !chat;
  contactForm.hidden = !direct;
  for (const link of options.querySelectorAll('a')) {
    if (link.hash === hash) link.setAttribute('aria-current','true');
    else link.removeAttribute('aria-current');
  }
  if (!chat) {
    if (moveFocus && direct) note.focus({preventScroll:true});
    return;
  }
  if (moveFocus && hash !== voiceRoute) input.focus({preventScroll:true});
  const id = ++lastVoiceCheck;
  if (hash === voiceRoute && mic.hidden) {
    status.textContent = voiceSupported ? 'Checking microphone availability…' : 'Voice needs a browser with microphone access. You can type your question here or choose Write to Aaron.';
  }
  if (voiceSupported) {
    let available = false;
    try {
      const response = await fetch('/api/voice-conversation',{cache:'no-store'});
      available = response.ok && (await response.json()).enabled;
    } catch {}
    if (view !== hash || id !== lastVoiceCheck) return;
    if (!available && call) endVoice('Voice is unavailable right now. You can type to Kit.');
    mic.hidden = tools.hidden = !available;
    if (hash === voiceRoute && !call && !submit.disabled) {
      status.textContent = available ? 'Start voice chat when you’re ready.' : 'Voice is unavailable right now. Type your question here or choose Write to Aaron.';
      if (moveFocus) (available ? mic : input).focus({preventScroll:true});
    }
  }
}

chooseRoute(location.hash,false);
window.addEventListener('hashchange', () => chooseRoute(location.hash,true));
options.addEventListener('click',event => {
  const link = event.target.closest('a');
  if (link?.hash === voiceRoute && voiceSupported && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    if (location.hash !== voiceRoute) location.hash = voiceRoute;
    chooseRoute(voiceRoute,false);
    if (!call) startVoice();
  } else if (link && link.hash === location.hash) chooseRoute(link.hash,true);
});

// Deal one line per turn. A slow response keeps the same label for its whole wait.
const waitingLines = [
  'Consulting the ampersand…',
  'Moving one pixel left…',
  'Unfolding a pocket-sized theory…',
  'Giving the loose end a tug…',
  'Penciling in a possibility…',
  'Checking behind the obvious…',
  'Turning the sketch sideways…',
  'Borrowing a pencil from the cursor…',
  'Sweeping up spare pixels…',
  'Folding a thought into thirds…',
  'Waking up the little gears…',
  'Making room on the workbench…',
  'Connecting two suspiciously friendly dots…',
  'Looking for the sneaky little hinge…',
  'Holding that thought up to the light…',
  'Assembling a very small staircase…',
  'Untangling the curly bit…',
  'Giving the idea a quarter turn…',
  'Testing the wobbly brick…',
  'Following a particularly good hunch…',
  'Taking a shortcut through the margins…',
  'Putting the kettle on for an idea…',
  'Dusting off the good ruler…',
  'Scooting the pieces into place…'
];
let remainingLines = [];
let previousLine = '';

function showThinking() {
  if (!remainingLines.length) {
    remainingLines = waitingLines.slice();
    for (let i = remainingLines.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingLines[i], remainingLines[j]] = [remainingLines[j], remainingLines[i]];
    }
    const last = remainingLines.length - 1;
    if (remainingLines[last] === previousLine) {
      [remainingLines[0], remainingLines[last]] = [remainingLines[last], remainingLines[0]];
    }
  }
  previousLine = remainingLines.pop();
  const line = document.createElement('span');
  line.className = 'kit-thinking';
  const mark = document.createElement('span');
  mark.className = 'kit-thinking-mark';
  mark.setAttribute('aria-hidden','true');
  line.append(mark, document.createTextNode(previousLine));
  status.replaceChildren(line);
}

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
  typing = true;
  mic.disabled = true;
  const question = {role:'user',content};
  const pending = addTurn('You', content);
  submit.disabled = true;
  input.readOnly = true;
  reset.disabled = true;
  handoff.disabled = true;
  showThinking();
  try {
    const response = await fetch('/api/first-look', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({messages:[...history.slice(-16),question]}),
      signal:AbortSignal.timeout(65000)
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
    typing = false;
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
  const parts = goals.map(turn => turn.content);
  if (latestReply && !latestReply.startsWith('[Visitor interrupted')) parts.push('Kit suggested: '+latestReply);
  const draft = parts.join('\n\n');
  if (draft && (draft !== lastAdded || !note.value.trim())) {
    const prefix = note.value.trim() ? note.value.trim()+'\n\n' : '';
    const free = note.maxLength - prefix.length;
    if (free < 60) {
      status.textContent = 'Your note is full. Shorten it before adding this conversation.';
      return;
    }
    note.value = prefix + (draft.length > free ? draft.slice(0,free-1)+'…' : draft);
    lastAdded = draft;
  }
  contactForm.hidden = false;
  location.hash = 'contact-form';
  note.focus({preventScroll:true});
});

reset.addEventListener('click', () => {
  endVoice();
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

function stopSound(session) {
  for (const source of session.sources) { try { source.stop(); } catch {} }
  session.sources.clear();
  session.nextAudio = 0;
}

function endVoice(message = '') {
  const session = call;
  if (!session) return;
  call = null;
  form.classList.remove('in-voice-chat');
  session.turn?.abort();
  clearTimeout(session.idle);
  stopSound(session);
  session.stream?.getTracks().forEach(track => track.stop());
  session.node?.disconnect();
  session.context?.close().catch(()=>{});
  mic.textContent = 'Start voice chat';
  mic.removeAttribute('aria-pressed');
  submit.disabled = input.readOnly = false;
  handoff.disabled = reset.disabled = false;
  status.textContent = message;
}

function resetIdle(session) {
  clearTimeout(session.idle);
  session.idle = setTimeout(()=>{ if (call===session) endVoice('Voice chat ended after a quiet minute.'); },60000);
}

function enqueueAudio(session, buffer) {
  const context = session.context;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const start = Math.max(context.currentTime + .015, session.nextAudio);
  session.nextAudio = start + buffer.duration;
  session.sources.add(source);
  session.phase = 'answering';
  status.textContent = 'Kit is speaking. You can jump in.';
  source.onended = () => {
    session.sources.delete(source);
    if (call===session && session.sources.size===0 && !session.turn && session.phase==='answering') listen(session);
  };
  source.start(start);
}

function listen(session) {
  session.phase = 'listening';
  status.textContent = 'Kit is listening.';
  resetIdle(session);
}

function interrupt(session) {
  session.turn?.abort();
  session.turn = null;
  stopSound(session);
  if (session.heard) {
    history.push({role:'user',content:session.heard},{role:'assistant',content:'[Visitor interrupted the reply.]'});
    session.heard = '';
  }
}

async function answerTurn(session, chunks, frames) {
  const turn = new AbortController();
  session.turn = turn;
  session.phase = 'thinking';
  clearTimeout(session.idle);
  showThinking();
  let complete = false;
  let leftover = null;
  const current = () => call===session && session.turn===turn;
  try {
    const response = await fetch('/api/voice-conversation',{
      method:'POST',headers:{'Content-Type':'application/json'},
      signal:AbortSignal.any([turn.signal,AbortSignal.timeout(55000)]),
      body:JSON.stringify({history:history.slice(-16),recording:encodeRecording(chunks,frames)})
    });
    if (!response.ok) throw Error('Voice is unavailable right now. You can keep typing to Kit.');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = '';
    while (current()) {
      const {value,done} = await reader.read();
      if (!current()) return;
      if (done) break;
      pending += decoder.decode(value,{stream:true});
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (!current()) return;
        if (!line) continue;
        const e = JSON.parse(line);
        if (e.type==='heard') {
          session.heard=e.text;
          addTurn('You',e.text);
        } else if (e.type==='pcm') {
          let bytes=Uint8Array.from(atob(e.audio),c=>c.charCodeAt(0));
          if (leftover!==null) {const combined=new Uint8Array(bytes.length+1);combined[0]=leftover;combined.set(bytes,1);bytes=combined;}
          leftover=bytes.length%2 ? bytes[bytes.length-1] : null;
          const count=Math.floor(bytes.length/2);
          if (!count) continue;
          const audio=session.context.createBuffer(1,count,e.rate);
          const samples=audio.getChannelData(0), raw=new DataView(bytes.buffer);
          for(let i=0;i<count;i++) samples[i]=raw.getInt16(i*2,true)/32768;
          enqueueAudio(session,audio);
        } else if(e.type==='mp3') {
          const bytes=Uint8Array.from(atob(e.audio),c=>c.charCodeAt(0));
          const audio=await session.context.decodeAudioData(bytes.buffer);
          if(current()) enqueueAudio(session,audio);
        } else if(e.type==='reply') {
          history.push({role:'user',content:session.heard},{role:'assistant',content:e.text});
          session.heard='';
          addTurn('Kit',e.text);
          handoff.hidden=reset.hidden=false;
          complete=true;
          if(!e.spoken) throw Error('Kit’s reply is above. Voice playback is unavailable.');
        } else if(e.type==='silence') {
          complete=true;
        } else if(e.type==='error') {
          throw Error(e.message);
        }
      }
    }
    if (!current()) return;
    if (!complete) throw Error('Voice chat disconnected. You can restart it or type here.');
    session.turn=null;
    if (!session.sources.size) listen(session);
  } catch(error) {
    if (!current()) return;
    if (session.heard) {input.value=session.heard;handoff.hidden=false;}
    endVoice(error.name==='Error' ? error.message : 'Voice chat disconnected. You can restart it or type here.');
  }
}

function microphoneFrame(session, data) {
  if (call!==session || session.phase==='opening') return;
  let energy=0;
  for (const sample of data) energy+=sample*sample;
  const rms=Math.sqrt(energy/data.length);
  const threshold=Math.max(session.phase==='answering' ? .025 : .010,session.floor*3.2);
  const loud=rms>=threshold;
  if (!loud && !session.frames) session.floor=.99*session.floor+.01*Math.min(rms,.016);
  if (!session.frames) {
    session.pre.push(data);
    if(session.pre.length>12) session.pre.shift();
    session.attack=loud ? session.attack+data.length : 0;
    if (session.attack < (session.phase==='answering' ? 2880 : 1440)) return;
    if (session.turn || session.sources.size) interrupt(session);
    session.chunks=session.pre.splice(0);
    session.frames=session.chunks.reduce((n,c)=>n+c.length,0);
    session.quiet=0;
    session.phase='speaking';
    session.hasSpoken=true;
    clearTimeout(session.idle);
    status.textContent='Listening to you…';
    return;
  }
  const count=Math.min(960000-session.frames,data.length);
  session.chunks.push(data.subarray(0,count));
  session.frames+=count;
  session.quiet=loud ? 0 : session.quiet+count;
  const pauseFrames=session.frames<32000 ? 10880 : 13280;
  if(session.quiet<pauseFrames && session.frames<960000) return;
  const chunks=session.chunks, frames=session.frames;
  session.chunks=[];session.frames=session.attack=session.quiet=0;
  answerTurn(session,chunks,frames);
}

async function startVoice() {
  if (call || typing) return;
  if (input.value.trim()) {status.textContent='Send or clear your typed draft before starting voice chat.';return;}
  const session={phase:'opening',sources:new Set(),nextAudio:0,turn:null,heard:'',pre:[],chunks:[],frames:0,attack:0,quiet:0,floor:.003};
  call=session;
  form.classList.add('in-voice-chat');
  const welcome = history.length ? null : fetch('/assets/studio/kit-welcome.mp3')
    .then(r=>r.ok ? r.arrayBuffer() : null).catch(()=>null);
  tools.hidden=mic.hidden=false;
  mic.textContent='End voice chat';
  mic.setAttribute('aria-pressed','true');
  submit.disabled=input.readOnly=true;
  status.textContent='Opening your microphone…';
  try {
    session.context=new AudioContext({sampleRate:16000});
    await session.context.resume();
    if(call!==session) return;
    const stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    if(call!==session) {stream.getTracks().forEach(t=>t.stop());return;}
    session.stream=stream;
    await session.context.audioWorklet.addModule('/assets/studio/kit-recorder.js?v=2');
    if(call!==session) return;
    session.node=new AudioWorkletNode(session.context,'kit-recorder');
    session.node.port.onmessage=({data})=>microphoneFrame(session,data);
    session.context.createMediaStreamSource(stream).connect(session.node);
    session.node.connect(session.context.destination);
    stream.getAudioTracks()[0].onended=()=>{if(call===session)endVoice('Your microphone disconnected.');};
    listen(session);
    if (welcome) {
      const bytes=await welcome;
      if (bytes && call===session && session.phase==='listening' && !session.hasSpoken) {
        try {
          const greeting=await session.context.decodeAudioData(bytes);
          if (call===session && session.phase==='listening' && !session.hasSpoken) enqueueAudio(session,greeting);
        } catch {}
      }
    }
  } catch(error) {
    if(call===session) endVoice(error.name==='NotAllowedError' ? 'Microphone access is off. Allow it in your browser or type here.' : 'Your microphone couldn’t start. You can type here.');
  }
}

mic.addEventListener('click',()=>{if(call)endVoice('Voice chat ended.');else startVoice();});
panel.addEventListener('toggle',()=>{if(!panel.open)endVoice();});
window.addEventListener('pagehide',()=>endVoice());
document.addEventListener('visibilitychange',()=>{if(document.hidden)endVoice();});
