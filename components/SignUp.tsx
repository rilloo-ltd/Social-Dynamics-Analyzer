
'use client'

import React, { useState } from 'react';
import { signUpWithEmail } from '../lib/auth';

const SignUp = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { error } = await signUpWithEmail(email, password);
    if (error) {
      setError(error);
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
