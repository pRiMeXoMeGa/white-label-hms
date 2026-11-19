import type { ServiceRequestDto } from '../../../shared/types';
import { Spinner, gap } from '../../components/ui';
import { useApi } from '../../lib/api';
import { BackLink, useStay } from './StayApp';
import { RequestCard } from './RequestCard';

export function RequestsPage() {
  const { code } = useStay();
  const requests = useApi<ServiceRequestDto[]>(`/stays/${code}/requests`, 4000);
  return (
    <div className="stack" style={gap('0.6rem')}>
      <BackLink>Home</BackLink>
      <h1 style={{ fontSize: 'var(--step-2)' }}>All requests</h1>
      {requests.loading && <Spinner />}
      {requests.data?.length === 0 && <p className="muted">No requests yet.</p>}
      {requests.data?.map((r) => <RequestCard key={r.id} r={r} onChange={requests.reload} />)}
    </div>
  );
}
