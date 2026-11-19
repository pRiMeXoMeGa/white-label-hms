import { useState, type FormEvent } from 'react';
import type { ServiceRequestDto } from '../../../shared/types';
import { ErrorNotice, Field, Spinner, gap } from '../../components/ui';
import { ApiError, post, useApi } from '../../lib/api';
import { StayHomeButton } from './CatalogOrder';
import { LiveRequestCard } from './RequestCard';
import { BackLink, useStay } from './StayApp';

export function Maintenance() {
  const { code } = useStay();
  const options = useApi<{ maintenanceCategories: string[] }>(`/stays/${code}/options`);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<ServiceRequestDto | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDone(await post<ServiceRequestDto>(`/stays/${code}/maintenance`, { category, description, urgent }));
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="stack">
        <BackLink>Home</BackLink>
        <h1 style={{ fontSize: 'var(--step-2)' }}>Issue reported</h1>
        <LiveRequestCard r={done} />
        <StayHomeButton />
      </div>
    );
  }

  return (
    <form className="stack" style={gap('1rem')} onSubmit={submit}>
      <BackLink>Home</BackLink>
      <div>
        <h1 style={{ fontSize: 'var(--step-2)' }}>Report an issue</h1>
        <p className="muted" style={{ margin: 0 }}>
          An engineer will come to your room. For anything unsafe, call reception straight away.
        </p>
      </div>
      {options.loading && <Spinner />}
      {options.data && (
        <fieldset>
          <legend className="visually-hidden">What is the problem with?</legend>
          <div className="choice-list">
            {options.data.maintenanceCategories.map((c) => (
              <label key={c} className="choice">
                <input type="radio" name="category" required value={c} checked={category === c} onChange={() => setCategory(c)} />
                <span className="choice-body">
                  <span className="choice-title">{c}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Field label="What is happening?">
        <textarea required minLength={3} maxLength={500} placeholder="The air conditioning is blowing warm air" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
        <span>This is urgent</span>
      </label>
      <ErrorNotice error={error} />
      <button className="btn btn-block" disabled={busy}>
        {busy ? 'Sending…' : 'Report issue'}
      </button>
    </form>
  );
}
