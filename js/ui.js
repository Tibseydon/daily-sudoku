/* Petits composants d'interface : formats, médailles/trophées SVG, toasts, modale, confettis, graphique. */
const UI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function formatTime(ms) {
    if (ms == null) return '—';
    const t = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function formatPenalty(s) {
    if (!s) return '0 s';
    const m = Math.floor(s / 60), r = s % 60;
    return m ? `${m} min${r ? ' ' + String(r).padStart(2, '0') : ''}` : `${r} s`;
  }
  const dayDate = day => new Date(day + 'T12:00:00Z');
  function formatDay(day, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
    return dayDate(day).toLocaleDateString('fr-FR', { ...opts, timeZone: 'UTC' });
  }
  function addDays(day, n) {
    const d = dayDate(day); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  let gid = 0;
  const STAR = (() => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 2.8 : 6.4, a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(`${(20 + r * Math.cos(a)).toFixed(2)},${(31 + r * Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(' ');
  })();

  function medalSVG(tier, size = 30) {
    const t = RULES.tiers[tier]; if (!t) return '';
    const id = `md${++gid}`;
    return `<svg class="medal" width="${size}" height="${size * 1.2}" viewBox="0 0 40 48" role="img" aria-label="Médaille ${t.label}">
      <title>Médaille ${t.label}</title>
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient></defs>
      <path d="M9 0h8l5 16h-8z" fill="#ef4f7a"/><path d="M23 0h8l-5 16h-8z" fill="#4f8cf0"/>
      <circle cx="20" cy="31" r="15" fill="url(#${id})" stroke="${t.c2}" stroke-width="2"/>
      <circle cx="20" cy="31" r="10.5" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.4"/>
      <polygon points="${STAR}" fill="rgba(255,255,255,.85)"/>
    </svg>`;
  }

  function trophySVG(tier, size = 40) {
    const t = RULES.tiers[tier]; if (!t) return '';
    const id = `tr${++gid}`;
    return `<svg class="trophy" width="${size}" height="${size}" viewBox="0 0 48 48" role="img" aria-label="Trophée ${t.label}">
      <title>Trophée ${t.label}</title>
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient></defs>
      <path d="M14 10H8a7 7 0 0 0 8 9M34 10h6a7 7 0 0 1-8 9" fill="none" stroke="${t.c2}" stroke-width="3" stroke-linecap="round"/>
      <path d="M13 5h22v12a11 11 0 0 1-22 0z" fill="url(#${id})" stroke="${t.c2}" stroke-width="1.5"/>
      <rect x="21" y="27" width="6" height="7" fill="${t.c2}"/>
      <rect x="14" y="34" width="20" height="8" rx="2.5" fill="url(#${id})" stroke="${t.c2}" stroke-width="1.5"/>
      <path d="M18 9v7" stroke="rgba(255,255,255,.7)" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`;
  }

  function rewardBadges(pos, n, size = 26) {
    const trophy = RULES.trophyFor(pos), medal = RULES.medalFor(pos, n);
    return `<span class="rewards">${trophy ? trophySVG(trophy, size + 6) : ''}${medal ? medalSVG(medal, size) : ''}</span>`;
  }

  /* ---------- Toast & modale ---------- */
  let toastTimer;
  function toast(msg, kind = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
  }
  function openModal(html, { onClose } = {}) {
    const modal = $('#modal');
    $('#modalCard').innerHTML = html;
    modal.classList.remove('hidden');
    const close = () => { modal.classList.add('hidden'); onClose?.(); };
    modal.onclick = e => { if (e.target === modal || e.target.closest('[data-close]')) close(); };
    return close;
  }
  const closeModal = () => $('#modal').classList.add('hidden');

  /* ---------- Confettis ---------- */
  function confetti(duration = 2800) {
    const cv = $('#confetti'), ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#fde047', '#f472b6', '#60a5fa', '#34d399', '#fb923c', '#c084fc'];
    const parts = Array.from({ length: 160 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4,
      s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const end = performance.now() + duration;
    (function frame(now) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      }
      if (now < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(performance.now());
  }

  /* ---------- Graphique en lignes (SVG, une seule échelle) ----------
     series: [{ key, label, color, points: [{ day, y }] }]   (y : plus bas = meilleur) */
  function lineChart(el, series, { formatY, days }) {
    const W = Math.max(300, el.clientWidth), H = 280;
    const m = { l: 56, r: 84, t: 18, b: 30 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const all = series.flatMap(s => s.points);
    if (!all.length || !days.length) {
      el.innerHTML = '<p class="empty">Termine des grilles pour voir ta courbe de progression ✨</p>';
      return;
    }
    const idx = Object.fromEntries(days.map((d, i) => [d, i]));
    // Pas « ronds » : secondes (30 s, 1 min, 5 min…) ou pourcentages (5, 10, 20, 25)
    const NICE = [1, 2, 5, 10, 15, 20, 25, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 7200];
    const rough = (Math.max(...all.map(p => p.y)) || 1) / 4;
    const tickStep = NICE.find(s => s >= rough) || Math.ceil(rough);
    const yMax = tickStep * 4;
    const x = i => m.l + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
    const y = v => m.t + ih - (v / yMax) * ih;

    const ticks = [0, 1, 2, 3, 4].map(k => k * tickStep);
    const step = Math.max(1, Math.ceil(days.length / 7));
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="Évolution par jour et par niveau">`;
    for (const tv of ticks) {
      svg += `<line x1="${m.l}" x2="${m.l + iw}" y1="${y(tv)}" y2="${y(tv)}" class="grid${tv === 0 ? ' base' : ''}"/>`;
      svg += `<text x="${m.l - 8}" y="${y(tv) + 4}" class="tick" text-anchor="end">${formatY(tv)}</text>`;
    }
    days.forEach((d, i) => {
      if (i % step === 0 || i === days.length - 1)
        svg += `<text x="${x(i)}" y="${H - 8}" class="tick" text-anchor="middle">${formatDay(d, { day: '2-digit', month: '2-digit' })}</text>`;
    });

    const labels = [];
    for (const s of series) {
      const pts = s.points.map(p => ({ ...p, i: idx[p.day] })).sort((a, b) => a.i - b.i);
      if (!pts.length) continue;
      let dPath = '';
      pts.forEach((p, k) => { dPath += `${k && pts[k - 1].i === p.i - 1 ? 'L' : 'M'}${x(p.i)},${y(p.y)} `; });
      svg += `<path d="${dPath}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      for (const p of pts) svg += `<circle cx="${x(p.i)}" cy="${y(p.y)}" r="4" fill="${s.color}" class="dot" data-key="${s.key}" data-i="${p.i}"/>`;
      const last = pts[pts.length - 1];
      labels.push({ y: y(last.y), x: x(last.i), label: s.label, color: s.color });
    }
    // Étiquettes directes en bout de courbe, écartées pour éviter les chevauchements
    labels.sort((a, b) => a.y - b.y);
    for (let k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < 15) labels[k].y = labels[k - 1].y + 15;
    for (const lb of labels) {
      svg += `<circle cx="${m.l + iw + 12}" cy="${lb.y}" r="4" fill="${lb.color}"/>`;
      svg += `<text x="${m.l + iw + 20}" y="${lb.y + 4}" class="dlabel">${esc(lb.label)}</text>`;
    }
    svg += `<line class="crosshair hidden" y1="${m.t}" y2="${m.t + ih}"/>`;
    svg += `<rect class="hit" x="${m.l - 10}" y="${m.t}" width="${iw + 20}" height="${ih}" fill="transparent"/></svg>`;
    el.innerHTML = svg + '<div class="chart-tip hidden"></div>';

    const svgEl = el.querySelector('svg'), tip = el.querySelector('.chart-tip'), ch = el.querySelector('.crosshair');
    const hit = el.querySelector('.hit');
    const move = ev => {
      const r = svgEl.getBoundingClientRect();
      const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const i = days.length === 1 ? 0 : Math.round(((px - m.l) / iw) * (days.length - 1));
      if (i < 0 || i >= days.length) return;
      const rows = series.map(s => ({ s, p: s.points.find(p => p.day === days[i]) })).filter(r => r.p);
      el.querySelectorAll('.dot').forEach(d => d.classList.toggle('on', +d.dataset.i === i));
      ch.setAttribute('x1', x(i)); ch.setAttribute('x2', x(i)); ch.classList.remove('hidden');
      tip.innerHTML = `<b>${esc(formatDay(days[i], { weekday: 'short', day: 'numeric', month: 'short' }))}</b>` +
        (rows.length ? rows.map(r => `<div><i style="background:${r.s.color}"></i>${esc(r.s.label)} <span>${formatY(r.p.y)}</span></div>`).join('')
          : '<div class="muted">Aucune grille terminée</div>');
      tip.classList.remove('hidden');
      const tx = x(i) + 14 + 170 > W ? x(i) - 14 - tip.offsetWidth : x(i) + 14;
      tip.style.left = `${tx}px`; tip.style.top = `${m.t}px`;
    };
    const leave = () => { tip.classList.add('hidden'); ch.classList.add('hidden'); el.querySelectorAll('.dot.on').forEach(d => d.classList.remove('on')); };
    hit.addEventListener('mousemove', move); hit.addEventListener('touchstart', move, { passive: true });
    hit.addEventListener('touchmove', move, { passive: true }); hit.addEventListener('mouseleave', leave);
  }

  return { $, esc, formatTime, formatPenalty, formatDay, addDays, medalSVG, trophySVG, rewardBadges, toast, openModal, closeModal, confetti, lineChart };
})();
