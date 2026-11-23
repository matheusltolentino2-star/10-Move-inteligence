# Contas de teste — projeto Supabase `10-move-intelligence`

> Contas internas de validação, com domínios inexistentes (`.local`).
> Nenhuma recebe e-mail. Apague-as antes de usar a plataforma com dados reais.

Criadas em 23/11/2026 para validar login, papéis e Row Level Security.

| E-mail | Papel | Perfil na interface |
|---|---|---|
| `admin@smoov.local` | `smoov_admin` | Administrador Smoov |
| `equipe@10move.local` | `tenmove_team` | Equipe 10 Move |
| `tecnico@smoov.local` | `tech_admin` | Administrador técnico |

## Definir a senha

A senha usada na validação não foi guardada em lugar nenhum, de propósito.
Para usar estas contas, defina uma senha sua no **SQL Editor** do Supabase:

```sql
update auth.users
   set encrypted_password = extensions.crypt('SUA-SENHA-AQUI', extensions.gen_salt('bf')),
       updated_at = now()
 where email = 'admin@smoov.local';
```

Ou, no painel: **Authentication → Users → ⋯ → Reset password**.

## O que foi verificado com elas

| Verificação | Smoov | 10 Move | Técnico |
|---|---|---|---|
| Papel lido do servidor | `smoov_admin` | `tenmove_team` | `tech_admin` |
| Importar bases | sim | **não** | **não** |
| Ver linhas individuais | sim | **não** | **não** |
| Editar catálogo | sim | **não** | **não** |
| Supressão de grupos pequenos | opcional | **sempre ativa** | **sempre ativa** |
| Aprovar indicador (escrita no banco) | permitida | **bloqueada pelo RLS** | **bloqueada pelo RLS** |
| Indicadores não aprovados | vê todos | **5 cartões bloqueados** | vê, com supressão |

Anônimo, sem sessão: 0 linhas em `organizations`, `memberships` e
`published_aggregates`; escrita recusada com
`new row violates row-level security policy`.

## Bug encontrado nesta validação

A primeira rodada mostrou os três usuários como `smoov_admin` na interface.
Causa: a política `mem_select` permite que cada membro veja **todos** os
vínculos da organização, e `carregarPapel()` pegava `linhas[0]` em vez do
vínculo do próprio usuário. O servidor seguia negando as escritas — o RLS
estava certo — mas a tela exibiria o papel errado e liberaria indicadores não
aprovados localmente.

Corrigido em `assets/js/auth-supabase.js` com `.eq('user_id', A.user.id)`.
É o tipo de falha que só aparece quando se testa com mais de um usuário na
mesma organização.

## Para apagar quando não precisar mais

```sql
delete from auth.users
 where email in ('admin@smoov.local', 'equipe@10move.local', 'tecnico@smoov.local');
```

Os vínculos em `public.memberships` saem junto, por `on delete cascade`.

## Para criar as contas reais

Painel do Supabase → **Authentication → Users → Add user**, com *Auto Confirm
User* marcado. Depois, vincular o papel conforme `supabase/schema.sql`,
seção 8. A senha fica com a pessoa — não defina senha por ela.
