// =====================================================================
// ui.js — peças de interface reaproveitadas pelas telas.
//   UI.abrirSheet(id) / UI.fecharSheet(id): painel que sobe de baixo (.sheet)
//   UI.tituloLimpo(t): "❌ ERRO AO SALVAR" -> "Erro ao salvar"
//   UI.icone(nome, classe): <svg> do sprite (#i-nome) em index.html
// =====================================================================
(function () {
    const abertos = [];

    function abrirSheet(id) {
        const el = document.getElementById(id);
        if (!el) return null;
        el.classList.remove('hidden');
        if (!abertos.includes(id)) abertos.push(id);
        document.body.classList.add('com-sheet');
        return el;
    }
    function fecharSheet(id) {
        const el = document.getElementById(id || abertos[abertos.length - 1]);
        if (!el) return;
        el.classList.add('hidden');
        const i = abertos.indexOf(el.id);
        if (i >= 0) abertos.splice(i, 1);
        if (!abertos.length) document.body.classList.remove('com-sheet');
    }
    // fecha pelo fundo escuro, pelo X ou por qualquer botão com data-fechar
    document.addEventListener('click', (e) => {
        const alvo = e.target && e.target.closest && e.target.closest('[data-fechar]');
        if (!alvo) return;
        const sheet = alvo.closest('.sheet');
        if (sheet) fecharSheet(sheet.id);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abertos.length) fecharSheet(); });

    function tituloLimpo(t) {
        let s = String(t == null ? '' : t).replace(/^[^\p{L}\p{N}]+/u, '').trim();
        const letras = s.replace(/[^\p{L}]/gu, '');
        if (letras && letras === letras.toUpperCase()) s = s.toLowerCase();
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
    function icone(nome, classe) {
        return `<svg class="i${classe ? ' ' + classe : ''}" aria-hidden="true"><use href="#i-${nome}"/></svg>`;
    }

    window.UI = { abrirSheet, fecharSheet, tituloLimpo, icone, sheetsAbertos: () => abertos.slice() };
})();
