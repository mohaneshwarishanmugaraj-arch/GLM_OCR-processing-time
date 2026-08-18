import { createFileRoute } from '@tanstack/react-router';
import { PerfDashboard } from '@/components/performance/PerfDashboard';

export const Route = createFileRoute('/_ocr/performance')({
  component: PerfDashboard
});
