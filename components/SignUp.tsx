
'use client'

import React, { useState } from 'react';
import { signUpWithEmail } from '../lib/auth';
import { analytics, MixpanelEvents } from '@/lib/mixpanel';

const SignUp = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { error } = await signUpWithEmail(email, password);
    if (error) {
      setError(error);
      analytics.track(MixpanelEvents.SIGNUP + ' Failed', { error });
    } else {
      analytics.track(MixpanelEvents.SIGNUP, { method: 'email' });
    }
  };

  return (
    <div>
      <form onSubmit={handleSignUp}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <button type="submit" className="cursor-pointer">Sign Up</button>
      </form>
      {error && <p>{error}</p>}
    </div>
  );
};

export default SignUp;
