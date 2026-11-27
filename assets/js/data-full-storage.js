/* O Excel sintético fica no Storage privado. A referência só muda após todos os blocos. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const BUCKET = 'smoov-lotes-simulados';
  const CHUNK = 5 * 1024 ** 2;
  const MAX = 350 * 1024 ** 2;
  const R = { estado: { fase:'', mensagem:'', progresso:0 }, padraoPendente:false };
  let geracao = 0, padraoInicial;

  function sessao() {
    const a = MI.auth;
    if (!a?.autenticado() || !a.org?.id || !a.user?.id) return null;
    return { org:a.org.id, user:a.user.id, cliente:a.client };
  }

  function conta() { return MI.auth?.role === 'smoov_admin' ? sessao() : null; }

  R.chaveSessao = function () {
    const c = sessao();
    return c ? c.org + '/' + c.user : null;
  };
  R.podeSalvar = () => !!conta();

  function anunciar(fase, mensagem, progresso=0) {
    const anterior = R.estado.fase;
    R.estado = { fase, mensagem, progresso };
    MI.app?.renderFonteMeta?.();
    MI.fullData?.atualizarPersistencia?.(R.estado, anterior !== fase);
    const label = MI.$('#padrao-status');
    if (label && mensagem) label.textContent = mensagem;
  }

  class OperacaoInterrompida extends Error {}

  function verificar(c, token) {
    if (token !== geracao || R.chaveSessao() !== c.org + '/' + c.user) {
      throw new OperacaoInterrompida();
    }
  }

  R.cancelar = function () {
    geracao++;
    R.padraoPendente = false;
    padraoInicial = null;
    anunciar('', '');
  };

  function caminho(c, upload, indice, owner=c.user) {
    return [c.org, owner, upload, String(indice).padStart(3,'0') + '.part'].join('/');
  }

  function lerResultado(r) {
    if (r.error) throw new Error(r.error.message || 'Armazenamento indisponível.');
    return r.data;
  }

  function metadados(c) {
    return c.cliente.from('saved_synthetic_batches')
      .select('upload_id,file_name,file_size').eq('org_id', c.org).eq('user_id', c.user).maybeSingle()
      .then(lerResultado);
  }

  function metadadosPadrao(c) {
    return c.cliente.from('organization_default_batches')
      .select('owner_id,upload_id,file_name,file_size,sha256').eq('org_id', c.org)
      .abortSignal(AbortSignal.timeout(5000)).maybeSingle()
      .then(lerResultado);
  }

  R.temPadrao = () => !!(padraoInicial?.meta && padraoInicial.chave === R.chaveSessao());

  R.sondarPadrao = async function () {
    const c = sessao();
    if (!c) return;
    const token = geracao;
    try {
      const meta = await metadadosPadrao(c);
      verificar(c, token);
      padraoInicial = { chave:R.chaveSessao(), meta };
      if (meta) {
        R.padraoPendente = true;
        anunciar('aguardando-padrao', 'Preparando a base padrão da Smoov…');
      }
    } catch (erro) {
      if (!(erro instanceof OperacaoInterrompida)) console.warn('Base padrão indisponível:', erro.message);
    }
  };

  async function escolher(c, padrao) {
    if (!R.podeSalvar()) return padrao;
    const pessoal = await metadados(c).catch(erro => { if (!padrao) throw erro; return null; });
    return pessoal && pessoal.upload_id !== padrao?.upload_id ? pessoal : padrao || pessoal;
  }

  async function removerBlocos(c, upload, quantidade) {
    if (!upload || !quantidade || R.chaveSessao() !== c.org + '/' + c.user) return;
    const paths = Array.from({length:quantidade}, (_,i)=>caminho(c, upload, i));
    try {
      lerResultado(await c.cliente.storage.from(BUCKET).remove(paths));
    } catch (erro) {
      console.warn('A limpeza de blocos antigos do lote ficou pendente.', erro.message);
    }
  }

  R.salvar = async function (batch) {
    const c = conta(), F = MI.fullData;
    if (!c || batch !== F.active || batch.meta.info.get('natureza') !== 'SIMULADO' ||
        R.estado.fase === 'salvando') return;
    const token = ++geracao, file = batch.file;
    const total = Math.ceil(file.size / CHUNK), upload = crypto.randomUUID();
    const bucket = c.cliente.storage.from(BUCKET);
    let tentados = 0, confirmado = false, anterior;
    anunciar('salvando', 'Salvando o Excel completo na conta…');
    try {
      for (let i=0; i<total; i++) {
        verificar(c, token);
        anunciar('salvando', 'Salvando na conta · bloco ' + (i+1) + ' de ' + total, i/total);
        tentados = i+1;
        lerResultado(await bucket.upload(caminho(c, upload, i), file.slice(i*CHUNK, (i+1)*CHUNK, 'application/octet-stream'),
          { contentType:'application/octet-stream', cacheControl:'0', upsert:false }));
      }
      verificar(c, token);
      anunciar('salvando', 'Confirmando o lote salvo na conta…', 0.99);
      try {
        const r = lerResultado(await c.cliente.rpc('save_synthetic_batch', {
          p_org:c.org, p_upload:upload, p_file_name:file.name, p_file_size:file.size
        }));
        anterior = r?.[0];
        confirmado = true;
      } catch (erro) {
        // A resposta pode cair depois que o servidor já gravou a referência.
        confirmado = (await metadados(c).catch(()=>null))?.upload_id === upload;
        if (!confirmado) throw erro;
      }
      verificar(c, token);
      anunciar('salvo', 'Excel salvo na conta. O lote será reaberto ao entrar novamente.', 1);
      MI.toast('Lote completo salvo na conta.', 'ok');
      if (anterior?.old_upload && anterior.old_upload !== upload) {
        void removerBlocos(c, anterior.old_upload, Math.ceil(anterior.old_size/CHUNK));
      }
    } catch (erro) {
      if (!confirmado) void removerBlocos(c, upload, tentados);
      if (erro instanceof OperacaoInterrompida || token !== geracao) return;
      anunciar('erro-salvar', 'O lote está ativo nesta sessão. O salvamento falhou: ' + erro.message);
      MI.toast('O lote ainda precisa ser salvo na conta.', 'error');
    }
  };

  async function baixar(c, meta, token) {
    const tamanho = Number(meta.file_size);
    if (!Number.isSafeInteger(tamanho) || tamanho < 22 || tamanho > MAX) {
      throw new Error('Tamanho do lote salvo inválido.');
    }
    const total = Math.ceil(tamanho/CHUNK), blocos = [];
    const bucket = c.cliente.storage.from(BUCKET);
    for (let i=0; i<total; i++) {
      verificar(c, token);
      anunciar('reabrindo', 'Baixando lote salvo · bloco ' + (i+1) + ' de ' + total, i/total/2);
      const parte = lerResultado(await bucket.download(caminho(c, meta.upload_id, i, meta.owner_id)));
      if (!parte || parte.size !== Math.min(CHUNK,tamanho-i*CHUNK)) {
        throw new Error('O bloco ' + (i+1) + ' do lote salvo está incompleto.');
      }
      blocos.push(parte);
    }
    return new File(blocos, meta.file_name, { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  R.reabrir = async function () {
    const c = sessao(), F = MI.fullData;
    if (!c || F.active || F.busy || R.estado.fase === 'reabrindo') return;
    const token = ++geracao;
    let meta;
    try {
      const padrao = padraoInicial?.chave === R.chaveSessao() ? padraoInicial.meta : await metadadosPadrao(c);
      meta = await escolher(c, padrao);
      verificar(c, token);
      if (!meta) { R.padraoPendente = false; anunciar('', ''); return; }
      if (F.active || F.busy) return;
      MI.toast('Reabrindo o lote completo salvo na conta…', 'info');
      let file;
      try {
        file = await baixar(c, meta, token);
      } catch (erro) {
        verificar(c, token);
        // Se outro navegador trocou o lote durante a leitura, busca a nova referência.
        const atual = await escolher(c, await metadadosPadrao(c));
        if (!atual || atual.upload_id === meta.upload_id) throw erro;
        meta = atual;
        file = await baixar(c, atual, token);
      }
      verificar(c, token);
      if (F.active || F.busy) return;
      anunciar('reabrindo', 'Validando o lote salvo…', 0.5);
      if (meta.sha256) await validarPadrao(file, meta.sha256);
      verificar(c, token);
      const preparar = meta.sha256 ? F.prepararPadrao : F.prepare;
      const batch = await preparar(file, p => {
        verificar(c, token);
        informarValidacao(p);
      });
      verificar(c, token);
      if (F.active) return;
      R.padraoPendente = false;
      F.activate(batch);
      anunciar('salvo', meta.sha256 ? 'Base padrão da Smoov ativa.' : 'Lote reaberto a partir do Excel salvo na conta.', 1);
      MI.app.rerender();
      MI.toast(MI.fmt.int(batch.stats.customers) + ' clientes do lote salvo foram ativados.', 'ok');
    } catch (erro) {
      if (erro instanceof OperacaoInterrompida || token !== geracao) return;
      R.padraoPendente = false;
      anunciar('erro-reabrir', 'Falha ao recuperar o lote salvo: ' + erro.message);
      MI.app.rerender();
      MI.toast('O lote salvo não abriu. A base anterior está disponível.', 'error');
    }
  };

  async function validarPadrao(file, esperado) {
    const bytes = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const hash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
    if (hash !== esperado) throw new Error('O arquivo da base padrão diverge do Excel homologado.');
  }

  function informarValidacao(p) {
    const etapa = p.phase || 'Validando lote salvo · ' + MI.fmt.int(p.done) + '/' + MI.fmt.int(p.total) + ' linhas';
    anunciar('reabrindo', etapa, 0.5 + 0.5*p.fraction);
  }

  MI.fullBatchStore = R;
})(window.MI);
