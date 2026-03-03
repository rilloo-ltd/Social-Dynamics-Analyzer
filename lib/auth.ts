
import { auth } from "./firebase";
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    GoogleAuthProvider, 
    signInWithPopup,
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
    const result = await signInWithPopup(auth, provider);
    return { user: result.user };
  } catch (error) {
    const authError = error as AuthError;
    return { error: authError.message };
  }
};

export const logOut = async (): Promise<{error?: string}> => {
  try {
    await signOut(auth);
    return {};
  } catch (error) {
    const authError = error as AuthError;
    return { error: authError.message };
  }
};
