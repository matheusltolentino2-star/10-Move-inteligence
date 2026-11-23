/* 10 Move Intelligence — gerador da base DEMONSTRATIVA
   -------------------------------------------------------------------------
   IMPORTANTE: nada aqui representa dados reais da Smoov ou de qualquer
   empresa. É uma base 100% fictícia, gerada no navegador a partir de uma
   semente fixa (resultado reproduzível), usada apenas para que a plataforma
   funcione antes da importação do arquivo real.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const HOJE = new Date(2026, 10, 23); // referência fixa: 23/11/2026
  const DIA = 86400000;

  /* Perfis comportamentais latentes — não ficam expostos como coluna.
     A segmentação da plataforma precisa descobri-los nos dados. */
  const PERFIS = [
    { nome: 'deslocamento', w: 34, horas: [7, 8, 9, 17, 18, 19], dias: [1, 2, 3, 4, 5], freq: [10, 4], dur: [14, 5], idade: [36, 10] },
    { nome: 'lazer', w: 26, horas: [11, 12, 13, 15, 16, 19, 20, 21], dias: [5, 6, 0], freq: [5, 2.5], dur: [26, 10], idade: [33, 11] },
    { nome: 'noturno', w: 12, horas: [20, 21, 22, 23, 0, 1], dias: [4, 5, 6], freq: [6, 3], dur: [19, 8], idade: [26, 6] },
    { nome: 'esporadico', w: 28, horas: [8, 10, 12, 14, 16, 18, 20], dias: [0, 1, 2, 3, 4, 5, 6], freq: [1.6, 1], dur: [21, 9], idade: [41, 14] }
  ];
  const PERFIS_W = MI.sum(PERFIS, function (p) { return p.w; });

  const CANAIS = [
    { v: 'Indicação de amigo', w: 24 }, { v: 'Instagram', w: 21 }, { v: 'Busca orgânica', w: 14 },
    { v: 'Google Ads', w: 13 }, { v: 'Loja de aplicativos', w: 12 }, { v: 'Parceria corporativa', w: 8 },
    { v: 'TikTok', w: 5 }, { v: 'Evento presencial', w: 3 }
  ];
  const PLANOS = [
    { v: 'Avulso', w: 44 }, { v: 'Mensal Light', w: 24 }, { v: 'Mensal Plus', w: 19 },
    { v: 'Anual', w: 8 }, { v: 'Corporativo', w: 5 }
  ];
  const DISPOSITIVOS = [{ v: 'Android', w: 56 }, { v: 'iOS', w: 38 }, { v: 'Web', w: 6 }];

  const CIDADES_W = MI.sum(MI.CIDADES, function (c) { return c.w; });

  /* Sazonalidade mensal (1 = média). Verão e fim de ano mais fortes. */
  const SAZON = [1.14, 1.08, 1.02, 0.95, 0.88, 0.82, 0.86, 0.93, 1.00, 1.06, 1.10, 1.16];

  function ticketBase(plano, perfil) {
    let base = 18;
    if (plano === 'Mensal Light') base = 15;
    else if (plano === 'Mensal Plus') base = 13.5;
    else if (plano === 'Anual') base = 12;
    else if (plano === 'Corporativo') base = 16;
    if (perfil === 'noturno') base *= 1.22;
    else if (perfil === 'lazer') base *= 1.12;
    else if (perfil === 'deslocamento') base *= 0.94;
    return base;
  }

  /* Gera N registros. Retorna {headers, rows} no formato "planilha". */
  MI.gerarBaseDemo = function (n, seed) {
    n = n || 80000;
    const rng = new MI.Rng(seed || 20261123);
    const rows = new Array(n);

    for (let i = 0; i < n; i++) {
      /* --- perfil latente --- */
      const perfil = rng.weighted(PERFIS, PERFIS_W);

      /* --- demografia --- */
      let idade = Math.round(rng.normal(perfil.idade[0], perfil.idade[1], 16, 84));
      const nasc = new Date(HOJE.getFullYear() - idade, rng.int(0, 11), rng.int(1, 28));
      /* ajusta idade para ser coerente com a data de nascimento */
      idade = HOJE.getFullYear() - nasc.getFullYear() - ((HOJE.getMonth() < nasc.getMonth()) ? 1 : 0);

      let genero;
      const g = rng.next();
      if (g < 0.515) genero = 'Feminino';
      else if (g < 0.967) genero = 'Masculino';
      else if (g < 0.982) genero = 'Outro';
      else genero = ''; // 1,8% sem informação — proposital

      /* --- localização --- */
      const c = rng.weighted(MI.CIDADES, CIDADES_W);
      const cidade = rng.chance(0.012) ? '' : c.cidade; // 1,2% ausente — proposital
      const uf = c.uf;
      const bairro = rng.pick(MI.BAIRROS);

      /* --- plano, canal, dispositivo (com efeito de idade) --- */
      let plano = rng.weighted(PLANOS).v;
      if (idade > 55 && plano === 'Anual' && rng.chance(0.5)) plano = 'Avulso';
      if (idade < 25 && plano === 'Corporativo' && rng.chance(0.7)) plano = 'Avulso';
      if (perfil.nome === 'deslocamento' && plano === 'Avulso' && rng.chance(0.42)) {
        plano = rng.chance(0.55) ? 'Mensal Light' : 'Mensal Plus';
      }
      const canal = rng.weighted(CANAIS).w ? rng.weighted(CANAIS).v : 'Instagram';
      let dispositivo = rng.weighted(DISPOSITIVOS).v;
      if (idade < 28 && dispositivo === 'Web' && rng.chance(0.6)) dispositivo = 'iOS';
      if (idade > 58 && dispositivo === 'iOS' && rng.chance(0.3)) dispositivo = 'Android';

      /* --- cadastro: tendência de crescimento nos últimos 46 meses --- */
      const u = rng.next();
      const mesesAtras = Math.floor(46 * (1 - Math.pow(u, 0.62))); // mais cadastros recentes
      const cad = new Date(HOJE.getFullYear(), HOJE.getMonth() - mesesAtras, rng.int(1, 28));
      const diasCliente = Math.max(1, Math.round((HOJE - cad) / DIA));

      /* --- atividade --- */
      let freqMensal = rng.normal(perfil.freq[0], perfil.freq[1], 0.2, 40);
      if (plano === 'Mensal Plus') freqMensal *= 1.35;
      else if (plano === 'Mensal Light') freqMensal *= 1.15;
      else if (plano === 'Anual') freqMensal *= 1.5;
      else if (plano === 'Corporativo') freqMensal *= 1.28;
      freqMensal = Math.round(freqMensal * 10) / 10;

      /* recência: clientes de menor frequência tendem a sumir.
         Calibrado para uma base realista (nem todo mundo ativo): aprox.
         55% ativos, 10% em risco, 22% inativos e 13% cancelados. */
      const pChurn = Math.min(0.92, 0.78 / (1 + freqMensal * 0.17));
      let diasDesdeUltima;
      if (rng.chance(pChurn)) diasDesdeUltima = Math.round(rng.normal(190, 130, 46, Math.min(diasCliente, 900)));
      else diasDesdeUltima = Math.round(Math.pow(rng.next(), 2.1) * 45);
      diasDesdeUltima = Math.min(diasDesdeUltima, diasCliente);
      const ultima = new Date(HOJE.getTime() - diasDesdeUltima * DIA);

      let status;
      if (diasDesdeUltima <= 45) status = 'Ativo';
      else if (diasDesdeUltima <= 120) status = 'Em risco';
      else if (diasDesdeUltima <= 300) status = 'Inativo';
      else status = 'Cancelado';

      /* transações em 12 meses, com sazonalidade do mês da última transação */
      const mesesAtivos = Math.min(12, Math.max(0.5, (diasCliente - Math.max(0, diasDesdeUltima - 30)) / 30.4));
      const saz = SAZON[ultima.getMonth()];
      let trans12 = Math.round(freqMensal * mesesAtivos * saz * (0.75 + rng.next() * 0.5));
      if (status === 'Cancelado') trans12 = Math.round(trans12 * 0.15);
      trans12 = Math.max(0, trans12);

      const ticket = Math.round(rng.normal(ticketBase(plano, perfil.nome), 5.2, 4.5, 85) * 100) / 100;
      const receita12 = Math.round(trans12 * ticket * 100) / 100;

      /* horário e dia preferidos vêm do perfil latente, com ruído */
      let hora = rng.pick(perfil.horas);
      if (rng.chance(0.18)) hora = (hora + rng.int(-2, 2) + 24) % 24;
      let dow = rng.pick(perfil.dias);
      if (rng.chance(0.2)) dow = rng.int(0, 6);

      const duracao = Math.round(rng.normal(perfil.dur[0], perfil.dur[1], 3, 120));
      const cupom = rng.chance(canal === 'Indicação de amigo' ? 0.46 : 0.27) ? 'Sim' : 'Não';
      const nps = rng.chance(0.78) ? Math.min(10, Math.max(0, Math.round(rng.normal(status === 'Ativo' ? 8.4 : 6.3, 2.0, 0, 10)))) : '';
      const avaliacao = Math.round(rng.normal(4.4, 0.52, 1, 5) * 10) / 10;

      rows[i] = {
        id_cliente: 'SMV-' + String(100000 + i),
        genero: genero,
        data_nascimento: MI.fmt.dateIso(nasc),
        idade: idade,
        uf: uf,
        cidade: cidade,
        bairro: bairro,
        data_cadastro: MI.fmt.dateIso(cad),
        canal_aquisicao: canal,
        plano: plano,
        status: status,
        dispositivo: dispositivo,
        transacoes_12m: trans12,
        frequencia_mensal: freqMensal,
        ticket_medio: ticket,
        receita_12m: receita12,
        data_ultima_transacao: MI.fmt.dateIso(ultima),
        dias_desde_ultima: diasDesdeUltima,
        dia_semana_preferido: MI.DIAS_SEMANA[dow],
        horario_preferido: String(hora).padStart(2, '0') + ':00',
        duracao_media_min: duracao,
        cupom_utilizado: cupom,
        nps: nps,
        avaliacao_media: avaliacao
      };
    }

    /* Imperfeições realistas: 14 identificadores duplicados, para o módulo
       de qualidade ter algo verdadeiro a reportar. */
    for (let k = 0; k < 14; k++) {
      const a = rng.int(0, n - 1), b = rng.int(0, n - 1);
      if (a !== b) rows[b].id_cliente = rows[a].id_cliente;
    }

    const headers = Object.keys(rows[0]);
    return { headers: headers, rows: rows };
  };

  MI.HOJE_REF = HOJE;

})(window.MI);
