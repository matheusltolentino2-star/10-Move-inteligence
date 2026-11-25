/* 10 Move Intelligence — visualização geográfica
   -------------------------------------------------------------------------
   Mapa coroplético do Brasil com a geometria real das 27 unidades da
   federação (ver data-geo-brasil.js, malha oficial do IBGE em projeção
   equivalente). Substituiu uma grade esquemática que não era um mapa: as
   formas eram inventadas e as posições, aproximadas.

   Os rótulos das unidades pequenas demais para caber um dentro — DF, SE,
   AL, RJ, ES, RN, PB — saem para uma faixa à direita, com linha de chamada,
   empilhados na ordem norte-sul para que as linhas não se cruzem.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const el = MI.el, G = {};

  function hexToRgb(h) {
    const m = String(h).trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return [120, 140, 160];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
      Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Escala sequencial: claro -> turquesa -> azul profundo */
  G.scale = function (t) {
    const th = MI.charts.theme();
    if (t <= 0) return th.border;
    if (t < 0.5) return mix(th.border, th.series[1], t / 0.5);
    return mix(th.series[1], th.series[0], (t - 0.5) / 0.5);
  };

  /* Abaixo desta área (em unidades do desenho) o rótulo não cabe dentro
     da unidade federativa e vai para a faixa lateral. */
  const AREA_MINIMA = 5000;
  const FAIXA = 190;      /* largura da faixa de rótulos à direita */
  const ESPACO = 46;      /* altura mínima entre dois rótulos externos */

  /* dist: lista [{label:'SP', value:n, pct}] — valores JÁ sujeitos à supressão */
  G.mapa = function (dist, opts) {
    opts = opts || {};
    const M = MI.BR_MAPA;
    if (!M) return el('p', { class: 'field__hint', text: 'A geometria do mapa não carregou.' });

    const byUf = {};
    let max = 0, total = 0;
    dist.forEach(function (e) {
      if (e.suppressed || e.isOther) return;
      byUf[e.label] = e;
      total += e.value;
      if (e.value > max) max = e.value;
    });

    const ufs = Object.keys(M.caminhos);

    /* Rótulos externos empilhados de norte a sul, cada um o mais perto
       possível da sua latitude real sem encostar no de cima. */
    const fora = ufs.filter(function (uf) { return M.areas[uf] < AREA_MINIMA; })
      .sort(function (a, b) { return M.centros[a][1] - M.centros[b][1]; });
    const alvoY = {};
    let ultimo = -Infinity;
    fora.forEach(function (uf) {
      const y = Math.max(M.centros[uf][1], ultimo + ESPACO);
      alvoY[uf] = y; ultimo = y;
    });

    let formas = '', chamadas = '', rotulos = '';
    ufs.forEach(function (uf) {
      const e = byUf[uf];
      const v = e ? e.value : 0;
      const t = max ? v / max : 0;
      const cor = v ? G.scale(0.12 + t * 0.88) : 'var(--surface-3)';
      const sel = opts.selected && opts.selected.indexOf(uf) >= 0;
      const legenda = MI.UF_NOMES[uf] + ' — ' +
        (v ? MI.fmt.int(v) + ' (' + MI.fmt.pctOf(v, total, 1) + ')' : 'sem registros');

      formas += '<path d="' + M.caminhos[uf] + '" fill="' + cor + '"' +
        ' class="mapa-br__uf' + (sel ? ' is-sel' : '') + (v ? '' : ' is-vazio') + '"' +
        ' data-uf="' + uf + '" aria-label="' + esc(legenda) + '"' +
        (v && opts.onSelect ? ' role="button" tabindex="0"' : '') + '></path>';

      const c = M.centros[uf];
      if (M.areas[uf] >= AREA_MINIMA) {
        rotulos += '<text x="' + c[0] + '" y="' + (c[1] + 9) + '" class="mapa-br__rot"' +
          ' fill="' + (t > 0.45 ? '#fff' : 'var(--text)') + '">' + uf + '</text>';
      } else {
        const y = alvoY[uf];
        chamadas += '<path d="M' + c[0] + ' ' + c[1] + 'L' + (M.largura + 26) + ' ' + y + '" class="mapa-br__linha"></path>' +
          '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="4" class="mapa-br__ponto"></circle>';
        rotulos += '<text x="' + (M.largura + 34) + '" y="' + (y + 9) + '" class="mapa-br__rot mapa-br__rot--fora">' + uf + '</text>';
      }
    });

    const caixa = el('div', { class: 'mapa-br' });
    caixa.innerHTML =
      '<svg class="mapa-br__svg" viewBox="0 0 ' + (M.largura + FAIXA) + ' ' + M.altura + '"' +
      ' preserveAspectRatio="xMidYMid meet" role="img"' +
      ' aria-label="Mapa do Brasil por unidade da federação">' +
      formas + chamadas + rotulos + '</svg>';

    /* Dica flutuante: o rótulo nativo do SVG demora a aparecer e some ao
       mover o cursor, o que atrapalha justamente quem está comparando
       estados vizinhos. */
    const dica = el('span', { class: 'mapa-br__tip', hidden: true });
    caixa.appendChild(dica);

    const alvos = caixa.querySelectorAll('[data-uf]');
    for (let i = 0; i < alvos.length; i++) {
      const p = alvos[i];
      const uf = p.getAttribute('data-uf');
      const temValor = !!(byUf[uf] && byUf[uf].value);
      p.addEventListener('mouseenter', function () {
        dica.textContent = p.getAttribute('aria-label');
        dica.hidden = false;
      });
      p.addEventListener('mousemove', function (ev) {
        const r = caixa.getBoundingClientRect();
        dica.style.left = Math.max(4, Math.min(r.width - 8, ev.clientX - r.left)) + 'px';
        dica.style.top = (ev.clientY - r.top - 12) + 'px';
      });
      p.addEventListener('mouseleave', function () { dica.hidden = true; });
      if (temValor && opts.onSelect) {
        p.addEventListener('click', function () { opts.onSelect(uf); });
        p.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); opts.onSelect(uf); }
        });
      }
    }

    const ramp = 'linear-gradient(90deg,' + [0, .25, .5, .75, 1].map(function (t) {
      return G.scale(0.12 + t * 0.88);
    }).join(',') + ')';

    return el('div', {}, [
      caixa,
      el('div', { class: 'carto__legend' }, [
        el('span', { text: '0' }),
        el('span', { class: 'carto__ramp', style: 'background:' + ramp }),
        el('span', { text: MI.fmt.int(max) }),
        el('span', {
          style: 'margin-left:10px;color:var(--faint)',
          text: opts.onSelect ? 'clique em uma unidade para filtrar' : ''
        })
      ])
    ]);
  };

  /* Nome antigo, mantido para não quebrar chamadas existentes. */
  G.cartogram = G.mapa;

  /* ================= Nível municipal =================
     A malha de cada estado é um arquivo próprio, carregado só quando o
     usuário entra naquele estado. Minas tem 853 municípios e 258 KB; não
     faz sentido baixar isso junto com a de Roraima para quem só quis ver
     o mapa do Brasil. */

  const carregando = {};

  function versaoAssets() {
    try {
      const s = document.querySelector('script[src*="core.js?v="]');
      if (s) return (s.getAttribute('src').split('?v=')[1] || '').trim();
    } catch (e) { }
    return '';
  }

  G.temUf = function (uf) { return !!(MI.GEO_MUN && MI.GEO_MUN[uf]); };

  G.carregarUf = function (uf) {
    if (G.temUf(uf)) return Promise.resolve(MI.GEO_MUN[uf]);
    if (carregando[uf]) return carregando[uf];
    carregando[uf] = new Promise(function (resolve, reject) {
      const v = versaoAssets();
      const s = document.createElement('script');
      s.src = 'assets/geo/mun-' + uf + '.js' + (v ? '?v=' + v : '');
      s.onload = function () {
        if (G.temUf(uf)) resolve(MI.GEO_MUN[uf]);
        else reject(new Error('A malha de ' + uf + ' carregou vazia.'));
      };
      s.onerror = function () { reject(new Error('Não foi possível carregar a malha municipal de ' + uf + '.')); };
      document.head.appendChild(s);
    }).catch(function (e) { delete carregando[uf]; throw e; });
    return carregando[uf];
  };

  /* Nome de cidade da planilha → código do IBGE, dentro de uma UF.
     Correspondência por nome normalizado e exata: nome parecido não é
     casado em silêncio, fica no balanço de não localizados. */
  G.indiceMunicipios = function (uf) {
    const M = MI.GEO_MUN && MI.GEO_MUN[uf];
    if (!M) return null;
    if (M._indice) return M._indice;
    const idx = {};
    Object.keys(M.municipios).forEach(function (cod) {
      idx[MI.slug(M.municipios[cod].n)] = cod;
    });
    M._indice = idx;
    return idx;
  };

  /* Mesma projeção da geração das malhas, agora no sentido de ida: uma
     coordenada informada vira posição no desenho do estado. Os parâmetros
     de escala viajam dentro de cada malha, então não há número mágico aqui.
     Sem eles — malha antiga em cache — devolve null em vez de chutar. */
  const RAD = Math.PI / 180;
  const f1 = -2 * RAD, f2 = -30 * RAD, f0 = -15 * RAD, l0 = -54 * RAD;
  const nCone = (Math.sin(f1) + Math.sin(f2)) / 2;
  const CCone = Math.cos(f1) * Math.cos(f1) + 2 * nCone * Math.sin(f1);
  const rho0 = Math.sqrt(CCone - 2 * nCone * Math.sin(f0)) / nCone;
  const RAIO_TERRA_M = 6371000;

  G.projetarNaUf = function (uf, lat, lng) {
    const M = MI.GEO_MUN && MI.GEO_MUN[uf];
    if (!M || !M.proj || lat == null || lng == null) return null;
    const f = lat * RAD, l = lng * RAD;
    const r = Math.sqrt(CCone - 2 * nCone * Math.sin(f)) / nCone;
    const t = nCone * (l - l0);
    const X = r * Math.sin(t), Y = -(rho0 - r * Math.cos(t));
    return [(X - M.proj.minX) * M.proj.k, (Y - M.proj.minY) * M.proj.k];
  };

  /* Quantas unidades do desenho valem N metros naquele estado. A projeção
     preserva área, não distância, mas perto dos paralelos padrão a
     diferença é pequena o bastante para um raio de poucos quilômetros —
     o que não vale é tratar isso como medida geodésica. */
  G.metrosEmUnidades = function (uf, metros) {
    const M = MI.GEO_MUN && MI.GEO_MUN[uf];
    if (!M || !M.proj) return null;
    return (metros / RAIO_TERRA_M) * M.proj.k;
  };

  /* dist: distribuição por nome de cidade, já sujeita à supressão. */
  G.mapaUf = function (uf, dist, opts) {
    opts = opts || {};
    const M = MI.GEO_MUN && MI.GEO_MUN[uf];
    if (!M) return el('p', { class: 'field__hint', text: 'A malha de ' + uf + ' ainda não carregou.' });
    const idx = G.indiceMunicipios(uf);

    const porCodigo = {};
    const naoLocalizados = [];
    let max = 0, total = 0, localizados = 0;
    dist.forEach(function (e) {
      if (e.suppressed || e.isOther) return;
      const cod = idx[MI.slug(e.label)];
      total += e.value;
      if (!cod) { naoLocalizados.push(e); return; }
      porCodigo[cod] = e;
      localizados += e.value;
      if (e.value > max) max = e.value;
    });

    const selecionados = opts.selected || [];
    let formas = '', rotulos = '';
    Object.keys(M.municipios).forEach(function (cod) {
      const m = M.municipios[cod];
      const e = porCodigo[cod];
      const v = e ? e.value : 0;
      const t = max ? v / max : 0;
      const cor = v ? G.scale(0.12 + t * 0.88) : 'var(--surface-3)';
      const sel = e && selecionados.indexOf(e.label) >= 0;
      const legenda = m.n + ' — ' + (v ? MI.fmt.int(v) + ' (' + MI.fmt.pctOf(v, total, 1) + ')' : 'sem registros');
      formas += '<path d="' + m.d + '" fill="' + cor + '"' +
        ' class="mapa-br__uf mapa-br__mun' + (sel ? ' is-sel' : '') + (v ? '' : ' is-vazio') + '"' +
        ' data-mun="' + cod + '" aria-label="' + esc(legenda) + '"' +
        (v && opts.onSelect ? ' role="button" tabindex="0"' : '') + '></path>';
    });

    /* Só os maiores recebem rótulo: num estado com centenas de municípios,
       escrever todos os nomes não é informação, é ruído. */
    /* Região metropolitana coloca dezenas de centróides a poucos pixels uns
       dos outros. Rotular todos empilha nomes ilegíveis em cima do mapa, e
       o maior — justamente o que interessa — fica escondido. Então os
       maiores entram primeiro e quem cai perto de um já colocado é
       descartado; a dica do cursor cobre o resto. */
    Object.keys(porCodigo)
      .sort(function (a, b) { return porCodigo[b].value - porCodigo[a].value; })
      .slice(0, 16)
      .forEach(function (cod) {
        const m = M.municipios[cod];
        const t = max ? porCodigo[cod].value / max : 0;
        rotulos += '<text x="' + m.c[0] + '" y="' + (m.c[1] + 7) + '" class="mapa-br__rot mapa-br__rot--mun"' +
          ' fill="' + (t > 0.45 ? '#fff' : 'var(--text)') + '">' + esc(m.n) + '</text>';
      });

    const caixa = el('div', { class: 'mapa-br' });
    caixa.innerHTML = '<svg class="mapa-br__svg" viewBox="0 0 ' + M.largura + ' ' + M.altura + '"' +
      ' preserveAspectRatio="xMidYMid meet" role="img"' +
      ' aria-label="Municípios de ' + esc(MI.UF_NOMES[uf] || uf) + '">' + formas + rotulos + '</svg>';

    /* Rótulos sobrepostos: estimar a largura do texto pelo número de letras
       erra feio em nomes como "São José dos Campos", e região metropolitana
       é exatamente onde os centróides se amontoam. Então a poda é feita com
       a caixa que o navegador realmente desenhou, depois que o elemento
       entra na página. Os candidatos já vêm ordenados por volume, então o
       município maior é o que fica. */
    setTimeout(function () {
      if (!caixa.isConnected) return;
      const textos = caixa.querySelectorAll('.mapa-br__rot--mun');
      const mantidos = [];
      for (let i = 0; i < textos.length; i++) {
        let b;
        try { b = textos[i].getBBox(); } catch (e) { continue; }
        const bate = mantidos.some(function (o) {
          return !(b.x + b.width < o.x || b.x > o.x + o.width ||
            b.y + b.height < o.y || b.y > o.y + o.height);
        });
        if (bate || mantidos.length >= 9) textos[i].remove();
        else mantidos.push(b);
      }
    }, 0);

    const dica = el('span', { class: 'mapa-br__tip', hidden: true });
    caixa.appendChild(dica);
    const alvos = caixa.querySelectorAll('[data-mun]');
    for (let i = 0; i < alvos.length; i++) {
      const p = alvos[i];
      const cod = p.getAttribute('data-mun');
      const e = porCodigo[cod];
      p.addEventListener('mouseenter', function () { dica.textContent = p.getAttribute('aria-label'); dica.hidden = false; });
      p.addEventListener('mousemove', function (ev) {
        const r = caixa.getBoundingClientRect();
        dica.style.left = Math.max(4, Math.min(r.width - 8, ev.clientX - r.left)) + 'px';
        dica.style.top = (ev.clientY - r.top - 12) + 'px';
      });
      p.addEventListener('mouseleave', function () { dica.hidden = true; });
      if (e && opts.onSelect) {
        p.addEventListener('click', function () { opts.onSelect(e.label); });
        p.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); opts.onSelect(e.label); }
        });
      }
    }

    const ramp = 'linear-gradient(90deg,' + [0, .25, .5, .75, 1].map(function (t) {
      return G.scale(0.12 + t * 0.88);
    }).join(',') + ')';

    return {
      node: el('div', {}, [
        caixa,
        el('div', { class: 'carto__legend' }, [
          el('span', { text: '0' }),
          el('span', { class: 'carto__ramp', style: 'background:' + ramp }),
          el('span', { text: MI.fmt.int(max) }),
          el('span', { style: 'margin-left:10px;color:var(--faint)', text: opts.onSelect ? 'clique em um município para filtrar' : '' })
        ])
      ]),
      municipios: Object.keys(M.municipios).length,
      comRegistros: Object.keys(porCodigo).length,
      localizados: localizados,
      total: total,
      naoLocalizados: naoLocalizados
    };
  };

  /* Barras por região (Norte, Nordeste, ...) */
  G.REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];

  MI.geo = G;

})(window.MI);
