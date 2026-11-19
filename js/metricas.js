// =====================================================================
// metricas.js — contadores anônimos de uso (para saber o que funciona)
//
//  metricas/<AAAA-MM-DD>/<evento>   número que só sobe de 1 em 1
//  metricas_ativos/<AAAA-MM-DD>/<uid> true  (conta usuários ativos no dia)
//
// Só o administrador lê (tela "Métricas" no menu). Regras do Firebase:
// docs/COMO-CONFIGURAR-MONETIZACAO.md. Nunca grava nome, e-mail nem dados do racha.
// Se o Firebase não estiver pronto ou as regras não existirem, falha em silêncio.
// =====================================================================
(function () {
    const fila = [];
    const jaContado = new Set();   // eventos "uma vez por sessão"

    function pronto() {
        return window.firebaseDb && window.firebaseFns && typeof window.firebaseFns.increment === 'function';
    }
    function dia() {
        return (window.Logica && window.Logica.diaISO) ? window.Logica.diaISO() : new Date().toISOString().slice(0, 10);
    }
    function enviar(fn) {
        if (pronto()) { try { fn(window.firebaseFns, window.firebaseDb); } catch (e) { /* ignora */ } }
        else fila.push(fn);
    }
    window.addEventListener('firebase-ready', () => {
        while (fila.length && pronto()) { const fn = fila.shift(); try { fn(window.firebaseFns, window.firebaseDb); } catch (e) { /* ignora */ } }
    });

    // evento: só letras minúsculas e "_" (as regras recusam o resto)
    // dados (opcional): detalhes que vão só para o painel de métricas (painel.js)
    function evento(nome, umaVez, dados) {
        nome = String(nome || '').toLowerCase().replace(/[^a-z_]/g, '').slice(0, 40);
        if (!nome) return;
        if (umaVez) { if (jaContado.has(nome)) return; jaContado.add(nome); }
        // abertura e cadastro o painel já recebe como "abrir" e "cadastro" (com o método)
        if (window.Painel && nome !== 'abertura' && nome !== 'cadastro') window.Painel.ev(nome, dados);
        const d = dia();
        enviar((f, db) => {
            const p = f.set(f.ref(db, 'metricas/' + d + '/' + nome), f.increment(1));
            if (p && p.catch) p.catch(() => {});
        });
    }
    function ativo(uid) {
        if (!uid || jaContado.has('ativo:' + uid)) return;
        jaContado.add('ativo:' + uid);
        const d = dia();
        enviar((f, db) => {
            const p = f.set(f.ref(db, 'metricas_ativos/' + d + '/' + uid), true);
            if (p && p.catch) p.catch(() => {});
        });
    }

    window.Metricas = { evento, ativo };
})();
