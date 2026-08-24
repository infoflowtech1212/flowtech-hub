import { VaultView } from '@/components/VaultView';
import { VaultGate } from '@/components/VaultGate';

export default function VaultOpen() {
  return (
    <VaultGate scope="open">
      <VaultView scope="open" />
    </VaultGate>
  );
}
