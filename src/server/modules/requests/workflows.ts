import type { ServiceType } from '../../../shared/types';

/**
 * Each service is a linear state machine. `advance` says how a request leaves a stage:
 * - 'delay': after AUTO_ADVANCE_SECONDS[_<SERVICE>] (the simulated staff action)
 * - 'scheduled_end': when the booked time slot has ended (spa treatment, transfer ride)
 * The last stage is terminal. Cancellation is a separate terminal state.
 */
export interface Stage {
  status: string;
  label: string;
  advance?: 'delay' | 'scheduled_end';
}

export interface Workflow {
  service: ServiceType;
  stages: Stage[];
}

export const CANCELLED = 'cancelled';

export const WORKFLOWS: Record<ServiceType, Workflow> = {
  food: {
    service: 'food',
    stages: [
      { status: 'received', label: 'Order received', advance: 'delay' },
      { status: 'preparing', label: 'Kitchen is preparing', advance: 'delay' },
      { status: 'on_the_way', label: 'On the way to your room', advance: 'delay' },
      { status: 'delivered', label: 'Delivered' },
    ],
  },
  laundry: {
    service: 'laundry',
    stages: [
      { status: 'received', label: 'Request received', advance: 'delay' },
      { status: 'picked_up', label: 'Picked up from your room', advance: 'delay' },
      { status: 'cleaning', label: 'Washing and pressing', advance: 'delay' },
      { status: 'delivered', label: 'Returned to your room' },
    ],
  },
  housekeeping: {
    service: 'housekeeping',
    stages: [
      { status: 'received', label: 'Request received', advance: 'delay' },
      { status: 'in_progress', label: 'Housekeeper on the way', advance: 'delay' },
      { status: 'completed', label: 'Done' },
    ],
  },
  amenity: {
    service: 'amenity',
    stages: [
      { status: 'received', label: 'Request received', advance: 'delay' },
      { status: 'on_the_way', label: 'On the way to your room', advance: 'delay' },
      { status: 'delivered', label: 'Delivered' },
    ],
  },
  maintenance: {
    service: 'maintenance',
    stages: [
      { status: 'reported', label: 'Issue reported', advance: 'delay' },
      { status: 'assigned', label: 'Technician assigned', advance: 'delay' },
      { status: 'in_progress', label: 'Being fixed', advance: 'delay' },
      { status: 'resolved', label: 'Resolved' },
    ],
  },
  spa: {
    service: 'spa',
    stages: [
      { status: 'requested', label: 'Booking requested', advance: 'delay' },
      { status: 'confirmed', label: 'Confirmed by the spa', advance: 'scheduled_end' },
      { status: 'completed', label: 'Treatment completed' },
    ],
  },
  transfer: {
    service: 'transfer',
    stages: [
      { status: 'requested', label: 'Transfer requested', advance: 'delay' },
      { status: 'confirmed', label: 'Confirmed', advance: 'delay' },
      { status: 'driver_assigned', label: 'Driver and car assigned', advance: 'scheduled_end' },
      { status: 'completed', label: 'Completed' },
    ],
  },
};

export function stageAt(service: ServiceType, index: number): Stage {
  const stage = WORKFLOWS[service].stages[index];
  if (!stage) throw new Error(`No stage ${index} for ${service}`);
  return stage;
}

export function isFinalStage(service: ServiceType, index: number): boolean {
  return index >= WORKFLOWS[service].stages.length - 1;
}

/** When a request at `stageIndex` should move on, or null if it is terminal. */
export function nextTransitionAt(
  service: ServiceType,
  stageIndex: number,
  now: Date,
  delaySeconds: number,
  scheduledEndUtc: Date | null,
): Date | null {
  if (isFinalStage(service, stageIndex)) return null;
  const stage = stageAt(service, stageIndex);
  if (stage.advance === 'scheduled_end' && scheduledEndUtc) return scheduledEndUtc;
  return new Date(now.getTime() + delaySeconds * 1000);
}
