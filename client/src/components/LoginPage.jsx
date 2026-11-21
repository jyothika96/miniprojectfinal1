import React, { useState } from 'react';
import { api } from '../api';
import { Activity, User, Lock, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';

export default function LoginPage({ onLoginSuccess }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [portal, setPortal] = useState('staff'); // 'staff' | 'public'

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await api.login({ email: identifier.trim(), password });
      if (response.success && response.user) {
        const isPublicAccount = response.user.role === 'public';
        if (portal === 'public' && !isPublicAccount) {
          api.logout();
          throw new Error('This is a staff account. Please use the Healthcare staff option.');
        }
        if (portal === 'staff' && isPublicAccount) {
          api.logout();
          throw new Error('This is a public account. Please use the Public dashboard option.');
        }
        onLoginSuccess(response.user);
      }
    } catch (err) {
      setError(err.message || 'Sign-in failed. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-brand">
        <div className="brand-row">
          <div className="brand-icon">
            <Activity size={19} />
          </div>
          <div className="brand-title">Community Disease Surveillance</div>
        </div>

        <svg className="login-pulse" viewBox="0 0 800 150" preserveAspectRatio="none" aria-hidden="true">
          <polyline
            points="0,95 140,95 180,95 205,40 235,135 262,70 285,95 420,95 460,95 485,55 510,120 532,95 800,95"
            fill="none"
            stroke="#3d9097"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="login-brand-body">
          <h1>Early warning for community health threats</h1>
          <p>
            Collect facility case reports, detect threshold breaches and coordinate field investigations in one
            place.
          </p>
        </div>
        <div className="login-brand-foot">Epidemiology Unit · Authorized personnel only</div>
      </section>

      <section className="login-form-side">
        <div className="login-card">
          <h2>Sign in</h2>
          <p className="lead">Choose how you are signing in.</p>

          <div className="portal-switch" role="radiogroup" aria-label="Sign-in type">
            <button type="button" role="radio" aria-checked={portal === 'staff'} className={`portal-option ${portal === 'staff' ? 'active' : ''}`} onClick={() => { setPortal('staff'); setError(null); }}>
              <strong>Healthcare staff</strong>
              <span>Manage and share data</span>
            </button>
            <button type="button" role="radio" aria-checked={portal === 'public'} className={`portal-option ${portal === 'public' ? 'active' : ''}`} onClick={() => { setPortal('public'); setError(null); }}>
              <strong>Public dashboard</strong>
              <span>View-only access</span>
            </button>
          </div>

          {error && (
            <div className="banner banner-error" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-id">
                Username or email
              </label>
              <div className="input-icon">
                <User size={16} />
                <input
                  id="login-id"
                  type="text"
                  className="form-control"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="login-pw">
                Password
              </label>
              <div className="input-icon has-reveal">
                <Lock size={16} />
                <input
                  id="login-pw"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon reveal-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.7rem' }} disabled={loading}>
              <LogIn size={16} />
              <span>{loading ? 'Signing in…' : portal === 'public' ? 'Open public dashboard' : 'Sign in'}</span>
            </button>
          </form>

          <p className="login-note">
            {portal === 'public' ? 'Public accounts can view the dashboard only and cannot add or change any data. ' : ''}This system is for public health surveillance. Alerts indicate statistical signals that need human
            verification, not clinical diagnoses.
          </p>
        </div>
      </section>
    </div>
  );
}
