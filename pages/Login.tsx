import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import { addUser, getAllUsers } from '../services/mockDb';
import { User } from '../types';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isRegister) {
      // Simple registration logic
      const users = getAllUsers();
      if (users.find(u => u.email === email)) {
        setError('Email already exists');
        return;
      }
      
      const newUser: User = {
        id: crypto.randomUUID(),
        username: email.split('@')[0],
        email,
        password, // In a real app, hash this!
        role: 'user',
        status: 'active',
        createdAt: new Date().toISOString()
      };
      
      addUser(newUser);
      localStorage.setItem('paydone_session_token', 'mock-token-' + newUser.id);
      localStorage.setItem('paydone_active_user', newUser.id);
      navigate('/dashboard');
    } else {
      // Simple login logic
      const users = getAllUsers();
      const user = users.find(u => u.email === email && u.password === password);
      
      if (user) {
        localStorage.setItem('paydone_session_token', 'mock-token-' + user.id);
        localStorage.setItem('paydone_active_user', user.id);
        navigate('/dashboard');
      } else {
        // For demo purposes, allow login if no users exist yet (first run)
        if (users.length === 0) {
             const newUser: User = {
                id: crypto.randomUUID(),
                username: email.split('@')[0],
                email,
                password,
                role: 'admin',
                status: 'active',
                createdAt: new Date().toISOString()
            };
            addUser(newUser);
            localStorage.setItem('paydone_session_token', 'mock-token-' + newUser.id);
            localStorage.setItem('paydone_active_user', newUser.id);
            navigate('/dashboard');
            return;
        }
        setError('Invalid credentials');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-8 bg-brand-600 text-white text-center">
          <h1 className="text-3xl font-bold mb-2">Paydone.id</h1>
          <p className="text-brand-100">Sistem Pelunasan Paling Cerdas</p>
        </div>
        
        <div className="p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </h2>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                  placeholder="name@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-brand-600 text-white py-2.5 rounded-lg font-medium hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
            >
              {isRegister ? 'Sign Up' : 'Sign In'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-600">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => setIsRegister(!isRegister)}
              className="text-brand-600 font-medium hover:underline"
            >
              {isRegister ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
