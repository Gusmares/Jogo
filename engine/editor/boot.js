/* NEON ENGINE — partida do editor.
   Lê o index.html do jogo, copia a marcação (escondida: alguns scripts procuram elementos do HUD) e carrega TODOS os scripts na mesma ordem,
   menos o laço do jogo (js/main.js). Assim o editor sempre mostra o mesmo mundo do jogo, mesmo quando entram scripts novos. Depois carrega o editor. */
'use strict';
window.NEON_EDITOR = true;
(async () => {
  const msg = document.getElementById('edBootMsg'), bar = document.getElementById('edBootBar'), err = document.getElementById('edBootErr');
  const errors = [];
  addEventListener('error', e => { errors.push((e.filename || '').split('/').pop() + ': ' + e.message); err.textContent = errors.slice(-6).join('\n'); });
  try {
    let info = null; try { info = await (await fetch('__engine/project', { cache: 'no-store' })).json(); } catch (e) { /* sem servidor da engine */ }
    window.NEON_PROJECT_INFO = info && info.ok ? info : null;
    const entry = (info && info.manifest && info.manifest.entry) || 'index.html';
    msg.textContent = 'Abrindo o projeto ' + ((info && info.manifest && info.manifest.name) || '') + '…';
    const html = await (await fetch(entry, { cache: 'no-store' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const game = [...doc.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).filter(s => !/(^|\/)js\/main\.js$/.test(s));
    doc.querySelectorAll('script').forEach(s => s.remove());
    const host = document.getElementById('gameDom'); host.innerHTML = doc.body.innerHTML;
    const cv = host.querySelector('#c'); document.getElementById('viewport').prepend(cv);
    const own = ['/__ed/vendor/TransformControls.js', '/__ed/engine.js', '/__ed/ui.js'];
    const all = game.concat(own); let done = 0;
    await new Promise(resolve => {
      for (const src of all) {
        const s = document.createElement('script'); s.src = src; s.async = false;               // baixa em paralelo, executa em ordem
        s.onload = s.onerror = ev => { if (ev.type === 'error') errors.push('não carregou ' + src); done++; bar.style.width = (done / all.length * 100).toFixed(1) + '%';
          msg.textContent = done < game.length ? 'Montando o mundo… ' + src.split('/').pop() : 'Abrindo o editor…'; if (done === all.length) resolve(); };
        document.body.appendChild(s);
      }
    });
    if (typeof edStart !== 'function') throw new Error('editor não carregou');
    await edStart();
    document.getElementById('edBoot').remove();
  } catch (e) { msg.textContent = 'Falhou ao abrir o editor: ' + e.message; console.error(e); }
})();
