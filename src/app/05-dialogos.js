    // --- SISTEMA DE DIÁLOGOS E ALERTAS CUSTOMIZADOS ---
    function criarContainerAlertas() {
        if (document.getElementById('modal-alerta-custom')) return;

        const modalDiv = document.createElement('div');
        modalDiv.id = 'modal-alerta-custom';
        modalDiv.className = 'modal hidden';
        modalDiv.style.zIndex = '99999';

        modalDiv.setAttribute('role', 'alertdialog');
        modalDiv.setAttribute('aria-labelledby', 'alerta-titulo');
        modalDiv.setAttribute('aria-describedby', 'alerta-mensagem');
        modalDiv.innerHTML = `
            <div class="modal-content dialogo">
                <h2 id="alerta-titulo">Aviso</h2>
                <p id="alerta-mensagem"></p>
                <div id="alerta-botoes" class="dialogo-botoes">
                    <button id="btn-alerta-cancelar" class="btn btn-secondary hidden">Cancelar</button>
                    <button id="btn-alerta-ok" class="btn btn-primary">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalDiv);
    }

    criarContainerAlertas();

    window.mostrarAlerta = function(mensagem, titulo = 'Aviso') {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-alerta-custom');
            const elTitulo = document.getElementById('alerta-titulo');
            const elMensagem = document.getElementById('alerta-mensagem');
            const btnOk = document.getElementById('btn-alerta-ok');
            const btnCancelar = document.getElementById('btn-alerta-cancelar');

            if (!modal) {
                alert(mensagem);
                resolve(true);
                return;
            }

            elTitulo.textContent = window.UI ? UI.tituloLimpo(titulo) : titulo;
            elMensagem.textContent = window.UI ? UI.semEmoji(mensagem) : mensagem;

            btnCancelar.classList.add('hidden');
            btnOk.textContent = 'OK';
            btnOk.className = 'btn btn-primary';

            const fechar = () => {
                modal.classList.add('hidden');
                btnOk.removeEventListener('click', okHandler);
            };

            const okHandler = () => {
                fechar();
                resolve(true);
            };

            btnOk.addEventListener('click', okHandler);
            modal.classList.remove('hidden');
        });
    };

    // opcoes: { ok: 'Apagar', perigo: true } -> botão com o nome da ação (vermelho quando não tem volta)
    function mostrarConfirmacao(mensagem, titulo = 'Confirmar', opcoes) {
        opcoes = opcoes || {};
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-alerta-custom');
            const elTitulo = document.getElementById('alerta-titulo');
            const elMensagem = document.getElementById('alerta-mensagem');
            const btnOk = document.getElementById('btn-alerta-ok');
            const btnCancelar = document.getElementById('btn-alerta-cancelar');

            if (!modal) {
                const res = confirm(mensagem);
                resolve(res);
                return;
            }

            elTitulo.textContent = window.UI ? UI.tituloLimpo(titulo) : titulo;
            elMensagem.textContent = window.UI ? UI.semEmoji(mensagem) : mensagem;

            btnCancelar.classList.remove('hidden');
            btnOk.textContent = opcoes.ok || 'Confirmar';
            btnOk.className = 'btn ' + (opcoes.perigo ? 'btn-perigo' : 'btn-primary');
            btnCancelar.textContent = opcoes.cancelar || 'Cancelar';

            const fechar = () => {
                modal.classList.add('hidden');
                btnOk.removeEventListener('click', okHandler);
                btnCancelar.removeEventListener('click', cancelHandler);
            };

            const okHandler = () => {
                fechar();
                resolve(true);
            };

            const cancelHandler = () => {
                fechar();
                resolve(false);
            };

            btnOk.addEventListener('click', okHandler);
            btnCancelar.addEventListener('click', cancelHandler);
            modal.classList.remove('hidden');
        });
    }

    // bolinha com as iniciais (cor fixa por nome) — usada nas listas de jogadores
    function avatarHtml(nome) {
        const n = String(nome || '?').trim();
        const partes = n.split(/\s+/);
        const ini = ((partes[0] || '?')[0] + (partes.length > 1 ? partes[partes.length - 1][0] : (partes[0][1] || ''))).toUpperCase();
        let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
        return `<span class="av" style="background:hsl(${h} 62% 68%)">${escapeHtml(ini)}</span>`;
    }

    function escapeHtml(texto) {
        return String(texto)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

