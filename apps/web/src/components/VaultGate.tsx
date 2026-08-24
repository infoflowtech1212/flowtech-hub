import { useState } from 'react';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import type { VaultScope } from '@flowtech/shared';
import { useSetVaultPin, useVaultPinStatus, useVerifyVaultPin } from '@/hooks/useIntranet';
import { Skeleton } from '@/components/ui/states';

const vaultLabel: Record<VaultScope, string> = { open: 'Open Vault', personal: 'Personal Vault' };

/**
 * Second security layer over a vault: the user must enter this vault's own
 * PIN every time the page opens. Open Vault and Personal Vault each have an
 * independent PIN — entering one does not unlock the other. Unlock state is
 * component-local — it resets on every mount/navigation, so leaving and
 * returning re-locks the vault.
 */
export function VaultGate({ scope, children }: { scope: VaultScope; children: React.ReactNode }) {
  const status = useVaultPinStatus(scope);
  const [unlocked, setUnlocked] = useState(false);

  if (status.isLoading) {
    return (
      <div className="mx-auto max-w-md pt-10">
        <Skeleton className="h-56" />
      </div>
    );
  }
  if (unlocked) return <>{children}</>;
  return <PinScreen scope={scope} isSet={status.data?.isSet ?? false} onUnlock={() => setUnlocked(true)} />;
}

function PinScreen({ scope, isSet, onUnlock }: { scope: VaultScope; isSet: boolean; onUnlock: () => void }) {
  const setPin = useSetVaultPin(scope);
  const verify = useVerifyVaultPin(scope);
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = setPin.isPending || verify.isPending;

  const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, 8);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) return setError('Enter a 4–8 digit PIN.');
    try {
      if (isSet) {
        const res = await verify.mutateAsync(pin);
        if (!res.ok) {
          setError('Incorrect PIN. Try again.');
          setPinValue('');
          return;
        }
        onUnlock();
      } else {
        if (pin !== confirm) return setError('PINs do not match.');
        await setPin.mutateAsync({ pin });
        onUnlock();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div className="mx-auto max-w-md pt-10">
      <div className="ft-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/12 text-accent-bright">
          {isSet ? <Lock className="h-7 w-7" /> : <ShieldCheck className="h-7 w-7" />}
        </div>
        <h1 className="text-lg font-bold text-content">
          {isSet ? `Enter your ${vaultLabel[scope]} PIN` : `Set a ${vaultLabel[scope]} PIN`}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {isSet
            ? `This PIN protects the ${vaultLabel[scope]}. Enter it to continue.`
            : `Create a 4–8 digit PIN for the ${vaultLabel[scope]}. It's independent from any other vault's PIN, and you'll enter it each time you open this page.`}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3 text-left">
          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-center text-sm text-danger">{error}</p>}
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            className="ft-input text-center text-lg tracking-[0.4em]"
            placeholder="••••"
            value={pin}
            onChange={(e) => setPinValue(onlyDigits(e.target.value))}
          />
          {!isSet && (
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              className="ft-input text-center text-lg tracking-[0.4em]"
              placeholder="Confirm PIN"
              value={confirm}
              onChange={(e) => setConfirm(onlyDigits(e.target.value))}
            />
          )}
          <button type="submit" className="ft-btn-primary w-full" disabled={pending}>
            <KeyRound className="h-4 w-4" />
            {pending ? 'Please wait…' : isSet ? 'Unlock' : 'Set PIN & unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}
