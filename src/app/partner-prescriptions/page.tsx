import type { Metadata } from 'next';
import { PartnerPrescriptions } from '@/components/private-portal/PartnerPrescriptions';

export const metadata: Metadata = { title: 'Recetas de TrustLeaf Cannabis', robots: { index: false, follow: false } };

export default function PartnerPrescriptionsPage() {
  return <PartnerPrescriptions />;
}
