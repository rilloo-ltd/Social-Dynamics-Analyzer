
import { auth, firebaseConfig } from "./firebase";
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    GoogleAuthProvider, 
    signInWithPopup,
    User,
    AuthError
} from "firebase/auth";
import { analytics, MixpanelEvents } from './mixpanel';

interface AuthResult {
    user?: User | null;
    error?: string;
}

const TEST_AUTH_SESSION_KEY = 'doda_test_auth_email';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const isTestAuthHost = (): boolean => {
  if (typeof window === 'undefined') return false;

  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname.endsWith('.lhr.life') ||
    hostname.endsWith('.loca.lt')
  );
};

const persistTestAuthSession = (email: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TEST_AUTH_SESSION_KEY, normalizeEmail(email));
};

export const getStoredTestAuthEmail = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TEST_AUTH_SESSION_KEY);
};

export const clearStoredTestAuthEmail = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TEST_AUTH_SESSION_KEY);
};

const signInWithEmailViaRest = async (email: string, password: string): Promise<boolean> => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  return response.ok;
};

const getCanonicalLocalhostUrl = (): string | null => {
  if (typeof window === 'undefined') return null;

  const currentUrl = new URL(window.location.href);
  const localAliases = new Set(['127.0.0.1', '0.0.0.0', '[::1]']);

  if (!localAliases.has(currentUrl.hostname)) {
    return null;
  }

  currentUrl.hostname = 'localhost';
  return currentUrl.toString();
};

export const redirectToCanonicalLocalhost = (): boolean => {
  const canonicalUrl = getCanonicalLocalhostUrl();

  if (!canonicalUrl) {
    return false;
  }

  window.location.replace(canonicalUrl);
  return true;
};

const getFriendlyAuthError = (authError: AuthError): string => {
  if (authError.code === 'auth/unauthorized-domain') {
    return 'Google sign-in is unavailable on this local address. Open the app on localhost and try again, or use email/password.';
  }

  return authError.message;
};

export const signUpWithEmail = async (email: string, password: string): Promise<AuthResult> => {
  const normalizedEmail = normalizeEmail(email);

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    return { user: userCredential.user };
  } catch (error) {
    const authError = error as AuthError;
    return { error: getFriendlyAuthError(authError) };
  }
};

export const signInWithEmail = async (email: string, password: string): Promise<AuthResult> => {
  const normalizedEmail = normalizeEmail(email);

  try {
    clearStoredTestAuthEmail();
    const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    return { user: userCredential.user };
  } catch (error) {
    const authError = error as AuthError;

    if (authError.code === 'auth/invalid-credential' && isTestAuthHost()) {
      try {
        const restSignInSucceeded = await signInWithEmailViaRest(normalizedEmail, password);

        if (restSignInSucceeded) {
          persistTestAuthSession(normalizedEmail);
          return { user: null };
        }
      } catch {
        // Fall back to the original Firebase error below.
      }
    }

    return { error: getFriendlyAuthError(authError) };
  }
};

export const signInWithGoogle = async (): Promise<AuthResult> => {
  if (redirectToCanonicalLocalhost()) {
    return {};
  }

  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return { user: result.user };
  } catch (error) {
    const authError = error as AuthError;
    return { error: getFriendlyAuthError(authError) };
  }
};

export const logOut = async (): Promise<{error?: string}> => {
  try {
    analytics.track(MixpanelEvents.LOGOUT);
    analytics.reset(); // Clear Mixpanel user data on logout
    clearStoredTestAuthEmail();
    await signOut(auth);
    return {};
  } catch (error) {
    const authError = error as AuthError;
    if (auth.currentUser) {
      return { error: getFriendlyAuthError(authError) };
    }
    return {};
  }
};
