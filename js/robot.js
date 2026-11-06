(function () {
'use strict';
/* ===== Imágenes (con dibujo de respaldo si falta alguna) ===== */
const IMG = {puerta:'puerta.jpg', pieza:'piesa.jpg', base:'Base.jpg', pared:'Pared.jpg', caja:'caja.jpg', bandera:'bandera.jpg', bateria:'Bateria.jpg'};
const SYM = {puerta:'i-dclosed', pieza:'i-gear', base:'i-base', pared:'i-wall', caja:'i-box', bandera:'i-flag', bateria:'i-bat', suciedad:'i-dirt', robot:'i-robot'};
const svg = k => `<svg class="ic" viewBox="0 0 40 40"><use href="#${SYM[k]}"/></svg>`;
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
let qi = 0, score = 0, tries = 0, busy = false, prog = [];

function drawTrack(fr) {
  return [...Array(9).keys()].map(i => {
    const dirt = fr.dirt.includes(i) ? `<span class="dirt">${svg('suciedad')}</span>` : '';
    const ths = fr.th.filter(t => t.x === i && !t.gone).map(t =>
      `<div class="th ${t.k}${t.open ? ' open' : ''}">${t.k === 'puerta' && t.has ? `<div class="behind">${img('bateria')}</div>` : ''}${img(t.k)}</div>`).join('');
    return `<div class="cell"><i class="num">${i}</i>${dirt}${ths}</div>`;
  }).join('');
}
function draw(fr, label) {
  const lane = root.querySelector('.lane'), bot = lane.querySelector('.bot'), st = root.querySelector('#status');
  lane.querySelector('.track').innerHTML = drawTrack(fr);
  bot.style.left = (fr.x * 100 / 9) + '%';
  bot.classList.toggle('err', !!fr.err);
  bot.innerHTML = svg('robot') + (fr.bag ? `<span class="carry">${img('pieza')}</span>` : '');
  st.className = 'status' + (fr.err ? ' err' : '');
  st.textContent = fr.msg ? (label ? label + ': ' : '') + (fr.err ? '❌ ' : '🤖 El robot ') + fr.msg : (label ? label + ': listo' : 'Robot listo.');
}
function stageHTML() {
  return `<div class="stage"><div class="lane"><div class="track"></div><div class="bot"></div></div></div><p class="status" id="status" role="status" aria-live="polite"></p>`;
}
async function execute(code) {
  if (busy) return false;
  busy = true; tries++;
  const q = Q[qi], segs = [];
  for (const sc of q.s) { const r = runSc(code, sc); segs.push(r); if (!r.good) break; }
  for (const s of segs) {
    for (const fr of s.w.fr) { draw(fr, s.lab); await sleep(fr.msg ? 650 : 300); }
    await sleep(350);
  }
  busy = false;
  const last = segs[segs.length - 1], good = segs.every(s => s.good);
  const st = root.querySelector('#status');
  st.className = 'status ' + (good ? 'ok' : 'err');
  st.textContent = good ? '✅ ¡Correcto! El robot cumplió la misión.' : (last.err ? '❌ Error en la ' + last.err + '. ' : '❌ ') + (last.err ? '' : 'Sin errores, pero ' + q.why);
  return good;
}
function success() {
  const q = Q[qi]; if (tries === 1) score++;
  root.querySelector('#fb').innerHTML = `<div class="idea-box"><strong>Idea clave.</strong> ${q.idea}</div><p><button class="btn" id="next" type="button">${qi === 9 ? 'Ver resultado' : 'Siguiente pregunta'}</button></p>`;
  root.querySelector('#next').onclick = () => { qi++; qi < 10 ? show() : final(); };
  root.querySelector('#next').focus();
}
function show() {
  const q = Q[qi]; tries = 0; prog = [];
  const head = `<div class="qhead"><span>Pregunta ${qi + 1} de 10</span><span>Aciertos a la primera: ${score}</span></div><div class="bar"><i style="width:${qi * 10}%"></i></div><h3>${qi + 1}. ${q.t}</h3><p class="mission"><strong>Misión:</strong> ${q.m}</p>` + stageHTML();
  if (!q.build) {
    root.innerHTML = head + `<div class="opts">${q.o.map((c, i) => `<button class="opt" data-i="${i}" type="button"><b>${'ABCD'[i]}</b><pre class="code">${hl(c)}</pre></button>`).join('')}</div><div id="fb"></div>`;
    draw(mkWorld(q.s[0]).fr[0]);
    root.querySelectorAll('.opt').forEach(b => b.onclick = async () => {
      if (busy) return;
      root.querySelectorAll('.opt').forEach(o => o.classList.remove('sel'));
      const i = +b.dataset.i, good = await execute(q.o[i]);
      if (good) { root.querySelectorAll('.opt').forEach(o => o.disabled = true); b.classList.add('good'); success(); }
      else b.classList.add('bad');
    });
  } else {
    root.innerHTML = head + `<div class="palette">${BLOCKS.map(b => `<button class="btn ghost" type="button" data-b="${b}">${b}</button>`).join('')}</div><pre class="code prog" id="prog"></pre><p class="palette"><button class="btn" id="run" type="button">▶ Ejecutar</button><button class="btn ghost" id="undo" type="button">Quitar último</button><button class="btn ghost" id="clr" type="button">Borrar todo</button></p><div id="fb"></div>`;
    draw(mkWorld(q.s[0]).fr[0]);
    const paint = () => root.querySelector('#prog').innerHTML = prog.length ? prog.map((b, i) => `<span class="cm">${i + 1}</span>  ${b}`).join('\n') : '<span class="cm"># Toca un bloque para agregarlo aquí</span>';
    paint();
    root.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { if (!busy) { prog.push(b.dataset.b); paint(); } });
    root.querySelector('#undo').onclick = () => { if (!busy) { prog.pop(); paint(); } };
    root.querySelector('#clr').onclick = () => { if (!busy) { prog = []; paint(); } };
    root.querySelector('#run').onclick = async () => {
      if (busy || !prog.length) return;
      if (await execute(prog.join('\n'))) { root.querySelector('#run').disabled = true; success(); }
    };
  }
}
function final() {
  root.innerHTML = `<div class="final"><h3>¡Terminaste!</h3><strong>${score} / 10</strong><p>respuestas correctas a la primera. ${score >= 8 ? 'Piensas como un programador.' : 'Repite las que fallaste: depurar también es aprender.'}</p><button class="btn" id="again" type="button">Jugar de nuevo</button></div>`;
  root.querySelector('#again').onclick = () => { qi = 0; score = 0; show(); };
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
