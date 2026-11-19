    // ---------- ACEITE DOS TERMOS (LGPD: consentimento registrado, com versão e data) ----------
    // Cadastro pelo formulário: a caixinha já foi marcada, então só grava. Conta antiga, conta criada
    // pelo Google ou termos atualizados: mostra a tela e só libera o app depois do aceite.
    // Aviso (não bloqueia: brasileiro viajando continua usando): o fuso do celular é de fora do Brasil?
    // Não coleta nada: só compara o fuso horário do aparelho com os fusos brasileiros.
    function foraDoBrasil() {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
            if (!tz) return false;
            return !/^(America\/(Sao_Paulo|Rio_Branco|Manaus|Porto_Velho|Boa_Vista|Cuiaba|Campo_Grande|Belem|Santarem|Fortaleza|Recife|Maceio|Bahia|Araguaina|Noronha|Eirunepe)|Brazil\/.*)$/.test(tz);
        } catch (e) { return false; }
    }
    window.foraDoBrasil = foraDoBrasil;
    function conferirAceite(aceite) {
        if (aceite && aceite.versao === VERSAO_TERMOS) return;
        let doCadastro = '';
        try { doCadastro = sessionStorage.getItem('cabecao_aceite_cadastro') || ''; sessionStorage.removeItem('cabecao_aceite_cadastro'); } catch (e) { /* ok */ }
        const registrar = () => gravar('aceite', { versao: VERSAO_TERMOS, em: Date.now(), maior18: true, moraNoBrasil: true, como: doCadastro ? 'cadastro' : 'tela' }, true);
        if (doCadastro) { registrar(); return; }
        if (document.getElementById('tela-aceite')) return;
        const t = document.createElement('div');
        t.id = 'tela-aceite';
        t.className = 'tela-aceite';
        t.setAttribute('role', 'dialog'); t.setAttribute('aria-modal', 'true'); t.setAttribute('aria-labelledby', 't-aceite');
        t.innerHTML = `<div class="aceite-card">
            <h2 id="t-aceite">${aceite ? 'Atualizamos os termos' : 'Antes de começar'}</h2>
            <p>Para usar o Cabeção Sorteios Pro, leia e aceite os <a href="termos-uso.html" target="_blank" rel="noopener">Termos de uso</a> e a <a href="politica-privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>. Eles explicam quais dados guardamos, para quê, e como apagar sua conta quando quiser.</p>
            <label class="auth-aceite"><input type="checkbox" id="aceite-ok"><span>Tenho <b>18 anos ou mais</b>, <b>moro no Brasil</b> e li e aceito os Termos de uso e a Política de Privacidade.</span></label>
            ${foraDoBrasil() ? '<p class="aviso-fora">Pelo relógio do seu celular, parece que você está fora do Brasil. O app é feito só para quem mora no Brasil.</p>' : ''}
            <button type="button" class="btn btn-primary" id="aceite-btn" disabled>Aceitar e continuar</button>
            <button type="button" class="btn-texto" id="aceite-sair">Não aceito, sair da conta</button>
        </div>`;
        document.body.appendChild(t);
        const chk = t.querySelector('#aceite-ok'), btn = t.querySelector('#aceite-btn');
        chk.addEventListener('change', () => { btn.disabled = !chk.checked; });
        btn.addEventListener('click', () => { registrar(); t.remove(); });
        t.querySelector('#aceite-sair').addEventListener('click', () => {
            t.remove();
            if (window.firebaseFns && window.firebaseAuth) window.firebaseFns.signOut(window.firebaseAuth).catch(() => {});
        });
    }

    // ---------- PERFIL NO MENU (foto + apelido) ----------
    function renderizarPerfil() {
        const img = document.getElementById('perfil-foto');
        const svg = document.querySelector('#perfil-avatar svg');
        const btn = document.getElementById('perfil-apelido');
        if (img && svg) {
            const tem = !!(perfil && perfil.foto);
            if (tem) img.src = perfil.foto;
            img.classList.toggle('hidden', !tem);
            svg.classList.toggle('hidden', tem);
        }
        if (btn) btn.textContent = (perfil && perfil.apelido) || 'Definir apelido';
        if (window.Painel) Painel.nome((perfil && perfil.apelido) || '');
    }
    function salvarPerfil() { gravar('perfil', perfil, true); renderizarPerfil(); }

    (function ligarPerfil() {
        const av = document.getElementById('perfil-avatar');
        const arq = document.getElementById('perfil-arq');
        const btn = document.getElementById('perfil-apelido');
        if (av && arq) {
            av.addEventListener('click', () => arq.click());
            arq.addEventListener('change', () => {
                const f = arq.files && arq.files[0];
                if (!f) return;
                const leitor = new FileReader();
                leitor.onload = () => {
                    const im = new Image();
                    im.onload = () => {
                        const c = document.createElement('canvas'); c.width = c.height = 128;
                        const lado = Math.min(im.width, im.height);
                        c.getContext('2d').drawImage(im, (im.width - lado) / 2, (im.height - lado) / 2, lado, lado, 0, 0, 128, 128);
                        perfil = Object.assign({}, perfil, { foto: c.toDataURL('image/jpeg', 0.8) });
                        salvarPerfil(); toast('Foto atualizada');
                    };
                    im.src = leitor.result;
                };
                leitor.readAsDataURL(f); arq.value = '';
            });
        }
        if (btn) btn.addEventListener('click', () => {
            const campo = document.createElement('input');
            campo.type = 'text'; campo.maxLength = 24; campo.className = 'perfil-campo';
            campo.value = (perfil && perfil.apelido) || ''; campo.placeholder = 'Seu apelido';
            btn.replaceWith(campo); campo.focus();
            let feito = false;
            const fim = (salvar) => {
                if (feito) return; feito = true;
                if (salvar) { perfil = Object.assign({}, perfil, { apelido: campo.value.trim().slice(0, 24) }); salvarPerfil(); }
                campo.replaceWith(btn); renderizarPerfil();
            };
            campo.addEventListener('keydown', e => { if (e.key === 'Enter') fim(true); if (e.key === 'Escape') fim(false); });
            campo.addEventListener('blur', () => fim(true));
        });
    })();

    function renderizarHistorico() {
        const container = document.getElementById('container-historico');
        if (!container) return;

        container.onclick = (e) => {
            const btn = e.target.closest('button[data-acao="excluir-hist"]');
            if (btn) { window.excluirHistorico(btn.dataset.id); return; }
            const card = e.target.closest('[data-acao="abrir-hist"]');
            if (card) abrirDetalheHistorico(card.dataset.id);
        };

        if (historico.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum campeonato finalizado até o momento.</p>';
            return;
        }

        const limiteHist = window.Monetizacao ? window.Monetizacao.limiteHistorico() : Infinity;
        const visiveis = historico.slice(0, limiteHist);
        const ocultos = historico.length - visiveis.length;

        container.innerHTML = visiveis.map((h, i) => {
            const classLista = Logica.ordenarClassificacao(Object.values(h.classificacao || {}));
            const campeao = classLista.length > 0 ? classLista[0].nome : 'N/A';

            return `
                <div class="card card-hist" data-acao="abrir-hist" data-id="${h.id}">
                    <div class="hist-topo">
                        <span class="hist-ic">${window.UI ? UI.icone('trophy') : ''}</span>
                        <div class="hist-txt"><small>${escapeHtml(String(h.data || ''))} · ${h.modo === 'todos-contra-todos' ? 'Tabela' : 'Racha livre'}</small><b>${escapeHtml(campeao)}</b><span>Campeão</span></div>
                        <button class="btn-icone perigo" data-acao="excluir-hist" data-id="${h.id}" aria-label="Excluir campeonato" title="Excluir">${window.UI ? UI.icone('trash', 'i-sm') : 'Excluir'}</button>
                    </div>
                    <p class="hist-abrir">Ver tabela, confrontos e artilharia ›</p>
                </div>
            `;
        }).join('') + (ocultos > 0 ? `
            <div class="card card-bloqueado" onclick="window.Monetizacao && window.Monetizacao.abrirModal('Você tem ${ocultos} campeonato(s) antigo(s) guardados. Seja Pro para ver todo o histórico!')">
                <h3>Mais ${ocultos} campeonato${ocultos > 1 ? 's' : ''} guardado${ocultos > 1 ? 's' : ''}</h3>
                <p class="subtext" style="margin:6px 0 0;">Seus dados estão salvos. Toque para liberar com o Plano Pro.</p>
            </div>` : '');
    }

    // ---------- SUA CONTA E SEUS DADOS (LGPD art. 18: acesso, portabilidade e eliminação) ----------
    async function lerContaInteira() {
        const f = window.firebaseFns, db = window.firebaseDb;
        const [d, p] = await Promise.all([
            f.get(f.ref(db, 'usuarios/' + currentUserUid)).then(s => (s.exists() ? s.val() : {})),
            f.get(f.ref(db, 'planos/' + currentUserUid)).then(s => (s.exists() ? s.val() : null)).catch(() => null)
        ]);
        return { dados: d || {}, plano: p };
    }
    async function baixarMeusDados() {
        if (!currentUserUid || !window.firebaseFns) return;
        try {
            const { dados, plano } = await lerContaInteira();
            const json = JSON.stringify({ app: 'Cabeção Sorteios Pro', exportadoEm: new Date().toISOString(), conta: { id: currentUserUid, email: emailUsuario || '' }, plano, dados }, null, 2);
            const nome = 'cabecao-meus-dados-' + new Date().toISOString().slice(0, 10) + '.json';
            const arq = typeof File === 'function' ? new File([json], nome, { type: 'application/json' }) : null;
            if (arq && navigator.canShare && navigator.canShare({ files: [arq] })) {
                await navigator.share({ files: [arq], title: 'Meus dados do Cabeção Sorteios Pro' }).catch(() => {});
            } else {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
                a.download = nome; document.body.appendChild(a); a.click();
                setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
            }
            toast('Cópia dos seus dados pronta');
        } catch (e) { toast('Não consegui juntar seus dados. Confira a internet.', 'erro'); }
    }
    // códigos de lista de presença e placar ao vivo de todos os rachas da conta
    function codigosPublicos(dados) {
        const lista = [dados].concat(Object.values((dados && dados.rachas) || {}));
        const pres = new Set(), vivo = new Set();
        lista.forEach(r => {
            if (r && r.presenca && r.presenca.codigo) pres.add(String(r.presenca.codigo));
            if (r && r.aoVivo && r.aoVivo.codigo) vivo.add(String(r.aoVivo.codigo));
        });
        return { pres: [...pres], vivo: [...vivo] };
    }
    async function excluirConta() {
        if (!currentUserUid || !window.firebaseFns) return;
        const m = abrirModalHtml(`<h2>Excluir minha conta</h2>
            <p class="subtext" style="margin-bottom:12px;">Isto apaga para sempre: seus jogadores, rachas, histórico, caixa, listas de presença e placares ao vivo, e a própria conta. Não dá para desfazer.</p>
            <p class="subtext" style="margin-bottom:12px;">Ficam guardados só os registros de pagamento do Pro, pelo prazo que a lei exige (obrigação fiscal), sem seus jogadores nem seus rachas. Se quiser uma cópia antes, use "Baixar meus dados".</p>
            <label class="subtext" for="tx-excluir">Para confirmar, escreva <b>EXCLUIR</b>:</label>
            <input type="text" id="tx-excluir" autocomplete="off" autocapitalize="characters">
            <div class="modal-actions"><button type="button" class="btn btn-perigo" id="ok-excluir" disabled>Excluir para sempre</button><button type="button" class="btn btn-secondary" id="cancela-excluir">Cancelar</button></div>`);
        const campo = m.querySelector('#tx-excluir'), ok = m.querySelector('#ok-excluir');
        campo.addEventListener('input', () => { ok.disabled = campo.value.trim().toUpperCase() !== 'EXCLUIR'; });
        m.querySelector('#cancela-excluir').onclick = () => m.remove();
        ok.onclick = async () => {
            ok.disabled = true; ok.setAttribute('aria-busy', 'true');
            const f = window.firebaseFns, db = window.firebaseDb, uid = currentUserUid;
            try {
                const { dados } = await lerContaInteira();
                const { pres, vivo } = codigosPublicos(dados);
                const apagar = caminho => f.set(f.ref(db, caminho), null).catch(() => {});
                await Promise.all([
                    ...pres.map(c => apagar('presenca/' + c)),
                    ...vivo.map(c => apagar('ao_vivo/' + c)),
                    ...Object.keys((dados && dados.suporteEnviados) || {}).map(id => apagar('suporte/' + id))
                ]);
                await f.set(f.ref(db, 'usuarios/' + uid), null);
                try { localStorage.removeItem(chaveCache(uid)); } catch (e) { /* ok */ }
                if (window.Painel) { Painel.ev('conta_excluida'); Painel.enviar(); }
                try {
                    await f.deleteUser(window.firebaseAuth.currentUser);
                    m.remove();
                    await mostrarAlerta('Sua conta e seus dados foram apagados.', 'Conta excluída');
                } catch (e) {
                    // por segurança o Firebase pede um login recente para apagar a conta
                    m.remove();
                    await mostrarAlerta('Seus dados já foram apagados. Para terminar de excluir a conta, entre de novo e toque em "Excluir minha conta" mais uma vez (o Firebase pede um login recente por segurança).', 'Falta um passo');
                    fazerLogout();
                }
            } catch (e) {
                ok.disabled = false; ok.removeAttribute('aria-busy');
                toast('Não consegui excluir agora. Confira a internet e tente de novo.', 'erro');
            }
        };
    }
    // estatísticas de uso (painel de métricas e contadores): a pessoa pode desligar
    (function ligarEstatisticas() {
        const chk = document.getElementById('chk-estatisticas');
        if (!chk) return;
        let desligado = false;
        try { desligado = localStorage.getItem('cabecao_sem_estatisticas') === '1'; } catch (e) { /* ok */ }
        chk.checked = !desligado;
        chk.addEventListener('change', () => {
            try { if (chk.checked) localStorage.removeItem('cabecao_sem_estatisticas'); else localStorage.setItem('cabecao_sem_estatisticas', '1'); } catch (e) { /* ok */ }
            if (window.Painel && Painel.desligar) Painel.desligar(!chk.checked);
            toast(chk.checked ? 'Estatísticas ligadas' : 'Estatísticas desligadas: nada de uso é enviado');
        });
    })();

    // Quando o plano do usuário carregar/mudar, redesenha o que depende dele
    window.aoMudarPlano = function() { renderizarHistorico(); if (abaAtual === 'tab-financeiro') renderizarCaixa(); };

    window.excluirHistorico = async function(id) {
        const confirmou = await mostrarConfirmacao('Deseja excluir este registro do histórico?', '🗑️ EXCLUIR HISTÓRICO');
        if (confirmou) {
            historico = historico.filter(h => h.id != id);
            salvarHistoricoFirebase();
            renderizarHistorico();
        }
    };
});
