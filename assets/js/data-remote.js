/* 10 Move Intelligence — base compartilhada na plataforma
   -------------------------------------------------------------------------
   Decisão do cliente em 24/11/2026: a base completa fica acessível tanto ao
   administrador da Smoov quanto à equipe da 10 Move, para que quem sobe o
   arquivo não precise reenviá-lo e os dois vejam o mesmo painel.

   Isso muda a premissa original do projeto — antes nenhum registro saía do
   navegador. Agora sai, e por isso:
     · só o administrador da Smoov publica ou remove bases;
     · todo carregamento fica registrado na trilha de auditoria do servidor;
     · o uso com dados reais de clientes exige base legal e contrato de
       tratamento, que são decisão das empresas, não do software.

   As linhas vão em blocos: uma linha por registro ficaria lenta para ler de
   volta e um único campo gigante trava o envio.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const TAMANHO_BLOCO = 2000;
  const R = { ultimoErro: null };

  function cliente() { return MI.auth && MI.auth.client; }

  R.disponivel = function () { return !!(MI.auth && MI.auth.autenticado() && MI.auth.org); };
  R.podePublicar = function () { return !MI.fullData?.active && R.disponivel() && MI.auth.role === 'smoov_admin'; };

  /* ---------------- Consulta ---------------- */
  R.ativa = function (kind) {
    if (!R.disponivel()) return Promise.resolve(null);
    return cliente().from('datasets')
      .select('*')
      .eq('org_id', MI.auth.org.id)
      .eq('kind', kind)
      .eq('is_active', true)
      .limit(1)
      .then(function (r) {
        if (r.error) { R.ultimoErro = r.error.message; return null; }
        return (r.data || [])[0] || null;
      })
      .catch(function (e) { R.ultimoErro = e.message || String(e); return null; });
  };

  R.listar = function () {
    if (!R.disponivel()) return Promise.resolve([]);
    return cliente().from('datasets')
      .select('id, kind, name, file_name, row_count, uploaded_at, is_active')
      .eq('org_id', MI.auth.org.id)
      .order('uploaded_at', { ascending: false })
      .then(function (r) { return r.error ? [] : (r.data || []); })
      .catch(function () { return []; });
  };

  /* ---------------- Envio ---------------- */
  function enviarBlocos(datasetId, linhas, onProgress) {
    const total = Math.ceil(linhas.length / TAMANHO_BLOCO);
    let i = 0;
    function proximo() {
      if (i >= total) return Promise.resolve(total);
      const fatia = linhas.slice(i * TAMANHO_BLOCO, (i + 1) * TAMANHO_BLOCO);
      return cliente().from('dataset_chunks')
        .insert({ dataset_id: datasetId, idx: i, rows: fatia })
        .then(function (r) {
          if (r.error) throw new Error('Bloco ' + (i + 1) + ' de ' + total + ': ' + r.error.message);
          i++;
          if (onProgress) onProgress(i / total, 'Enviando bloco ' + i + ' de ' + total + '…');
          return proximo();
        });
    }
    return proximo();
  }

  /* Desativa a base anterior do mesmo tipo: só uma fica ativa por vez. */
  function desativarAnteriores(kind) {
    return cliente().from('datasets')
      .update({ is_active: false })
      .eq('org_id', MI.auth.org.id)
      .eq('kind', kind)
      .eq('is_active', true)
      .then(function () { return true; });
  }

  R.publicarClientes = function (ds, onProgress) {
    if (!R.podePublicar()) return Promise.reject(new Error('Apenas o administrador da Smoov publica bases.'));
    if (!ds || !ds.rows || !ds.rows.length) return Promise.reject(new Error('Base vazia.'));

    /* Só os campos originais da planilha. Os campos derivados (_idade, _uf,
       _data…) são recalculados na carga e não precisam trafegar. */
    const headers = ds.headers;
    const limpas = new Array(ds.rows.length);
    for (let i = 0; i < ds.rows.length; i++) {
      const o = {};
      for (let c = 0; c < headers.length; c++) {
        const v = ds.rows[i][headers[c]];
        o[headers[c]] = v instanceof Date ? MI.fmt.dateIso(v) : v;
      }
      limpas[i] = o;
    }

    if (onProgress) onProgress(0.05, 'Registrando a base…');
    return desativarAnteriores('clientes')
      .then(function () {
        return cliente().from('datasets').insert({
          org_id: MI.auth.org.id,
          kind: 'clientes',
          name: ds.name,
          file_name: ds.fileName || null,
          sheet_name: ds.sheetName || null,
          row_count: limpas.length,
          headers: headers,
          columns: [],                 /* reinferido na carga */
          roles: ds.roles,
          chunk_size: TAMANHO_BLOCO,
          chunk_count: Math.ceil(limpas.length / TAMANHO_BLOCO),
          uploaded_by: MI.auth.user.id
        }).select('id').limit(1);
      })
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        const id = r.data[0].id;
        return enviarBlocos(id, limpas, onProgress).then(function () {
          MI.privacy.log('publicou base de clientes', ds.fileName || ds.name);
          return id;
        });
      });
  };

  /* Nas transações o que viaja é o item já normalizado: guardar as linhas
     brutas significaria manter uma segunda cópia de tudo em memória. */
  const CAMPOS_TX = ['_pedido', '_cliente', '_sku', '_nome', '_tamanho', '_catBruta',
    '_hora', '_qtd', '_valorUnit', '_valor', '_canal', '_unidade'];

  R.publicarTransacoes = function (onProgress) {
    if (!R.podePublicar()) return Promise.reject(new Error('Apenas o administrador da Smoov publica bases.'));
    const T = MI.tx;
    if (!T.has()) return Promise.reject(new Error('Nenhuma base de transações carregada.'));
    if (T.isDemo()) return Promise.reject(new Error('As transações demonstrativas não são publicadas: elas apontam para a base de clientes fictícia.'));

    const itens = T.items;
    const limpas = new Array(itens.length);
    for (let i = 0; i < itens.length; i++) {
      const o = {};
      for (let c = 0; c < CAMPOS_TX.length; c++) o[CAMPOS_TX[c]] = itens[i][CAMPOS_TX[c]];
      o._data = itens[i]._data ? itens[i]._data.toISOString() : null;
      limpas[i] = o;
    }

    if (onProgress) onProgress(0.05, 'Registrando a base de transações…');
    return desativarAnteriores('transacoes')
      .then(function () {
        return cliente().from('datasets').insert({
          org_id: MI.auth.org.id,
          kind: 'transacoes',
          name: T.fileName || 'Transações',
          file_name: T.fileName || null,
          row_count: limpas.length,
          headers: CAMPOS_TX.concat(['_data']),
          columns: [],
          roles: {},
          mapping: T.mapping || {},
          chunk_size: TAMANHO_BLOCO,
          chunk_count: Math.ceil(limpas.length / TAMANHO_BLOCO),
          uploaded_by: MI.auth.user.id
        }).select('id').limit(1);
      })
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        const id = r.data[0].id;
        return enviarBlocos(id, limpas, onProgress).then(function () {
          MI.privacy.log('publicou base de transações', T.fileName || '');
          return id;
        });
      });
  };

  /* ---------------- Carga ---------------- */
  function baixarBlocos(meta, onProgress) {
    const total = meta.chunk_count || 0;
    const linhas = [];
    let i = 0;
    function proximo() {
      if (i >= total) return Promise.resolve(linhas);
      return cliente().from('dataset_chunks')
        .select('rows')
        .eq('dataset_id', meta.id)
        .eq('idx', i)
        .limit(1)
        .then(function (r) {
          if (r.error) throw new Error('Bloco ' + (i + 1) + ': ' + r.error.message);
          const bloco = (r.data || [])[0];
          if (bloco && bloco.rows) Array.prototype.push.apply(linhas, bloco.rows);
          i++;
          if (onProgress) onProgress(i / total, 'Baixando bloco ' + i + ' de ' + total + '…');
          return proximo();
        });
    }
    return proximo();
  }

  /* Cada carregamento vira registro na trilha do servidor: com a base
     acessível às duas empresas, saber quem leu o quê deixa de ser opcional. */
  function auditarAcesso(meta) {
    if (!MI.auth.autenticado()) return;
    MI.auth.auditar('acessou base compartilhada', meta.name, {
      dataset_id: meta.id, kind: meta.kind, linhas: meta.row_count
    });
  }

  R.carregarClientes = function (meta, onProgress) {
    return baixarBlocos(meta, onProgress).then(function (linhas) {
      if (!linhas.length) throw new Error('A base publicada está sem linhas.');
      /* O esquema é reinferido: tipos e estatísticas de coluna não precisam
         trafegar, e assim não há risco de datas quebrarem na serialização.
         Os papéis corrigidos à mão pelo administrador são preservados. */
      const schema = MI.inferSchema(meta.headers, linhas);
      const ds = {
        name: meta.name,
        source: 'remote',
        fileName: meta.file_name,
        sheetName: meta.sheet_name,
        rows: linhas,
        headers: meta.headers,
        columns: schema.columns,
        roles: meta.roles && Object.keys(meta.roles).length ? meta.roles : schema.roles,
        remoto: { id: meta.id, enviadoEm: meta.uploaded_at },
        createdAt: new Date()
      };
      ds.columns.forEach(function (c) {
        c.role = Object.keys(ds.roles).filter(function (r) { return ds.roles[r] === c.key; })[0] || null;
      });
      auditarAcesso(meta);
      return ds;
    });
  };

  R.carregarTransacoes = function (meta, onProgress) {
    return baixarBlocos(meta, onProgress).then(function (linhas) {
      if (!linhas.length) throw new Error('A base de transações publicada está sem linhas.');
      const itens = new Array(linhas.length);
      for (let i = 0; i < linhas.length; i++) {
        const o = linhas[i];
        const d = o._data ? new Date(o._data) : null;
        itens[i] = {
          _pedido: o._pedido, _cliente: o._cliente, _sku: o._sku, _nome: o._nome,
          _tamanho: o._tamanho, _catBruta: o._catBruta,
          _data: d, _mes: d ? MI.monthKey(d) : null, _dow: d ? d.getDay() : null,
          _hora: o._hora, _qtd: o._qtd || 1, _valorUnit: o._valorUnit, _valor: o._valor,
          _canal: o._canal, _unidade: o._unidade,
          _prod: null, _cat: null, _subcat: null, _metodo: null,
          _faixa: null, _genero: null, _uf: null, _cidade: null, _idade: null
        };
      }
      auditarAcesso(meta);
      MI.tx.setItems(itens, 'remote', meta.file_name, meta.mapping || {});
      return MI.tx.link;
    });
  };

  R.remover = function (id) {
    if (!R.podePublicar()) return Promise.reject(new Error('Apenas o administrador da Smoov remove bases.'));
    return cliente().from('datasets').delete().eq('id', id).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      MI.privacy.log('removeu base publicada', id);
      return true;
    });
  };

  MI.remote = R;

})(window.MI);
