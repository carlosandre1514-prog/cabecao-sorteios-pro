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
            case 'auth/email-already-in-use': return 'Este e-mail já tem conta. Toque em "Já tenho conta" para entrar.';
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

    function alternarModo() {
        modoLogin = !modoLogin;
        aviso('');
        $('auth-subtitle').textContent = modoLogin ? 'Entre para continuar' : 'Crie sua conta gratuita';
        $('btn-auth-action').textContent = modoLogin ? 'Entrar' : 'Cadastrar';
        $('btn-auth-switch').textContent = modoLogin ? 'Não tem conta? Cadastre-se' : 'Já tenho conta';
        $('btn-esqueci-senha').classList.toggle('hidden', !modoLogin);
        $('auth-password').autocomplete = modoLogin ? 'current-password' : 'new-password';
    }

    async function enviarFormulario(ev) {
        ev.preventDefault();
        if (ocupado) return;
        aviso('');

        const email = $('auth-email').value.trim();
        const senha = $('auth-password').value.trim();
        if (!email || !senha) { aviso('Preencha o e-mail e a senha.'); return; }

        const botao = $('btn-auth-action');
        ocupar(true, botao);
        try {
            if (!(await aguardarFirebase(8000))) throw { code: 'app/sem-firebase' };
            const f = window.firebaseFns;
            if (modoLogin) await f.signInWithEmailAndPassword(window.firebaseAuth, email, senha);
            else await f.createUserWithEmailAndPassword(window.firebaseAuth, email, senha);
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
            await f.signInWithPopup(window.firebaseAuth, new f.GoogleAuthProvider());
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

    function iniciar() {
        const form = $('auth-form');
        if (!form) return;
        form.addEventListener('submit', enviarFormulario);
        $('btn-auth-switch').addEventListener('click', alternarModo);
        $('btn-google-auth').addEventListener('click', loginGoogle);
        $('btn-esqueci-senha').addEventListener('click', esqueciSenha);
        $('btn-ver-senha').addEventListener('click', () => {
            const campo = $('auth-password');
            const mostrar = campo.type === 'password';
            campo.type = mostrar ? 'text' : 'password';
            $('btn-ver-senha').textContent = mostrar ? '🙈' : '👁️';
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
