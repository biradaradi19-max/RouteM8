import React from 'react';
import { useApp } from '../../context/AppContext';
import type { DeliveryRequest, PublishedJourney } from '../../types';
import { RequesterDashboard } from './RequesterDashboard';
import { PartnerDashboard } from './PartnerDashboard';

export interface DashboardViewProps {
  onOpenCreateRequest: () => void;
  onOpenPublishJourney: () => void;
  onInspectMatch: (req: DeliveryRequest, journey?: PublishedJourney) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenCreateRequest,
  onOpenPublishJourney,
  onInspectMatch,
}) => {
  const { activeRoleMode } = useApp();

  // If in Delivery Partner mode, render dedicated transporter dashboard
  if (activeRoleMode === 'transporter') {
    return (
      <PartnerDashboard
        onOpenPublishJourney={onOpenPublishJourney}
        onInspectMatch={onInspectMatch}
      />
    );
  }

  // Default to dedicated Requester dashboard
  return (
    <RequesterDashboard
      onOpenCreateRequest={onOpenCreateRequest}
      onInspectMatch={(req) => onInspectMatch(req)}
    />
  );
};
