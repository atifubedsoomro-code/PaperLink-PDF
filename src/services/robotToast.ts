import type { RobotExpression } from '../components/MiniAiRobot';

export interface RobotToastDetail {
  id: number;
  message: string;
  subText?: string;
  expression?: RobotExpression;
  durationMs?: number;
}

export const ROBOT_TOAST_EVENT = 'paperlink:robot-toast';

export function triggerRobotToast(options: Omit<RobotToastDetail, 'id'>): void {
  if (typeof window === 'undefined') return;
  const detail: RobotToastDetail = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    ...options,
  };
  window.dispatchEvent(new CustomEvent<RobotToastDetail>(ROBOT_TOAST_EVENT, { detail }));
}
