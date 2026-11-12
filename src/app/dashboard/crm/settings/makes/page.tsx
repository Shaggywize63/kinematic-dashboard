'use client';
import NamedListManager from '../../../../../components/crm/settings/NamedListManager';
import { crmMakes } from '../../../../../lib/crmApi';

// Settings -> Makes (connected-B2B): the manufacturers the products are bought from. A brand is not a make.
export default function MakesSettingsPage() {
  return (
    <NamedListManager
      noun="make" nounPlural="makes" title="Makes"
      description="The manufacturers you buy from. A make is who makes the product; the brand it is sold under is kept separately in Brands."
      emptyText="No makes yet. Add the manufacturers you buy from."
      namePlaceholder="Make name (e.g. Festo)"
      api={crmMakes}
    />
  );
}
