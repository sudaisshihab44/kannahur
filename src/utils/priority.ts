/**
 * src/utils/priority.ts
 *
 * Shared priority-weight helper used by ReceptionDashboard,
 * TVDisplay, PatientTracker, and queueService.
 * Single source of truth — no more copy-paste across 5 files.
 */
export function getPriorityWeight(priority: string | undefined): number {
  switch (priority) {
    case 'VIP':                    return 4;
    case 'Person with Disability': return 3;
    case 'Pregnant Woman':         return 2;
    case 'Senior Citizen':         return 1;
    default:                       return 0;
  }
}
