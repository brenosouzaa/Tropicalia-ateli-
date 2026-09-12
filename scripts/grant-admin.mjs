// Run only in a trusted local/admin environment using Google Application Default Credentials.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const projectId = 'template-cd4a9';
const uid = process.argv[2];
if (!uid || uid.length > 128 || process.argv.length !== 3) {
  console.error('Uso: node scripts/grant-admin.mjs UID_DO_ADMIN_EXISTENTE');
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const user = await auth.getUser(uid);
if (user.disabled || !user.providerData.some(provider => provider.providerId === 'password')) {
  throw new Error('Escolha uma conta existente, ativa, com acesso por e-mail e senha.');
}
await auth.setCustomUserClaims(uid, { ...user.customClaims, tropicaliaAdmin: true });
console.log('Administrador autorizado no Firebase do ateliê. Saia e entre novamente no site.');
