(function () {
'use strict';
/* ===== Imágenes (con dibujo de respaldo si falta alguna) ===== */
const IMG = {puerta:'puerta.jpg', pieza:'piesa.png', base:'Base.jpg', pared:'Pared.jpg', caja:'caja.jpg', bandera:'bandera.jpg', bateria:'Bateria.jpg'};
const SYM = {puerta:'i-dclosed', pieza:'i-gear', base:'i-base', pared:'i-wall', caja:'i-box', bandera:'i-flag', bateria:'i-bat', suciedad:'i-dirt', robot:'i-robot'};
const svg = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 40 40"><use href="#${SYM[k]}"/></svg>`;
window.__fb = k => { const s = document.createElement('span'); s.innerHTML = svg(k); return s.firstChild; };
const img = k => IMG[k] ? `<img class="ic" src="img/${IMG[k]}" alt="" onerror="this.replaceWith(__fb('${k}'))">` : svg(k);
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const hl = s => esc(s).replace(/\b(for|while|if|elif|else|not|in|range|True)\b/g,'<span class="kw">$1</span>').replace(/\b(\d+)\b/g,'<span class="num">$1</span>');
const L = (...a) => a.join('\n');

/* ===== Mini intérprete de Python (for, while, if/elif/else, variables, llamadas) ===== */
function parse(src) {
  const lines = src.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).map(l => ({d: l.match(/^ */)[0].length, t: l.trim()}));
  let i = 0;
  const block = d => {
    const out = [];
    while (i < lines.length && lines[i].d === d) {
      const ln = i + 1, t = lines[i++].t;
      if (t.endsWith(':')) out.push({k: t.slice(0, -1), ln, body: i < lines.length && lines[i].d > d ? block(lines[i].d) : []});
      else out.push({k: t, ln});
    }
    return out;
  };
  return block(0);
}
function exec(src, w, vars) {
  let steps = 0;
  const loopErr = () => { if (++steps > 300) throw Error('el programa nunca termina (ciclo infinito)'); };
  const ev = e => {
    e = e.replace(/\bnot\b/g,'!').replace(/\band\b/g,'&&').replace(/\bor\b/g,'||').replace(/\bTrue\b/g,'true').replace(/\bFalse\b/g,'false');
    try { return new Function('a','v','with(a){with(v){return (' + e + ')}}')(w.api, vars); }
    catch (x) { if (x instanceof ReferenceError) throw Error('la variable «' + x.message.split(' ')[0] + '» todavía no existe: primero hay que crearla'); throw x; }
  };
  const run = list => {
    for (let j = 0; j < list.length; j++) {
      const s = list[j]; let m; loopErr(); w.ln = s.ln;
      if (m = s.k.match(/^for \w+ in range\((.+)\)$/)) { const n = ev(m[1]); for (let q = 0; q < n; q++) run(s.body); }
      else if (m = s.k.match(/^while (.+)$/)) { while (ev(m[1])) { loopErr(); run(s.body); } }
      else if (m = s.k.match(/^if (.+)$/)) {
        let done = ev(m[1]); if (done) run(s.body);
        while (list[j+1] && /^(elif |else$)/.test(list[j+1].k)) {
          const n = list[++j]; if (done) continue;
          if (n.k === 'else' || ev(n.k.slice(5))) { done = true; run(n.body); }
        }
      }
      else if (m = s.k.match(/^(\w+) = (.+)$/)) vars[m[1]] = ev(m[2]);
      else ev(s.k);
    }
  };
  run(parse(src));
}

/* ===== Mundo del robot ===== */
const NM = {puerta:'la puerta', pared:'la pared', caja:'una caja'};
const OBJ = ['puerta','pieza'];
function mkWorld(c) {
  const w = {x:0, n:9, th:c.th.map(t => ({...t})), dirt:[...(c.dirt || [])], bag:0, done:0, acts:[], fr:[]};
  const snap = (msg, err) => w.fr.push({x:w.x, th:w.th.map(t => ({...t})), dirt:[...w.dirt], bag:w.bag, msg, err});
  const fail = m => { snap(m, 1); throw Error(m); };
  const live = f => w.th.filter(t => !t.gone && f(t));
  const near = () => live(t => OBJ.includes(t.k) && t.x > w.x).sort((a,b) => a.x - b.x)[0];
  const reach = f => live(t => f(t) && Math.abs(t.x - w.x) <= 1).sort((a,b) => Math.abs(a.x-w.x) - Math.abs(b.x-w.x))[0];
  const far = () => near() ? 'el objeto está lejos: primero hay que acercarse a él' : null;
  const act = (name, msg) => { w.acts.push(name); snap(msg); };
  w.snap = snap;
  w.api = {
    detectar_objeto: () => !!near(),
    medir_distancia: () => { const t = near(); if (!t) fail('no hay nada que medir'); return t.x - w.x; },
    avanzar: (n = 1) => {
      const b = live(t => t.x > w.x && t.x <= w.x + n && ((t.k === 'puerta' && !t.open) || t.k === 'pared' || t.k === 'caja'))[0];
      if (b) { w.x = b.x - 1; fail('¡chocó contra ' + NM[b.k] + '!'); }
      if (w.x + n >= w.n) fail('se salió del pasillo');
      w.x += n; snap('avanza ' + n + (n === 1 ? ' casilla' : ' casillas'));
    },
    avanzar_hacia_objeto: () => { const t = near(); if (!t) fail('no hay ningún objeto adelante'); w.x = t.x - 1; snap('avanza hacia ' + (t.k === 'puerta' ? 'la puerta' : 'la pieza')); },
    abrir_objeto: () => {
      const t = reach(p => p.k === 'puerta');
      if (!t) fail(far() || 'no hay ningún objeto para abrir');
      t.open = true; snap('abre la puerta');
    },
    recoger_objeto: () => {
      const t = reach(p => p.k === 'pieza' || (p.k === 'puerta' && p.has));
      if (!t) fail(far() || 'no hay nada que recoger aquí');
      if (t.k === 'puerta') {
        if (!t.open) fail('la batería está detrás de la puerta cerrada: primero hay que abrirla');
        t.has = 0; w.got = 1; return snap('recoge la batería');
      }
      t.gone = 1; w.bag++; snap('recoge la pieza');
    },
    ir_a_base: () => { w.x = w.th.find(t => t.k === 'base').x; snap('va a la base'); },
    soltar_objeto: () => {
      if (!w.bag) fail('no lleva nada para soltar');
      if (w.x !== w.th.find(t => t.k === 'base').x) fail('solo puede soltar la pieza en la base');
      w.bag--; w.done++; snap('suelta la pieza en la base');
    },
    limpiar: () => { const i = w.dirt.indexOf(w.x); if (i < 0) return snap('aquí no hay suciedad'); w.dirt.splice(i, 1); snap('limpia la baldosa'); },
    hay_pared: () => live(t => t.k === 'pared' && t.x === w.x + 1).length > 0,
    hay_caja_adelante: () => live(t => t.k === 'caja' && t.x === w.x + 1).length > 0,
    saltar: () => { if (!w.api.hay_caja_adelante()) fail('no hay nada que saltar'); w.x += 2; snap('salta la caja'); },
    llego_a_la_meta: () => w.x >= w.th.find(t => t.k === 'bandera').x,
    cargar: () => act('cargar', 'se conecta al cargador'),
    ahorrar: () => act('ahorrar', 'activa el modo ahorro'),
    trabajar: () => act('trabajar', 'trabaja normal')
  };
  snap('');
  return w;
}
function runSc(prog, sc) {
  const w = mkWorld(sc); let err = null;
  try { exec(prog, w, {...(sc.v || {})}); }
  catch (e) { err = 'línea ' + w.ln + ': ' + e.message; if (!w.fr[w.fr.length-1].err) w.snap(err, 1); }
  return {w, err, good: !err && sc.ok(w), lab: sc.lab};
}

/* ===== Las 10 preguntas ===== */
const bat = (v, a) => ({th:[], v:{bateria:v}, lab:'Robot con ' + v + ' %', ok:w => w.acts.join() === a});
const Q = [
{t:'La puerta', m:'llegar a la puerta y abrirla.', c:2,
 o:[L('abrir_objeto()','avanzar_hacia_objeto()','detectar_objeto()'), L('detectar_objeto()','abrir_objeto()','avanzar_hacia_objeto()'), L('detectar_objeto()','avanzar_hacia_objeto()','abrir_objeto()'), L('abrir_objeto()','detectar_objeto()','avanzar_hacia_objeto()')],
 s:[{th:[{k:'puerta',x:6}], ok:w => w.th[0].open}], why:'la puerta quedó cerrada.',
 idea:'En una secuencia el orden importa: primero detectar, luego acercarse y al final abrir.'},
{t:'Variables', m:'llegar justo delante de la puerta, sin chocar.', c:2,
 o:[L('avanzar(distancia - 1)','distancia = medir_distancia()'), L('distancia = medir_distancia()','avanzar(distancia)'), L('distancia = medir_distancia()','avanzar(distancia - 1)'), L('distancia = medir_distancia()','avanzar(1)')],
 s:[{th:[{k:'puerta',x:7}], ok:w => w.x === 6}], why:'no quedó justo delante de la puerta.',
 idea:'Una variable guarda un dato (la distancia) para usarlo después. Hay que crearla antes de usarla.'},
{t:'Recoger y entregar', m:'llevar una pieza hasta la base.', c:2,
 o:[L('recoger_objeto()','detectar_objeto()','avanzar_hacia_objeto()','ir_a_base()','soltar_objeto()'), L('detectar_objeto()','avanzar_hacia_objeto()','ir_a_base()','soltar_objeto()','recoger_objeto()'), L('detectar_objeto()','avanzar_hacia_objeto()','recoger_objeto()','ir_a_base()','soltar_objeto()'), L('detectar_objeto()','avanzar_hacia_objeto()','ir_a_base()','recoger_objeto()')],
 s:[{th:[{k:'pieza',x:3},{k:'base',x:8}], ok:w => w.done === 1}], why:'la pieza no llegó a la base.',
 idea:'Cada acción necesita que la anterior ya se haya hecho: no se puede soltar lo que no se recogió.'},
{t:'for: el pasillo sucio', m:'limpiar 5 baldosas (casillas 1 a 5).', c:1,
 o:[L('avanzar()','limpiar()'), L('for i in range(5):','    avanzar()','    limpiar()'), L('for i in range(3):','    avanzar()','    limpiar()'), L('for i in range(5):','    limpiar()','    avanzar()')],
 s:[{th:[], dirt:[1,2,3,4,5], ok:w => !w.dirt.length}], why:'quedaron baldosas sucias.',
 idea:'for repite un bloque un número fijo de veces. Fíjate también en el orden dentro del bloque.'},
{t:'while: hasta la pared', m:'avanzar hasta quedar pegado a la pared del fondo.', c:1,
 o:[L('while hay_pared():','    avanzar()'), L('while not hay_pared():','    avanzar()'), 'avanzar()', L('while True:','    avanzar()')],
 s:[{th:[{k:'pared',x:8}], ok:w => w.x === 7}], why:'no quedó pegado a la pared.',
 idea:'while repite mientras la condición sea verdadera. Si la condición nunca cambia, el robot no para.'},
{t:'for con recoger', m:'hay 3 piezas, en las casillas 2, 4 y 6. El robot empieza en la 0 y debe recogerlas todas.', c:1,
 o:[L('for i in range(3):','    avanzar(2)'), L('for i in range(3):','    avanzar(2)','    recoger_objeto()'), L('for i in range(3):','    avanzar(1)','    recoger_objeto()'), L('for i in range(2):','    avanzar(2)','    recoger_objeto()')],
 s:[{th:[2,4,6].map(x => ({k:'pieza',x})), ok:w => w.bag === 3}], why:'no recogió las 3 piezas.',
 idea:'Si un patrón se repite (avanzar 2 y recoger), un ciclo lo escribe una sola vez.'},
{t:'if: ¿hay algo adelante?', m:'si hay un objeto, ir hasta él y abrirlo. Si no hay nada, no hacer nada. Se prueba con y sin objeto.', c:0,
 o:[L('if detectar_objeto():','    avanzar_hacia_objeto()','    abrir_objeto()'), L('avanzar_hacia_objeto()','if detectar_objeto():','    abrir_objeto()'), L('if detectar_objeto():','    avanzar_hacia_objeto()','abrir_objeto()'), L('if not detectar_objeto():','    avanzar_hacia_objeto()','    abrir_objeto()')],
 s:[{th:[{k:'puerta',x:5}], lab:'Con objeto', ok:w => w.th[0].open}, {th:[], lab:'Sin objeto', ok:() => true}], why:'no abrió la puerta cuando había un objeto.',
 idea:'if decide. La sangría indica qué líneas dependen de la condición.'},
{t:'if / else dentro de un ciclo', m:'llegar a la bandera cruzando un pasillo con cajas.', c:1,
 o:[L('while not llego_a_la_meta():','    avanzar()'), L('while not llego_a_la_meta():','    if hay_caja_adelante():','        saltar()','    else:','        avanzar()'), L('while not llego_a_la_meta():','    if hay_caja_adelante():','        avanzar()','    else:','        saltar()'), L('if hay_caja_adelante():','    saltar()','else:','    avanzar()')],
 s:[{th:[{k:'caja',x:2},{k:'caja',x:5},{k:'bandera',x:8}], ok:w => w.x >= 8}], why:'no llegó a la bandera.',
 idea:'Un ciclo con una decisión adentro permite reaccionar a lo que pasa en cada paso.'},
{t:'elif: el nivel de batería', m:'si queda menos de 20 % cargar, si queda menos de 60 % ahorrar energía y si no, trabajar normal. Se prueba con tres robots (15, 45 y 90 %).', c:0,
 o:[L('if bateria < 20:','    cargar()','elif bateria < 60:','    ahorrar()','else:','    trabajar()'), L('if bateria < 60:','    ahorrar()','elif bateria < 20:','    cargar()','else:','    trabajar()'), L('if bateria < 20:','    cargar()','if bateria < 60:','    ahorrar()','else:','    trabajar()'), L('if bateria > 60:','    cargar()','elif bateria > 20:','    ahorrar()','else:','    trabajar()')],
 s:[bat(15,'cargar'), bat(45,'ahorrar'), bat(90,'trabajar')], why:'hizo una acción equivocada (o más de una).',
 idea:'elif evalúa las condiciones en orden y se queda con la primera que sea verdadera.'},
{t:'Arma tu programa', m:'la batería está detrás de una puerta cerrada. Toca los bloques para armar el programa, ejecútalo, mira el error y corrígelo.', build:1,
 s:[{th:[{k:'puerta',x:6,has:1}], ok:w => w.got}], why:'el robot no recogió la batería.',
 idea:'Depurar es probar, leer el error y corregir. Así trabajan los programadores.'}
];
const BLOCKS = ['detectar_objeto()','avanzar_hacia_objeto()','abrir_objeto()','recoger_objeto()'];

/* ===== Interfaz ===== */
const root = document.getElementById('juegoApp');
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* Ángulo de cámara del robot 3D dentro del juego (el robot avanza hacia la derecha).
   Si lo ves mirando hacia la izquierda o de espaldas, cambia el primer valor (prueba 60deg o 90deg). */
const ROBOT_ORBIT = '-60deg 80deg auto';
let qi = 0, busy = false, prog = [], hist = [];
let st = {};                       // estado de la pregunta actual
const $ = s => root.querySelector(s);

function drawTrack(fr) {
  return [...Array(9).keys()].map(i => {
    const dirt = fr.dirt.includes(i) ? `<span class="dirt">${svg('suciedad')}</span>` : '';
    const ths = fr.th.filter(t => t.x === i && !t.gone).map(t =>
      `<div class="th ${t.k}${t.open ? ' open' : ''}">${t.k === 'puerta' && t.has ? `<div class="behind">${img('bateria')}</div>` : ''}${img(t.k)}</div>`).join('');
    return `<div class="cell"><i class="num">${i}</i>${dirt}${ths}</div>`;
  }).join('');
}
function draw(fr, label) {
  const bot = $('.bot'), carry = $('.carry'), msg = $('#status');
  $('.track').innerHTML = drawTrack(fr);
  bot.style.left = (fr.x * 100 / 9) + '%';
  bot.classList.toggle('warn', !!fr.err);
  const on = fr.bag ? '1' : '';
  if (carry.dataset.on !== on) { carry.dataset.on = on; carry.hidden = !on; carry.innerHTML = on ? img('pieza') : ''; }
  msg.className = 'status' + (fr.err ? ' warn' : '');
  msg.textContent = fr.msg ? (label ? label + ': ' : '') + (fr.err ? '⚠️ ' : '🤖 El robot ') + fr.msg : (label ? label + ': listo' : 'Robot listo.');
}
/* El robot: dibujo de respaldo debajo y modelo 3D encima. El dibujo se oculta cuando el 3D carga. */
function initBot() {
  const bot = $('.bot');
  bot.className = 'bot';
  bot.innerHTML = svg('robot', 'rb-fb') +
    `<model-viewer src="img/piesa.png" alt="" camera-orbit="${ROBOT_ORBIT}" min-camera-orbit="auto 80deg auto" max-camera-orbit="auto 80deg auto" ` +
    `disable-zoom disable-pan interaction-prompt="none" shadow-intensity="1" exposure="1.1" loading="eager"></model-viewer><span class="carry" hidden></span>`;
  const mv = bot.querySelector('model-viewer');
  mv.addEventListener('load', () => bot.classList.add('has3d'));
  mv.addEventListener('error', () => mv.remove());
}
function stageHTML() {
  return `<div class="stage"><div class="lane"><div class="track"></div><div class="bot"></div></div></div><p class="status" id="status" role="status" aria-live="polite"></p>`;
}
function updateCnt() { $('#cnt').textContent = 'Pruebas: ' + st.runs + ' · Intentos: ' + st.tries; }
function setCheck() { const c = $('#check'); if (c) c.disabled = busy || st.done || !st.res; }
function clearVerdict() {
  root.querySelectorAll('.opt').forEach(o => o.classList.remove('sel', 'bad', 'good'));
  const p = $('#prog'); if (p) p.classList.remove('bad', 'good');
  $('#fb').innerHTML = '';
}

/* Ejecuta el programa en todos los escenarios SIN decir si está bien o mal: solo guarda el resultado. */
async function execute(code) {
  busy = true; st.runs++; updateCnt(); setCheck();
  const q = Q[qi], segs = q.s.map(sc => runSc(code, sc));
  for (const s of segs) {
    for (const fr of s.w.fr) { draw(fr, s.lab); await sleep(fr.msg ? 650 : 300); }
    await sleep(350);
  }
  const bad = segs.find(s => !s.good), errSeg = segs.find(s => s.err);
  st.res = {good: !bad, why: bad ? (bad.lab ? bad.lab + ': ' : '') + (bad.err ? 'el programa se detuvo con un error en la ' + bad.err : 'el programa terminó sin errores, pero ' + q.why) : ''};
  busy = false;
  const msg = $('#status');
  msg.className = 'status' + (errSeg ? ' warn' : '');
  msg.textContent = (errSeg ? '⚠️ ' + (errSeg.lab ? errSeg.lab + ': ' : '') + 'Error en la ' + errSeg.err + ' (el programa se detuvo). ' : '') +
    'Observa lo que hizo el robot. Cuando lo decidas, pulsa «Ver respuesta».';
  setCheck();
}

function resetAttempt() {
  clearVerdict(); st.res = null; st.sel = null;
  draw(mkWorld(Q[qi].s[0]).fr[0]); setCheck();
}
/* «Ver respuesta»: recién aquí se califica la opción que se probó. */
function verify() {
  const q = Q[qi], res = st.res;
  if (busy || st.done || !res) return;
  st.tries++; updateCnt();
  const target = q.build ? $('#prog') : root.querySelector(`.opt[data-i="${st.sel}"]`);
  target.classList.remove('sel');
  const msg = $('#status'); msg.className = 'status'; msg.textContent = '';
  const fb = $('#fb');
  if (res.good) {
    st.done = true; target.classList.add('good');
    root.querySelectorAll('.opt,[data-b],#undo,#clr,#run').forEach(o => o.disabled = true);
    hist.push({t: q.t, tries: st.tries, runs: st.runs});
    fb.innerHTML = `<div class="verdict good"><strong>✅ ¡Correcto!</strong> El robot cumplió la misión. Lo lograste en ${st.tries} ${st.tries === 1 ? 'intento' : 'intentos'}.</div>` +
      `<div class="idea-box"><strong>Idea clave.</strong> ${q.idea}</div><p><button class="btn" id="next" type="button">${qi === 9 ? 'Ver resultado' : 'Siguiente pregunta'}</button></p>`;
    $('#next').onclick = () => { qi++; qi < 10 ? show() : final(); };
    $('#next').focus();
  } else {
    target.classList.add('bad'); st.res = null;
    fb.innerHTML = `<div class="verdict bad"><strong>❌ Esta opción no es la correcta.</strong> Fíjate: ${res.why}</div><p><button class="btn" id="retry" type="button">Volver a intentar</button></p>`;
    $('#retry').onclick = resetAttempt;
    $('#retry').focus();
  }
  setCheck();
}
function show() {
  const q = Q[qi]; prog = [];
  st = {sel: null, res: null, runs: 0, tries: 0, done: false};
  const head = `<div class="qhead"><span>Pregunta ${qi + 1} de 10</span><span>Aciertos a la primera: ${hist.filter(h => h.tries === 1).length}</span><span id="cnt"></span></div><div class="bar"><i style="width:${qi * 10}%"></i></div><h3>${qi + 1}. ${q.t}</h3><p class="mission"><strong>Misión:</strong> ${q.m}</p>` + stageHTML();
  const check = `<button class="btn" id="check" type="button" disabled>Ver respuesta</button>`;
  if (!q.build) {
    root.innerHTML = head + `<div class="opts">${q.o.map((c, i) => `<button class="opt" data-i="${i}" type="button"><b>${'ABCD'[i]}</b><pre class="code">${hl(c)}</pre></button>`).join('')}</div><div class="actions">${check}</div><div id="fb" aria-live="polite"></div>`;
    root.querySelectorAll('.opt').forEach(b => b.onclick = async () => {
      if (busy || st.done) return;
      clearVerdict(); st.res = null; st.sel = +b.dataset.i; b.classList.add('sel');
      await execute(q.o[st.sel]);
    });
  } else {
    root.innerHTML = head + `<div class="palette">${BLOCKS.map(b => `<button class="btn ghost" type="button" data-b="${b}">${b}</button>`).join('')}</div><pre class="code prog" id="prog"></pre><div class="actions"><button class="btn" id="run" type="button">▶ Ejecutar</button><button class="btn ghost" id="undo" type="button">Quitar último</button><button class="btn ghost" id="clr" type="button">Borrar todo</button>${check}</div><div id="fb" aria-live="polite"></div>`;
    const paint = () => $('#prog').innerHTML = prog.length ? prog.map((b, i) => `<span class="cm">${i + 1}</span>  ${b}`).join('\n') : '<span class="cm"># Toca un bloque para agregarlo aquí</span>';
    const changed = () => { clearVerdict(); st.res = null; paint(); setCheck(); };
    paint();
    root.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { if (!busy && !st.done) { prog.push(b.dataset.b); changed(); } });
    $('#undo').onclick = () => { if (!busy && !st.done) { prog.pop(); changed(); } };
    $('#clr').onclick = () => { if (!busy && !st.done) { prog = []; changed(); } };
    $('#run').onclick = async () => {
      if (busy || st.done || !prog.length) return;
      clearVerdict(); st.res = null;
      await execute(prog.join('\n'));
    };
  }
  initBot(); updateCnt();
  draw(mkWorld(q.s[0]).fr[0]);
  $('#check').onclick = verify;
}
function final() {
  const first = hist.filter(h => h.tries === 1).length, total = hist.reduce((a, h) => a + h.tries, 0);
  root.innerHTML = `<div class="final"><h3>¡Terminaste!</h3><strong>${first} / 10</strong><p>respuestas correctas a la primera. ${first >= 8 ? 'Piensas como un programador.' : 'Repite las que te costaron: depurar también es aprender.'}</p>` +
    `<table class="res"><thead><tr><th>Pregunta</th><th>Pruebas</th><th>Intentos</th></tr></thead><tbody>${hist.map((h, i) => `<tr><td>${i + 1}. ${h.t}</td><td>${h.runs}</td><td>${h.tries}</td></tr>`).join('')}</tbody>` +
    `<tfoot><tr><td>Total</td><td>${hist.reduce((a, h) => a + h.runs, 0)}</td><td>${total}</td></tr></tfoot></table>` +
    `<button class="btn" id="again" type="button">Jugar de nuevo</button></div>`;
  $('#again').onclick = () => { qi = 0; hist = []; show(); };
}

/* ===== Portada ===== */
const v = document.getElementById('heroRobot'), b = document.getElementById('btnGirar');
b.onclick = () => {
  const on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', on); b.textContent = on ? 'Detener giro' : 'Girar automáticamente';
  on ? v.setAttribute('auto-rotate', '') : v.removeAttribute('auto-rotate');
};
if (location.protocol === 'file:') document.getElementById('aviso').hidden = false;
if (root) show();
})();
