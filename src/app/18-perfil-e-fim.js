    // ---------- ACEITE DOS TERMOS (LGPD: consentimento registrado, com versão e data) ----------
    // Cadastro pelo formulário: a caixinha já foi marcada, então só grava. Conta antiga, conta criada
    // pelo Google ou termos atualizados: mostra a tela e só libera o app depois do aceite.
    function conferirAceite(aceite) {
        if (aceite && aceite.versao === VERSAO_TERMOS) return;
        let doCadastro = '';
        try { doCadastro = sessionStorage.getItem('cabecao_aceite_cadastro') || ''; sessionStorage.removeItem('cabecao_aceite_cadastro'); } catch (e) { /* ok */ }
        const registrar = () => gravar('aceite', { versao: VERSAO_TERMOS, em: Date.now(), maior18: true, como: doCadastro ? 'cadastro' : 'tela' }, true);
        if (doCadastro) { registrar(); return; }
        if (document.getElementById('tela-aceite')) return;
        const t = document.createElement('div');
        t.id = 'tela-aceite';
        t.className = 'tela-aceite';
        t.setAttribute('role', 'dialog'); t.setAttribute('aria-modal', 'true'); t.setAttribute('aria-labelledby', 't-aceite');
        t.innerHTML = `<div class="aceite-card">
            <h2 id="t-aceite">${aceite ? 'Atualizamos os termos' : 'Antes de começar'}</h2>
            <p>Para usar o Cabeção Sorteios Pro, leia e aceite os <a href="termos-uso.html" target="_blank" rel="noopener">Termos de uso</a> e a <a href="politica-privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>. Eles explicam quais dados guardamos, para quê, e como apagar sua conta quando quiser.</p>
            <label class="auth-aceite"><input type="checkbox" id="aceite-ok"><span>Tenho <b>18 anos ou mais</b> e li e aceito os Termos de uso e a Política de Privacidade.</span></label>
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
