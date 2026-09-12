# TROPICALIA ATELIÊ

Vitrine de peças artesanais com atendimento direto pelo WhatsApp. Sem carrinho, checkout ou cobrança online.

## Decisão atual — 12/09/2026

**Firebase é o único backend do ateliê.** Mantidos o projeto `template-cd4a9`, Cloud Firestore e Firebase Authentication. Não há integração com Supabase nem alteração nos bancos de outros projetos.

## O que está implementado

- Fotos proporcionais e inteiras nos cartões e prévias.
- Detalhes da peça com galeria, miniaturas, pinça, arraste, toque duplo e zoom por teclado.
- Cadastro pelo celular: até seis fotos da galeria, escolha da capa, informações essenciais e prévia.
- Edição e exclusão de produtos, capa da vitrine, WhatsApp e Instagram pelo painel.
- Nenhum controle de publicação visível antes do acesso autorizado; formulários são limpos ao sair.
- Sessão por aba, saída após 30 minutos sem atividade e autenticação limitada a oito horas.
- Administrador identificado pela custom claim `tropicaliaAdmin: true`, emitida pelo Firebase Admin SDK. Uma conta comum autenticada não abre o painel.
- Validação de campos, formatos e conteúdo de arquivos; compressão de fotos e transações sem gravação offline.
- Regras do Firestore com leitura pública somente de `produtos` e `config/layout`, gravação exclusiva do administrador e validação dos registros.

As fotos permanecem no formato Base64 usado pelo projeto original, dentro dos documentos do Firestore, com limite e compressão adaptativa. Não é necessário adicionar Storage, outro banco ou novo plano. `catalogue.json` é apenas uma cópia estática pública para a primeira abertura e falhas de rede; não é um segundo banco.

## Estado da entrega

- Site anterior: https://tropicalia-atelie.vercel.app/
- Código com Firebase recuperado e revisado em 12/09/2026.
- Consulta de produção em 12/09 confirmou **cinco peças e nove fotos**. A cópia inicial foi atualizada sem gravar, excluir ou cadastrar nada no banco real.
- **17 testes passaram:** 13 de lógica e quatro cenários de regras no emulador, cobrindo visitante, usuário comum, administrador e entradas inválidas.
- **Regras e permissão de administrador ainda não aplicadas em produção.** O console Firebase não abriu neste ambiente e não há credencial administrativa disponível. Testes no emulador não validam as permissões atuais do banco real.
- Repositório oficial: https://github.com/brenosouzaa/Tropicalia-ateli-. A permissão de escrita da integração foi liberada e confirmada em 12/09/2026. O código completo, as imagens públicas, regras e testes estão reunidos neste repositório.
- A publicação desta revisão é registrada separadamente; um commit não comprova atualização do site.

## Concluir a configuração segura do Firebase

**Antes de ativar este novo painel, autorize a conta existente.** Sem a claim específica, o painel permanece bloqueado, mesmo com e-mail e senha corretos. Não há senha nova nem cadastro público de administrador.

1. No Firebase Authentication do projeto `template-cd4a9`, identifique o UID da conta existente que administra o ateliê. Não use o e-mail da conta GitHub por suposição.
2. Em uma máquina confiável, configure Google Application Default Credentials com acesso administrativo a esse projeto. Não compartilhe senhas, chaves privadas, arquivos de conta de serviço ou tokens no chat/GitHub.
3. Instale as dependências com `npm ci` e execute `node scripts/grant-admin.mjs UID_DA_CONTA_EXISTENTE`. O script preserva as demais claims e concede somente `tropicaliaAdmin` no projeto do ateliê.
4. Revise as regras atuais antes de substituí-las. Este arquivo atende à vitrine e nega outras coleções por padrão. Depois de confirmar que o projeto só serve a esse ateliê, aplique com `firebase deploy --only firestore:rules --project template-cd4a9`.
5. Os índices para campos de fotos estão em `firestore.indexes.json`; revise os índices existentes antes de aplicar esse arquivo, para preservar qualquer índice independente.
6. Saia e entre novamente no site para renovar a sessão. Confira publicar, editar, contatos e sair com a conta real.

As regras são o controle de segurança do banco. Ocultar controles ou verificar a claim apenas no navegador não substitui aplicar as regras.

Referências: [custom claims](https://firebase.google.com/docs/auth/admin/custom-claims) e [regras do Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions).

## Executar e testar

```sh
npm ci
npm test
npm run check
npm run test:rules
npm run dev
```

O teste de regras exige Java e usa somente `demo-tropicalia` no emulador local. Não usa credenciais nem documentos de produção. O comando de desenvolvimento abre o servidor em `http://localhost:4173`.

## Publicação

O diretório `dist/` contém os arquivos estáticos prontos. Na Vercel: **Framework Other**, instalação/build vazios e **Output Directory `dist`**. `vercel.json` configura essas opções e os cabeçalhos de segurança.

```sh
vercel --prod
```

Para a Cloudflare Pages, publique apenas `dist/` com o projeto da marca. O `_headers` já contém a política de conteúdo. Nunca envie credenciais administrativas ao frontend.

A configuração pública web do Firebase não é um segredo. As ferramentas administrativas, regras, testes e este README ficam fora de `dist/` e não são publicados como páginas.

`.openai/hosting.json` identifica a cópia de trabalho, não adiciona banco e não precisa ser enviado à Vercel/Cloudflare.
