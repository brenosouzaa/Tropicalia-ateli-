// This claim is issued only by a trusted Firebase administrator.
// Firestore rules repeat this condition; UI checks are never the security boundary.
export const MAX_SESSION_SECONDS = 8 * 60 * 60;
export function allowedAdminSession(user, claims, nowSeconds = Date.now() / 1000) {
  return Boolean(user && !user.isAnonymous && claims?.tropicaliaAdmin === true
    && claims.firebase?.sign_in_provider === 'password'
    && Number.isFinite(claims.auth_time)
    && claims.auth_time <= nowSeconds + 60
    && nowSeconds - claims.auth_time <= MAX_SESSION_SECONDS);
}
