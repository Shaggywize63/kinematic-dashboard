'use client';
import NamedListManager from '../../../../../components/crm/settings/NamedListManager';
import { crmBrands } from '../../../../../lib/crmApi';

// Settings -> Brands (connected-B2B): the product brands (MAC, PHD, BEKO, PIAB...). A brand is not a make.
export default function BrandsSettingsPage() {
  return (
    <NamedListManager
      noun="brand" nounPlural="brands" title="Brands"
      description="The product brands you sell, such as MAC, PHD, BEKO or PIAB. A brand is not the manufacturer; that is kept separately in Makes."
      emptyText="No brands yet. Add brands such as MAC, PHD or BEKO."
      namePlaceholder="Brand name (e.g. MAC)"
      api={crmBrands}
    />
  );
}
