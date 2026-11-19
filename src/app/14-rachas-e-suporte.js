    // ---------- PERFIS DE RACHA ----------
    function nomeRachaAtivo() {
        const r = rachas.find(x => String(x.id) === String(rachaAtivo));
        return r ? r.nome : 'Racha principal';
    }
    function renderizarRachas() {
        const sub = document.getElementById('sub-racha');
        if (sub) sub.textContent = visualRacha.nome || nomeRachaAtivo();
        const box = document.getElementById('lista-rachas');
        if (!box) return;
        box.innerHTML = rachas.map(r => {
            const ativo = String(r.id) === String(rachaAtivo);
            const info = ativo ? { j: jogadores.length, h: historico.length } : (resumoRachas[r.id] || { j: 0, h: 0 });
            return `<button type="button" class="racha-item${ativo ? ' on' : ''}" data-racha="${escapeHtml(String(r.id))}">
                <span class="racha-ic">${window.UI ? UI.icone("ball") : ""}</span>
                <span class="racha-txt"><b>${escapeHtml(r.nome)}</b><small>${info.j} jogadores · ${info.h} campeonatos</small></span>
                ${ativo ? '<span class="racha-tag">Ativo</span>' : ''}
            </button>`;
        }).join('');
    }
    function trocarRacha(id) {
        id = String(id);
        if (id === String(rachaAtivo) || !dadosCarregados) { fecharDrawer(); return; }
        gravar('rachaAtivo', id, true);      // lembra o racha escolhido para a próxima vez
        rachaAtivo = id; rachaEscolhida = true;
        limparEstadoLocal(true);
        fecharDrawer();
        irParaAba('tab-jogadores', true);
        carregarDadosDoFirebase();
        toast('Racha: ' + nomeRachaAtivo());
    }
    function abrirNovoRacha() {
        if (!dadosCarregados) return;
        fecharDrawer();
        const m = abrirModalHtml(`<h2>Novo perfil de racha</h2>
            <input type="text" id="in-novo-racha" maxlength="30" placeholder="Ex.: Pelada de Sexta">
            <p class="subtext" style="margin-top:8px;">Os jogadores do racha atual (${jogadores.length}) serão copiados, desativados, para o novo perfil.</p>
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="ok-novo-racha">Criar racha</button><button type="button" class="btn btn-secondary" id="cancela-novo-racha">Cancelar</button></div>`);
        m.querySelector('#cancela-novo-racha').onclick = () => m.remove();
        m.querySelector('#ok-novo-racha').onclick = async () => {
            const nome = m.querySelector('#in-novo-racha').value.trim().slice(0, 30);
            if (!nome) return;
            const id = String(Date.now());
            const copia = jogadores.map((j, i) => ({ id: Logica.idUnico() + i, nome: j.nome, estrelas: j.estrelas, isGoleiro: !!j.isGoleiro, presente: false }));
            const extras = rachas.filter(r => r.id !== 'principal').concat([{ id, nome }]);
            m.remove();
            try {
                if (copia.length) await gravar(`rachas/${id}/jogadores`, copia, true);
                await gravar('rachasLista', extras, true);
            } catch (e) { return; }
            rachas = [{ id: 'principal', nome: 'Racha principal' }].concat(extras);
            resumoRachas[id] = { j: copia.length, h: 0 };
            trocarRacha(id);
            toast('Racha criado');
        };
    }

    // ---------- SUPORTE ----------
    function atualizarBotaoAdmin() {
        const b = document.getElementById('btn-caixa-suporte');
        if (b) b.classList.toggle('hidden', !souAdmin);
        const m = document.getElementById('btn-metricas');
        if (m) m.classList.toggle('hidden', !souAdmin);
        ['mais-caixa-suporte', 'mais-metricas', 'mais-admin'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !souAdmin); });
    }
    async function verificarAdmin() {
        souAdmin = false;
        const meu = String(emailUsuario).trim().toLowerCase();
        const f = window.firebaseFns, db = window.firebaseDb;
        // admin/email só o próprio administrador consegue ler (as regras recusam para os outros)
        try {
            const s = await f.get(f.ref(db, 'admin/email'));
            const adm = String(s.exists() ? s.val() : '').trim().toLowerCase();
            souAdmin = !!adm && adm === meu;
        } catch (e) { /* sem permissão: não é o administrador */ }
        // jeito antigo (e-mail em configuracoes, que é público): continua valendo até migrar no painel
        if (!souAdmin) {
            try {
                const s = await f.get(f.ref(db, 'configuracoes/admin_email'));
                const adm = String(s.exists() ? s.val() : '').trim().toLowerCase();
                souAdmin = !!adm && adm === meu;
            } catch (e) { /* sem admin configurado */ }
        }
        atualizarBotaoAdmin();
    }
    function abrirSuporte() {
        fecharDrawer();
        const m = abrirModalHtml(`<h2>💬 Falar com o suporte</h2>
            <textarea id="tx-suporte" rows="4" maxlength="800" placeholder="Conte o problema ou a sugestão..."></textarea>
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="env-suporte">Enviar mensagem</button><button type="button" class="btn btn-secondary" id="cancela-suporte">Cancelar</button></div>`);
        m.querySelector('#cancela-suporte').onclick = () => m.remove();
        m.querySelector('#env-suporte').onclick = () => {
            const texto = m.querySelector('#tx-suporte').value.trim();
            if (!texto || !currentUserUid) return;
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const msg = { de: (perfil && perfil.apelido) || 'Sem apelido', email: emailUsuario, racha: nomeRachaAtivo(), texto, em: Date.now(), ok: false, uid: currentUserUid };
            window.firebaseFns.set(window.firebaseFns.ref(window.firebaseDb, 'suporte/' + id), msg)
                .then(() => { m.remove(); toast('Mensagem enviada ao suporte'); })
                .catch((e) => toast('Não foi possível enviar (' + ((e && e.code) || 'erro') + ')', 'erro'));
        };
    }
    async function carregarCaixa() {
        const box = document.getElementById('lista-caixa');
        if (!box) return;
        box.innerHTML = '<p class="subtext">Carregando...</p>';
        try {
            const s = await window.firebaseFns.get(window.firebaseFns.ref(window.firebaseDb, 'suporte'));
            const obj = s.exists() ? (s.val() || {}) : {};
            const lista = Object.entries(obj).map(([id, m]) => Object.assign({ id }, m)).sort((a, b) => (b.em || 0) - (a.em || 0));
            box.innerHTML = lista.length ? lista.map(m => `<div class="msg-suporte">
                <b>${escapeHtml(m.de || '')}</b> ${m.ok ? '<span class="tag-ok">resolvido</span>' : '<span class="tag-novo">novo</span>'}
                <div class="msg-texto">${escapeHtml(m.texto || '')}</div>
                <small>${escapeHtml(m.email || '')} · ${escapeHtml(m.racha || '')} · ${new Date(m.em || 0).toLocaleString('pt-BR')}<br>ID: <span class="num" style="user-select:all">${escapeHtml(m.uid || '')}</span></small>
                ${m.ok ? '' : `<button type="button" class="btn btn-secondary" data-resolver="${escapeHtml(m.id)}" style="margin-top:8px;">Marcar como resolvido</button>`}
            </div>`).join('') : '<p class="subtext">Nenhuma mensagem.</p>';
        } catch (e) {
            box.innerHTML = '<p class="subtext">Não foi possível ler as mensagens. Confira as regras do Firebase em docs/COMO-CONFIGURAR-MONETIZACAO.md.</p>';
        }
    }
    function abrirCaixa() {
        if (!souAdmin) return;
        fecharDrawer();
        irParaTelaExtra('tab-caixa', 'Caixa do suporte');
        carregarCaixa();
    }

