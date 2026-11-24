/* 10 Move Intelligence — autenticação real (Supabase)
   -------------------------------------------------------------------------
   O módulo procura um arquivo config.js ao lado do index.html. Onde ele não
   existe — como na versão publicada em Artifact — a aplicação segue em modo
   local, sem login, e a interface declara isso em vez de fingir segurança.
   Onde ele existe, nenhuma seção abre sem sessão válida e o perfil passa a
   vir do servidor.

   config.js:

     window.MI_CONFIG = {
       supabaseUrl: 'https://SEU-PROJETO.supabase.co',
       supabaseAnonKey: 'SUA-CHAVE-PUBLICA',
       orgSlug: 'smoov'
     };

   A chave publicável é pública por projeto. Quem protege os dados é o Row
   Level Security de supabase/schema.sql, não o sigilo da chave. A
   service_role key NUNCA entra aqui: ela ignora todas as políticas.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

  const PAPEL_PARA_PERFIL = {
    smoov_admin: 'smoov',
    tenmove_team: 'tenmove',
    tech_admin: 'tech'
  };

  const A = {
    enabled: false,
    ready: false,
    client: null,
    user: null,
    org: null,
    role: null,
    erro: null,

    /* Chamado pelo app no boot. Resolve sempre — nunca derruba a aplicação. */
    init: function () {
      return garantirConfig().then(iniciar);
    },

    signIn: function (email, senha) {
      if (!A.client) return Promise.reject(new Error('Autenticação não configurada.'));
      return A.client.auth.signInWithPassword({ email: email, password: senha })
        .then(function (r) {
          if (r.error) throw new Error(traduzir(r.error.message));
          A.user = r.data.user;
          return carregarPapel();
        });
    },

    signInLink: function (email) {
      if (!A.client) return Promise.reject(new Error('Autenticação não configurada.'));
      return A.client.auth.signInWithOtp({ email: email }).then(function (r) {
        if (r.error) throw new Error(traduzir(r.error.message));
        return true;
      });
    },

    signOut: function () {
      if (!A.client) return Promise.resolve();
      return A.client.auth.signOut().then(function () {
        A.user = null; A.role = null; A.org = null;
      });
    },

    autenticado: function () { return !!(A.enabled && A.user && A.role); },
    /* Com autenticação ativa o perfil vem do servidor e não pode ser trocado. */
    perfilTravado: function () { return A.autenticado(); },

    /* Registra uma ação na trilha de auditoria do servidor. */
    auditar: function (acao, alvo, detalhes) {
      if (!A.autenticado()) return Promise.resolve(false);
      return A.client.from('audit_log').insert({
        org_id: A.org.id, user_id: A.user.id, action: acao, target: alvo || null, details: detalhes || null
      }).then(function (r) { return !r.error; }).catch(function () { return false; });
    },

    /* Publica um agregado já aprovado. O banco recusa se o grupo for pequeno,
       se o indicador não estiver aprovado ou se o limite diário de recortes
       tiver sido atingido — a regra vale no servidor, não no JavaScript. */
    publicarAgregado: function (indicadorId, rotulo, payload, minGrupo, linhas) {
      if (!A.autenticado()) return Promise.reject(new Error('Sem sessão autenticada.'));
      if (A.role !== 'smoov_admin') return Promise.reject(new Error('Apenas o administrador da Smoov publica indicadores.'));
      return A.client.from('published_aggregates').insert({
        org_id: A.org.id,
        indicator_id: indicadorId,
        scope_label: rotulo,
        scope_hash: hash(rotulo + '|' + JSON.stringify(payload).length),
        min_group_n: minGrupo,
        k_threshold: MI.privacy.k,
        row_count: linhas,
        payload: payload,
        published_by: A.user.id
      }).then(function (r) {
        if (r.error) throw new Error(r.error.message);
        return true;
      });
    }
  };

  /* ---------------- Inicialização ---------------- */

  /* Acompanha a mesma versão dos demais arquivos, lida da própria página, para
     o config.js nunca ficar preso em cache enquanto o resto é atualizado. */
  function versaoAssets() {
    try {
      const s = document.querySelector('script[src*="core.js?v="]');
      if (s) return (s.getAttribute('src').split('?v=')[1] || '').trim();
    } catch (e) { }
    return '';
  }

  function garantirConfig() {
    if (window.MI_CONFIG) return Promise.resolve();
    return new Promise(function (resolve) {
      const v = versaoAssets();
      const s = document.createElement('script');
      s.src = 'config.js' + (v ? '?v=' + v : '');
      s.onload = function () { resolve(); };
      s.onerror = function () { resolve(); };   // ausência de config é um estado válido
      document.head.appendChild(s);
    });
  }

  function iniciar() {
    const cfg = window.MI_CONFIG;
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      A.enabled = false; A.ready = true;
      return Promise.resolve(A);
    }
    A.enabled = true;
    return carregarSdk()
      .then(function () {
        A.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true }
        });
        A.client.auth.onAuthStateChange(function (_evt, session) {
          if (!session) {
            A.user = null; A.role = null; A.org = null;
            if (MI.app && MI.app.rerender) MI.app.rerender();
          }
        });
        return A.client.auth.getSession();
      })
      .then(function (res) {
        const sessao = res && res.data ? res.data.session : null;
        if (!sessao) { A.ready = true; return A; }
        A.user = sessao.user;
        return carregarPapel().then(function () { A.ready = true; return A; });
      })
      .catch(function (e) {
        A.erro = e.message || String(e);
        A.enabled = true; A.ready = true;
        return A;
      });
  }

  function carregarSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = SUPABASE_JS;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Não foi possível carregar o SDK do Supabase.')); };
      document.head.appendChild(s);
    });
  }

  function carregarPapel() {
    const slug = (window.MI_CONFIG && window.MI_CONFIG.orgSlug) || null;
    /* Filtrar por user_id é obrigatório: a política mem_select permite que
       cada membro veja TODOS os vínculos da organização. Sem o filtro,
       linhas[0] podia ser o vínculo de outra pessoa e a interface exibiria o
       papel errado — o servidor seguiria negando as escritas, mas a tela
       mostraria indicadores que o usuário não deveria ver. */
    return A.client.from('memberships')
      .select('role, org_id, organizations(id, slug, name)')
      .eq('user_id', A.user.id)
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        const linhas = r.data || [];
        const escolhida = slug
          ? linhas.filter(function (m) { return m.organizations && m.organizations.slug === slug; })[0]
          : linhas[0];
        if (!escolhida) {
          A.role = null; A.org = null;
          throw new Error('Este usuário não está vinculado a nenhuma organização. Peça ao administrador da Smoov para incluí-lo.');
        }
        A.role = escolhida.role;
        A.org = escolhida.organizations;
        const perfil = PAPEL_PARA_PERFIL[A.role];
        if (perfil) MI.store.setPerspective(perfil);
        /* a partir daqui a fonte da verdade das aprovações é o servidor */
        return MI.privacy.carregarDoServidor().then(function () { return A; });
      });
  }

  function traduzir(msg) {
    const m = String(msg || '').toLowerCase();
    if (m.indexOf('invalid login') >= 0) return 'E-mail ou senha incorretos.';
    if (m.indexOf('email not confirmed') >= 0) return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
    if (m.indexOf('rate limit') >= 0) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
    if (m.indexOf('failed to fetch') >= 0) return 'Não foi possível falar com o servidor de autenticação. Verifique a conexão.';
    return msg;
  }

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }

  /* ---------------- Tela de login ---------------- */
  A.renderGate = function (host) {
    const el = MI.el, U = MI.ui;
    const email = el('input', { class: 'input', type: 'email', placeholder: 'voce@empresa.com.br', id: 'auth-email', autocomplete: 'username' });
    const senha = el('input', { class: 'input', type: 'password', placeholder: 'sua senha', id: 'auth-senha', autocomplete: 'current-password' });
    const aviso = el('div');

    const entrar = function () {
      if (!email.value.trim()) { MI.toast('Informe o e-mail.', 'error'); return; }
      MI.clear(aviso).appendChild(U.note(null, 'Entrando…'));
      A.signIn(email.value.trim(), senha.value)
        .then(function () {
          MI.toast('Sessão iniciada.', 'ok');
          MI.app.renderNav();
          MI.app.rerender();
        })
        .catch(function (e) { MI.clear(aviso).appendChild(U.note('crit', e.message)); });
    };
    senha.addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });

    host.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12',
      title: 'Entrar na plataforma',
      sub: 'Acesso restrito a usuários cadastrados pelo administrador da Smoov',
      body: [
        el('div', { style: 'max-width:420px;display:grid;gap:12px' }, [
          el('div', { class: 'field' }, [el('label', { class: 'field__label', for: 'auth-email' }, 'E-mail'), email]),
          el('div', { class: 'field' }, [el('label', { class: 'field__label', for: 'auth-senha' }, 'Senha'), senha]),
          el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
            U.btn('Entrar', { variant: 'accent', icon: 'check', onClick: entrar }),
            U.btn('Receber link por e-mail', {
              onClick: function () {
                if (!email.value.trim()) { MI.toast('Informe o e-mail.', 'error'); return; }
                A.signInLink(email.value.trim())
                  .then(function () { MI.clear(aviso).appendChild(U.note('ok', 'Link enviado. Confira seu e-mail.')); })
                  .catch(function (e) { MI.clear(aviso).appendChild(U.note('crit', e.message)); });
              }
            })
          ]),
          aviso
        ]),
        el('div', { style: 'margin-top:16px' }, U.note(null, [
          el('strong', { text: 'Seu arquivo continua local. ' }),
          'O login controla quem acessa quais indicadores. A planilha de clientes nunca é enviada ao servidor: ' +
          'ela é lida no seu navegador, como antes.'
        ]))
      ]
    })));
  };

  MI.auth = A;

})(window.MI);
