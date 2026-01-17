
export enum ConnectionMode {
  WIFI = 'Wi-Fi LAN',
  HOTSPOT = 'Hotspot',
  BLUETOOTH = 'Bluetooth LE',
  INTERNET = 'Internet',
  PANIC = 'Panic Mode (QR)'
}

export enum ExamStatus {
  IDLE = 'idle',
  STARTING = 'starting',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed'
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit?: number; // duration in seconds
  points?: number; // marks for this question
}

export interface StudentResponse {
  studentId: string;
  studentName: string;
  questionId: string;
  selectedOption: number | null;
  timestamp: number;
  isCorrect: boolean;
}

export interface Student {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'answering' | 'done';
  score: number;
  violations: number;
  isFocused: boolean;
}

export interface ExamSession {
  id: string;
  title: string;
  questions: Question[];
  currentQuestionIndex: number;
  status: ExamStatus;
  responses: StudentResponse[];
  startTime?: number;
}
