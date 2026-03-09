
'use client'

import React, { useState } from 'react';
import { signInWithEmail, signInWithGoogle } from '../lib/auth';
import { analytics, MixpanelEvents } from '@/lib/mixpanel';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleEmailSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { error } = await signInWithEmail(email, password);
    if (error) {
      setError(error);
      analytics.track(MixpanelEvents.LOGIN + ' Failed', { method: 'email', error });
    } else {
      analytics.track(MixpanelEvents.LOGIN, { method: 'email' });
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error);
      analytics.track(MixpanelEvents.LOGIN + ' Failed', { method: 'google', error });
    } else {
      analytics.track(MixpanelEvents.LOGIN, { method: 'google' });
    }
  };

  return (
    <div>
      <form onSubmit={handleEmailSignIn}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <button type="submit" className="cursor-pointer">Sign In with Email</button>
      </form>
      <button onClick={handleGoogleSignIn} className="cursor-pointer">Sign In with Google</button>
      {error && <p>{error}</p>}
    </div>
  );
};

export default Login;
