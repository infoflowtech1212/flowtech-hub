import { VaultView } from '@/components/VaultView';
import { VaultGate } from '@/components/VaultGate';

export default function VaultPersonal() {
  return (
    <VaultGate>
      <VaultView scope="personal" />
    </VaultGate>
  );
}
