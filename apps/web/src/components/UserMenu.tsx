import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Moon, Sun, User as UserIcon } from 'lucide-react';
import type { UserProfile } from '@flowtech/shared';
import { Avatar } from './ui/Avatar';
import { useTheme } from '@/hooks/useTheme';
import { logout } from '@/lib/auth';

export function UserMenu({ user }: { user: UserProfile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-pill border border-line/10 py-1 pl-1 pr-3 transition-colors hover:border-line/20"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={user.displayName} src={user.photoUrl} size={28} />
        <span className="hidden text-sm font-medium sm:block">{user.givenName ?? user.displayName}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 animate-fade-up rounded-card border border-line/10 bg-elevated p-1 shadow-card"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-content">{user.displayName}</p>
            <p className="truncate text-xs text-muted">{user.mail}</p>
          </div>
          <div className="my-1 h-px bg-line/10" />
          <MenuItem
            icon={<UserIcon className="h-4 w-4" />}
            label="My profile"
            onClick={() => {
              setOpen(false);
              navigate('/profile');
            }}
          />
          <button
            role="menuitem"
            onClick={toggle}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-content hover:bg-line/5"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <div className="my-1 h-px bg-line/10" />
          <button
            role="menuitem"
            onClick={() => logout()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-content hover:bg-line/5"
    >
      {icon}
      {label}
    </button>
  );
}
