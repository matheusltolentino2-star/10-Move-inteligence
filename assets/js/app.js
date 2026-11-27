/* 10 Move Intelligence — casca da aplicação, navegação e filtros globais */
window.MI = window.MI || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, st = MI.store;

  /* Como o papel vindo do servidor aparece para quem está na sessão. */
  const PAPEL_ROTULO = {
    smoov_admin: 'Administrador Smoov',
    tenmove_team: 'Equipe 10 Move',
    tech_admin: 'Administrador técnico'
  };

  const NAV = [
    {
      group: 'Clientes', items: [
        { id: 'overview', label: 'Visão geral', icon: 'dashboard' },
        { id: 'profile', label: 'Perfil dos clientes', icon: 'users' },
        { id: 'geography', label: 'Inteligência geográfica', icon: 'map' },
        { id: 'behavior', label: 'Comportamento', icon: 'clock' },
        { id: 'segmentation', label: 'Segmentação', icon: 'filter' }
      ]
    },
    {
      group: 'Produtos e consumo', items: [
        { id: 'catalog', label: 'Cardápio & Produtos', icon: 'grid' },
        { id: 'consumption', label: 'Inteligência de Consumo', icon: 'spark' },
        { id: 'opportunities', label: 'Oportunidades Comerciais', icon: 'target' }
      ]
    },
    {
      group: 'Entrega e governança', items: [
        { id: 'reports', label: 'Relatórios', icon: 'report' },
        { id: 'settings', label: 'Configurações e Acessos', icon: 'shield' }
      ]
    }
  ];
  const VALID = {};
  NAV.forEach(function (g) { g.items.forEach(function (i) { VALID[i.id] = i; }); });

  const app = {
    current: 'overview',
    panelOpen: false,

    /* ---------------- Inicialização ---------------- */
    boot: function () {
      const msg = MI.$('#boot-msg'), bar = MI.$('#boot-bar');
      const step = function (p, t) {
        if (bar) bar.style.width = Math.round(p * 100) + '%';
        if (msg) msg.textContent = t;
      };

      let concluido = false;

      const falhar = function (texto) {
        if (concluido) return;
        concluido = true;
        step(1, '');
        if (!msg) return;
        MI.clear(msg);
        msg.appendChild(el('div', { style: 'color:#ff9b94;margin-bottom:12px;line-height:1.5', text: texto }));
        msg.appendChild(el('button', {
          class: 'btn btn--accent', type: 'button',
          onclick: function () { try { location.reload(); } catch (e) { } }
        }, 'Tentar de novo'));
      };

      const mostrarApp = function () {
        if (concluido) return;
        concluido = true;
        clearTimeout(vigia);
        MI.$('#boot').hidden = true;
        MI.$('#app').hidden = false;
        app.marcarAtividade();
        app.vigiarInatividade();
        app.mount();
        step(1, '');
        /* As 120 mil transações demonstrativas ficam para depois da primeira
           tela aparecer. Elas não valem segurar o carregamento, ainda mais em
           celular. */
        setTimeout(app.carregarFontesDaSessao, 400);
      };

      /* Rede de segurança: nenhuma espera pode prender a tela de carregamento
         para sempre. Se algo não responder, a aplicação abre com o que tiver
         pronto, ou explica o que houve — nunca fica girando em silêncio. */
      const vigia = setTimeout(function () {
        if (concluido) return;
        console.warn('Carregamento passou de 25 s; abrindo com o que estiver pronto.');
        if (!st.dataset) {
          falhar('O carregamento demorou demais neste navegador. Isso costuma acontecer quando o armazenamento local está bloqueado ou o aparelho tem pouca memória.');
          return;
        }
        mostrarApp();
        MI.toast('O carregamento demorou mais que o esperado. Alguns recursos podem estar incompletos.', 'error');
      }, 25000);

      /* Tela de acesso: sem menu, sem barra de filtros e sem o nome da base.
         Antes isso aparecia para quem nem tinha entrado, revelando quantos
         registros e colunas a base ativa tem — com a base real da Smoov,
         seria vazamento de informação para qualquer um com o link. */
      const mostrarLogin = function () {
        if (concluido) return;
        concluido = true;
        clearTimeout(vigia);
        MI.$('#boot').hidden = true;
        app.bindShell();
        app.telaDeAcesso();
        step(1, '');
      };

      step(0.12, 'Verificando acesso…');

      const gerarEAbrir = function () {
        step(0.28, 'Procurando a base publicada na plataforma…');
        app.prepararBase(function (p, t) { step(0.3 + p * 0.45, t); })
          .then(function () {
            step(0.88, 'Carregando o catálogo de produtos…');
            return MI.catalog.load()
              .catch(function (e) { console.error('Catálogo não carregou:', e); })
              .then(function () {
                step(0.95, 'Montando painéis…');
                setTimeout(mostrarApp, 40);
              });
          })
          .catch(function (e) {
            console.error(e); clearTimeout(vigia);
            falhar('Falha ao preparar a base: ' + (e.message || e));
          });
      };

      /* A autenticação resolve primeiro. Sem sessão válida, nada é gerado:
         nem os 80 mil registros, nem as transações, nem o catálogo. */
      (MI.auth ? MI.auth.init() : Promise.resolve({ enabled: false }))
        .catch(function () { return { enabled: false }; })
        .then(function (a) {
          if (!a || !a.enabled) { setTimeout(gerarEAbrir, 40); return; }
          /* Uma aba reaberta no dia seguinte não é uma sessão em uso. O token
             do Supabase se renova sozinho e duraria indefinidamente, então
             quem decide é o tempo desde a última interação de verdade. */
          if (MI.auth.autenticado() && app.repousouDemais()) {
            step(0.2, 'Sessão expirada por inatividade…');
            return MI.auth.signOut()
              .catch(function () { })
              .then(function () {
                mostrarLogin();
                MI.toast('Sua sessão expirou por inatividade. Entre de novo.', 'info');
              });
          }
          if (!MI.auth.autenticado()) { mostrarLogin(); return; }
          setTimeout(gerarEAbrir, 40);
        });
    },

    /* Chamado pela tela de login depois de uma entrada bem-sucedida.
       Entrar agora passa pela mesma sequência de quem recarrega a página:
       antes, quem acabava de entrar via a base demonstrativa e só encontrava
       a base publicada depois de um F5 — o que deixa a impressão de que o
       trabalho de quem subiu o arquivo se perdeu. */
    aposLogin: function () {
      const appEl = MI.$('#app');
      app.encerrando = false;
      app.marcarAtividade();
      app.vigiarInatividade();
      appEl.classList.remove('is-locked');
      const host = MI.clear(MI.$('#view'));
      const recado = el('p', { text: 'Procurando a base publicada na plataforma…' });
      host.appendChild(el('div', { class: 'empty' }, [
        el('div', { html: MI.icon('refresh', 26) }),
        el('h4', { text: 'Preparando os painéis' }),
        recado
      ]));
      setTimeout(function () {
        app.prepararBase(function (p, t) { if (t) recado.textContent = t; })
          .catch(function (e) {
            console.error(e);
            MI.toast('Falha ao preparar a base: ' + (e.message || e), 'error');
          })
          .then(function () {
            return MI.catalog.load().catch(function (e) { console.error('Catálogo não carregou:', e); });
          })
          .then(function () {
            app.mount();
            setTimeout(app.carregarFontesDaSessao, 400);
          });
      }, 50);
    },

    /* ---------------- Sessão ---------------- */

    /* Minutos sem nenhuma interação até a sessão cair, e quanto antes disso
       o aviso aparece. Trinta minutos é o que se usa para painel com dado
       pessoal: longo o bastante para uma reunião, curto o bastante para um
       computador compartilhado não ficar aberto a tarde inteira. */
    INATIVIDADE_MIN: 30,
    AVISO_MIN: 2,
    encerrando: false,

    repousouDemais: function () {
      const ultima = MI.storage.get('ultimaAtividade', 0);
      if (!ultima) return false;
      return (Date.now() - ultima) > app.INATIVIDADE_MIN * 60000;
    },

    marcarAtividade: function () {
      app.ultimaAtividade = Date.now();
      MI.storage.set('ultimaAtividade', app.ultimaAtividade);
    },

    /* Um só par de temporizadores, reiniciado a cada interação. Gravar a
       marca em cada clique seria escrever em disco a cada clique, então o
       registro é afunilado a uma vez por minuto. */
    vigiarInatividade: function () {
      if (!MI.auth || !MI.auth.enabled || app.vigiando) return;
      app.vigiando = true;

      const reiniciar = function () {
        clearTimeout(app.tAviso); clearTimeout(app.tCorte);
        if (!MI.auth.autenticado()) return;
        app.tAviso = setTimeout(function () {
          MI.toast('Sua sessão expira em ' + app.AVISO_MIN + ' minutos por inatividade. Mexa em qualquer coisa para continuar.', 'error');
        }, (app.INATIVIDADE_MIN - app.AVISO_MIN) * 60000);
        app.tCorte = setTimeout(function () {
          MI.auth.sair('inatividade de ' + app.INATIVIDADE_MIN + ' minutos');
        }, app.INATIVIDADE_MIN * 60000);
      };

      let ultimoRegistro = 0;
      const aoInteragir = function () {
        const agora = Date.now();
        app.ultimaAtividade = agora;
        if (agora - ultimoRegistro > 60000) {
          ultimoRegistro = agora;
          MI.storage.set('ultimaAtividade', agora);
        }
        reiniciar();
      };

      ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
        document.addEventListener(ev, aoInteragir, { passive: true });
      });
      /* Voltar para a aba depois de horas com ela em segundo plano conta
         como reabrir a aplicação, não como continuar usando. */
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        if (!MI.auth.autenticado()) return;
        if (app.repousouDemais()) MI.auth.sair('inatividade');
        else aoInteragir();
      });
      reiniciar();
    },

    /* Devolve a aplicação ao estado anterior ao login. A base sai da memória:
       ela nunca é gravada em disco, mas continuaria na tela para quem
       assumisse o computador em seguida. */
    encerrar: function (motivo) {
      const appEl = MI.$('#app');
      /* Durante o boot a aplicação ainda está escondida ou travada na tela
         de acesso; o aviso de "sem sessão" que chega aí não é uma saída. */
      if (!appEl || appEl.hidden || appEl.classList.contains('is-locked')) return;
      if (app.encerrando) return;
      app.encerrando = true;
      clearTimeout(app.tAviso); clearTimeout(app.tCorte);
      MI.storage.del('ultimaAtividade');
      try {
        MI.fullBatchStore?.cancelar();
        MI.fullData?.remove();
        MI.tx.clear();
        st.limpar();
      } catch (e) { console.error('Falha ao limpar a base ao sair:', e); }
      app.closePanel();
      app.current = 'overview';
      app.telaDeAcesso();
      MI.toast(motivo === 'saída manual' || !motivo
        ? 'Sessão encerrada. A base saiu deste navegador.'
        : 'Sessão encerrada por ' + motivo + '. A base saiu deste navegador.', 'ok');
    },

    /* Tela de acesso: sem menu, sem barra de filtros e sem o nome da base —
       nada que revele o tamanho ou o nome da base para quem não entrou. */
    telaDeAcesso: function () {
      const appEl = MI.$('#app');
      appEl.hidden = false;
      appEl.classList.add('is-locked');
      MI.$('#title').textContent = '';
      MI.$('#subtitle').textContent = '';
      MI.$('#ds-name').textContent = '—';
      MI.$('#ds-meta').textContent = '';
      document.title = '10 Move Intelligence';
      const sessao = MI.$('#sessao');
      if (sessao) sessao.hidden = true;
      MI.auth.renderGate(MI.clear(MI.$('#view')));
      U.flush();
    },

    /* Uma única sequência para decidir qual base entra em cena, usada tanto
       no carregamento da página quanto logo depois do login. Duas cópias
       disso foi exatamente o que fez a base publicada aparecer só no F5. */
    prepararBase: function (onProgress) {
      const legada = app.carregarBaseAtiva(onProgress)
        .catch(function (e) {
          console.error('Base publicada não carregou:', e);
          MI.toast('A base publicada não carregou: ' + (e.message || e), 'error');
          return null;
        });
      return Promise.all([legada, MI.fullBatchStore?.sondarPadrao()])
        .then(function ([ds]) {
          if (!ds) {
            if (onProgress) onProgress(0.2, 'Gerando base demonstrativa de 80 mil clientes…');
            ds = app.buildDemo();
          }
          if (onProgress) onProgress(0.9, 'Detectando colunas e tipos de dado…');
          st.setDataset(ds);
          return ds;
        });
    },

    /* A base publicada na plataforma tem prioridade sobre a demonstrativa:
       é o que o administrador da Smoov subiu e o que os dois lados devem ver. */
    carregarBaseAtiva: function (onProgress) {
      if (!MI.remote || !MI.remote.disponivel()) return Promise.resolve(null);
      return MI.remote.ativa('clientes').then(function (meta) {
        if (!meta) return null;
        if (onProgress) onProgress(0, 'Baixando a base publicada por ' + (meta.file_name || meta.name) + '…');
        return MI.remote.carregarClientes(meta, onProgress);
      });
    },

    /* Mesma ordem para as transações: publicada primeiro, demonstrativa depois. */
    carregarTransacoes: function () {
      if (MI.tx.has()) return app.carregarUnidades();
      if (MI.remote && MI.remote.disponivel()) {
        return MI.remote.ativa('transacoes')
          .then(function (meta) {
            if (!meta) { app.gerarTransacoesDemo(); return; }
            return MI.remote.carregarTransacoes(meta).then(function () {
              app.renderNav();
              if (app.current === 'consumption') app.renderView();
            });
          })
          .catch(function (e) {
            console.error('Transações publicadas não carregaram:', e);
            app.gerarTransacoesDemo();
          })
          .then(function () { app.carregarUnidades(); });
      }
      app.gerarTransacoesDemo();
      return app.carregarUnidades();
    },

    carregarFontesDaSessao: async function () {
      const lotes = MI.fullBatchStore, chave = lotes?.chaveSessao();
      await app.carregarTransacoes();
      if (chave && chave === lotes.chaveSessao()) await lotes.reabrir();
    },

    /* As unidades vêm depois das transações porque é delas que saem as
       que ainda não existem: o nome da loja já está em cada venda, e
       ninguém deveria ter que redigitá-lo num cadastro. */
    carregarUnidades: function () {
      if (!MI.unidades || !MI.unidades.disponivel()) return;
      return MI.unidades.carregar()
        .then(function () { return MI.unidades.semear(); })
        .then(function (r) {
          if (r && r.criadas) {
            MI.toast(MI.fmt.int(r.criadas) + ' unidades entraram no cadastro a partir das transações.', 'ok');
          }
          if (app.current === 'geography' || app.current === 'settings') app.renderView();
        })
        .catch(function (e) { console.error('Unidades:', e); });
    },

    /* Geração em segundo plano, depois que a interface já está utilizável. */
    gerarTransacoesDemo: function () {
      if (MI.tx.has()) return;
      if (!st.dataset || st.dataset.source !== 'demo' || !MI.catalog.items.length) return;
      try {
        const link = MI.tx.gerarDemo(120000);
        if (link) {
          app.renderNav();
          if (app.current === 'consumption') app.renderView();
        }
      } catch (e) {
        console.error('Falha ao gerar transações demonstrativas:', e);
      }
    },

    buildDemo: function () {
      const gen = MI.gerarBaseDemo(80000, 20261123);
      const schema = MI.inferSchema(gen.headers, gen.rows);
      return {
        name: 'Base demonstrativa Smoov (sintética)',
        source: 'demo',
        fileName: null,
        rows: gen.rows,
        headers: gen.headers,
        columns: schema.columns,
        roles: schema.roles,
        createdAt: new Date()
      };
    },

    loadDemo: function () {
      st.setDataset(app.buildDemo());
      app.rerender();
    },

    /* ---------------- Montagem ---------------- */
    mount: function () {
      app.renderNav();
      app.bindShell();

      /* A autenticação já foi resolvida no boot. Só é chamada aqui quando a
         aplicação foi montada por outro caminho e ainda não passou por ela. */
      if (MI.auth && !MI.auth.ready) {
        MI.auth.init().then(function (a) {
          if (a.enabled) { app.renderNav(); app.renderView(); }
        });
      }

      st.on('filters', function () { app.renderFilterBar(); app.renderView(); app.renderNav(); });
      st.on('dataset', function () { app.renderFilterBar(); app.renderNav(); app.closePanel(); });
      st.on('perspective', function () { app.renderNav(); app.renderView(); });
      st.on('privacy', function () { app.renderView(); });
      st.on('approvals', function () { app.renderNav(); });

      /* troca de tema do sistema redesenha os gráficos com as novas cores */
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { app.renderView(); });
      } catch (e) { }

      const hash = (location.hash || '').replace('#', '');
      app.current = VALID[hash] ? hash : 'overview';

      window.addEventListener('hashchange', function () {
        const h = (location.hash || '').replace('#', '');
        if (VALID[h] && h !== app.current) { app.current = h; app.renderNav(); app.renderView(); }
      });

      app.renderFilterBar();
      app.renderView();
    },

    bindShell: function () {
      MI.$('#burger').addEventListener('click', function () {
        MI.$('#sidebar').classList.toggle('is-open');
        MI.$('#backdrop').classList.toggle('is-open');
      });
      MI.$('#backdrop').addEventListener('click', function () {
        MI.$('#sidebar').classList.remove('is-open');
        app.closePanel();
      });
      MI.$('#btn-filters').addEventListener('click', function () { app.openFilters(); });
      const btnTema = MI.$('#btn-tema');
      if (btnTema) btnTema.addEventListener('click', function () { app.alternarTema(); });
      const btnSair = MI.$('#btn-sair');
      if (btnSair) btnSair.addEventListener('click', function () {
        btnSair.disabled = true;
        MI.auth.sair('saída manual').then(function () { btnSair.disabled = false; });
      });
      MI.$('#panel-close').addEventListener('click', function () { app.closePanel(); });
      MI.$('#panel-clear').addEventListener('click', function () {
        st.clearFilters();
        app.buildPanel();
        MI.toast('Filtros removidos.', 'ok');
      });
      MI.$('#panel-done').addEventListener('click', function () { app.closePanel(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { app.closePanel(); MI.$('#sidebar').classList.remove('is-open'); }
      });
      MI.$$('.persp__btn').forEach(function (b) {
        b.addEventListener('click', function () {
          if (MI.auth && MI.auth.perfilTravado()) {
            MI.toast('Com autenticação ativa, o perfil vem do servidor e não pode ser trocado aqui.', 'info');
            return;
          }
          st.setPerspective(b.dataset.persp);
          const msg = {
            smoov: 'Perfil Administrador Smoov: área privada, acesso completo.',
            tenmove: 'Perfil Equipe 10 Move: somente indicadores aprovados.',
            tech: 'Perfil Administrador técnico: sem registros individuais, supressão sempre ativa.'
          };
          MI.toast(msg[st.perspective] || '', 'info');
        });
      });
    },

    /* ---------------- Navegação ---------------- */
    go: function (id) {
      if (!VALID[id]) return;
      app.current = id;
      try { location.hash = id; } catch (e) { }
      MI.$('#sidebar').classList.remove('is-open');
      MI.$('#backdrop').classList.remove('is-open');
      app.renderNav();
      app.renderView();
      window.scrollTo({ top: 0, behavior: 'auto' });
    },

    rerender: function () { app.renderNav(); app.renderFilterBar(); app.renderView(); },

    /* Tema: padrão claro, que é a identidade da Smoov. A escolha do usuário
       vence a preferência do sistema operacional. */
    temaAtual: function () { return MI.storage.get('tema', 'claro'); },
    aplicarTema: function (tema) {
      const t = tema === 'escuro' ? 'escuro' : 'claro';
      document.documentElement.setAttribute('data-theme', t === 'escuro' ? 'dark' : 'light');
      MI.storage.set('tema', t);
      app.renderNav();
      /* os gráficos leem as cores dos tokens, então precisam ser redesenhados */
      app.renderView();
    },
    alternarTema: function () {
      app.aplicarTema(app.temaAtual() === 'claro' ? 'escuro' : 'claro');
    },

    renderNav: function () {
      const host = MI.clear(MI.$('#nav'));
      const nFilters = st.activeFilterCount();
      NAV.forEach(function (g) {
        const items = g.items.filter(function (i) { return !(i.smoovOnly && st.isTenMove()); });
        if (!items.length) return;
        host.appendChild(el('div', { class: 'nav__group', text: g.group }));
        items.forEach(function (i) {
          host.appendChild(el('button', {
            class: 'nav__item' + (app.current === i.id ? ' is-active' : ''), type: 'button',
            onclick: function () { app.go(i.id); }
          }, [
            el('span', { html: MI.icon(i.icon, 18) }),
            el('span', { text: i.label }),
            i.id === 'segmentation' && nFilters ? el('span', { class: 'nav__badge', text: String(nFilters) }) : null,
            i.id === 'catalog' ? el('span', { class: 'nav__badge', text: MI.fmt.int(MI.catalog.items.length) }) : null,
            i.id === 'consumption' && MI.tx.has() ? el('span', { class: 'nav__badge', text: MI.fmt.compact(MI.tx.link.itens) }) : null,
            i.id === 'settings' && !st.isTenMove() ? el('span', { class: 'nav__badge', text: MI.privacy.approvedCount() + '/' + MI.privacy.INDICATORS.length }) : null
          ]));
        });
      });

      MI.$$('.persp__btn').forEach(function (b) {
        b.classList.toggle('is-on', b.dataset.persp === st.perspective);
      });
      const ds = st.dataset;

      /* Quem está na sessão, e a saída. Sem isto a única forma de sair era
         fechar o navegador — e a sessão continuava válida na volta. */
      const sessao = MI.$('#sessao');
      if (sessao) {
        const dentro = MI.auth && MI.auth.autenticado();
        sessao.hidden = !dentro;
        if (dentro) {
          MI.$('#sessao-email').textContent = MI.auth.user.email || 'sessão ativa';
          MI.$('#sessao-email').title = MI.auth.user.email || '';
          MI.$('#sessao-papel').textContent = PAPEL_ROTULO[MI.auth.role] || MI.auth.role || '';
        }
      }

      MI.$('#persp-note').textContent = st.isTenMove()
        ? MI.privacy.approvedCount() + ' de ' + MI.privacy.INDICATORS.length + ' indicadores liberados pela Smoov.'
        : st.isTech()
          ? 'Sem acesso a registros individuais. Supressão sempre ativa.'
          : ds && ds.source === 'remote'
            ? 'Acesso completo à base publicada na plataforma.'
            : 'Acesso completo à base carregada neste navegador.';

      app.renderFonteMeta();
      const btnTema = MI.$('#btn-tema');
      if (btnTema) {
        const escuro = app.temaAtual() === 'escuro';
        MI.clear(btnTema);
        btnTema.appendChild(el('span', { html: MI.icon(escuro ? 'spark' : 'eye', 15) }));
        btnTema.appendChild(el('span', { text: escuro ? 'Tema claro' : 'Tema escuro' }));
        btnTema.setAttribute('aria-label', escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro');
      }

      MI.$('#sidebar-demo').textContent = ds && ds.source === 'demo'
        ? 'Dados demonstrativos sintéticos. Importe a planilha da Smoov para analisar a base real.'
        : 'Base importada. Processamento local, nenhum envio externo.';
    },

    renderFonteMeta: function () {
      const label = MI.$('#ds-meta'), ds = st.dataset;
      if (!label || app.encerrando || MI.$('#app')?.classList.contains('is-locked')) return;
      const lotes = MI.fullBatchStore, status = lotes?.estado;
      MI.$('#ds-name').textContent = lotes?.padraoPendente ? 'Base padrão da Smoov' : ds ? ds.name : '—';
      if (['aguardando-padrao','reabrindo','salvando'].includes(status?.fase)) {
        const acao = status.fase === 'salvando' ? 'Salvando lote na conta' :
          lotes.padraoPendente ? 'Carregando base padrão' : 'Reabrindo lote salvo';
        label.textContent = acao + ' · ' + Math.round(status.progresso * 100) + '%';
      } else {
        label.textContent = ds ? MI.fmt.int(ds.rows.length) + ' registros · ' + ds.columns.length + ' colunas' : '';
      }
    },

    renderView: function () {
      const v = MI.views[app.current];
      const host = MI.$('#view');
      MI.charts.destroyAll();
      MI.clear(host);
      MI.$('#title').textContent = v ? v.title : '';
      MI.$('#subtitle').textContent = v ? v.subtitle : '';
      document.title = (v ? v.title + ' · ' : '') + '10 Move Intelligence';
      if (!v) { host.appendChild(U.empty('Seção não encontrada')); return; }

      /* Em bases grandes o cálculo leva alguns instantes: mostra um esqueleto
         antes de travar a thread, para a navegação não parecer congelada. */
      if (st.rows.length > 20000) {
        host.appendChild(el('div', { class: 'grid', id: 'view-skeleton' }, [
          el('div', { class: 'card c3 skeleton', style: 'height:104px;border:0' }),
          el('div', { class: 'card c3 skeleton', style: 'height:104px;border:0' }),
          el('div', { class: 'card c3 skeleton', style: 'height:104px;border:0' }),
          el('div', { class: 'card c3 skeleton', style: 'height:104px;border:0' }),
          el('div', { class: 'card c8 skeleton', style: 'height:280px;border:0' }),
          el('div', { class: 'card c4 skeleton', style: 'height:280px;border:0' })
        ]));
        const token = ++app._renderToken;
        setTimeout(function () {
          if (token !== app._renderToken) return;
          MI.clear(host);
          app._paint(v, host);
        }, 16);
        return;
      }
      app._paint(v, host);
    },

    _renderToken: 0,

    _paint: function (v, host) {
      /* Com autenticação configurada, nenhuma seção abre sem sessão válida. */
      if (MI.auth && MI.auth.enabled && !MI.auth.autenticado()) {
        if (MI.auth.erro) {
          host.appendChild(el('div', { class: 'grid', style: 'margin-bottom:14px' }, U.card({
            span: 'c12', body: U.note('crit', [
              el('strong', { text: 'Falha na autenticação. ' }), MI.auth.erro
            ])
          })));
        }
        MI.auth.renderGate(host);
        U.flush();
        return;
      }
      if (MI.fullBatchStore?.padraoPendente && !MI.fullData.active && app.current !== 'settings') {
        host.appendChild(el('div', { class:'empty' }, [
          el('h4',{text:'Carregando a base padrão da Smoov'}),
          el('p',{id:'padrao-status','aria-live':'polite',text:MI.fullBatchStore.estado.mensagem})
        ]));
        return;
      }
      try {
        v.render(host);
        U.flush();
      } catch (e) {
        console.error(e);
        host.appendChild(U.card({
          span: 'c12', title: 'Erro ao montar esta seção',
          body: [
            U.note('crit', [el('strong', { text: 'Algo falhou ao calcular os indicadores desta seção. ' }), String(e.message || e)]),
            el('div', { style: 'margin-top:12px' }, U.btn('Voltar para a visão geral', { variant: 'primary', onClick: function () { app.go('overview'); } }))
          ]
        }));
      }
    },

    /* ---------------- Barra de filtros ---------------- */
    renderFilterBar: function () {
      const host = MI.clear(MI.$('#filterbar'));
      const chips = app.filterChips();
      host.appendChild(el('span', { class: 'filterbar__label', text: 'Recorte' }));
      if (!chips.length) {
        host.appendChild(el('button', {
          class: 'chip chip--ghost', type: 'button', onclick: function () { app.openFilters(); }
        }, [el('span', { html: MI.icon('filter', 14) }), 'Base completa — adicionar filtro']));
      } else {
        chips.forEach(function (c) { host.appendChild(c); });
        host.appendChild(el('button', {
          class: 'chip chip--ghost', type: 'button', onclick: function () { app.openFilters(); }
        }, [el('span', { html: MI.icon('filter', 14) }), 'Mais filtros']));
        host.appendChild(el('button', {
          class: 'chip chip--ghost', type: 'button', onclick: function () { st.clearFilters(); MI.toast('Filtros removidos.', 'ok'); }
        }, 'Limpar tudo'));
      }
      host.appendChild(el('span', { class: 'filterbar__count' }, [
        el('strong', { text: MI.fmt.int(st.rows.length) }),
        ' de ' + MI.fmt.int(st.dataset ? st.dataset.rows.length : 0) + ' registros',
        st.dataset && st.rows.length !== st.dataset.rows.length
          ? ' · ' + MI.fmt.pctOf(st.rows.length, st.dataset.rows.length, 1) : ''
      ]));
    },

    filterChips: function () {
      const fields = {};
      st.filterFields().forEach(function (f) { fields[f.id] = f; });
      return Object.keys(st.filters).map(function (id) {
        const f = st.filters[id];
        const meta = fields[id] || { label: id.replace('col:', '') };
        let txt = meta.label + ': ';
        if (f.kind === 'cat') {
          const vals = Array.from(f.values);
          txt += vals.length <= 3 ? vals.join(', ') : vals.length + ' selecionados';
        } else if (f.kind === 'range') {
          txt += (meta.money ? MI.fmt.money(f.min) : MI.fmt.dec(f.min, 0)) + ' a ' +
            (meta.money ? MI.fmt.money(f.max) : MI.fmt.dec(f.max, 0));
        } else if (f.kind === 'daterange') {
          txt += (f.from ? MI.fmt.date(f.from) : '…') + ' a ' + (f.to ? MI.fmt.date(f.to) : '…');
        }
        return el('span', { class: 'chip is-on' }, [
          el('button', {
            style: 'border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:0',
            title: 'Editar este filtro', onclick: function () { app.openFilters(id); }
          }, txt),
          el('button', {
            class: 'chip__x', title: 'Remover filtro', html: MI.icon('close', 13),
            onclick: function () { st.setFilter(id, null); }
          })
        ]);
      });
    },

    filterSummary: function () {
      const n = st.activeFilterCount();
      if (!n) return 'base completa, sem filtros';
      const fields = {};
      st.filterFields().forEach(function (f) { fields[f.id] = f; });
      return Object.keys(st.filters).map(function (id) {
        const f = st.filters[id], meta = fields[id] || { label: id };
        if (f.kind === 'cat') {
          const vals = Array.from(f.values);
          return meta.label + ' = ' + (vals.length <= 4 ? vals.join('/') : vals.length + ' valores');
        }
        if (f.kind === 'range') return meta.label + ' entre ' + MI.fmt.dec(f.min, 0) + ' e ' + MI.fmt.dec(f.max, 0);
        if (f.kind === 'daterange') return meta.label + ' de ' + (f.from ? MI.fmt.date(f.from) : '…') + ' a ' + (f.to ? MI.fmt.date(f.to) : '…');
        return meta.label;
      }).join('; ');
    },

    toggleCatValue: function (fieldId, value) {
      const cur = st.filters[fieldId];
      const set = cur && cur.kind === 'cat' ? new Set(cur.values) : new Set();
      if (set.has(value)) set.delete(value); else set.add(value);
      st.setFilter(fieldId, set.size ? { kind: 'cat', values: set } : null);
    },

    /* ---------------- Painel de filtros ---------------- */
    openFilters: function (focusId) {
      app.panelOpen = true;
      MI.$('#panel').classList.add('is-open');
      MI.$('#backdrop').classList.add('is-open');
      app.buildPanel(focusId);
    },
    closePanel: function () {
      app.panelOpen = false;
      MI.$('#panel').classList.remove('is-open');
      MI.$('#backdrop').classList.remove('is-open');
      MI.$('#sidebar').classList.remove('is-open');
    },

    buildPanel: function (focusId) {
      const host = MI.clear(MI.$('#panel-body'));
      const fields = st.filterFields();
      if (!fields.length) {
        host.appendChild(U.empty('Nenhuma dimensão filtrável', 'A base ativa não tem colunas reconhecidas como dimensão ou medida.'));
        return;
      }

      host.appendChild(U.note(null, [
        el('strong', { text: 'Os filtros valem para toda a plataforma. ' }),
        'Gráficos, tabelas, mapas e relatórios usam o mesmo recorte.'
      ]));

      let debounce = null;
      const apply = function (id, filter) {
        if (filter) st.filters[id] = filter; else delete st.filters[id];
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          st.applyFilters();
          st.emit('filters', st.filters);
        }, 220);
      };

      fields.forEach(function (f) {
        const current = st.filters[f.id];
        const box = el('div', { class: 'field' });
        box.appendChild(el('label', { class: 'field__label' }, [
          f.label,
          current ? el('span', { class: 'badge badge--ok', text: 'ativo' }) : null
        ]));

        if (f.kind === 'cat') {
          const counts = MI.countBy(st.dataset.rows, f.raw || f.id);
          const selected = current && current.kind === 'cat' ? new Set(current.values) : new Set();
          const opts = el('div', { class: 'opts' });
          const render = function (filtro) {
            MI.clear(opts);
            const lista = f.options.filter(function (o) {
              return !filtro || MI.slug(o).indexOf(MI.slug(filtro)) >= 0;
            }).slice(0, 120);
            lista.forEach(function (o) {
              const n = f.id === '_dow' ? countDow(st.dataset.rows, o) : (counts.get(o) || 0);
              const lab = el('label', { class: 'opt' }, [
                el('input', {
                  type: 'checkbox', checked: selected.has(o),
                  onchange: function (e) {
                    if (e.target.checked) selected.add(o); else selected.delete(o);
                    apply(f.id, selected.size ? { kind: 'cat', values: new Set(selected), raw: f.raw } : null);
                    lab.classList.toggle('is-on', e.target.checked);
                  }
                }),
                o, el('small', { text: MI.fmt.compact(n) })
              ]);
              opts.appendChild(lab);
            });
            if (!lista.length) opts.appendChild(el('span', { class: 'field__hint', text: 'Nenhuma opção corresponde à busca.' }));
          };
          if (f.searchable || f.options.length > 20) {
            const search = el('input', { class: 'input', type: 'search', placeholder: 'Buscar em ' + f.options.length + ' opções…' });
            search.addEventListener('input', function () { render(search.value); });
            box.appendChild(search);
          }
          render('');
          box.appendChild(opts);
          if (f.options.length > 120) box.appendChild(el('span', { class: 'field__hint', text: 'Exibindo as 120 opções mais frequentes. Use a busca para encontrar as demais.' }));

        } else if (f.kind === 'range') {
          const lo = el('input', { class: 'input', type: 'number', value: String(current ? current.min : f.min), min: String(f.min), max: String(f.max), step: f.integer ? '1' : 'any' });
          const hi = el('input', { class: 'input', type: 'number', value: String(current ? current.max : f.max), min: String(f.min), max: String(f.max), step: f.integer ? '1' : 'any' });
          const upd = function () {
            const a = MI.parseNumber(lo.value), b = MI.parseNumber(hi.value);
            if (a == null || b == null) return;
            const min = Math.min(a, b), max = Math.max(a, b);
            apply(f.id, (min <= f.min && max >= f.max) ? null : { kind: 'range', min: min, max: max, raw: f.raw });
          };
          lo.addEventListener('change', upd); hi.addEventListener('change', upd);
          box.appendChild(el('div', { class: 'range-row' }, [lo, el('span', { text: 'até' }), hi]));
          box.appendChild(el('span', { class: 'field__hint', text: 'Faixa na base: ' + MI.fmt.dec(f.min, 0) + ' a ' + MI.fmt.dec(f.max, 0) }));

        } else if (f.kind === 'daterange') {
          const lo = el('input', { class: 'input', type: 'date', value: MI.fmt.dateIso(current && current.from ? current.from : f.min) });
          const hi = el('input', { class: 'input', type: 'date', value: MI.fmt.dateIso(current && current.to ? current.to : f.max) });
          const upd = function () {
            const a = lo.value ? MI.parseDate(lo.value) : null, b = hi.value ? MI.parseDate(hi.value) : null;
            const igualBase = (!a || (f.min && a <= f.min)) && (!b || (f.max && b >= f.max));
            apply(f.id, igualBase ? null : { kind: 'daterange', from: a, to: b, raw: f.raw });
          };
          lo.addEventListener('change', upd); hi.addEventListener('change', upd);
          box.appendChild(el('div', { class: 'range-row' }, [lo, el('span', { text: 'até' }), hi]));
          box.appendChild(el('span', { class: 'field__hint', text: 'Período na base: ' + MI.fmt.date(f.min) + ' a ' + MI.fmt.date(f.max) }));
        }

        host.appendChild(box);
        if (focusId === f.id) setTimeout(function () { box.scrollIntoView({ block: 'center' }); }, 60);
      });
    }
  };

  function countDow(rows, nome) {
    const i = MI.DIAS_SEMANA.indexOf(nome);
    let n = 0;
    for (let k = 0; k < rows.length; k++) if (rows[k]._dow === i) n++;
    return n;
  }

  MI.app = app;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', app.boot);
  else app.boot();

})(window.MI);
