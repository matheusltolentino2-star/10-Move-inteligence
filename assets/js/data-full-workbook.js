/* Leitura incremental do Excel gerado para o lote nacional. Os módulos de importação avulsa continuam usando SheetJS. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const text = new TextDecoder('utf-8', {fatal: true});
  const crcTable = Uint32Array.from({length:256}, function (_, i) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    return c;
  });
  const entities = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'"};
  function unescape(s) {
    return s.includes('&') ? s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (_, k) {
      if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
      if (k.startsWith('#')) return String.fromCodePoint(Number(k.slice(1)));
      return entities[k];
    }) : s;
  }

  function requireValid(ok, message) {
    if (!ok) throw new Error(message);
  }

  async function zip(file) {
    requireValid(file.size >= 22 && file.size <= 350 * 1024 ** 2, 'O arquivo de lote deve ter entre 22 bytes e 350 MiB.');
    const last = Math.max(0, file.size - 65557);
    const tail = new DataView(await file.slice(last).arrayBuffer());
    let i = tail.byteLength - 22;
    for (; i >= 0; i--) {
      if (tail.getUint32(i, true) === 0x06054b50 && i + 22 + tail.getUint16(i + 20, true) === tail.byteLength) break;
    }
    requireValid(i >= 0, 'O arquivo não contém um diretório XLSX legível.');
    requireValid(tail.getUint32(i + 4, true) === 0, 'O arquivo deve conter um único volume ZIP.');
    const count = tail.getUint16(i + 10, true);
    const bytes = tail.getUint32(i + 12, true);
    const offset = tail.getUint32(i + 16, true);
    requireValid(count > 0 && count < 192 && bytes < 524288 && offset + bytes <= last + i, 'Diretório XLSX inválido.');
    const directory = new DataView(await file.slice(offset, offset + bytes).arrayBuffer());
    const entries = new Map();
    let cursor = 0;
    for (let k = 0; k < count; k++) {
      requireValid(cursor + 46 <= bytes && directory.getUint32(cursor, true) === 0x02014b50, 'Entrada XLSX inválida.');
      const flags = directory.getUint16(cursor + 8, true);
      const method = directory.getUint16(cursor + 10, true);
      const crc = directory.getUint32(cursor + 16, true);
      const compressed = directory.getUint32(cursor + 20, true);
      const size = directory.getUint32(cursor + 24, true);
      const len = directory.getUint16(cursor + 28, true);
      const local = directory.getUint32(cursor + 42, true);
      requireValid(cursor + 46 + len <= bytes && !(flags & 1) && (method === 0 || method === 8) &&
        local + 30 + compressed <= offset && size < 1024 ** 3, 'Entrada XLSX excede o formato suportado.');
      const name = text.decode(new Uint8Array(directory.buffer, cursor + 46, len));
      requireValid(!entries.has(name), 'O XLSX contém partes duplicadas.');
      entries.set(name, {method, crc, compressed, size, local});
      cursor += 46 + len + directory.getUint16(cursor + 30, true) + directory.getUint16(cursor + 32, true);
    }
    return {
      has: name => entries.has(name),
      async *content(name) {
        const e = entries.get(name);
        requireValid(e, 'Parte XLSX ausente: ' + name);
        const local = new DataView(await file.slice(e.local, e.local + 30).arrayBuffer());
        requireValid(local.getUint32(0, true) === 0x04034b50, 'Cabeçalho XLSX inválido: ' + name);
        const begin = e.local + 30 + local.getUint16(26, true) + local.getUint16(28, true);
        requireValid(begin + e.compressed <= offset, 'Limites XLSX inválidos: ' + name);
        let stream = file.slice(begin, begin + e.compressed).stream();
        if (e.method === 8) stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
        const reader = stream.getReader();
        const decoder = new TextDecoder('utf-8', {fatal:true});
        let seen = 0, crc = 0xffffffff;
        try {
          for (;;) {
            const block = await reader.read();
            if (block.done) break;
            const data = block.value;
            seen += data.length;
            requireValid(seen <= e.size, 'Tamanho descompactado divergente: ' + name);
            for (let k = 0; k < data.length; k++) crc = (crc >>> 8) ^ crcTable[(crc ^ data[k]) & 255];
            yield decoder.decode(data, {stream:true});
          }
          requireValid(seen === e.size && ((crc ^ 0xffffffff) >>> 0) === e.crc, 'Integridade ZIP inválida: ' + name);
          const end = decoder.decode();
          if (end) yield end;
        } finally {
          await reader.cancel().catch(function () {});
          reader.releaseLock();
        }
      }
    };
  }

  async function string(content) {
    let joined = '';
    for await (const s of content) {
      joined += s;
      requireValid(joined.length <= 2_000_000, 'Metadados XLSX excedem o tamanho suportado.');
    }
    return joined;
  }

  function attributes(tag) {
    return Object.fromEntries(Array.from(tag.matchAll(/([\w:]+)="([^"]*)"/g), m => [m[1], unescape(m[2])]));
  }

  async function* elementBatches(content, name) {
    const opening = new RegExp('<' + name + '(?=[\\s>])', 'g');
    const ending = '</' + name + '>';
    let pending = '';
    for await (const block of content) {
      pending += block;
      const batch = [];
      opening.lastIndex = 0;
      let consumed = 0, match;
      while ((match = opening.exec(pending))) {
        const start = match.index;
        const stop = pending.indexOf(ending, start);
        if (stop < 0) {
          consumed = start;
          break;
        }
        consumed = stop + ending.length;
        batch.push(pending.slice(start, consumed));
        opening.lastIndex = consumed;
      }
      if (!match) consumed = Math.max(consumed, pending.length - name.length - 2);
      pending = pending.slice(consumed);
      requireValid(pending.length < 2_000_000, 'Uma linha do Excel excede o tamanho suportado.');
      if (batch.length) yield batch;
    }
    opening.lastIndex = 0;
    requireValid(!opening.test(pending), 'O Excel contém uma linha incompleta.');
  }

  function richText(src) {
    let value = '';
    for (const match of src.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) value += unescape(match[1]);
    return value;
  }

  function nextCell(row, offset) {
    let start = row.indexOf('<c', offset);
    while (start !== -1 && !' > /\t\r\n'.includes(row[start + 2])) {
      start = row.indexOf('<c', start + 2);
    }
    return start;
  }

  function cells(row, strings) {
    const out = [];
    requireValid(row.indexOf('<f') === -1, 'O lote deve conter valores, sem fórmulas nas tabelas.');
    let start = nextCell(row, 0), previous = 0;
    while (start !== -1) {
      const close = row.indexOf('>', start);
      const tag = row.slice(start, close);
      const addr = tag.indexOf(' r="');
      let pos = previous + 1;
      if (addr !== -1) {
        pos = 0;
        for (let letter = addr + 4; letter < tag.length; letter++) {
          const code = tag.charCodeAt(letter);
          if (code < 65 || code > 90) break;
          pos = pos * 26 + code - 64;
        }
      }
      requireValid(pos > previous && pos <= 128, 'Coluna inválida, fora de ordem ou duplicada no Excel.');
      previous = pos;
      const empty = row[close - 1] === '/';
      const end = empty ? close : row.indexOf('</c>', close);
      requireValid(end >= close, 'Célula Excel incompleta.');
      const typeAt = tag.indexOf(' t="');
      const type = typeAt !== -1 ? tag.slice(typeAt + 4, tag.indexOf('"',typeAt + 4)) : '';
      let value;
      if (empty) value = '';
      else if (type==='inlineStr') {
        const startText=row.indexOf('<t',close+1);
        const before= row.indexOf('>',startText);
        const after=row.indexOf('</t>',before);
        requireValid(startText>close && after<end && after>before,'Texto Excel inválido.');
        const nextText=row.indexOf('<t',after+4);
        value=nextText>0 && nextText<end ? richText(row.slice(close+1,end)) : unescape(row.slice(before+1,after));
      } else {
        const v=row.indexOf('<v>',close+1);
        const e=v<end && v>=0 ? row.indexOf('</v>',v+3) : -1;
        const raw=e<0 ? '' : row.slice(v+3,e);
        if(type==='s') {
          requireValid(raw && strings[Number(raw)]!==undefined,'Índice de texto XLSX inválido.');
          value=strings[Number(raw)];
        } else if(type==='str' || type==='d') value=unescape(raw);
        else if(type==='b') {
          requireValid(raw==='0' || raw==='1','Booleano Excel inválido.');
          value=raw==='1';
        } else {
          requireValid(type!=='e' && Number.isFinite(Number(raw)),'Valor Excel inválido.');
          value=raw===''?'':Number(raw);
        }
      }
      out[pos - 1]=value;
      start=nextCell(row,end+1);
    }
    return out;
  }

  MI.fullWorkbook = {
    async isFullBatch(file) {
      if (!/\.xlsx$/i.test(file.name)) return false;
      try {
        const workbook = await zip(file);
        const meta = await string(workbook.content('xl/workbook.xml'));
        const names = new Set(Array.from(meta.matchAll(/<sheet\s[^>]+>/g), m => attributes(m[0]).name));
        return ['metadados', 'clientes', 'catalogo', 'geografia', 'operacao', 'matriz_integracao', 'gabarito_cenarios']
          .every(name => names.has(name)) &&
          ['pedidos', 'itens'].every(name => names.has(name) || names.has(name + '_01'));
      } catch (_) {
        return false;
      }
    },

    async open(file) {
      const workbook = await zip(file);
      const rel = await string(workbook.content('xl/_rels/workbook.xml.rels'));
      const meta = await string(workbook.content('xl/workbook.xml'));
      const refs = new Map();
      for (const link of rel.matchAll(/<Relationship\s[^>]+>/g)) {
        const a = attributes(link[0]);
        if (a.Type?.endsWith('/worksheet')) refs.set(a.Id, a.Target);
      }
      const sheets = new Map();
      for (const item of meta.matchAll(/<sheet\s[^>]+>/g)) {
        const a = attributes(item[0]);
        const target = refs.get(a['r:id']);
        const part = target?.startsWith('/') ? target.slice(1) : 'xl/' + target;
        requireValid(a.name && !sheets.has(a.name) && /^xl\/worksheets\/sheet\d+\.xml$/.test(part),
          'Referência de aba inválida no Excel.');
        sheets.set(a.name, part);
      }
      const shared = [];
      if (workbook.has('xl/sharedStrings.xml')) {
        for await (const batch of elementBatches(workbook.content('xl/sharedStrings.xml'), 'si')) {
          requireValid(shared.length + batch.length <= 4_500_000, 'O XLSX contém textos demais para o lote.');
          for (const si of batch) shared.push(richText(si));
        }
      }
      async function* rowBatches(name) {
        const source = sheets.get(name);
        requireValid(source, 'Aba ausente: ' + name);
        let expected = 1;
        for await (const batch of elementBatches(workbook.content(source), 'row')) {
          yield batch.map(row => {
            const address = /^<row\b[^>]*\br="(\d+)"/.exec(row)?.[1];
            requireValid(address === undefined || Number(address) === expected,
              'Linhas faltantes ou fora de ordem em ' + name + ': ' + expected);
            expected++;
            return cells(row, shared);
          });
        }
      }
      return {
        names: Array.from(sheets.keys()),
        rowBatches,
        async *rows(name) {
          for await (const batch of rowBatches(name)) yield* batch;
        }
      };
    }
  };
})(window.MI);
