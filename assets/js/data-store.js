/* 10 Move Intelligence — estado central
   Normaliza a base ativa em campos derivados (_idade, _uf, _mes, _hora...),
   aplica filtros combináveis e notifica as visões. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  /* ---------------- Normalizadores ---------------- */
  function normGenero(v) {
    if (v == null || v === '') return null;
    const s = MI.slug(v);
    if (/^(f|fem|feminino|female|mulher|mulheres)$/.test(s)) return 'Feminino';
    if (/^(m|masc|masculino|male|homem|homens)$/.test(s)) return 'Masculino';
    if (/^(o|outro|outros|other|nao_binario|nb)$/.test(s)) return 'Outro';
    if (/^(ni|n_i|nao_informado|nao_declarado|desconhecido|null|na)$/.test(s)) return null;
    return MI.titleCase(String(v).trim());
  }

  function normHora(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      if (v >= 0 && v <= 23 && Number.isInteger(v)) return v;
      if (v > 0 && v < 1) return Math.floor(v * 24); // fração de dia (Excel)
      return null;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) { const h = +m[1]; return h >= 0 && h <= 23 ? h : null; }
    m = s.match(/^(\d{1,2})$/);
    if (m) { const h = +m[1]; return h >= 0 && h <= 23 ? h : null; }
    const d = MI.parseDate(s);
    if (d && /[T\s]\d{1,2}:/.test(s)) return d.getHours();
    return null;
  }

  function normDow(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && v >= 0 && v <= 6) return v;
    const s = MI.slug(v);
    if (/^\d$/.test(s)) { const n = +s; return n >= 0 && n <= 6 ? n : null; }
    for (let i = 0; i < 7; i++) {
      if (MI.slug(MI.DIAS_SEMANA[i]) === s || MI.slug(MI.DIAS_SEMANA_ABREV[i]) === s) return i;
      if (s.indexOf(MI.slug(MI.DIAS_SEMANA[i])) === 0) return i;
    }
    if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(s)) {
      return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(s);
    }
    return null;
  }

  /* ---------------- Campos derivados ---------------- */
  /* id -> {label, kind, from(roles), compute(row)} */
  const DERIVED = [
    { id: '_idade', label: 'Idade', kind: 'number', needs: ['idade', 'nascimento'] },
    { id: '_faixa', label: 'Faixa de idade', kind: 'cat', needs: ['idade', 'nascimento'], ordered: true },
    { id: '_genero', label: 'Gênero', kind: 'cat', needs: ['genero'] },
    { id: '_uf', label: 'Estado (UF)', kind: 'cat', needs: ['uf'] },
    { id: '_regiao', label: 'Região', kind: 'cat', needs: ['uf'] },
    { id: '_cidade', label: 'Cidade', kind: 'cat', needs: ['cidade'] },
    { id: '_bairro', label: 'Bairro / região', kind: 'cat', needs: ['bairro'] },
    { id: '_plano', label: 'Plano / produto', kind: 'cat', needs: ['plano'] },
    { id: '_canal', label: 'Canal de aquisição', kind: 'cat', needs: ['canal'] },
    { id: '_status', label: 'Status', kind: 'cat', needs: ['status'] },
    { id: '_dispositivo', label: 'Dispositivo', kind: 'cat', needs: ['dispositivo'] },
    { id: '_data', label: 'Data da última atividade', kind: 'date', needs: ['dataEvento'] },
    { id: '_cad', label: 'Data de cadastro', kind: 'date', needs: ['dataCadastro'] },
    { id: '_hora', label: 'Horário', kind: 'number', needs: ['hora'] },
    { id: '_dow', label: 'Dia da semana', kind: 'number', needs: ['diaSemana', 'dataEvento'] },
    { id: '_valor', label: 'Ticket médio', kind: 'number', needs: ['valor'] },
    { id: '_receita', label: 'Receita acumulada', kind: 'number', needs: ['receita'] },
    { id: '_freq', label: 'Frequência / transações', kind: 'number', needs: ['frequencia'] },
    { id: '_recencia', label: 'Dias desde a última atividade', kind: 'number', needs: ['recencia', 'dataEvento'] },
    { id: '_satisfacao', label: 'Satisfação / NPS', kind: 'number', needs: ['satisfacao'] },
    { id: '_duracao', label: 'Duração média', kind: 'number', needs: ['duracao'] }
  ];
  MI.DERIVED = DERIVED;
  MI.DERIVED_BY_ID = {};
  DERIVED.forEach(function (d) { MI.DERIVED_BY_ID[d.id] = d; });

  /* Constrói os campos derivados em uma passagem única sobre as linhas. */
  function normalize(ds) {
    const roles = ds.roles, rows = ds.rows;
    const kIdade = roles.idade, kNasc = roles.nascimento, kGen = roles.genero,
      kUf = roles.uf, kCid = roles.cidade, kBairro = roles.bairro,
      kPlano = roles.plano, kCanal = roles.canal, kStatus = roles.status, kDisp = roles.dispositivo,
      kEvt = roles.dataEvento, kCad = roles.dataCadastro, kHora = roles.hora, kDow = roles.diaSemana,
      kVal = roles.valor, kRec = roles.receita, kFreq = roles.frequencia, kRecen = roles.recencia,
      kSat = roles.satisfacao, kDur = roles.duracao;

    /* data de referência = data máxima encontrada, ou hoje */
    let refDate = null;
    const avail = {};
    const hoje = new Date();

    if (kEvt) {
      const col = ds.columns.filter(function (c) { return c.key === kEvt; })[0];
      if (col && col.dateRange && col.dateRange.max) refDate = col.dateRange.max;
    }
    if (!refDate) refDate = hoje;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      /* idade */
      let idade = null;
      if (kIdade != null) idade = MI.parseNumber(r[kIdade]);
      if ((idade == null || idade < 0 || idade > 120) && kNasc != null) {
        const nd = MI.parseDate(r[kNasc]);
        if (nd) {
          idade = refDate.getFullYear() - nd.getFullYear();
          if (refDate.getMonth() < nd.getMonth() || (refDate.getMonth() === nd.getMonth() && refDate.getDate() < nd.getDate())) idade--;
        }
      }
      if (idade != null && (idade < 0 || idade > 120)) idade = null;
      r._idade = idade;
      r._faixa = MI.ageBand(idade);

      r._genero = kGen != null ? normGenero(r[kGen]) : null;

      const uf = kUf != null ? MI.normalizeUf(r[kUf]) : null;
      r._uf = uf;
      r._regiao = uf ? (MI.UF_REGIAO[uf] || null) : null;
      r._cidade = kCid != null && r[kCid] !== '' && r[kCid] != null ? MI.titleCase(String(r[kCid]).trim()) : null;
      r._bairro = kBairro != null && r[kBairro] ? String(r[kBairro]).trim() : null;

      r._plano = kPlano != null && r[kPlano] !== '' && r[kPlano] != null ? String(r[kPlano]).trim() : null;
      r._canal = kCanal != null && r[kCanal] !== '' && r[kCanal] != null ? String(r[kCanal]).trim() : null;
      r._status = kStatus != null && r[kStatus] !== '' && r[kStatus] != null ? String(r[kStatus]).trim() : null;
      r._dispositivo = kDisp != null && r[kDisp] !== '' && r[kDisp] != null ? String(r[kDisp]).trim() : null;

      const dEvt = kEvt != null ? MI.parseDate(r[kEvt]) : null;
      r._data = dEvt;
      r._mes = dEvt ? MI.monthKey(dEvt) : null;
      const dCad = kCad != null ? MI.parseDate(r[kCad]) : null;
      r._cad = dCad;
      r._mesCad = dCad ? MI.monthKey(dCad) : null;

      let hora = kHora != null ? normHora(r[kHora]) : null;
      if (hora == null && dEvt && kEvt != null && /\d{1,2}:\d{2}/.test(String(r[kEvt]))) hora = dEvt.getHours();
      r._hora = hora;

      let dow = kDow != null ? normDow(r[kDow]) : null;
      if (dow == null && dEvt) dow = dEvt.getDay();
      r._dow = dow;

      r._valor = kVal != null ? MI.parseNumber(r[kVal]) : null;
      r._receita = kRec != null ? MI.parseNumber(r[kRec]) : null;
      r._freq = kFreq != null ? MI.parseNumber(r[kFreq]) : null;

      let recen = kRecen != null ? MI.parseNumber(r[kRecen]) : null;
      if (recen == null && dEvt) recen = Math.round((refDate - dEvt) / 86400000);
      r._recencia = recen != null && recen >= 0 ? recen : null;

      r._satisfacao = kSat != null ? MI.parseNumber(r[kSat]) : null;
      r._duracao = kDur != null ? MI.parseNumber(r[kDur]) : null;
    }

    /* disponibilidade: só é "disponível" se houver valores de fato */
    DERIVED.forEach(function (d) {
      let count = 0;
      const step = Math.max(1, Math.floor(rows.length / 2000));
      for (let i = 0; i < rows.length; i += step) {
        const v = rows[i][d.id];
        if (v != null && v !== '') { count++; if (count > 8) break; }
      }
      avail[d.id] = count > 8 || (count > 0 && rows.length < 50);
    });
    avail._mes = avail._data;
    avail._mesCad = avail._cad;

    ds.available = avail;
    ds.refDate = refDate;

    /* colunas extra (não mapeadas) que servem como dimensão de filtro */
    ds.extraDims = MI.dimensionColumns(ds).filter(function (c) {
      return ['genero', 'uf', 'cidade', 'bairro', 'plano', 'canal', 'status', 'dispositivo', 'diaSemana'].indexOf(c.role) < 0;
    });
    ds.measures = MI.measureColumns(ds);
    return ds;
  }
  MI.normalizeDataset = normalize;

  /* ---------------- Store ---------------- */
  const listeners = {};
  const store = {
    dataset: null,
    rows: [],
    filters: {},
    perspective: MI.storage.get('perspective', 'smoov'),

    on: function (evt, cb) { (listeners[evt] = listeners[evt] || []).push(cb); },
    emit: function (evt, payload) { (listeners[evt] || []).forEach(function (cb) { cb(payload); }); },

    setDataset: function (ds) {
      normalize(ds);
      this.dataset = ds;
      this.filters = {};
      this.applyFilters();
      this.emit('dataset', ds);
    },

    /* Acrescenta à base atual as colunas de outra planilha, casando pela
       chave do cliente. Uma planilha só de endereços deixa de ser uma base
       separada e vira colunas novas nos clientes que já existem.

       Linha sem correspondência fica com as colunas novas vazias, e a
       contagem volta no resultado: saber quantos ficaram de fora é o que
       diz se a chave usada foi a certa. */
    juntarColunas: function (ds, novas, chaveAtual, chaveNova, colunas) {
      if (!ds || !novas || !novas.length) return null;
      const porChave = new Map();
      for (let i = 0; i < novas.length; i++) {
        const v = novas[i][chaveNova];
        if (v == null || v === '') continue;
        const k = String(v).trim();
        if (!porChave.has(k)) porChave.set(k, novas[i]);
      }
      let casadas = 0;
      for (let i = 0; i < ds.rows.length; i++) {
        const v = ds.rows[i][chaveAtual];
        const achou = v == null || v === '' ? null : porChave.get(String(v).trim());
        if (achou) casadas++;
        for (let c = 0; c < colunas.length; c++) {
          ds.rows[i][colunas[c]] = achou ? achou[colunas[c]] : null;
        }
      }
      ds.headers = ds.headers.concat(colunas);
      return { casadas: casadas, semCorrespondencia: ds.rows.length - casadas, colunas: colunas.slice() };
    },

    /* Acrescenta linhas de outra planilha do mesmo formato. Cliente que já
       existe é ignorado em vez de duplicado: dois arquivos com o mesmo mês
       no meio são mais comuns que raros. */
    empilhar: function (ds, novas, chaveAtual, chaveNova) {
      if (!ds || !novas || !novas.length) return null;
      const existentes = new Set();
      if (chaveAtual) {
        for (let i = 0; i < ds.rows.length; i++) {
          const v = ds.rows[i][chaveAtual];
          if (v != null && v !== '') existentes.add(String(v).trim());
        }
      }
      let acrescentadas = 0, repetidas = 0;
      for (let i = 0; i < novas.length; i++) {
        const v = chaveNova ? novas[i][chaveNova] : null;
        const k = v == null || v === '' ? null : String(v).trim();
        if (k && existentes.has(k)) { repetidas++; continue; }
        if (k) existentes.add(k);
        const linha = {};
        for (let c = 0; c < ds.headers.length; c++) {
          const h = ds.headers[c];
          /* a chave pode ter outro nome na planilha nova */
          linha[h] = h === chaveAtual && chaveNova ? novas[i][chaveNova] : novas[i][h];
          if (linha[h] === undefined) linha[h] = null;
        }
        ds.rows.push(linha);
        acrescentadas++;
      }
      return { acrescentadas: acrescentadas, repetidas: repetidas };
    },

    /* Tira a base da memória. Usado ao sair: os registros nunca chegam a
       ser gravados em disco, mas continuariam na tela de quem assumisse o
       computador em seguida. */
    limpar: function () {
      this.dataset = null;
      this.filters = {};
      this.rows = [];
      this.emit('dataset', null);
    },

    has: function (derivedId) { return !!(this.dataset && this.dataset.available[derivedId]); },
    role: function (key) { return this.dataset ? this.dataset.roles[key] : null; },
    column: function (key) {
      if (!this.dataset) return null;
      return this.dataset.columns.filter(function (c) { return c.key === key; })[0] || null;
    },

    /* Campos filtráveis disponíveis na base ativa */
    filterFields: function () {
      const ds = this.dataset;
      if (!ds) return [];
      const out = [];
      const all = ds.rows;

      if (ds.available._faixa) out.push({ id: '_faixa', label: 'Faixa de idade', kind: 'cat', options: MI.AGE_BANDS.map(function (b) { return b.label; }) });
      if (ds.available._idade) {
        const mm = minMax(all, '_idade');
        out.push({ id: '_idade', label: 'Idade (anos)', kind: 'range', min: mm[0], max: mm[1] });
      }
      if (ds.available._genero) out.push({ id: '_genero', label: 'Gênero', kind: 'cat', options: catOptions(all, '_genero', 12) });
      if (ds.available._uf) out.push({ id: '_uf', label: 'Estado (UF)', kind: 'cat', options: catOptions(all, '_uf', 30) });
      if (ds.available._regiao) out.push({ id: '_regiao', label: 'Região', kind: 'cat', options: catOptions(all, '_regiao', 6) });
      if (ds.available._cidade) out.push({ id: '_cidade', label: 'Cidade', kind: 'cat', options: catOptions(all, '_cidade', 200), searchable: true });
      if (ds.available._plano) out.push({ id: '_plano', label: 'Plano / produto', kind: 'cat', options: catOptions(all, '_plano', 40) });
      if (ds.available._canal) out.push({ id: '_canal', label: 'Canal de aquisição', kind: 'cat', options: catOptions(all, '_canal', 40) });
      if (ds.available._status) out.push({ id: '_status', label: 'Status', kind: 'cat', options: catOptions(all, '_status', 20) });
      if (ds.available._dispositivo) out.push({ id: '_dispositivo', label: 'Dispositivo', kind: 'cat', options: catOptions(all, '_dispositivo', 20) });
      if (ds.available._data) {
        const dr = dateMinMax(all, '_data');
        out.push({ id: '_data', label: 'Período da última atividade', kind: 'daterange', min: dr[0], max: dr[1] });
      }
      if (ds.available._cad) {
        const dr = dateMinMax(all, '_cad');
        out.push({ id: '_cad', label: 'Período de cadastro', kind: 'daterange', min: dr[0], max: dr[1] });
      }
      if (ds.available._hora) out.push({ id: '_hora', label: 'Horário (0–23h)', kind: 'range', min: 0, max: 23, integer: true });
      if (ds.available._dow) out.push({ id: '_dow', label: 'Dia da semana', kind: 'cat', options: MI.DIAS_SEMANA.slice(), valueMap: 'dow' });
      if (ds.available._valor) { const mm = minMax(all, '_valor'); out.push({ id: '_valor', label: 'Ticket médio', kind: 'range', min: mm[0], max: mm[1], money: true }); }
      if (ds.available._freq) { const mm = minMax(all, '_freq'); out.push({ id: '_freq', label: 'Frequência / transações', kind: 'range', min: mm[0], max: mm[1] }); }
      if (ds.available._recencia) { const mm = minMax(all, '_recencia'); out.push({ id: '_recencia', label: 'Dias desde a última atividade', kind: 'range', min: mm[0], max: mm[1], integer: true }); }
      if (ds.available._satisfacao) { const mm = minMax(all, '_satisfacao'); out.push({ id: '_satisfacao', label: 'Satisfação / NPS', kind: 'range', min: mm[0], max: mm[1] }); }

      ds.extraDims.forEach(function (c) {
        out.push({ id: 'col:' + c.key, label: c.label, kind: 'cat', options: catOptions(all, c.key, 60), raw: c.key });
      });
      return out;
    },

    setFilter: function (id, filter) {
      if (!filter) delete this.filters[id];
      else this.filters[id] = filter;
      this.applyFilters();
      this.emit('filters', this.filters);
    },
    clearFilters: function () {
      this.filters = {};
      this.applyFilters();
      this.emit('filters', this.filters);
    },
    activeFilterCount: function () { return Object.keys(this.filters).length; },

    applyFilters: function () {
      const ds = this.dataset;
      if (!ds) { this.rows = []; return; }
      const ids = Object.keys(this.filters);
      if (!ids.length) { this.rows = ds.rows; return; }
      const tests = ids.map(function (id) {
        const f = store.filters[id];
        const field = f.raw || id;
        if (f.kind === 'cat') {
          const set = f.values instanceof Set ? f.values : new Set(f.values);
          if (id === '_dow') {
            const nums = new Set(Array.from(set, function (v) { return typeof v === 'number' ? v : MI.DIAS_SEMANA.indexOf(v); }));
            return function (r) { return nums.has(r._dow); };
          }
          return function (r) { return set.has(r[field]); };
        }
        if (f.kind === 'range') {
          const lo = f.min, hi = f.max;
          return function (r) { const v = r[field]; return v != null && v >= lo && v <= hi; };
        }
        if (f.kind === 'daterange') {
          const lo = f.from ? f.from.getTime() : -Infinity;
          const hi = f.to ? f.to.getTime() + 86399999 : Infinity;
          return function (r) { const v = r[field]; return v && v.getTime() >= lo && v.getTime() <= hi; };
        }
        return function () { return true; };
      });
      const src = ds.rows, out = [];
      outer: for (let i = 0; i < src.length; i++) {
        const r = src[i];
        for (let t = 0; t < tests.length; t++) if (!tests[t](r)) continue outer;
        out.push(r);
      }
      this.rows = out;
    },

    setPerspective: function (p) {
      this.perspective = ['smoov', 'tenmove', 'tech'].indexOf(p) >= 0 ? p : 'smoov';
      MI.storage.set('perspective', this.perspective);
      this.emit('perspective', this.perspective);
    },
    isTenMove: function () { return this.perspective === 'tenmove'; },
    isTech: function () { return this.perspective === 'tech'; },
    isSmoov: function () { return this.perspective === 'smoov'; }
  };

  function minMax(rows, key) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][key];
      if (v == null || isNaN(v)) continue;
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    if (lo === Infinity) return [0, 0];
    return [Math.floor(lo), Math.ceil(hi)];
  }
  function dateMinMax(rows, key) {
    let lo = null, hi = null;
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][key];
      if (!v) continue;
      if (!lo || v < lo) lo = v; if (!hi || v > hi) hi = v;
    }
    return [lo, hi];
  }
  function catOptions(rows, key, limit) {
    const m = MI.countBy(rows, key);
    return MI.mapToSorted(m, limit).map(function (e) { return e.label; });
  }
  MI.catOptions = catOptions;

  MI.store = store;

})(window.MI);
