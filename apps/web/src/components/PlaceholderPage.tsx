import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';
import { PageHeader, SectionCard } from './ui/Page';
import { EmptyState } from './ui/states';

/**
 * Clean scaffold for a feature that's navigable but whose content/create flow
 * is built out in a later step. Keeps the shell + routing real so we can wire
 * each feature one by one.
 */
export function PlaceholderPage({
  title,
  subtitle,
  icon,
  createLabel,
  note,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  createLabel?: string;
  note?: string;
}) {
  const Icon = icon;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          createLabel && (
            <button className="ft-btn-primary" title="Available in a later build step">
              <Plus className="h-4 w-4" /> {createLabel}
            </button>
          )
        }
      />
      <SectionCard>
        <EmptyState
          icon={<Icon className="h-5 w-5" />}
          title={`${title} is set up and ready to build out`}
          hint={note ?? 'The navigation and route are live. Content and create/add actions land in the next step.'}
        />
      </SectionCard>
    </div>
  );
}
