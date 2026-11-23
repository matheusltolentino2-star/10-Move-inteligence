# Publicar o 10 Move Intelligence na internet

Estado atual, sem rodeios:

| Peça | Situação |
|---|---|
| Aplicação como Artifact | **Pronta**, URL HTTPS, modo demonstração sem login |
| Projeto Supabase | **Criado** — `10-move-intelligence`, região sa-east-1, plano gratuito, US$ 0,00/mês |
| Esquema, RLS e auditoria | **Aplicados e verificados** — 5 tabelas, 10 políticas, 0 alertas de segurança |
| Organização `smoov` | **Criada** |
| Autenticação na aplicação | **Ligada** — `config.js` existe, login exigido |
| Usuários e papéis | **Falta** — depende de você criar as contas |
| Deploy na Vercel | **Falta** — o conector da Vercel não faz deploy |

Verificações feitas, não apenas afirmadas:

- Anônimo lê **0 linhas** de `organizations`, `memberships` e
  `published_aggregates`, mesmo havendo dados.
- Tentativa de escrita anônima é recusada:
  `new row violates row-level security policy`.
- Cabeçalhos de produção (CSP, HSTS) testados localmente: **zero violações**,
  com Chart.js, SheetJS, jsPDF, worker do pdf.js e IndexedDB funcionando.

---

## O que já está pronto

| Arquivo | Função |
|---|---|
| `index.html` + `assets/` | Aplicação estática completa, sem build |
| `vercel.json` | Headers de segurança, CSP, HSTS e cache |
| `supabase/schema.sql` | Organizações, papéis, indicadores aprovados, agregados publicados, auditoria, tudo com RLS negando por padrão |
| `assets/js/auth-supabase.js` | Login, sessão, leitura de papel e publicação de agregados |
| `config.example.js` | Modelo de configuração |

A aplicação **não precisa de build**: é HTML, CSS e JavaScript clássico.
Qualquer hospedagem estática serve — Vercel, Netlify, Cloudflare Pages,
GitHub Pages ou um bucket S3.

---

## Por que a Vercel ainda depende de você

O conector do Supabase tem `create_project` e `apply_migration` — por isso o
banco inteiro foi criado e configurado daqui. Já o conector da Vercel
**não tem ferramenta de deploy**: ele lista projetos e lê deployments. Não há
`vercel` CLI nem token nesta máquina.

Então o deploy é um passo seu. São dois minutos no painel.

---

## Caminho A — Vercel pelo painel (mais rápido, ~10 minutos)

1. Suba esta pasta para um repositório no GitHub.
2. Em <https://vercel.com/new>, importe o repositório.
3. Em *Framework Preset* escolha **Other**. Deixe *Build Command* vazio e
   *Output Directory* como `.`.
4. Deploy. Você recebe uma URL `https://<projeto>.vercel.app`.

Pronto: aplicação pública, funcionando, com a base demonstrativa. Ainda **sem
login** — qualquer pessoa com o link vê os dashboards demonstrativos. Para dados
reais, siga o Caminho B antes de divulgar o endereço.

## Caminho A' — Vercel por linha de comando

Precisa de um token em <https://vercel.com/account/tokens>:

```powershell
npx vercel@latest deploy --prod --yes --token SEU_TOKEN
```

Rode o comando dentro desta pasta. Não guarde o token em arquivo do projeto.

---

## Caminho B — Usuários e papéis (único passo que falta no banco)

O projeto, o esquema, o RLS e a organização `smoov` **já existem**. Falta
cadastrar as pessoas.

### 1. Criar os usuários

No painel do Supabase, em **Authentication → Users → Add user**, crie uma
conta para cada pessoa. Use *Auto Confirm User* para evitar o passo de
confirmação por e-mail.

### 2. Dar o papel a cada uma

Copie o UUID de cada usuário e rode no **SQL Editor**:

```sql
insert into public.memberships (org_id, user_id, role)
  select o.id, 'UUID-DO-USUARIO', 'smoov_admin'
    from public.organizations o where o.slug = 'smoov'
  on conflict (org_id, user_id) do update set role = excluded.role;
```

Papéis disponíveis: `smoov_admin`, `tenmove_team`, `tech_admin`.

Sem vínculo, o login funciona mas nenhuma seção abre, e a aplicação explica o
motivo. Isso é o comportamento correto de negar por padrão, não um erro.

Se preferir, me passe os UUIDs que eu rodo o comando.

### 3. A configuração já está no lugar

`config.js` já aponta para o projeto, e `assets/js/auth-supabase.js` o carrega
sozinho. Não é preciso editar o `index.html`.

Um detalhe de projeto: o `index.html` é o mesmo nos dois ambientes. Onde
`config.js` existe (Vercel, localhost), a aplicação exige login; onde não
existe (o Artifact publicado), ela segue em modo demonstração. Foi assim que o
link de apresentação continuou aberto sem duplicar código.

### 4. Depois do deploy

A partir daí:

- nenhuma seção abre sem sessão válida;
- o perfil vem do servidor e **não pode ser trocado na interface**;
- a equipe 10 Move só enxerga indicadores aprovados, pela política de RLS —
  não por uma regra de JavaScript que dá para contornar;
- toda publicação de agregado é recusada pelo banco se o menor grupo for
  inferior ao k, se o indicador não estiver aprovado, ou se já houver 20
  recortes diferentes do mesmo indicador no dia (proteção contra reconstrução
  por diferenciação).

---

## O que continua valendo depois de publicado

**A planilha não sobe para o servidor.** Mesmo com Supabase ativo, o arquivo de
clientes continua sendo lido no navegador com FileReader. O banco guarda
permissões, aprovações, agregados publicados e auditoria — nunca registros
individuais. Isso é uma decisão de arquitetura, não uma limitação.

## Antes de usar com dados reais da Smoov

O software cobre a parte técnica. O resto não é código:

- base legal para o tratamento e para o compartilhamento entre as duas empresas;
- contrato de operador/controlador conforme a LGPD;
- relatório de impacto à proteção de dados, dado que há dados pessoais;
- revisão de quem recebe `smoov_admin` — esse papel vê registros individuais;
- definição de prazo de retenção e de descarte.

Publicar o endereço antes disso expõe dados pessoais de terceiros.
