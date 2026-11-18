// Matrix digital rain background + tiny shared helpers.
(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'rain';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF<>{}[]=/$#'.split('');
  const size = 16;
  let cols = 0, drops = [];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.ceil(canvas.width / size);
    drops = Array.from({ length: cols }, () => Math.random() * -50);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  function frame() {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = size + 'px monospace';
    for (let i = 0; i < cols; i++) {
      const y = drops[i] * size;
      const c = chars[(Math.random() * chars.length) | 0];
      ctx.fillStyle = Math.random() > 0.975 ? '#d4ffdd' : '#00ff41';
      ctx.fillText(c, i * size, y);
      if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i] += 1;
    }
  }
  resize();
  window.addEventListener('resize', resize);
  if (reduce) { for (let k = 0; k < 60; k++) frame(); }
  else setInterval(frame, 55);
})();

// Shared helpers
window.MX = {
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  type(el, lines, speed = 18) {
    return new Promise((resolve) => {
      let li = 0, ci = 0;
      el.innerHTML = '';
      const cur = document.createElement('span'); cur.className = 'cur';
      const tick = () => {
        if (li >= lines.length) { el.appendChild(cur); return resolve(); }
        if (ci === 0 && li > 0) el.appendChild(document.createElement('br'));
        const line = lines[li];
        el.appendChild(document.createTextNode(line[ci] || ''));
        ci++;
        if (ci >= line.length) { li++; ci = 0; }
        el.appendChild(cur);
        setTimeout(tick, speed);
      };
      tick();
    });
  },
};
