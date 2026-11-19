// =====================================================================
// auth.js — TELA DE LOGIN (entrar, cadastrar, Google, esqueci a senha)
//
// Por que o login antigo mostrava erro antes de entrar:
//  1) O botão podia ser tocado antes do Firebase terminar de carregar.
//  2) Depois de logar, o app lia seus dados logo de cara; o banco ainda
//     estava conectando ("Client is offline") e aparecia um erro.
//  3) Havia um pop-up "Login realizado!" que travava a tela.
// Agora: o botão espera o Firebase, o erro aparece dentro do próprio
// formulário (sem pop-up) e a leitura dos dados tenta de novo sozinha
// (veja carregarDadosDoFirebase em app.js).
//
// Quem decide mostrar/esconder a tela de login é o app.js
// (onAuthStateChanged). Aqui só fica o formulário.
// =====================================================================
(function () {
    let modoLogin = true;
    let ocupado = false;

    const $ = (id) => document.getElementById(id);

    function firebasePronto() {
        return !!(window.firebaseAuth && window.firebaseFns);
    }

    // Espera o Firebase (carregado pelo <script type="module">) por até `ms`.
    function aguardarFirebase(ms) {
        return new Promise((resolve) => {
            if (firebasePronto()) return resolve(true);
            const t = setTimeout(() => resolve(firebasePronto()), ms);
            window.addEventListener('firebase-ready', () => { clearTimeout(t); resolve(true); }, { once: true });
        });
    }

    function traduzirErro(e) {
        const c = (e && e.code) || '';
        switch (c) {
            case 'auth/invalid-credential':
            case 'auth/wrong-password':
            case 'auth/user-not-found': return 'E-mail ou senha incorretos.';
            case 'auth/invalid-email': return 'O e-mail digitado não é válido.';
            case 'auth/email-already-in-use': return 'Este e-mail já tem conta. Toque em "Entrar" ali em cima para acessar.';
            case 'auth/weak-password': return 'A senha precisa ter pelo menos 6 caracteres.';
            case 'auth/too-many-requests': return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
            case 'auth/network-request-failed':
            case 'app/sem-firebase': return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
            case 'auth/unauthorized-domain': return 'Este endereço não está autorizado no Firebase (Authentication → Settings → Authorized domains).';
            case 'auth/popup-blocked': return 'O navegador bloqueou a janela do Google. Libere pop-ups e tente de novo.';
            case 'auth/operation-not-allowed': return 'Este tipo de login está desativado no Firebase.';
            default: return 'Não foi possível entrar (' + (c || (e && e.message) || 'erro') + '). Tente de novo.';
        }
    }

    function aviso(texto, tipo) {
        const el = $('auth-aviso');
        if (!el) return;
        if (!texto) { el.classList.add('hidden'); return; }
        el.textContent = texto;
        el.classList.toggle('ok', tipo === 'ok');
        el.classList.remove('hidden');
    }

    function ocupar(estado, botao) {
        ocupado = estado;
        ['btn-auth-action', 'btn-google-auth', 'btn-auth-switch', 'btn-esqueci-senha'].forEach((id) => {
            const b = $(id);
            if (b) b.disabled = estado;
        });
        if (botao) botao.setAttribute('aria-busy', estado ? 'true' : 'false');
    }

    // abas "Entrar" / "Criar conta"
    function definirModo(login) {
        modoLogin = !!login;
        aviso('');
        const sub = $('auth-subtitle'), acao = $('btn-auth-action');
        if (sub) sub.textContent = modoLogin ? 'Bem-vindo de volta. Bora pro racha?' : 'Crie sua conta grátis em menos de um minuto.';
        if (acao) acao.textContent = modoLogin ? 'Entrar' : 'Criar minha conta';
        const esq = $('btn-esqueci-senha'); if (esq) esq.classList.toggle('hidden', !modoLogin);
        const termos = $('auth-termos'); if (termos) termos.classList.toggle('hidden', modoLogin);
        const senha = $('auth-password');
        if (senha) { senha.autocomplete = modoLogin ? 'current-password' : 'new-password'; senha.placeholder = modoLogin ? 'Sua senha' : 'Crie uma senha (mínimo 6)'; }
        [['aba-entrar', modoLogin], ['aba-criar', !modoLogin]].forEach(([id, on]) => {
            const b = $(id); if (!b) return;
            b.classList.toggle('ativa', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        const card = document.querySelector('.auth-card'); if (card) card.classList.toggle('modo-criar', !modoLogin);
        forcaSenha();
    }
    function alternarModo() { definirModo(!modoLogin); }

    // força da senha (só ao criar a conta)
    function forcaSenha() {
        const el = $('forca-senha'), campo = $('auth-password');
        if (!el || !campo) return;
        const s = campo.value || '';
        if (modoLogin || !s) { el.classList.add('hidden'); return; }
        let n = s.length >= 6 ? 1 : 0;
        if (n && s.length >= 8 && /\d/.test(s) && /[a-zA-Z]/.test(s)) n = 2;
        // forte: comprida, ou com símbolo e letras maiúsculas e minúsculas
        if (n === 2 && (s.length >= 12 || (/[^a-zA-Z0-9]/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s)))) n = 3;
        el.classList.remove('hidden');
        el.dataset.nivel = String(n);
        el.querySelector('span').textContent = ['Muito curta (mínimo 6)', 'Fraca, mas serve', 'Boa', 'Forte'][n];
    }
    const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

    async function enviarFormulario(ev) {
        ev.preventDefault();
        if (ocupado) return;
        aviso('');

        const email = $('auth-email').value.trim();
        const senha = $('auth-password').value.trim();
        if (!email || !senha) { aviso('Preencha o e-mail e a senha.'); return; }
        if (!emailValido(email)) { aviso('Confira o e-mail: está faltando alguma coisa.'); marcarErro('auth-email'); return; }
        if (!modoLogin && senha.length < 6) { aviso('A senha precisa ter pelo menos 6 caracteres.'); marcarErro('auth-password'); return; }
        if (!modoLogin && $('auth-aceite') && !$('auth-aceite').checked) { aviso('Para criar a conta, confirme que tem 18 anos ou mais e que aceita os Termos e a Política de Privacidade.'); return; }

        const botao = $('btn-auth-action');
        ocupar(true, botao);
        try {
            if (!(await aguardarFirebase(8000))) throw { code: 'app/sem-firebase' };
            const f = window.firebaseFns;
            if (modoLogin) {
                await f.signInWithEmailAndPassword(window.firebaseAuth, email, senha);
                if (window.Painel) Painel.ev('login', { metodo: 'email' });
            } else {
                // o aceite marcado aqui é gravado na conta assim que os dados carregarem (conferirAceite)
                try { sessionStorage.setItem('cabecao_aceite_cadastro', String(Date.now())); } catch (e) { /* ok */ }
                await f.createUserWithEmailAndPassword(window.firebaseAuth, email, senha);
                if (window.Metricas) Metricas.evento('cadastro');
                if (window.Painel) Painel.ev('cadastro', { metodo: 'email' });
                comemorar();
            }
            // sucesso: o app.js percebe o login (onAuthStateChanged) e abre o app sozinho
        } catch (e) {
            aviso(traduzirErro(e));
        } finally {
            ocupar(false, botao);
        }
    }

    async function loginGoogle() {
        if (ocupado) return;
        aviso('');
        const botao = $('btn-google-auth');
        ocupar(true, botao);
        try {
            if (!(await aguardarFirebase(8000))) throw { code: 'app/sem-firebase' };
            const f = window.firebaseFns;
            const r = await f.signInWithPopup(window.firebaseAuth, new f.GoogleAuthProvider());
            // conta nova = criada agora (primeiro acesso igual à criação)
            const md = r && r.user && r.user.metadata;
            const nova = !!(md && md.creationTime && md.creationTime === md.lastSignInTime);
            if (nova && window.Metricas) Metricas.evento('cadastro');
            if (window.Painel) Painel.ev(nova ? 'cadastro' : 'login', { metodo: 'google' });
            if (nova) comemorar();
        } catch (e) {
            const c = e && e.code;
            if (c !== 'auth/cancelled-popup-request' && c !== 'auth/popup-closed-by-user') {
                console.error('Login Google:', e);
                aviso(traduzirErro(e));
            }
        } finally {
            ocupar(false, botao);
        }
    }

    async function esqueciSenha() {
        if (ocupado) return;
        aviso('');
        const email = $('auth-email').value.trim();
        if (!email) { aviso('Digite seu e-mail acima e toque em "Esqueci minha senha" de novo.'); $('auth-email').focus(); return; }
        ocupar(true);
        try {
            if (!(await aguardarFirebase(8000))) throw { code: 'app/sem-firebase' };
            await window.firebaseFns.sendPasswordResetEmail(window.firebaseAuth, email);
            aviso('Pronto! Se existir uma conta com esse e-mail, você vai receber o link para criar outra senha (veja também o spam).', 'ok');
        } catch (e) {
            aviso(traduzirErro(e));
        } finally {
            ocupar(false);
        }
    }

    // conta nova: animação de gol (js/futebol3d.js), por cima do app que já está abrindo
    function comemorar() {
        if (window.Futebol3D) window.Futebol3D.gol('Bem-vindo ao time!').catch(() => {});
    }
    function marcarErro(id, focar = true) {
        const campo = $(id); if (!campo) return;
        const caixa = campo.closest('.campo-auth') || campo;
        caixa.classList.remove('erro'); void caixa.offsetWidth; caixa.classList.add('erro');
        if (focar) campo.focus();
    }

    // estádio 3D atrás do login: liga quando a tela aparece, desliga quando some (bateria)
    function ligarEstadio() {
        const tela = $('auth-screen'), fundo = $('auth-fundo');
        if (!tela || !fundo) return;
        let cena = null, ligando = false;
        const conferir = async () => {
            const visivel = !tela.classList.contains('hidden');
            if (visivel && !cena && !ligando && window.Futebol3D) {
                ligando = true;
                try { cena = await window.Futebol3D.estadio(fundo); } catch (e) { cena = null; }
                ligando = false;
                if (cena) tela.classList.add('com-3d');
                if (tela.classList.contains('hidden') && cena) { cena.parar(); cena = null; tela.classList.remove('com-3d'); }
            } else if (!visivel && cena) { cena.parar(); cena = null; tela.classList.remove('com-3d'); }
        };
        if (typeof MutationObserver === 'function') new MutationObserver(conferir).observe(tela, { attributes: true, attributeFilter: ['class'] });
        window.addEventListener('futebol3d-pronto', conferir);
        conferir();
    }

    function iniciar() {
        const form = $('auth-form');
        if (!form) return;
        form.addEventListener('submit', enviarFormulario);
        $('btn-auth-switch').addEventListener('click', alternarModo);
        $('aba-entrar')?.addEventListener('click', () => definirModo(true));
        $('aba-criar')?.addEventListener('click', () => definirModo(false));
        $('auth-password')?.addEventListener('input', forcaSenha);
        ['auth-email', 'auth-password'].forEach(id => $(id)?.addEventListener('input', () => { const c = $(id).closest && $(id).closest('.campo-auth'); if (c) c.classList.remove('erro'); }));
        $('auth-email')?.addEventListener('blur', () => { const v = $('auth-email').value.trim(); if (v && !emailValido(v)) marcarErro('auth-email', false); });
        ligarEstadio();
        $('btn-google-auth').addEventListener('click', loginGoogle);
        $('btn-esqueci-senha').addEventListener('click', esqueciSenha);
        $('btn-ver-senha').addEventListener('click', () => {
            const campo = $('auth-password');
            const mostrar = campo.type === 'password';
            campo.type = mostrar ? 'text' : 'password';
            $('btn-ver-senha').innerHTML = `<svg class="i"><use href="#i-${mostrar ? 'eye-off' : 'eye'}"/></svg>`;
        $('btn-ver-senha').setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
