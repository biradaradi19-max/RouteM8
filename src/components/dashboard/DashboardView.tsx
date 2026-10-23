import React from 'react';
import { useApp } from '../../context/AppContext';
import type { DeliveryRequest, PublishedJourney } from '../../types';
import { RequesterDashboard } from './RequesterDashboard';
import { PartnerDashboard } from './PartnerDashboard';
import { ErrorBoundary } from '../common/ErrorBoundary';

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
      <ErrorBoundary fallbackTitle="Partner Dashboard Encountered An Issue">
        <PartnerDashboard
          onOpenPublishJourney={onOpenPublishJourney}
          onInspectMatch={onInspectMatch}
        />
      </ErrorBoundary>
    );
  }

  // Default to dedicated Requester dashboard
  return (
    <ErrorBoundary fallbackTitle="Requester Dashboard Encountered An Issue">
      <RequesterDashboard
        onOpenCreateRequest={onOpenCreateRequest}
        onInspectMatch={(req) => onInspectMatch(req)}
      />
    </ErrorBoundary>
  );
};

