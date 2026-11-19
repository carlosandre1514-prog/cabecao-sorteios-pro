// Preenche os dados do responsável pelo app (fornecedor / controlador) nas páginas de Termos e
// Privacidade. Eles são cadastrados no painel de administração (configuracoes/legal, leitura pública).
(function () {
    const BANCO = 'https://studio-7737408264-35a36-default-rtdb.firebaseio.com';
    const campos = document.querySelectorAll('[data-legal]');
    const pendente = (el) => { if (!el.textContent.trim()) { el.textContent = '(a preencher pelo responsável)'; el.classList.add('vazio-legal'); } };
    fetch(BANCO + '/configuracoes/legal.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((l) => {
            l = l || {};
            campos.forEach((el) => {
                const v = String(l[el.dataset.legal] || '').trim();
                if (!v) return pendente(el);
                if (el.dataset.legal === 'email') { el.innerHTML = ''; const a = document.createElement('a'); a.href = 'mailto:' + v; a.textContent = v; el.appendChild(a); }
                else el.textContent = v;
            });
        })
        .catch(() => campos.forEach(pendente));
})();
