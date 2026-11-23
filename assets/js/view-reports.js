/* 10 Move Intelligence — Relatórios
   Gera um PDF de indicadores AGREGADOS e exporta tabelas consolidadas.
   Nenhuma linha individual entra no relatório ou na exportação. */
window.MI = window.MI || {};
MI.views = MI.views || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, S = MI.stats;

  /* ================= Montagem do conteúdo do relatório ================= */
  function buildModel() {
    const st = MI.store, ds = st.dataset, rows = st.rows;
    const tenMove = st.isTenMove();
    const inc = function (id) { return MI.privacy.canSee(id); };

    const m = {
      titulo: '10 Move Intelligence — Relatório de Indicadores',
      base: ds.name,
      origem: ds.source === 'demo' ? 'Base demonstrativa sintética (não são dados reais da Smoov)' : 'Planilha importada: ' + ds.fileName,
      perspectiva: tenMove ? 'Visão 10 Move — somente indicadores aprovados' : 'Visão Smoov — área privada',
      geradoEm: new Date(),
      registros: rows.length,
      registrosBase: ds.rows.length,
      filtros: MI.app.filterSummary(),
      k: MI.privacy.k,
      kpis: [],
      secoes: [],
      fatos: [],
      limitacoes: []
    };

    /* --- KPIs --- */
    if (inc('base.volume')) {
      m.kpis.push({ k: 'Registros no recorte', v: MI.fmt.int(rows.length) });
      const idKey = st.role('id');
      if (idKey) m.kpis.push({ k: 'Clientes únicos', v: MI.fmt.int(S.uniqueCount(rows, idKey)) });
      m.kpis.push({ k: 'Participação na base', v: MI.fmt.pctOf(rows.length, ds.rows.length, 1) });
    }
    if (st.has('_idade') && inc('demo.idade')) {
      const s = S.numStats(rows, '_idade');
      m.kpis.push({ k: 'Idade mediana', v: MI.fmt.dec(s.median, 1) + ' anos' });
      m.kpis.push({ k: 'Idade média', v: MI.fmt.dec(s.mean, 1) + ' anos' });
    }
    if (st.has('_valor') && inc('neg.ticket')) {
      const s = S.numStats(rows, '_valor');
      m.kpis.push({ k: 'Ticket médio', v: MI.fmt.money(s.mean) });
    }
    if (st.has('_freq') && inc('comp.frequencia')) {
      const s = S.numStats(rows, '_freq');
      m.kpis.push({ k: 'Frequência média', v: MI.fmt.dec(s.mean, 2) });
    }
    if (st.has('_recencia') && inc('comp.frequencia')) {
      const s = S.numStats(rows, '_recencia');
      m.kpis.push({ k: 'Recência mediana', v: MI.fmt.int(s.median) + ' dias' });
    }
    if (st.has('_uf') && inc('geo.uf')) {
      const d = MI.privacy.guardDist(S.dist(rows, '_uf', {}));
      m.kpis.push({ k: 'Estados com presença', v: String(d.filter(function (e) { return !e.suppressed; }).length) });
    }

    /* --- Seções de distribuição --- */
    const secao = function (id, titulo, field, opts) {
      if (!st.has(field) || !inc(id)) return;
      const d = MI.privacy.guardDist(S.dist(rows, field, opts || {}));
      if (!d.length) return;
      m.secoes.push({
        id: id, titulo: titulo, tipo: 'dist', field: field,
        linhas: d.map(function (e) {
          return { label: String(e.label), valor: e.value, pct: e.pct, suprimido: !!e.suppressed };
        }),
        total: d.total, ausentes: d.missing,
        nota: d.suppressedGroups ? d.suppressedGroups + ' categoria(s) com menos de ' + MI.privacy.k + ' registros foram agrupadas em “Suprimido”.' : null
      });
    };

    secao('demo.genero', 'Distribuição por gênero', '_genero', { limit: 8 });
    if (st.has('_faixa') && inc('demo.idade')) {
      const d = MI.privacy.guardDist(S.dist(rows, '_faixa', { order: MI.AGE_BANDS.map(function (b) { return b.label; }) }));
      m.secoes.push({
        id: 'demo.idade', titulo: 'Distribuição por faixa de idade', tipo: 'dist', field: '_faixa',
        linhas: d.map(function (e) { return { label: e.label, valor: e.value, pct: e.pct, suprimido: !!e.suppressed }; }),
        total: d.total, ausentes: d.missing
      });
    }
    secao('geo.uf', 'Distribuição por estado', '_uf', { limit: 15 });
    secao('geo.cidade', 'Principais cidades', '_cidade', { limit: 15, other: false });
    secao('neg.plano', 'Mix de planos e produtos', '_plano', { limit: 10 });
    secao('neg.canal', 'Canais de aquisição', '_canal', { limit: 10 });
    secao('base.volume', 'Status dos clientes', '_status', { limit: 8 });

    if (st.has('_dow') && inc('comp.horarios')) {
      const d = S.dist(rows, '_dow', {});
      const linhas = MI.DIAS_SEMANA.map(function (nome, i) {
        const e = d.filter(function (x) { return +x.label === i; })[0];
        return { label: nome, valor: e ? e.value : 0 };
      });
      const total = MI.sum(linhas, function (e) { return e.valor; });
      linhas.forEach(function (e) { e.pct = total ? e.valor / total : 0; });
      m.secoes.push({ id: 'comp.horarios', titulo: 'Volume por dia da semana', tipo: 'dist', linhas: linhas, total: total });
    }
    if (st.has('_hora') && inc('comp.horarios')) {
      const d = S.dist(rows, '_hora', {});
      const blocos = [
        { label: 'Madrugada (0–5h)', from: 0, to: 5 }, { label: 'Manhã (6–11h)', from: 6, to: 11 },
        { label: 'Tarde (12–17h)', from: 12, to: 17 }, { label: 'Noite (18–23h)', from: 18, to: 23 }
      ].map(function (b) {
        let v = 0;
        d.forEach(function (e) { const h = +e.label; if (h >= b.from && h <= b.to) v += e.value; });
        return { label: b.label, valor: v };
      });
      const total = MI.sum(blocos, function (e) { return e.valor; });
      blocos.forEach(function (e) { e.pct = total ? e.valor / total : 0; });
      m.secoes.push({ id: 'comp.horarios', titulo: 'Volume por período do dia', tipo: 'dist', linhas: blocos, total: total });
    }

    if (inc('neg.segmentos')) {
      const rfm = S.rfm(rows);
      if (rfm) {
        m.secoes.push({
          id: 'neg.segmentos', titulo: 'Segmentos de valor (RFM)', tipo: 'dist',
          linhas: rfm.map(function (s) {
            return { label: s.label, valor: s.count, pct: s.pct, extra: s.ticket != null ? 'ticket ' + MI.fmt.money(s.ticket) : null };
          }),
          total: rfm.total
        });
      }
    }

    /* --- Fatos --- */
    m.fatos = S.findings(rows).filter(function (f) { return f.kind === 'fato'; });

    /* --- Limitações --- */
    m.limitacoes = [
      ds.source === 'demo'
        ? 'Os números deste relatório vêm de uma base sintética gerada para demonstração. Não representam dados reais da Smoov.'
        : 'Os números refletem exclusivamente o conteúdo da planilha importada, sem enriquecimento externo.',
      'Categorias e células com menos de ' + MI.privacy.k + ' registros são suprimidas para reduzir risco de reidentificação.',
      'Agregação não é anonimização garantida. Cruzamentos de muitas dimensões podem isolar indivíduos mesmo com supressão.',
      'Participação de mercado, penetração e retorno sobre investimento não são calculáveis sem dados externos de população, custo e concorrência.'
    ];
    if (st.has('_data')) {
      m.limitacoes.push('A recência é medida contra a data mais recente presente na base (' + MI.fmt.date(ds.refDate) + '), não contra a data de hoje.');
    }
    return m;
  }

  /* ================= PDF (jsPDF) ================= */
  function gerarPdf(model, comGraficos) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      MI.toast('A biblioteca de PDF não carregou. Verifique a conexão e recarregue a página.', 'error');
      return Promise.resolve(false);
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const W = 210, H = 297, M = 16;
    let y = 0;
    const NAVY = [7, 33, 56], TEAL = [15, 182, 161], INK = [12, 26, 41], MUTED = [86, 106, 130], LINE = [225, 232, 241];

    function header(primeira) {
      doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.rect(0, 0, W, primeira ? 42 : 20, 'F');
      doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
      doc.rect(0, primeira ? 42 : 20, W, 1.2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      if (primeira) {
        doc.setFontSize(19);
        doc.text('10 Move Intelligence', M, 20);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(170, 200, 220);
        doc.text('Relatório de indicadores consolidados', M, 28);
        doc.setFontSize(8.5);
        doc.text(model.perspectiva, M, 35);
        y = 52;
      } else {
        doc.setFontSize(9.5);
        doc.text('10 Move Intelligence', M, 13);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(170, 200, 220);
        doc.text(model.base, W - M, 13, { align: 'right' });
        y = 30;
      }
      doc.setTextColor(INK[0], INK[1], INK[2]);
    }

    function footer() {
      const total = doc.internal.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
        doc.line(M, H - 14, W - M, H - 14);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.text('Indicadores agregados · supressão de grupos com menos de ' + model.k + ' registros · nenhum dado individual', M, H - 9);
        doc.text(p + '/' + total, W - M, H - 9, { align: 'right' });
      }
    }

    function espaco(h) { if (y + h > H - 22) { doc.addPage(); header(false); } }

    function titulo(t) {
      espaco(16);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(t, M, y); y += 3;
      doc.setDrawColor(TEAL[0], TEAL[1], TEAL[2]); doc.setLineWidth(.5);
      doc.line(M, y, M + 24, y); doc.setLineWidth(.2);
      y += 6;
    }

    function paragrafo(t, size, color) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(size || 9);
      const c = color || MUTED;
      doc.setTextColor(c[0], c[1], c[2]);
      const linhas = doc.splitTextToSize(t, W - M * 2);
      espaco(linhas.length * (size === 8 ? 3.6 : 4.3) + 2);
      doc.text(linhas, M, y);
      y += linhas.length * (size === 8 ? 3.6 : 4.3) + 2;
      doc.setTextColor(INK[0], INK[1], INK[2]);
    }

    function caixa(texto, cor) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      const linhas = doc.splitTextToSize(texto, W - M * 2 - 8);
      const h = linhas.length * 4 + 7;
      espaco(h + 3);
      doc.setFillColor(cor[0], cor[1], cor[2]);
      doc.rect(M, y - 4, W - M * 2, h, 'F');
      doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
      doc.rect(M, y - 4, 1.6, h, 'F');
      doc.setTextColor(40, 55, 72);
      doc.text(linhas, M + 5, y + 1);
      y += h + 2;
      doc.setTextColor(INK[0], INK[1], INK[2]);
    }

    function kpis(list) {
      const cols = 3, cw = (W - M * 2) / cols, ch = 17;
      const linhas = Math.ceil(list.length / cols);
      espaco(linhas * ch + 4);
      list.forEach(function (kv, i) {
        const cx = M + (i % cols) * cw, cy = y + Math.floor(i / cols) * ch;
        doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
        doc.setFillColor(248, 250, 252);
        doc.rect(cx + 1, cy, cw - 2, ch - 2, 'FD');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.text(doc.splitTextToSize(String(kv.k).toUpperCase(), cw - 8)[0], cx + 4, cy + 5.5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.text(String(kv.v), cx + 4, cy + 12.5);
      });
      y += linhas * ch + 4;
    }

    function tabela(secao) {
      const linhas = secao.linhas.slice(0, 16);
      const temExtra = linhas.some(function (l) { return l.extra; });
      /* Larguras fixas por coluna, da direita para a esquerda, para o rótulo
         nunca invadir os números. */
      const larguraTotal = W - M * 2;
      const wExtra = temExtra ? 34 : 0, wPct = 26, wNum = 36;
      const xExtra = W - M;
      const xPct = xExtra - wExtra;
      const xNum = xPct - wPct;
      const wLabel = larguraTotal - wExtra - wPct - wNum - 4;

      espaco(12 + linhas.length * 6);
      doc.setFillColor(240, 244, 249);
      doc.rect(M, y - 4, larguraTotal, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text('CATEGORIA', M + 2, y + .6);
      doc.text('REGISTROS', xNum, y + .6, { align: 'right' });
      doc.text('%', xPct, y + .6, { align: 'right' });
      if (temExtra) doc.text('DETALHE', xExtra, y + .6, { align: 'right' });
      y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      linhas.forEach(function (l, i) {
        espaco(7);
        if (i % 2 === 1) {
          doc.setFillColor(251, 252, 254);
          doc.rect(M, y - 3.6, larguraTotal, 6, 'F');
        }
        doc.setTextColor(l.suprimido ? MUTED[0] : INK[0], l.suprimido ? MUTED[1] : INK[1], l.suprimido ? MUTED[2] : INK[2]);
        doc.text(doc.splitTextToSize(String(l.label), wLabel)[0], M + 2, y);
        doc.text(MI.fmt.int(l.valor), xNum, y, { align: 'right' });
        doc.text(l.pct != null ? MI.fmt.pct(l.pct, 1) : '—', xPct, y, { align: 'right' });
        if (temExtra && l.extra) doc.text(doc.splitTextToSize(String(l.extra), wExtra - 2)[0], xExtra, y, { align: 'right' });
        y += 6;
      });
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.line(M, y - 3.4, W - M * 2 + M, y - 3.4);
      y += 1;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      let rodape = 'Total: ' + MI.fmt.int(secao.total) + ' registros';
      if (secao.ausentes) rodape += ' · ' + MI.fmt.int(secao.ausentes) + ' sem valor informado';
      if (secao.linhas.length > 16) rodape += ' · exibindo 16 de ' + secao.linhas.length + ' categorias';
      doc.text(rodape, M, y + 1.5);
      y += 6;
      if (secao.nota) { paragrafo(secao.nota, 8); }
      doc.setTextColor(INK[0], INK[1], INK[2]);
      y += 2;
    }

    /* ---------- Construção ---------- */
    header(true);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(model.base, M, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(model.origem, M, y); y += 5;
    doc.text('Gerado em ' + MI.fmt.date(model.geradoEm) + ' às ' +
      String(model.geradoEm.getHours()).padStart(2, '0') + ':' + String(model.geradoEm.getMinutes()).padStart(2, '0'), M, y);
    y += 5;
    doc.text('Recorte: ' + model.filtros, M, y); y += 5;
    doc.text('Registros no recorte: ' + MI.fmt.int(model.registros) + ' de ' + MI.fmt.int(model.registrosBase) +
      ' (' + MI.fmt.pctOf(model.registros, model.registrosBase, 1) + ')', M, y);
    y += 9;
    doc.setTextColor(INK[0], INK[1], INK[2]);

    if (model.origem.indexOf('demonstrativa') >= 0) {
      caixa('ATENÇÃO: os números deste relatório vêm de uma base sintética criada para demonstração da plataforma. Não representam dados reais da Smoov nem de seus clientes.', [253, 242, 224]);
    }

    titulo('Indicadores principais');
    kpis(model.kpis);

    if (model.fatos.length) {
      titulo('Leitura dos dados');
      model.fatos.slice(0, 8).forEach(function (f) {
        espaco(14);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        const t = doc.splitTextToSize(f.titulo, W - M * 2);
        doc.text(t, M, y); y += t.length * 4.6;
        paragrafo(f.texto, 8.5);
        y += 1;
      });
      paragrafo('Todos os itens acima são fatos calculados sobre o recorte. Hipóteses e ações sugeridas estão na plataforma, na seção Inteligência comercial, sempre identificadas como tal.', 8);
    }

    const graficos = comGraficos || [];
    let gi = 0;

    model.secoes.forEach(function (s) {
      titulo(s.titulo);
      /* gráfico correspondente, se houver */
      const g = graficos.filter(function (x) { return x.field === s.field; })[0];
      if (g && g.img) {
        const iw = W - M * 2, ih = iw * (g.h / g.w);
        espaco(ih + 4);
        try { doc.addImage(g.img, 'PNG', M, y, iw, ih); y += ih + 5; } catch (e) { }
        graficos.splice(graficos.indexOf(g), 1);
      }
      tabela(s);
      gi++;
    });

    doc.addPage(); header(false);
    titulo('Privacidade, método e limitações');
    paragrafo('Este relatório contém exclusivamente indicadores agregados. Nenhum registro individual, identificador, ' +
      'nome, documento ou contato é incluído em nenhuma página.', 9, INK);
    y += 2;
    model.limitacoes.forEach(function (l) {
      espaco(8);
      doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
      doc.circle(M + 1.2, y - 1.2, 1, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      const linhas = doc.splitTextToSize(l, W - M * 2 - 6);
      doc.text(linhas, M + 5, y);
      y += linhas.length * 4.2 + 2.5;
    });
    y += 3;
    caixa('Esta versão da plataforma executa inteiramente no navegador. A separação entre a área privada da Smoov e a visão ' +
      'de indicadores aprovados da 10 Move é funcional, mas não é um controle de segurança: não há autenticação, ' +
      'autorização validada em servidor, isolamento por organização nem auditoria à prova de adulteração. ' +
      'Para uso em produção com dados reais compartilhados entre as duas empresas, esses controles precisam ser ' +
      'implementados em backend antes de qualquer liberação de acesso externo.', [233, 241, 251]);

    footer();
    return Promise.resolve(doc);
  }

  /* Renderiza gráficos fora da tela para embutir no PDF */
  function capturarGraficos() {
    const st = MI.store, rows = st.rows;
    const alvos = [];
    if (st.has('_faixa') && MI.privacy.canSee('demo.idade')) {
      alvos.push({
        field: '_faixa', build: function (cv) {
          return MI.charts.bar(cv, MI.privacy.guardDist(S.dist(rows, '_faixa', { order: MI.AGE_BANDS.map(function (b) { return b.label; }) })), {});
        }
      });
    }
    if (st.has('_uf') && MI.privacy.canSee('geo.uf')) {
      alvos.push({
        field: '_uf', build: function (cv) {
          return MI.charts.bar(cv, MI.privacy.guardDist(S.dist(rows, '_uf', { limit: 12, other: false })), {});
        }
      });
    }
    if (st.has('_canal') && MI.privacy.canSee('neg.canal')) {
      alvos.push({
        field: '_canal', build: function (cv) {
          return MI.charts.bar(cv, MI.privacy.guardDist(S.dist(rows, '_canal', { limit: 8 })), { horizontal: true, multicolor: true });
        }
      });
    }
    if (!alvos.length) return Promise.resolve([]);

    const host = el('div', { style: 'position:fixed;left:-10000px;top:0;width:900px' });
    document.body.appendChild(host);
    MI.charts.noAnim = true;
    const criados = alvos.map(function (a) {
      const cv = el('canvas', { width: 900, height: 330 });
      host.appendChild(el('div', { style: 'width:900px;height:330px' }, cv));
      let ch = null;
      try { ch = a.build(cv); } catch (e) { }
      return { field: a.field, cv: cv, ch: ch };
    });

    return new Promise(function (resolve) {
      setTimeout(function () {
        const out = criados.map(function (c) {
          return { field: c.field, img: MI.charts.toImage(c.cv), w: 900, h: 330 };
        }).filter(function (c) { return c.img; });
        criados.forEach(function (c) { try { if (c.ch) c.ch.destroy(); } catch (e) { } });
        document.body.removeChild(host);
        MI.charts.noAnim = false;
        resolve(out);
      }, 260);
    });
  }

  /* ================= Exportação de agregados ================= */
  function csvAgregados(model) {
    const linhas = [];
    linhas.push(['Indicador', 'Categoria', 'Registros', 'Participação', 'Observação']);
    model.kpis.forEach(function (kv) { linhas.push(['Indicador principal', kv.k, '', '', kv.v]); });
    model.secoes.forEach(function (s) {
      s.linhas.forEach(function (l) {
        linhas.push([s.titulo, l.label, l.valor, l.pct != null ? MI.fmt.pct(l.pct, 2) : '', l.suprimido ? 'Suprimido por k-anonimato' : (l.extra || '')]);
      });
    });
    linhas.push([]);
    linhas.push(['Metadados']);
    linhas.push(['Base', model.base]);
    linhas.push(['Origem', model.origem]);
    linhas.push(['Perspectiva', model.perspectiva]);
    linhas.push(['Recorte', model.filtros]);
    linhas.push(['Registros no recorte', model.registros]);
    linhas.push(['Limite de supressão (k)', model.k]);
    linhas.push(['Gerado em', MI.fmt.date(model.geradoEm)]);
    model.limitacoes.forEach(function (l, i) { linhas.push(['Limitação ' + (i + 1), l]); });
    return MI.toCsv(linhas[0], linhas.slice(1));
  }

  function nomeArquivo(ext) {
    const d = new Date();
    const slug = MI.slug(MI.store.dataset.name).slice(0, 40) || 'base';
    return '10move-indicadores-' + slug + '-' + MI.fmt.dateIso(d) + '.' + ext;
  }

  /* ================= Visão ================= */
  MI.views.reports = {
    title: 'Relatórios',
    subtitle: 'PDF executivo e exportação de indicadores agregados',
    icon: 'report',

    render: function (root) {
      const st = MI.store;
      if (!st.rows.length) {
        root.appendChild(el('div', { class: 'grid' }, U.card({ span: 'c12', body: U.empty('Nenhum registro no recorte atual', 'Ajuste os filtros para gerar um relatório.') })));
        return;
      }
      const model = buildModel();

      const notice = U.demoNotice();
      if (notice) root.appendChild(el('div', { style: 'margin-bottom:14px' }, notice));

      /* ---- Ações ---- */
      root.appendChild(U.section('Gerar relatório', 'Monta um documento com os indicadores do recorte atual'));

      const bloqueado = MI.env.downloadsBlocked;
      root.appendChild(el('div', { class: 'grid' }, [
        U.card({
          span: 'c8', title: 'Relatório em PDF',
          sub: model.secoes.length + ' seções de indicadores · ' + model.kpis.length + ' indicadores principais · ' + model.fatos.length + ' leituras',
          body: [
            el('div', { style: 'display:flex;gap:9px;flex-wrap:wrap' }, [
              U.btn('Gerar e baixar PDF', {
                variant: 'accent', icon: 'download',
                onClick: function (e) {
                  const btn = e.currentTarget;
                  btn.disabled = true; btn.textContent = 'Gerando…';
                  capturarGraficos().then(function (gs) { return gerarPdf(model, gs); }).then(function (doc) {
                    if (!doc) return;
                    try {
                      doc.save(nomeArquivo('pdf'));
                      MI.toast('PDF gerado. Se o download não aparecer, use “Abrir PDF em nova aba”.', 'ok');
                    } catch (err) {
                      MI.toast('O navegador bloqueou o download. Use “Abrir PDF em nova aba”.', 'error');
                    }
                  }).catch(function (err) {
                    MI.toast('Falha ao gerar o PDF: ' + (err.message || err), 'error');
                  }).then(function () {
                    btn.disabled = false; MI.app.rerender();
                  });
                }
              }),
              U.btn('Abrir PDF em nova aba', {
                icon: 'eye',
                onClick: function (e) {
                  const btn = e.currentTarget;
                  btn.disabled = true;
                  capturarGraficos().then(function (gs) { return gerarPdf(model, gs); }).then(function (doc) {
                    if (!doc) return;
                    const url = doc.output('bloburl');
                    const w = window.open(url, '_blank');
                    if (!w) MI.toast('O navegador bloqueou a nova aba. Permita pop-ups para este endereço ou use o download.', 'error');
                  }).catch(function (err) {
                    MI.toast('Falha ao gerar o PDF: ' + (err.message || err), 'error');
                  }).then(function () { btn.disabled = false; MI.app.rerender(); });
                }
              })
            ]),
            bloqueado ? el('div', { style: 'margin-top:12px' }, U.note('warn', [
              el('strong', { text: 'Ambiente incorporado. ' }),
              'Esta página está rodando dentro de um visualizador que bloqueia downloads iniciados pela própria página. ' +
              'O PDF é gerado corretamente, mas pode não ser salvo. Para exportar sem restrição, abra a aplicação ' +
              'diretamente no navegador a partir do arquivo local, ou use os botões de copiar abaixo.'
            ])) : null
          ]
        }),
        U.card({
          span: 'c4', title: 'Exportar indicadores',
          sub: 'Somente agregados — nunca a base bruta',
          body: el('div', { style: 'display:grid;gap:9px' }, [
            U.btn('Baixar CSV de indicadores', {
              icon: 'download', onClick: function () {
                const ok = MI.download(nomeArquivo('csv'), 'text/csv;charset=utf-8', csvAgregados(model));
                MI.toast(ok ? 'CSV de indicadores gerado.' : 'Download bloqueado neste ambiente. Use “Copiar indicadores”.', ok ? 'ok' : 'error');
              }
            }),
            U.btn('Copiar indicadores', {
              icon: 'copy', onClick: function () {
                MI.copyText(csvAgregados(model).replace(/^﻿/, '')).then(function (ok) {
                  MI.toast(ok ? 'Indicadores copiados. Cole em uma planilha.' : 'O navegador não permitiu acesso à área de transferência.', ok ? 'ok' : 'error');
                });
              }
            }),
            U.btn('Baixar JSON de indicadores', {
              icon: 'download', onClick: function () {
                const ok = MI.download(nomeArquivo('json'), 'application/json', JSON.stringify(model, null, 2));
                MI.toast(ok ? 'JSON gerado.' : 'Download bloqueado neste ambiente.', ok ? 'ok' : 'error');
              }
            }),
            el('p', { class: 'field__hint', text: 'A exportação da base bruta é bloqueada por projeto. A 10 Move recebe apenas indicadores consolidados.' })
          ])
        })
      ]));

      /* ---- Pré-visualização do documento ---- */
      root.appendChild(U.section('Pré-visualização', 'Exatamente o conteúdo que vai para o PDF'));
      const doc = el('div', { class: 'report-doc' }, [
        el('h2', { text: '10 Move Intelligence' }),
        el('p', { class: 'rp-sub', text: 'Relatório de indicadores consolidados · ' + model.perspectiva }),
        el('h3', { text: 'Identificação' }),
        el('ul', {}, [
          el('li', {}, [el('b', { text: 'Base: ' }), model.base]),
          el('li', {}, [el('b', { text: 'Origem: ' }), model.origem]),
          el('li', {}, [el('b', { text: 'Recorte: ' }), model.filtros]),
          el('li', {}, [el('b', { text: 'Registros: ' }), MI.fmt.int(model.registros) + ' de ' + MI.fmt.int(model.registrosBase)]),
          el('li', {}, [el('b', { text: 'Gerado em: ' }), MI.fmt.date(model.geradoEm)]),
          el('li', {}, [el('b', { text: 'Limite de supressão: ' }), 'grupos com menos de ' + model.k + ' registros'])
        ]),
        el('h3', { text: 'Indicadores principais' }),
        el('div', { class: 'rp-kpis' }, model.kpis.map(function (kv) {
          return el('div', { class: 'rp-kpi' }, [el('span', { text: kv.k }), el('b', { text: kv.v })]);
        })),
        model.fatos.length ? el('h3', { text: 'Leitura dos dados' }) : null,
        model.fatos.length ? el('div', { class: 'findings' }, model.fatos.slice(0, 8).map(function (f) {
          return el('article', { class: 'finding' }, [el('h4', { text: f.titulo }), el('p', { text: f.texto })]);
        })) : null
      ]);

      model.secoes.forEach(function (s) {
        doc.appendChild(el('h3', { text: s.titulo }));
        doc.appendChild(U.table(
          [{ label: 'Categoria' }, { label: 'Registros', num: true }, { label: 'Participação', num: true }].concat(
            s.linhas.some(function (l) { return l.extra; }) ? [{ label: 'Detalhe', num: true }] : []),
          s.linhas.slice(0, 16).map(function (l) {
            const cells = [
              { v: l.label, masked: l.suprimido },
              { v: MI.fmt.int(l.valor), num: true },
              { v: l.pct != null ? MI.fmt.pct(l.pct, 1) : '—', num: true }
            ];
            if (s.linhas.some(function (x) { return x.extra; })) cells.push({ v: l.extra || '—', num: true });
            return { cells: cells };
          })
        ));
        if (s.nota) doc.appendChild(el('p', { class: 'field__hint', style: 'margin-top:8px', text: s.nota }));
      });

      doc.appendChild(el('h3', { text: 'Privacidade, método e limitações' }));
      doc.appendChild(el('ul', {}, model.limitacoes.map(function (l) { return el('li', { text: l }); })));

      root.appendChild(el('div', { class: 'grid' }, el('div', { class: 'c12' }, doc)));
    }
  };

  MI.report = { buildModel: buildModel, gerarPdf: gerarPdf, csvAgregados: csvAgregados };

})(window.MI);
