import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, doc, onSnapshot, getDocFromServer, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, onIdTokenChanged, getIdTokenResult, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence, inMemoryPersistence } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { validateProductWrite, validateLayoutWrite, MAX_DOCUMENT_BYTES } from './core.mjs';
import { allowedAdminSession } from './access-policy.mjs';

// Public web-app configuration retained from the existing storefront.
// Authentication and Firestore security rules, not this configuration, authorize writes.
const app = initializeApp({
  apiKey: 'AIzaSyDRJBkm3RX1kEFzRyBdikL2-IfC2YKmjw4',
  authDomain: 'template-cd4a9.firebaseapp.com',
  projectId: 'template-cd4a9',
  storageBucket: 'template-cd4a9.firebasestorage.app',
  messagingSenderId: '144653292955',
  appId: '1:144653292955:web:864cddeaca233285a7bd3e',
  measurementId: 'G-L6HFBP6N93'
});
const db = getFirestore(app);
const auth = getAuth(app);
// Use a tab-scoped session rather than leaving an admin login on this device.
const persistenceReady = setPersistence(auth, browserSessionPersistence).catch(() => setPersistence(auth, inMemoryPersistence));
export const observeAuth = callback => onIdTokenChanged(auth, async user => {
  await persistenceReady;
  if (!user) { if (!auth.currentUser) callback(null); return; }
  try {
    const { claims } = await getIdTokenResult(user);
    if (auth.currentUser !== user) return;
    if (!allowedAdminSession(user, claims)) { await signOut(auth); callback(null); return; }
    callback(user);
  } catch { callback(null); }
});
export const newProductId = () => doc(collection(db, 'produtos')).id;
export async function login(email, password) {
  await persistenceReady;
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  const { claims } = await getIdTokenResult(result.user);
  if (!allowedAdminSession(result.user, claims)) { await signOut(auth); throw new Error('Esta conta não tem permissão de administrador do ateliê.'); }
  return result;
}
export const logout = () => signOut(auth);
export function subscribeProducts(onData, onError) {
  return onSnapshot(collection(db, 'produtos'), { includeMetadataChanges: true }, snapshot => {
    if (!snapshot.metadata.fromCache) onData(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
  }, onError);
}
export function subscribeLayout(onData, onError) {
  return onSnapshot(doc(db, 'config', 'layout'), snapshot => {
    if (snapshot.exists()) onData(snapshot.data());
  }, onError);
}
export async function readProduct(id) {
  const snap = await getDocFromServer(doc(db, 'produtos', id));
  if (!snap.exists()) throw new Error('Esta peça não está mais na vitrine. Atualize a página.');
  return { ...snap.data(), id: snap.id };
}
async function requireAccess() {
  await persistenceReady;
  const user = auth.currentUser;
  if (!user) throw new Error('Sua sessão terminou. Entre novamente para salvar.');
  if (!navigator.onLine) throw new Error('Você está sem conexão. Suas alterações continuam aqui; tente novamente quando a internet voltar.');
  const { claims } = await getIdTokenResult(user, true);
  if (auth.currentUser !== user || !allowedAdminSession(user, claims)) throw new Error('Sua sessão terminou. Entre novamente para salvar.');
  return user;
}
function validId(id) { if (typeof id !== 'string' || !/^[a-z\d_-]{1,128}$/i.test(id)) throw new Error('Identificador de peça inválido.'); }
function stillSignedIn(user) { if (auth.currentUser !== user) throw new Error('Sua sessão terminou. Entre novamente para salvar.'); }
function checkSize(data) { if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_DOCUMENT_BYTES) throw new Error('As fotos ficaram muito grandes. Reduza a quantidade e tente novamente.'); }
export async function saveProduct(id, data, editing) {
  const user = await requireAccess(); validId(id); validateProductWrite(data);
  // A stable id plus a transaction makes retries idempotent and avoids queued offline writes.
  const ref = doc(db, 'produtos', id);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    stillSignedIn(user);
    if (editing && !snapshot.exists()) throw new Error('Esta peça foi excluída. Feche o cadastro e atualize a vitrine.');
    if (!editing && snapshot.exists()) {
      const existing = snapshot.data();
      if (!Object.keys(data).every(key => JSON.stringify(existing[key]) === JSON.stringify(data[key]))) throw new Error('Esta peça já existe. Abra a edição da peça para continuar.');
      return;
    }
    checkSize({ ...(snapshot.exists() ? snapshot.data() : {}), ...data });
    transaction.set(ref, { ...data, date: snapshot.exists() ? snapshot.data().date || serverTimestamp() : serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  });
}
export async function deleteProduct(id) {
  const user = await requireAccess(); validId(id);
  await runTransaction(db, async transaction => {
    const ref = doc(db, 'produtos', id);
    await transaction.get(ref);
    stillSignedIn(user);
    transaction.delete(ref);
  });
}
export async function saveLayout(data) {
  const user = await requireAccess(); validateLayoutWrite(data);
  await runTransaction(db, async transaction => {
    const ref = doc(db, 'config', 'layout');
    const snapshot = await transaction.get(ref);
    stillSignedIn(user); checkSize({ ...(snapshot.exists() ? snapshot.data() : {}), ...data });
    transaction.set(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  });
}
