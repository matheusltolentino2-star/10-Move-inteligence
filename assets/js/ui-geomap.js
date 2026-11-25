/* 10 Move Intelligence — workspace de inteligência geográfica
   -------------------------------------------------------------------------
   POR QUE CONTINUA SVG

   Avaliei trocar por MapLibre GL, Deck.gl ou Leaflet antes de refatorar. A
   carga de trabalho aqui é um coroplético sobre geometria fixa e pequena:
   27 UFs no nível nacional, no máximo 853 polígonos num estado, tudo já
   projetado em build. Não há tiles, não há basemap, não há dado em tempo
   real, não há milhões de feições.

   Trocar custaria: 200 KB a 900 KB de biblioteca, uma fonte de dados em
   GeoJSON não projetado, mudanças na CSP e, principalmente, a quebra da
   arquitetura sem build do projeto. O que elas dariam de volta — zoom, pan,
   rótulos que não escalam — é o que este arquivo implementa com transform
   de SVG, que o navegador acelera por GPU do mesmo jeito.

   A conta muda se entrarem basemap, setores censitários do país inteiro ou
   pontos em volume. Aí MapLibre passa a valer, e a geometria em código IBGE
   continua servindo.

   COMO O ZOOM FUNCIONA

   As geometrias ficam num <g> com transform; os rótulos ficam FORA dele,
   posicionados em coordenadas de tela. Assim o texto não estica junto com o
   mapa — que é o que separa mapa profissional de SVG esticado.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const el = MI.el;
  const NS = 'http://www.w3.org/2000/svg';
  const W = {};

  /* Preferências de leitura sobrevivem ao re-render. Cada seleção no mapa
     refaz o componente, e sem isto a camada de unidades e a métrica
     escolhida voltavam ao padrão a cada clique — o usuário ligava o raio,
     clicava num município e o raio sumia. */
  const PREF = { verUnidades: true, verRaios: false, metrica: 'clientes' };

  function svgEl(nome, attrs) {
    const n = document.createElementNS(NS, nome);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    return n;
  }

  /* Caixa envolvente lida do próprio caminho. Guardada no objeto da feição
     porque o cálculo se repete a cada mudança de zoom. */
  function caixa(d) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const re = /(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g;
    let m;
    while ((m = re.exec(d))) {
      const x = +m[1], y = +m[2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return [minX, minY, maxX, maxY];
  }

  /* ---------------- Métricas ---------------- */

  function metricasDisponiveis() {
    const st = MI.store;
    const m = [{
      id: 'clientes', rotulo: 'Clientes', unidade: 'registros',
      valor: function (a) { return a.n; },
      fmt: function (v) { return MI.fmt.int(v); }
    }];
    if (st.has('_receita')) m.push({
      id: 'receita', rotulo: 'Receita acumulada', unidade: 'R$',
      valor: function (a) { return a.receita; },
      fmt: function (v) { return MI.fmt.money(v); }
    });
    if (st.has('_valor')) m.push({
      id: 'ticket', rotulo: 'Ticket médio', unidade: 'R$ por cliente',
      valor: function (a) { return a.comValor ? a.valor / a.comValor : 0; },
      fmt: function (v) { return MI.fmt.money(v); }
    });
    return m;
  }

  /* Agrega o recorte por território e aplica a supressão de grupos pequenos.
     Suprimido não é o mesmo que sem registro: um some por proteção, o outro
     por ausência, e o mapa precisa distinguir os dois. */
  function agregar(rows, campo) {
    const k = MI.privacy.k;
    const mascarar = MI.privacy.masking();
    const m = new Map();
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][campo];
      if (v == null || v === '') continue;
      let o = m.get(v);
      if (!o) { o = { n: 0, receita: 0, valor: 0, comValor: 0 }; m.set(v, o); }
      o.n++;
      const rec = rows[i]._receita;
      if (typeof rec === 'number' && isFinite(rec)) o.receita += rec;
      const val = rows[i]._valor;
      if (typeof val === 'number' && isFinite(val)) { o.valor += val; o.comValor++; }
    }
    let suprimidos = 0, gruposSuprimidos = 0;
    m.forEach(function (o) {
      o.suprimido = mascarar && o.n < k;
      if (o.suprimido) { suprimidos += o.n; gruposSuprimidos++; }
    });
    return { por: m, k: k, suprimidos: suprimidos, gruposSuprimidos: gruposSuprimidos };
  }

  /* ---------------- Workspace ---------------- */

  /* opts:
       nivel 'brasil' | 'uf', uf, rows, campo, selecionado,
       crumbs [{rotulo, aoClicar}], onSelect(nome), aoAprofundar(nome)   */
  W.workspace = function (opts) {
    const nivel = opts.nivel;
    const fonteGeo = nivel === 'uf' ? MI.GEO_MUN[opts.uf] : MI.BR_MAPA;
    if (!fonteGeo) return el('p', { class: 'field__hint', text: 'Geometria indisponível.' });

    /* feições normalizadas: o nível nacional guarda por sigla, o estadual
       por código do IBGE, e o resto do componente não precisa saber disso */
    const feicoes = [];
    if (nivel === 'uf') {
      Object.keys(fonteGeo.municipios).forEach(function (cod) {
        const m = fonteGeo.municipios[cod];
        if (!m._cx) m._cx = caixa(m.d);
        feicoes.push({ id: cod, nome: m.n, chave: m.n, d: m.d, c: m.c, cx: m._cx });
      });
    } else {
      fonteGeo._cx = fonteGeo._cx || {};
      Object.keys(fonteGeo.caminhos).forEach(function (uf) {
        if (!fonteGeo._cx[uf]) fonteGeo._cx[uf] = caixa(fonteGeo.caminhos[uf]);
        feicoes.push({
          id: uf, nome: MI.UF_NOMES[uf] || uf, chave: uf,
          d: fonteGeo.caminhos[uf], c: fonteGeo.centros[uf], cx: fonteGeo._cx[uf]
        });
      });
    }

    const ag = agregar(opts.rows, opts.campo);
    const metricas = metricasDisponiveis();
    const metricaSalva = metricas.filter(function (m) { return m.id === PREF.metrica; })[0];
    const S = {
      k: 1, tx: 0, ty: 0,
      metrica: metricaSalva || metricas[0],
      hover: null,
      /* O painel abre por padrão na tela larga: ocupa com conteúdo útil a
         faixa que sobraria ao lado de um mapa quase quadrado, e é por ele
         que se chega aos territórios pequenos demais para acertar com o
         cursor. No celular ele empilha embaixo e empurraria o mapa para
         fora da tela, então começa fechado. */
      painel: window.innerWidth >= 900,
      largura: fonteGeo.largura,
      altura: fonteGeo.altura
    };

    /* valores por feição, já sob a métrica escolhida */
    function recalcular() {
      let max = 0;
      feicoes.forEach(function (f) {
        const a = ag.por.get(f.chave);
        f.ag = a || null;
        f.suprimido = !!(a && a.suprimido);
        f.v = a && !a.suprimido ? S.metrica.valor(a) : 0;
        if (f.v > max) max = f.v;
      });
      S.max = max;
    }
    recalcular();

    /* ---------- estrutura ---------- */
    const raiz = el('div', { class: 'geo' });

    const svg = svgEl('svg', {
      class: 'geo__svg',
      viewBox: '0 0 ' + S.largura + ' ' + S.altura,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': nivel === 'uf'
        ? 'Mapa de municípios de ' + (MI.UF_NOMES[opts.uf] || opts.uf)
        : 'Mapa do Brasil por unidade da federação'
    });
    const camada = svgEl('g', { class: 'geo__camada' });
    const camadaUnidades = svgEl('g', { class: 'geo__unidades' });
    const camadaRotulos = svgEl('g', { class: 'geo__rotulos' });
    svg.appendChild(camada);
    camada.appendChild(camadaUnidades);
    svg.appendChild(camadaRotulos);

    const porId = {};
    feicoes.forEach(function (f) {
      const p = svgEl('path', { d: f.d, 'data-id': f.id, class: 'geo__f' });
      p.setAttribute('aria-label', f.nome);
      camada.appendChild(p);
      porId[f.id] = p;
      f.el = p;
    });

    const dica = el('div', { class: 'geo__tip', hidden: true });
    const palco = el('div', { class: 'geo__palco' }, [dica]);
    palco.insertBefore(svg, dica);

    /* ---------- pintura ---------- */
    function pintar() {
      feicoes.forEach(function (f) {
        const sel = opts.selecionado && f.chave === opts.selecionado;
        let cls = 'geo__f';
        if (!f.ag) cls += ' is-sem';
        else if (f.suprimido) cls += ' is-sup';
        if (sel) cls += ' is-sel';
        if (S.hover === f.id) cls += ' is-hover';
        f.el.setAttribute('class', cls);
        f.el.setAttribute('fill', f.ag && !f.suprimido && S.max
          ? MI.geo.scale(0.14 + (f.v / S.max) * 0.86)
          : 'var(--geo-vazio)');
        if (f.ag && !f.suprimido) {
          f.el.setAttribute('role', 'button');
          f.el.setAttribute('tabindex', '0');
        } else {
          f.el.removeAttribute('role');
          f.el.removeAttribute('tabindex');
        }
      });
    }

    /* ---------- zoom e deslocamento ---------- */
    function aplicar() {
      camada.setAttribute('transform', 'translate(' + S.tx + ' ' + S.ty + ') scale(' + S.k + ')');
      redimensionarMarcas();
      agendarRotulos();
      botaoReset.disabled = S.k === 1 && S.tx === 0 && S.ty === 0;
    }

    function limitar() {
      /* não deixa o mapa sair de vista: no mínimo um quarto dele continua
         dentro do palco, em qualquer direção */
      const margem = 0.75;
      const maxTx = S.largura * margem;
      const minTx = -S.largura * S.k + S.largura * (1 - margem);
      const maxTy = S.altura * margem;
      const minTy = -S.altura * S.k + S.altura * (1 - margem);
      S.tx = Math.min(maxTx, Math.max(minTx, S.tx));
      S.ty = Math.min(maxTy, Math.max(minTy, S.ty));
    }

    function zoomPara(k, cx, cy) {
      const novo = Math.min(28, Math.max(1, k));
      const f = novo / S.k;
      S.tx = cx - (cx - S.tx) * f;
      S.ty = cy - (cy - S.ty) * f;
      S.k = novo;
      limitar();
      aplicar();
    }

    /* converte ponto de tela para o sistema do viewBox */
    function paraViewBox(ev) {
      const r = svg.getBoundingClientRect();
      const escalaTela = Math.min(r.width / S.largura, r.height / S.altura);
      const offX = (r.width - S.largura * escalaTela) / 2;
      const offY = (r.height - S.altura * escalaTela) / 2;
      return [(ev.clientX - r.left - offX) / escalaTela, (ev.clientY - r.top - offY) / escalaTela];
    }

    svg.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      const p = paraViewBox(ev);
      zoomPara(S.k * (ev.deltaY < 0 ? 1.18 : 1 / 1.18), p[0], p[1]);
    }, { passive: false });

    let arrastando = null;
    svg.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      arrastando = { x: ev.clientX, y: ev.clientY, tx: S.tx, ty: S.ty, moveu: false };
      svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener('pointermove', function (ev) {
      if (!arrastando) return;
      const r = svg.getBoundingClientRect();
      const escalaTela = Math.min(r.width / S.largura, r.height / S.altura);
      const dx = (ev.clientX - arrastando.x) / escalaTela;
      const dy = (ev.clientY - arrastando.y) / escalaTela;
      if (Math.abs(dx) + Math.abs(dy) > 3) arrastando.moveu = true;
      S.tx = arrastando.tx + dx;
      S.ty = arrastando.ty + dy;
      limitar();
      aplicar();
      raiz.classList.add('is-arrastando');
    });
    const soltar = function (ev) {
      if (!arrastando) return;
      const moveu = arrastando.moveu;
      arrastando = null;
      raiz.classList.remove('is-arrastando');
      try { svg.releasePointerCapture(ev.pointerId); } catch (e) { }
      svg._ignorarClique = moveu;
    };
    svg.addEventListener('pointerup', soltar);
    svg.addEventListener('pointercancel', soltar);

    /* Enquadra uma feição com folga, animado: pular direto confunde sobre
       onde se está no território. */
    function enquadrar(f, animar) {
      const larg = Math.max(1, f.cx[2] - f.cx[0]);
      const alt = Math.max(1, f.cx[3] - f.cx[1]);
      const alvoK = Math.min(16, Math.max(1, 0.7 * Math.min(S.largura / larg, S.altura / alt)));
      const cx = (f.cx[0] + f.cx[2]) / 2, cy = (f.cx[1] + f.cx[3]) / 2;
      const alvoTx = S.largura / 2 - cx * alvoK;
      const alvoTy = S.altura / 2 - cy * alvoK;
      if (!animar) { S.k = alvoK; S.tx = alvoTx; S.ty = alvoTy; limitar(); aplicar(); return; }
      const k0 = S.k, tx0 = S.tx, ty0 = S.ty, t0 = performance.now();
      const passo = function (t) {
        const p = Math.min(1, (t - t0) / 420);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        S.k = k0 + (alvoK - k0) * e;
        S.tx = tx0 + (alvoTx - tx0) * e;
        S.ty = ty0 + (alvoTy - ty0) * e;
        aplicar();
        if (p < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    }

    /* ---------- rótulos ----------
       Ficam fora da camada transformada: o texto mantém o tamanho em
       qualquer zoom. Entram em ordem de relevância e só quando cabem dentro
       do próprio polígono na tela; o que não cabe fica para a dica e para o
       painel, nunca por cima da geometria. */
    let pendente = null;
    function agendarRotulos() {
      if (pendente) cancelAnimationFrame(pendente);
      pendente = requestAnimationFrame(function () { pendente = null; desenharRotulos(); });
    }

    function desenharRotulos() {
      while (camadaRotulos.firstChild) camadaRotulos.removeChild(camadaRotulos.firstChild);
      const candidatos = feicoes.filter(function (f) { return f.ag && !f.suprimido; })
        .sort(function (a, b) { return b.v - a.v; });
      const selecionada = feicoes.filter(function (f) {
        return opts.selecionado && f.chave === opts.selecionado;
      })[0];
      if (selecionada && candidatos.indexOf(selecionada) > 0) {
        candidatos.splice(candidatos.indexOf(selecionada), 1);
        candidatos.unshift(selecionada);
      }

      const caixas = [];
      const naoCoube = [];
      let postos = 0;
      for (let i = 0; i < candidatos.length && postos < 14; i++) {
        const f = candidatos[i];
        const larguraTela = (f.cx[2] - f.cx[0]) * S.k;
        const alturaTela = (f.cx[3] - f.cx[1]) * S.k;
        const x = f.c[0] * S.k + S.tx;
        const y = f.c[1] * S.k + S.ty;
        if (x < 0 || y < 0 || x > S.largura || y > S.altura) continue;  /* fora de vista */
        if (alturaTela < 15) { naoCoube.push([f, x, y]); continue; }

        const t = svgEl('text', {
          x: x, y: y + 5, class: 'geo__rot' + (f === selecionada ? ' is-sel' : ''),
          fill: S.max && f.v / S.max > 0.45 ? '#fff' : 'var(--text)'
        });
        t.textContent = f.nome;
        camadaRotulos.appendChild(t);

        let b;
        try { b = t.getBBox(); } catch (e) { camadaRotulos.removeChild(t); continue; }
        /* o rótulo não pode ser maior que o município que ele nomeia */
        if (b.width > larguraTela * 0.95) {
          camadaRotulos.removeChild(t);
          naoCoube.push([f, x, y]);
          continue;
        }
        const bate = caixas.some(function (o) {
          return !(b.x + b.width < o.x || b.x > o.x + o.width || b.y + b.height < o.y || b.y > o.y + o.height);
        });
        if (bate) { camadaRotulos.removeChild(t); continue; }
        caixas.push(b);
        postos++;
      }

      /* Os maiores que não cabem por dentro — caso de São Paulo capital no
         mapa do estado — ganham chamada externa com linha. Sem isso o
         município mais relevante da tela fica sem nome, e escrever por cima
         dele cobriria justamente a geometria que importa. */
      naoCoube.slice(0, 3).forEach(function (par) {
        const f = par[0], x = par[1], y = par[2];
        const dir = x > S.largura * 0.62 ? -1 : 1;
        const lx = x + dir * 34, ly = y - 24;
        const t = svgEl('text', {
          x: lx + dir * 5, y: ly + 4,
          class: 'geo__rot geo__rot--fora' + (f === selecionada ? ' is-sel' : ''),
          'text-anchor': dir > 0 ? 'start' : 'end'
        });
        t.textContent = f.nome;
        camadaRotulos.appendChild(t);
        let b;
        try { b = t.getBBox(); } catch (e) { camadaRotulos.removeChild(t); return; }
        if (b.x < 0 || b.x + b.width > S.largura || b.y < 0) { camadaRotulos.removeChild(t); return; }
        const bate = caixas.some(function (o) {
          return !(b.x + b.width < o.x || b.x > o.x + o.width || b.y + b.height < o.y || b.y > o.y + o.height);
        });
        if (bate) { camadaRotulos.removeChild(t); return; }
        caixas.push(b);
        const linha = svgEl('path', { d: 'M' + x + ' ' + y + 'L' + lx + ' ' + ly, class: 'geo__chamada' });
        camadaRotulos.insertBefore(linha, t);
        camadaRotulos.appendChild(svgEl('circle', { cx: x, cy: y, r: 2.6, class: 'geo__ponto' }));
      });
    }

    /* ---------- camada de unidades ----------
       Cada unidade entra com a posição que a precisão dela permite, e o
       desenho diz qual é: coordenada informada vira ponto cheio; município
       vira ponto vazado, porque é o centro do município, não a porta da
       loja. O raio de cobertura só sai para quem tem coordenada — um
       círculo de 3 km em volta de um centróide não mede nada. */
    S.verUnidades = PREF.verUnidades;
    S.verRaios = PREF.verRaios;

    function posicaoDaUnidade(u) {
      if (nivel === 'brasil') {
        const c = u.uf && fonteGeo.centros[u.uf];
        return c ? { p: c, aproximada: true } : null;
      }
      if (u.uf !== opts.uf) return null;
      if (u.precisao === 'exata') {
        const p = MI.geo.projetarNaUf(opts.uf, u.lat, u.lng);
        if (p) return { p: p, aproximada: false };
      }
      if (u.municipio) {
        const idx = MI.geo.indiceMunicipios(opts.uf);
        const cod = idx && idx[MI.slug(u.municipio)];
        const m = cod && fonteGeo.municipios[cod];
        if (m) return { p: m.c, aproximada: true };
      }
      return null;
    }

    /* Quantas unidades do viewBox valem um pixel de tela. O marcador precisa
       ter tamanho constante em PIXEL: dimensioná-lo em unidades do desenho
       fazia o ponto virar sub-pixel assim que o mapa aproximava. */
    function unidadesPorPixel() {
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return 1;
      return 1 / Math.min(r.width / S.largura, r.height / S.altura);
    }
    function raioMarca() { return (4.6 * unidadesPorPixel()) / S.k; }

    function desenharUnidades() {
      while (camadaUnidades.firstChild) camadaUnidades.removeChild(camadaUnidades.firstChild);
      if (!S.verUnidades || !MI.unidades) return;
      const lista = MI.unidades.posicionaveis();
      lista.forEach(function (u) {
        const pos = posicaoDaUnidade(u);
        if (!pos) return;
        if (S.verRaios && !pos.aproximada && nivel === 'uf') {
          const raio = MI.geo.metrosEmUnidades(opts.uf, u.raio_m || 3000);
          if (raio) {
            camadaUnidades.appendChild(svgEl('circle', {
              cx: pos.p[0], cy: pos.p[1], r: raio,
              class: 'geo__raio geo__raio--' + (u.formato || 'nao_informado')
            }));
          }
        }
        const marca = svgEl('circle', {
          cx: pos.p[0], cy: pos.p[1], r: raioMarca(),
          class: 'geo__unidade geo__unidade--' + (u.formato || 'nao_informado') +
            (pos.aproximada ? ' is-aprox' : '')
        });
        marca.setAttribute('vector-effect', 'non-scaling-stroke');
        marca.setAttribute('data-unidade', u.id);
        camadaUnidades.appendChild(marca);
      });
    }

    /* o raio do marcador compensa o zoom para não virar um disco gigante */
    function redimensionarMarcas() {
      const marcas = camadaUnidades.querySelectorAll('.geo__unidade');
      const r = raioMarca();
      for (let i = 0; i < marcas.length; i++) marcas[i].setAttribute('r', r);
    }

    /* ---------- dica ---------- */
    function textoDica(f) {
      const linhas = [el('strong', { text: f.nome })];
      if (!f.ag) linhas.push(el('span', { text: 'Sem registros no recorte' }));
      else if (f.suprimido) linhas.push(el('span', { text: 'Suprimido: menos de ' + ag.k + ' registros' }));
      else {
        linhas.push(el('span', { text: MI.fmt.int(f.ag.n) + ' clientes · ' + MI.fmt.pctOf(f.ag.n, opts.rows.length, 1) + ' do recorte' }));
        if (MI.store.has('_receita')) linhas.push(el('span', { text: 'Receita ' + MI.fmt.money(f.ag.receita) }));
        if (f.ag.comValor) linhas.push(el('span', { text: 'Ticket médio ' + MI.fmt.money(f.ag.valor / f.ag.comValor) }));
      }
      return linhas;
    }

    svg.addEventListener('pointermove', function (ev) {
      if (arrastando) return;
      /* a unidade tem prioridade na dica: ela está por cima do polígono e é
         o que o cursor está mirando */
      const uEl = ev.target.closest ? ev.target.closest('[data-unidade]') : null;
      if (uEl && MI.unidades) {
        const u = MI.unidades.items.filter(function (x) { return x.id === uEl.getAttribute('data-unidade'); })[0];
        if (u) {
          MI.clear(dica);
          dica.appendChild(el('strong', { text: u.nome }));
          dica.appendChild(el('span', { text: MI.unidades.rotuloFormato(u.formato) }));
          dica.appendChild(el('span', { text: MI.unidades.rotuloPrecisao(u.precisao) }));
          if (u.municipio) dica.appendChild(el('span', { text: u.municipio + (u.uf ? ' · ' + u.uf : '') }));
          const r = palco.getBoundingClientRect();
          dica.hidden = false;
          dica.style.left = Math.min(r.width - 12, Math.max(12, ev.clientX - r.left)) + 'px';
          dica.style.top = (ev.clientY - r.top - 14) + 'px';
          return;
        }
      }
      const alvo = ev.target.closest ? ev.target.closest('[data-id]') : null;
      const id = alvo ? alvo.getAttribute('data-id') : null;
      if (id !== S.hover) {
        S.hover = id;
        pintar();
      }
      if (!id) { dica.hidden = true; return; }
      const f = feicoes.filter(function (x) { return x.id === id; })[0];
      MI.clear(dica);
      textoDica(f).forEach(function (n) { dica.appendChild(n); });
      const r = palco.getBoundingClientRect();
      dica.hidden = false;
      dica.style.left = Math.min(r.width - 12, Math.max(12, ev.clientX - r.left)) + 'px';
      dica.style.top = (ev.clientY - r.top - 14) + 'px';
    });
    svg.addEventListener('pointerleave', function () {
      S.hover = null; dica.hidden = true; pintar();
    });

    svg.addEventListener('click', function (ev) {
      if (svg._ignorarClique) { svg._ignorarClique = false; return; }
      const alvo = ev.target.closest ? ev.target.closest('[data-id]') : null;
      if (!alvo) return;
      const f = feicoes.filter(function (x) { return x.id === alvo.getAttribute('data-id'); })[0];
      if (!f || !f.ag || f.suprimido) return;
      enquadrar(f, true);
      if (opts.onSelect) opts.onSelect(f.chave);
    });
    svg.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const alvo = ev.target.closest ? ev.target.closest('[data-id]') : null;
      if (!alvo) return;
      ev.preventDefault();
      const f = feicoes.filter(function (x) { return x.id === alvo.getAttribute('data-id'); })[0];
      if (f && f.ag && !f.suprimido && opts.onSelect) { enquadrar(f, true); opts.onSelect(f.chave); }
    });

    /* ---------- barra superior ---------- */
    const trilha = el('div', { class: 'geo__trilha' });
    (opts.crumbs || []).forEach(function (c, i) {
      if (i) trilha.appendChild(el('span', { class: 'geo__crumb-sep', text: '›' }));
      trilha.appendChild(el('button', {
        class: 'geo__crumb' + (c.aoClicar ? '' : ' is-on'), type: 'button',
        onclick: c.aoClicar || null
      }, c.rotulo));
    });

    const seletorMetrica = el('select', { class: 'input input--sm geo__metrica', 'aria-label': 'Métrica do mapa' },
      metricas.map(function (m) {
        return el('option', { value: m.id, text: m.rotulo, selected: m.id === S.metrica.id ? '' : null });
      }));
    seletorMetrica.addEventListener('change', function () {
      S.metrica = metricas.filter(function (m) { return m.id === seletorMetrica.value; })[0] || metricas[0];
      PREF.metrica = S.metrica.id;
      recalcular(); pintar(); agendarRotulos(); atualizarLegenda();
    });

    const busca = el('input', {
      class: 'input input--sm geo__busca', type: 'search',
      placeholder: nivel === 'uf' ? 'Buscar município…' : 'Buscar estado…',
      'aria-label': 'Buscar no mapa'
    });
    const sugestoes = el('div', { class: 'geo__sugestoes', hidden: true });
    busca.addEventListener('input', function () {
      const q = MI.slug(busca.value.trim());
      MI.clear(sugestoes);
      if (q.length < 2) { sugestoes.hidden = true; return; }
      const achados = feicoes.filter(function (f) { return MI.slug(f.nome).indexOf(q) >= 0; })
        .sort(function (a, b) { return b.v - a.v; }).slice(0, 7);
      if (!achados.length) {
        sugestoes.appendChild(el('div', { class: 'geo__sug is-vazio', text: 'Nada encontrado' }));
      } else {
        achados.forEach(function (f) {
          sugestoes.appendChild(el('button', {
            class: 'geo__sug', type: 'button',
            onclick: function () {
              busca.value = ''; sugestoes.hidden = true;
              enquadrar(f, true);
              if (f.ag && !f.suprimido && opts.onSelect) opts.onSelect(f.chave);
              else MI.toast(f.nome + ' não tem registros no recorte atual.', 'info');
            }
          }, [
            el('span', { text: f.nome }),
            el('small', { text: f.ag && !f.suprimido ? S.metrica.fmt(f.v) : 'sem registros' })
          ]));
        });
      }
      sugestoes.hidden = false;
    });
    busca.addEventListener('blur', function () { setTimeout(function () { sugestoes.hidden = true; }, 150); });

    const botao = function (rotulo, titulo, aoClicar, conteudo) {
      return el('button', { class: 'geo__ctrl', type: 'button', title: titulo, 'aria-label': titulo, onclick: aoClicar },
        conteudo || rotulo);
    };
    const botaoReset = botao('', 'Voltar ao enquadramento inicial', function () {
      S.k = 1; S.tx = 0; S.ty = 0; aplicar();
    }, el('span', { html: MI.icon('refresh', 15) }));
    botaoReset.disabled = true;

    const botaoTela = botao('', 'Tela cheia', function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (raiz.requestFullscreen) raiz.requestFullscreen();
    }, el('span', { html: MI.icon('grid', 15) }));

    const botaoPainel = botao('', 'Mostrar ou esconder o painel', function () {
      S.painel = !S.painel;
      raiz.classList.toggle('is-com-painel', S.painel);
    }, el('span', { html: MI.icon('chevron', 15) }));

    /* Camadas operacionais. Ficam desligadas quando não há o que mostrar, e
       com o motivo no título: botão que não faz nada é pior que botão
       ausente. */
    const bal = MI.unidades ? MI.unidades.balanco() : { total: 0, exatas: 0 };
    const alternador = function (rotulo, ligado, habilitado, titulo, aoMudar) {
      const b = el('button', {
        class: 'geo__camada-btn' + (ligado ? ' is-on' : ''), type: 'button',
        title: titulo, disabled: !habilitado,
        onclick: function () {
          const novo = !b.classList.contains('is-on');
          b.classList.toggle('is-on', novo);
          aoMudar(novo);
        }
      }, rotulo);
      return b;
    };

    const btnUnidades = alternador('Unidades', S.verUnidades, bal.total > 0,
      bal.total ? MI.fmt.int(bal.total) + ' unidades cadastradas' : 'Nenhuma unidade cadastrada ainda',
      function (v) { S.verUnidades = v; PREF.verUnidades = v; desenharUnidades(); });

    const btnRaios = alternador('Raio 3 km', S.verRaios, nivel === 'uf' && bal.exatas > 0,
      nivel !== 'uf' ? 'O raio só faz sentido dentro de um estado'
        : bal.exatas ? 'Cobertura das unidades com coordenada informada'
          : 'Nenhuma unidade tem coordenada: o raio sairia em volta do centro do município',
      function (v) { S.verRaios = v; PREF.verRaios = v; desenharUnidades(); });

    const barra = el('div', { class: 'geo__barra' }, [
      trilha,
      el('div', { class: 'geo__barra-dir' }, [
        el('div', { class: 'geo__camadas' }, [btnUnidades, btnRaios]),
        el('div', { class: 'geo__campo-busca' }, [busca, sugestoes]),
        seletorMetrica,
        botaoPainel
      ])
    ]);

    const controles = el('div', { class: 'geo__controles' }, [
      botao('+', 'Aproximar', function () { zoomPara(S.k * 1.4, S.largura / 2, S.altura / 2); }),
      botao('−', 'Afastar', function () { zoomPara(S.k / 1.4, S.largura / 2, S.altura / 2); }),
      botaoReset,
      botaoTela
    ]);
    palco.appendChild(controles);

    /* ---------- legenda ---------- */
    const faixa = el('span', { class: 'geo__ramp' });
    const legMin = el('span', { class: 'geo__leg-v', text: '0' });
    const legMax = el('span', { class: 'geo__leg-v' });
    const legUnidade = el('span', { class: 'geo__leg-un' });
    function atualizarLegenda() {
      faixa.style.background = 'linear-gradient(90deg,' + [0, .25, .5, .75, 1].map(function (t) {
        return MI.geo.scale(0.14 + t * 0.86);
      }).join(',') + ')';
      legMax.textContent = S.metrica.fmt(S.max || 0);
      legUnidade.textContent = S.metrica.rotulo + ' · ' + S.metrica.unidade;
    }
    atualizarLegenda();

    const legenda = el('div', { class: 'geo__legenda' }, [
      el('div', { class: 'geo__leg-linha' }, [legMin, faixa, legMax]),
      el('div', { class: 'geo__leg-un-linha' }, legUnidade),
      el('div', { class: 'geo__leg-chaves' }, [
        el('span', { class: 'geo__chave' }, [el('i', { class: 'geo__sw is-sem' }), 'sem registros']),
        ag.gruposSuprimidos
          ? el('span', { class: 'geo__chave' }, [el('i', { class: 'geo__sw is-sup' }), 'suprimido (< ' + ag.k + ')'])
          : null,
        el('span', { class: 'geo__chave' }, [el('i', { class: 'geo__sw is-sel' }), 'selecionado'])
      ].filter(Boolean)),
      el('div', { class: 'geo__fonte', text: 'Malha IBGE · projeção cônica equivalente' })
    ]);
    palco.appendChild(legenda);

    /* ---------- painel contextual ---------- */
    const painel = el('aside', { class: 'geo__painel' });
    function montarPainel() {
      MI.clear(painel);
      const sel = opts.selecionado
        ? feicoes.filter(function (f) { return f.chave === opts.selecionado; })[0]
        : null;

      painel.appendChild(el('div', { class: 'geo__painel-topo' }, [
        el('h4', { text: sel ? sel.nome : (nivel === 'uf' ? MI.UF_NOMES[opts.uf] : 'Brasil') }),
        el('button', {
          class: 'geo__ctrl geo__ctrl--fecha', type: 'button', title: 'Fechar painel',
          onclick: function () { S.painel = false; raiz.classList.remove('is-com-painel'); }
        }, el('span', { html: MI.icon('close', 14) }))
      ]));

      if (sel && sel.ag && !sel.suprimido) {
        const a = sel.ag;
        painel.appendChild(MI.ui.statline([
          { k: 'Clientes', v: MI.fmt.int(a.n) },
          { k: 'Participação', v: MI.fmt.pctOf(a.n, opts.rows.length, 1) },
          MI.store.has('_receita') ? { k: 'Receita', v: MI.fmt.money(a.receita) } : null,
          a.comValor ? { k: 'Ticket médio', v: MI.fmt.money(a.valor / a.comValor) } : null
        ].filter(Boolean)));
        if (opts.aoAprofundar) {
          painel.appendChild(el('div', { style: 'margin-top:12px' },
            MI.ui.btn(opts.rotuloAprofundar || 'Aprofundar', {
              sm: true, variant: 'accent', icon: 'target',
              onClick: function () { opts.aoAprofundar(sel.chave); }
            })));
        }
      }

      /* ranking: o painel é por onde se investiga sem precisar caçar
         polígonos pequenos no mapa */
      const ranking = feicoes.filter(function (f) { return f.ag && !f.suprimido; })
        .sort(function (a, b) { return b.v - a.v; }).slice(0, 25);
      painel.appendChild(el('div', { class: 'geo__painel-sec', text: 'Ranking por ' + S.metrica.rotulo.toLowerCase() }));
      painel.appendChild(el('div', { class: 'geo__lista' }, ranking.map(function (f, i) {
        const prop = S.max ? f.v / S.max : 0;
        return el('button', {
          class: 'geo__item' + (opts.selecionado === f.chave ? ' is-on' : ''), type: 'button',
          onclick: function () { enquadrar(f, true); if (opts.onSelect) opts.onSelect(f.chave); }
        }, [
          el('span', { class: 'geo__item-pos', text: String(i + 1) }),
          el('span', { class: 'geo__item-nome', text: f.nome }),
          el('span', { class: 'geo__item-v', text: S.metrica.fmt(f.v) }),
          el('i', { class: 'geo__item-barra', style: 'width:' + Math.round(prop * 100) + '%' })
        ]);
      })));

      if (opts.naoLocalizados && opts.naoLocalizados.length) {
        painel.appendChild(el('div', { class: 'geo__painel-sec', text: 'Fora do mapa' }));
        painel.appendChild(el('div', { class: 'geo__aviso' }, [
          el('strong', { text: MI.fmt.int(opts.naoLocalizados.length) + ' nomes não batem com a malha. ' }),
          'Continuam nos números da plataforma; só não têm posição.'
        ]));
        painel.appendChild(el('div', { class: 'geo__lista' }, opts.naoLocalizados.slice(0, 10).map(function (e) {
          return el('div', { class: 'geo__item is-inerte' }, [
            el('span', { class: 'geo__item-nome', text: e.label }),
            el('span', { class: 'geo__item-v', text: MI.fmt.int(e.value) })
          ]);
        })));
      }
    }
    montarPainel();

    raiz.appendChild(barra);
    raiz.appendChild(el('div', { class: 'geo__corpo' }, [palco, painel]));
    if (S.painel) raiz.classList.add('is-com-painel');

    pintar();
    desenharUnidades();
    /* Medir texto exige layout pronto. Um setTimeout sozinho chegava cedo
       demais e todo rótulo era podado por getBBox zerado — daí o observador,
       que também cobre redimensionamento de janela e entrada em tela cheia. */
    if (window.ResizeObserver) {
      const obs = new ResizeObserver(function () { agendarRotulos(); });
      obs.observe(palco);
    }
    setTimeout(function () {
      agendarRotulos();
      const sel = opts.selecionado
        ? feicoes.filter(function (f) { return f.chave === opts.selecionado; })[0]
        : null;
      if (sel) enquadrar(sel, false);
    }, 0);

    raiz._reagir = function () { recalcular(); pintar(); desenharUnidades(); agendarRotulos(); atualizarLegenda(); montarPainel(); };
    return raiz;
  };

  MI.geoMap = W;

})(window.MI);
