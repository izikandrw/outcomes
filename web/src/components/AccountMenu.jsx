import { useEffect, useRef, useState } from 'react';
import AccountLogo from './AccountLogo.jsx';

export default function AccountMenu({ user, account, onSettings, onMembers, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !ref.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const choose = (action) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="ghost small account-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <AccountLogo account={account} size={20} />
        {account.name} ▾
      </button>
      {open && (
        <div className="account-menu-panel" role="menu">
          <div className="account-menu-user">
            <AccountLogo account={account} size={32} />
            <div>
              <div className="account-menu-name">{account.name}</div>
              {user.email}
            </div>
          </div>
          {user.role === 'admin' && (
            <>
              <button type="button" role="menuitem" onClick={choose(onSettings)}>
                Account settings
              </button>
              <button type="button" role="menuitem" onClick={choose(onMembers)}>
                Members
              </button>
            </>
          )}
          <button type="button" role="menuitem" onClick={choose(onSignOut)}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
