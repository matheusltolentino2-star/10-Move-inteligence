/* 10 Move Intelligence — unidades Smoov
   -------------------------------------------------------------------------
   Até aqui a loja existia só como texto livre no campo "unidade" das
   transações. Virou entidade: nome, formato, município, endereço, posição,
   raio operacional e maturidade.

   Três decisões que moldam o resto:

   1. As unidades nascem sozinhas a partir do que as transações já trazem.
      Quem sobe a planilha não vai cadastrar à mão as lojas que ele já
      informou em cada venda.

   2. A precisão da posição é um campo, não uma suposição:
        exata      — alguém informou latitude e longitude
        municipio  — sabe-se o município; o mapa desenha no centróide dele
        ausente    — não dá para posicionar
      Raio de cobertura só vale para "exata". Três quilômetros em volta do
      centróide de um município não medem nada, e desenhar esse círculo
      seria apresentar uma suposição com cara de medida.

   3. Ficam no servidor, não no navegador. Coordenada é justamente a parte
      que alguém digita à mão: se morasse no IndexedDB, o trabalho do Léo
      não chegaria à 10 Move.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const U = {
    items: [],
    fonte: 'nenhuma',          /* 'remota' | 'nenhuma' */
    erro: null,
    carregado: false
  };

  const FORMATOS = {
    propria: 'Loja própria',
    franquia: 'Franquia',
    nao_informado: 'Formato não informado'
  };
  const PRECISOES = {
    exata: 'Coordenada informada',
    municipio: 'Aproximada pelo município',
    ausente: 'Sem posição'
  };
  U.FORMATOS = FORMATOS;
  U.PRECISOES = PRECISOES;
  U.rotuloFormato = function (f) { return FORMATOS[f] || FORMATOS.nao_informado; };
  U.rotuloPrecisao = function (p) { return PRECISOES[p] || PRECISOES.ausente; };

  function cliente() { return MI.auth && MI.auth.client; }
  U.disponivel = function () { return !!(MI.remote && MI.remote.disponivel()); };
  U.podeEditar = function () { return !!(MI.remote && MI.remote.podePublicar()); };

  U.chaveDe = function (nome) { return MI.slug(String(nome || '').trim()); };

  /* ---------------- Carga ---------------- */
  U.carregar = function () {
    if (!U.disponivel()) {
      U.items = []; U.fonte = 'nenhuma'; U.carregado = true;
      return Promise.resolve(U.items);
    }
    return cliente().from('units')
      .select('*')
      .eq('org_id', MI.auth.org.id)
      .order('nome')
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        U.items = r.data || [];
        U.fonte = 'remota';
        U.erro = null;
        U.carregado = true;
        return U.items;
      })
      .catch(function (e) {
        U.erro = e.message || String(e);
        U.items = []; U.fonte = 'nenhuma'; U.carregado = true;
        console.error('Unidades não carregaram:', e);
        return U.items;
      });
  };

  U.porChave = function (chave) {
    const k = U.chaveDe(chave);
    return U.items.filter(function (u) { return u.chave === k; })[0] || null;
  };

  /* Unidades que o mapa consegue posicionar, e como. */
  U.posicionaveis = function () {
    return U.items.filter(function (u) {
      return u.precisao === 'exata' || (u.precisao === 'municipio' && u.municipio && u.uf);
    });
  };

  U.balanco = function () {
    let exatas = 0, porMunicipio = 0, sem = 0, proprias = 0, franquias = 0;
    U.items.forEach(function (u) {
      if (u.precisao === 'exata') exatas++;
      else if (u.precisao === 'municipio') porMunicipio++;
      else sem++;
      if (u.formato === 'propria') proprias++;
      else if (u.formato === 'franquia') franquias++;
    });
    return {
      total: U.items.length, exatas: exatas, porMunicipio: porMunicipio, sem: sem,
      proprias: proprias, franquias: franquias
    };
  };

  /* ---------------- Semeadura a partir das transações ----------------
     O que a venda informa é o nome da unidade. Município e UF são deduzidos
     por maioria entre os clientes que compraram ali — e isso é uma dedução,
     então a unidade nasce como "aproximada pelo município", nunca como
     endereço. Quem souber o endereço corrige, e aí ela vira exata. */
  U.semear = function () {
    if (!U.podeEditar()) return Promise.resolve({ criadas: 0 });
    const T = MI.tx;
    if (!T || !T.has() || T.isDemo()) return Promise.resolve({ criadas: 0 });

    const vistos = new Map();
    for (let i = 0; i < T.items.length; i++) {
      const nome = T.items[i]._unidade;
      if (!nome) continue;
      const k = U.chaveDe(nome);
      if (!k) continue;
      let o = vistos.get(k);
      if (!o) { o = { nome: String(nome).trim(), itens: 0, municipios: new Map(), ufs: new Map() }; vistos.set(k, o); }
      o.itens++;
      const cid = T.items[i]._cidade, uf = T.items[i]._uf;
      if (cid) o.municipios.set(cid, (o.municipios.get(cid) || 0) + 1);
      if (uf) o.ufs.set(uf, (o.ufs.get(uf) || 0) + 1);
    }
    if (!vistos.size) return Promise.resolve({ criadas: 0 });

    const maioria = function (m) {
      let melhor = null, max = 0;
      m.forEach(function (n, v) { if (n > max) { max = n; melhor = v; } });
      return melhor;
    };

    const novas = [];
    vistos.forEach(function (o, k) {
      if (U.porChave(k)) return;
      const mun = maioria(o.municipios), uf = maioria(o.ufs);
      novas.push({
        org_id: MI.auth.org.id,
        nome: o.nome,
        chave: k,
        formato: 'nao_informado',
        uf: uf || null,
        municipio: mun || null,
        precisao: mun && uf ? 'municipio' : 'ausente',
        origem: 'auto',
        criada_por: MI.auth.user.id
      });
    });
    if (!novas.length) return Promise.resolve({ criadas: 0 });

    return cliente().from('units').insert(novas).select('*')
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        U.items = U.items.concat(r.data || []).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
        MI.privacy.log('cadastrou unidades a partir das transações', novas.length + ' unidades');
        return { criadas: (r.data || []).length, novas: r.data || [] };
      })
      .catch(function (e) {
        console.error('Não foi possível cadastrar as unidades:', e);
        MI.toast('As unidades não puderam ser cadastradas: ' + (e.message || e), 'error');
        return { criadas: 0 };
      });
  };

  /* ---------------- Escrita ---------------- */
  function normalizar(dados) {
    const d = Object.assign({}, dados);
    const temCoord = d.lat != null && d.lat !== '' && d.lng != null && d.lng !== '';
    d.lat = temCoord ? Number(d.lat) : null;
    d.lng = temCoord ? Number(d.lng) : null;
    /* a precisão é consequência do que foi preenchido, não uma escolha
       solta: marcar "exata" sem coordenada seria uma promessa vazia */
    d.precisao = temCoord ? 'exata' : (d.municipio && d.uf ? 'municipio' : 'ausente');
    if (d.raio_m != null) d.raio_m = Math.max(100, Math.min(50000, Number(d.raio_m) || 3000));
    return d;
  }

  U.salvar = function (id, patch) {
    if (!U.podeEditar()) return Promise.reject(new Error('Apenas o administrador da Smoov edita unidades.'));
    const d = normalizar(patch);
    return cliente().from('units').update(d).eq('id', id).select('*')
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        const atualizada = (r.data || [])[0];
        if (atualizada) {
          U.items = U.items.map(function (u) { return u.id === id ? atualizada : u; });
        }
        MI.privacy.log('editou unidade', (atualizada && atualizada.nome) || id);
        return atualizada;
      });
  };

  U.adicionar = function (dados) {
    if (!U.podeEditar()) return Promise.reject(new Error('Apenas o administrador da Smoov cadastra unidades.'));
    const d = normalizar(dados);
    d.org_id = MI.auth.org.id;
    d.chave = U.chaveDe(d.nome);
    d.origem = 'manual';
    d.criada_por = MI.auth.user.id;
    if (!d.nome || !d.chave) return Promise.reject(new Error('O nome da unidade é obrigatório.'));
    if (U.porChave(d.chave)) return Promise.reject(new Error('Já existe uma unidade com este nome.'));
    return cliente().from('units').insert(d).select('*')
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        const nova = (r.data || [])[0];
        if (nova) U.items = U.items.concat([nova]).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
        MI.privacy.log('cadastrou unidade', d.nome);
        return nova;
      });
  };

  U.remover = function (id) {
    if (!U.podeEditar()) return Promise.reject(new Error('Apenas o administrador da Smoov remove unidades.'));
    return cliente().from('units').delete().eq('id', id).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      U.items = U.items.filter(function (u) { return u.id !== id; });
      MI.privacy.log('removeu unidade', id);
      return true;
    });
  };

  /* ---------------- Ligação com as transações ----------------
     Quanto do que foi vendido tem unidade informada, e quanto dessas
     unidades está cadastrada. */
  U.cobertura = function () {
    const T = MI.tx;
    if (!T || !T.has()) return null;
    let comUnidade = 0, casados = 0;
    const desconhecidas = new Map();
    for (let i = 0; i < T.items.length; i++) {
      const nome = T.items[i]._unidade;
      if (!nome) continue;
      comUnidade++;
      const k = U.chaveDe(nome);
      if (U.porChave(k)) casados++;
      else desconhecidas.set(nome, (desconhecidas.get(nome) || 0) + 1);
    }
    return {
      itens: T.items.length,
      comUnidade: comUnidade,
      taxaUnidade: T.items.length ? comUnidade / T.items.length : 0,
      casados: casados,
      desconhecidas: MI.mapToSorted(desconhecidas, 20)
    };
  };

  MI.unidades = U;

})(window.MI);
