/* 10 Move Intelligence — configuração de produção (MODELO)
   -------------------------------------------------------------------------
   Copie este arquivo para config.js, preencha os valores e inclua
   <script src="config.js"></script> no index.html, logo antes de
   assets/js/core.js.

   Enquanto config.js não existir, a aplicação roda em modo local: sem login,
   com a troca de perfil servindo apenas para demonstração — e a interface
   diz isso ao usuário, em vez de fingir que há segurança.

   A chave anônima do Supabase é pública por projeto. Quem protege os dados é
   o Row Level Security de supabase/schema.sql, não o sigilo dessa chave.
   NUNCA coloque aqui a service_role key: ela ignora todas as políticas.
   ------------------------------------------------------------------------- */
window.MI_CONFIG = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseAnonKey: 'COLE-AQUI-A-CHAVE-ANON-PUBLICA',
  orgSlug: 'smoov'
};
