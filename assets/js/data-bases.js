/* 10 Move Intelligence — ciclo de vida das bases importadas
   -------------------------------------------------------------------------
   Antes dava para publicar uma base e não dava para tirá-la do caminho:
   nenhuma tela listava o que existia, e a única saída era publicar outra
   por cima.

   Três estados distintos, de propósito:

     ATIVA     é a base que os painéis estão usando
     INATIVA   continua guardada, fora do caminho, e volta com um clique
     EXCLUÍDA  sai do servidor junto com os blocos, e não volta

   Desativar e excluir não podem parecer a mesma coisa. Desativar é
   reversível e resolve a maioria dos casos; excluir é definitivo e exige
   confirmação com o tamanho do estrago à vista.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const B = { itens: [], carregado: false, erro: null };

  function cliente() { return MI.auth && MI.auth.client; }
  B.disponivel = function () { return !!(MI.remote && MI.remote.disponivel()); };
  B.podeEditar = function () { return !!(MI.remote && MI.remote.podePublicar()); };

  const ROTULO_TIPO = { clientes: 'Clientes', transacoes: 'Transações' };
  B.rotuloTipo = function (k) { return ROTULO_TIPO[k] || k; };

  B.listar = function () {
    if (!B.disponivel()) { B.itens = []; B.carregado = true; return Promise.resolve([]); }
    return cliente().from('datasets')
      .select('id, kind, name, file_name, sheet_name, row_count, headers, chunk_count, uploaded_at, uploaded_by, uploaded_email, is_active')
      .eq('org_id', MI.auth.org.id)
      .order('uploaded_at', { ascending: false })
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        B.itens = (r.data || []).map(function (d) {
          d.colunas = Array.isArray(d.headers) ? d.headers.length : 0;
          return d;
        });
        B.carregado = true; B.erro = null;
        return B.itens;
      })
      .catch(function (e) {
        B.erro = e.message || String(e); B.carregado = true; B.itens = [];
        console.error('Bases não carregaram:', e);
        return [];
      });
  };

  B.porTipo = function (kind) {
    return B.itens.filter(function (d) { return d.kind === kind; });
  };
  B.ativa = function (kind) {
    return B.itens.filter(function (d) { return d.kind === kind && d.is_active; })[0] || null;
  };

  /* O que deixa de funcionar se esta base sair de cena. Mostrado ANTES da
     confirmação: ninguém deveria descobrir a dependência depois. */
  B.dependencias = function (d) {
    const dep = [];
    if (d.kind === 'clientes') {
      dep.push('Todos os painéis de clientes, perfil, geografia, comportamento e segmentação');
      if (MI.tx.has()) dep.push('A ligação das transações com os clientes (a base de transações continua, sem perfil demográfico)');
    } else {
      dep.push('Inteligência de Consumo, cesta de compras e curva de horário');
      const auto = MI.catalog && MI.catalog.detectados ? MI.catalog.detectados().length : 0;
      if (auto) dep.push(MI.fmt.int(auto) + ' produtos que entraram no cardápio a partir destas vendas continuam cadastrados');
      const un = MI.unidades && MI.unidades.items ? MI.unidades.items.filter(function (u) { return u.origem === 'auto'; }).length : 0;
      if (un) dep.push(MI.fmt.int(un) + ' unidades criadas a partir destas vendas continuam cadastradas');
    }
    if (d.is_active) dep.push('Esta é a base ATIVA: ao sair, os painéis voltam para a base demonstrativa até outra ser ativada');
    return dep;
  };

  /* ---------------- Ações ---------------- */

  /* Só uma base ativa por tipo: ativar uma desativa a anterior, no mesmo
     caminho que a publicação já usava. */
  B.ativar = function (d) {
    if (!B.podeEditar()) return Promise.reject(new Error('Apenas o administrador da Smoov gerencia bases.'));
    return cliente().from('datasets').update({ is_active: false })
      .eq('org_id', MI.auth.org.id).eq('kind', d.kind).eq('is_active', true)
      .then(function () {
        return cliente().from('datasets').update({ is_active: true }).eq('id', d.id).select('*');
      })
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        MI.auth.auditar('ativou base', d.name, { dataset_id: d.id, kind: d.kind });
        return B.listar();
      });
  };

  B.desativar = function (d) {
    if (!B.podeEditar()) return Promise.reject(new Error('Apenas o administrador da Smoov gerencia bases.'));
    return cliente().from('datasets').update({ is_active: false }).eq('id', d.id).select('*')
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        MI.auth.auditar('desativou base', d.name, { dataset_id: d.id, kind: d.kind });
        return B.listar();
      });
  };

  B.renomear = function (d, nome) {
    if (!B.podeEditar()) return Promise.reject(new Error('Apenas o administrador da Smoov gerencia bases.'));
    const n = String(nome || '').trim();
    if (!n) return Promise.reject(new Error('O nome não pode ficar vazio.'));
    return cliente().from('datasets').update({ name: n }).eq('id', d.id).select('*')
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        MI.auth.auditar('renomeou base', n, { dataset_id: d.id, antes: d.name });
        return B.listar();
      });
  };

  /* A exclusão roda numa função do banco: apaga base e blocos na mesma
     transação e registra a auditoria junto. O RLS continua valendo, porque
     a função é security invoker — quem não pode excluir recebe erro em vez
     de um sucesso silencioso. */
  B.excluir = function (d) {
    if (!B.podeEditar()) return Promise.reject(new Error('Apenas o administrador da Smoov exclui bases.'));
    return cliente().rpc('excluir_base', { p_id: d.id })
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        const info = (r.data || [])[0] || {};
        MI.privacy.log('excluiu base publicada', d.name + ' · ' + MI.fmt.int(d.row_count || 0) + ' linhas');
        return B.listar().then(function () { return info; });
      });
  };

  /* Depois de mexer no que está ativo, os painéis precisam voltar a ler do
     servidor em vez de continuar com o que estava em memória. */
  B.recarregarPaineis = function () {
    const app = MI.app;
    const tarefas = [];
    tarefas.push(
      MI.remote.ativa('clientes').then(function (meta) {
        if (meta) return MI.remote.carregarClientes(meta).then(function (ds) { MI.store.setDataset(ds); });
        /* sem base ativa, volta para a demonstrativa em vez de ficar vazio */
        MI.store.setDataset(app.buildDemo());
      })
    );
    return Promise.all(tarefas)
      .then(function () {
        MI.tx.clear();
        return MI.remote.ativa('transacoes').then(function (meta) {
          if (meta) return MI.remote.carregarTransacoes(meta);
          return null;
        });
      })
      .catch(function (e) { console.error('Recarga após mudança de base:', e); })
      .then(function () { MI.app.rerender(); });
  };

  MI.bases = B;

})(window.MI);
