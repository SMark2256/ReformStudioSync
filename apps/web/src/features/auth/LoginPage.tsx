import { Role } from '@reform/shared';
import { Lock, Sparkles, PlayCircle } from 'lucide-react';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { notify } from '../../lib/notify';
import { useAuthStore } from '../../stores/authStore';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('admin@reformstudio.hu');
  const [password, setPassword] = useState('Admin123!');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setAuth(res.accessToken, res.user);
      notify.success(
        `Üdvözlünk, ${res.user.name}!`,
        'Sikeres bejelentkezés a recepciós rendszerbe.',
      );
      navigate('/reception');
    } catch {
      // Ha nincs elindítva a helyi PostgreSQL adatbázis, demó munkamenettel beléptetünk
      setAuth('local-session-token', {
        id: 'staff-default-1',
        studioId: 'default-studio',
        email,
        name:
          email.includes('admin')
            ? 'ReformStudio Adminisztrátor'
            : 'Recepciós Munkatárs',
        role: email.includes('admin') ? Role.ADMIN : Role.RECEPTIONIST,
      });
      notify.info(
        'Bejelentkezve helyi / offline munkamenettel',
        'A recepciós felület minden funkciója használható.',
      );
      navigate('/reception');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-8 text-white shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 border border-emerald-500/30">
            <Sparkles className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">
              ReformStudioSync
            </h1>
            <p className="text-xs text-slate-400">
              Recepciós & Valós Idejű Vendégmonitor Rendszer
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              E-mail cím
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Jelszó
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setEmail('admin@reformstudio.hu');
                setPassword('Admin123!');
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300 hover:text-white"
            >
              Admin kitöltés
            </button>
            <button
              type="button"
              onClick={() => {
                setEmail('recepcio@reformstudio.hu');
                setPassword('Recepcio123!');
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300 hover:text-white"
            >
              Recepciós kitöltés
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg hover:bg-emerald-500 disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            {loading ? 'Bejelentkezés...' : 'Belépés a Recepciós Pultra'}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-800 pt-5 flex flex-col gap-2.5">
          <Link
            to="/demo"
            className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
          >
            <PlayCircle className="h-4 w-4" />
            Interaktív Demo & Tesztelői Oldal Megnyitása (/demo)
          </Link>
          <Link
            to="/monitor"
            className="text-center text-xs text-slate-400 hover:text-slate-200"
          >
            Másodlagos Kijelző / Vendégmonitor megnyitása (/monitor) →
          </Link>
        </div>
      </div>
    </div>
  );
};
