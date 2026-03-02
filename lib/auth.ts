
import { auth } from "./firebase";
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    GoogleAuthProvider, 
    signInWithRedirect,
    getRedirectResult,
    User,
    AuthError
} from "firebase/auth";

interface AuthResult {
    user?: User | null;
    error?: string;
}

export const signUpWithEmail = async (email: string, password: string): Promise<AuthResult> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user };
  } catch (error) {
    const authError = error as AuthError;
    return { error: authError.message };
  }
};

export const signInWithEmail = async (email: string, password: string): Promise<AuthResult> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user };
  } catch (error) {
    const authError = error as AuthError;
    return { error: authError.message };
  }
};

export const signInWithGoogle = async (): Promise<AuthResult> => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithRedirect(auth, provider);
    return {};
  } catch (error) {
    const authError = error as AuthError;
    return { error: authError.message };
  }
};

export const handleRedirectResult = async (): Promise<AuthResult> => {
    try {
        const result = await getRedirectResult(auth);
        if (result) {
            return { user: result.user };
        }
        return { user: null };
    } catch (error) {
        const authError = error as AuthError;
        return { error: authError.message };
    }
}

export const logOut = async (): Promise<{error?: string}> => {
  try {
    await signOut(auth);
    return {};
  } catch (error) {
    const authError = error as AuthError;
    return { error: authError.message };
  }
};
