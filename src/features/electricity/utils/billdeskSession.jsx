import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import toast from 'react-hot-toast';
import { apiBase } from '../api/servicesApi.js';

function CaptchaModal({ sessionData, resolve, cleanup }) {
  const [captcha, setCaptcha] = useState('');

  // Prevent scrolling when open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!captcha || captcha.length !== 6) {
      toast.error('Enter valid 6-digit captcha');
      return;
    }
    
    const finalSession = {
      ...sessionData,
      captcha,
      timestamp: Date.now()
    };
    
    // Store in localStorage for 1 hour
    localStorage.setItem('billdesk_session', JSON.stringify(finalSession));
    
    resolve(finalSession);
    cleanup();
  };

  const handleCancel = () => {
    resolve(null); // Resolving null cancels the refresh action
    cleanup();
  };

  return (
    <div className="overlay overlay--center" onClick={e => e.target === e.currentTarget && handleCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" style={{ width: '320px' }}>
        <h2 className="dialog__title">BillDesk Authentication</h2>
        <p className="dialog__desc" style={{ marginBottom: '16px' }}>
          To fetch fresh billing data securely, please solve this Captcha. It will be valid for 1 hour.
        </p>
        
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '8px', textAlign: 'center', minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img 
                src={`${apiBase()}/billdesk/captcha-image?cookie=${encodeURIComponent(sessionData.cookie)}`} 
                alt="Captcha" 
                style={{ mixBlendMode: 'darken', maxWidth: '100%' }}
                onError={(e) => { e.target.style.display = 'none'; toast.error('Failed to load image'); }}
              />
            </div>
            
            <div className="field">
              <label htmlFor="captcha" className="field__label">Captcha Code</label>
              <input
                id="captcha"
                type="text"
                className="field__input"
                value={captcha}
                onChange={e => setCaptcha(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter numbers"
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>
          
          <div className="dialog__footer" style={{ marginTop: '24px' }}>
            <button type="button" className="btn btn--ghost" onClick={handleCancel}>Cancel</button>
            <button type="submit" className="btn btn--primary">Submit</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export async function getValidSession() {
  // 1. Check local storage
  const stored = localStorage.getItem('billdesk_session');
  if (stored) {
    try {
      const session = JSON.parse(stored);
      // Check if valid for 1 hour (3600000 ms)
      if (Date.now() - session.timestamp < 3600000) {
        return session;
      }
    } catch (e) {
      // ignore parse error
    }
  }

  // 2. Fetch new reqtoken and cookie
  let sessionData;
  const loadToast = toast.loading('Connecting to BillDesk...');
  try {
    const res = await fetch(`${apiBase()}/billdesk/init-session`);
    const json = await res.json();
    toast.dismiss(loadToast);
    if (!json.ok) throw new Error(json.error);
    sessionData = json;
  } catch (err) {
    toast.dismiss(loadToast);
    toast.error('Failed to initialize BillDesk session');
    return null;
  }

  // 3. Present Modal and wait for user
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const cleanup = () => {
      root.unmount();
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    };

    root.render(
      <CaptchaModal 
        sessionData={sessionData} 
        resolve={resolve} 
        cleanup={cleanup} 
      />
    );
  });
}
