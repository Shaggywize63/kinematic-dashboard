'use client';
// "Continue": walks through the lessons of a course and then the quiz. SIMULATION: the lesson text is sample content and
// the person doing it would normally use their own phone; here an HR user acts for them.

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Modal, Note, ProgressBar, T } from '../../ui';
import { fullName } from '../../../../lib/hrms/format';
import { PASS_MARK, gradeQuiz, minutesText, progressPct, type QuizResult } from '../../../../lib/hrms/people/learningEngine';
import { completeLesson, submitQuiz } from '../../../../lib/hrms/people/learningActions';
import type { LearningState } from '../../../../lib/hrms/people/types';
import type { Employee } from '../../../../lib/hrms/types';
import { Muted, SimulationBadge, Stack } from '../shared';

export default function LessonModal({ st, assignmentId, employees, onClose, onCertificate }: {
  st: LearningState; assignmentId: string; employees: Map<string, Employee>; onClose: () => void; onCertificate: (certId: string) => void;
}) {
  const a = st.assignments.find((x) => x.id === assignmentId);
  const course = a && st.courses.find((c) => c.id === a.courseId);
  const person = a && employees.get(a.employeeId);
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);
  const [last, setLast] = useState<{ result: QuizResult; certificateId?: string } | null>(null);
  if (!a || !course || !person) return null;

  const total = course.lessons.length;
  const inQuiz = !a.completedOn && a.stepsDone >= total;
  const lesson = course.lessons[a.stepsDone];
  const allAnswered = course.quiz.every((_, i) => answers[i] !== undefined);
  const live = allAnswered ? gradeQuiz(course, answers) : null;

  function submit() {
    const r = submitQuiz(a!.id, answers);
    if (!r) return;
    setLast(r);
    if (r.result.passed) toast.success(`Passed with ${r.result.score}%. Certificate ${r.certificateId} issued.`);
  }

  return (
    <Modal title={course.title} onClose={onClose} width={620}>
      <Stack gap={14}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, color: T.dim }}>Learning as <b style={{ color: T.text }}>{fullName(person)}</b></span>
          <SimulationBadge>Simulation</SimulationBadge>
          <Badge>{course.mode === 'classroom' ? 'Classroom' : 'Self-paced'} · {minutesText(course.durationMin)}</Badge>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.dim, marginBottom: 4 }}>
            <span>Progress</span><span data-testid="lesson-progress">{progressPct(course, a)}%</span>
          </div>
          <ProgressBar pct={progressPct(course, a)} tone={a.completedOn ? 'ok' : 'info'} />
        </div>

        {a.completedOn && (
          <Stack gap={10}>
            <Note tone="ok">Completed on {a.completedOn} with a score of {a.score}%. {a.certificateId ? `Certificate ${a.certificateId} was issued.` : ''}</Note>
            {a.certificateId && <div><Button variant="primary" onClick={() => onCertificate(a.certificateId!)}>View certificate</Button></div>}
          </Stack>
        )}

        {!a.completedOn && !inQuiz && lesson && (
          <Stack gap={10}>
            <div style={{ fontSize: 12, color: T.mute }}>Lesson {a.stepsDone + 1} of {total}</div>
            <h3 data-testid="lesson-title" style={{ margin: 0, fontSize: 16, fontFamily: T.heading, color: T.text }}>{lesson.title}</h3>
            <p style={{ margin: 0, fontSize: 14, color: T.dim, lineHeight: 1.6 }}>{lesson.body}</p>
            <Muted>Sample lesson text. {course.mode === 'classroom' ? 'In the live product the trainer marks who attended; here you can step through it.' : 'In the live product this is a short video or reading.'}</Muted>
            <div><Button variant="primary" onClick={() => completeLesson(a.id)}>{a.stepsDone + 1 < total ? 'Mark lesson done, next' : 'Mark lesson done, go to the quiz'}</Button></div>
          </Stack>
        )}

        {inQuiz && (
          <Stack gap={14}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontFamily: T.heading, color: T.text }}>Quiz</h3>
              <Muted>{course.quiz.length} questions. Pass mark {PASS_MARK}%. Attempts so far: {a.attempts}.</Muted>
            </div>
            {last && !last.result.passed && (
              <Note tone="warn">You scored {last.result.score}% ({last.result.correct} of {last.result.total}). The pass mark is {PASS_MARK}%. Read the lessons again if you like, then try once more.</Note>
            )}
            {course.quiz.map((q, qi) => (
              <fieldset key={qi} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '10px 14px', margin: 0 }}>
                <legend style={{ fontSize: 13.5, fontWeight: 600, color: T.text, padding: '0 6px' }}>{qi + 1}. {q.q}</legend>
                {q.options.map((o, oi) => (
                  <label key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 2px', fontSize: 14, color: T.text, cursor: 'pointer' }}>
                    <input type="radio" name={`q${qi}`} checked={answers[qi] === oi} onChange={() => setAnswers((prev) => { const n = [...prev]; n[qi] = oi; return n; })} />
                    {o}
                  </label>
                ))}
              </fieldset>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="primary" disabled={!allAnswered} onClick={submit}>Submit answers</Button>
              {!allAnswered && <Muted>Answer all {course.quiz.length} questions to submit.</Muted>}
              {last && <Button onClick={() => { setLast(null); setAnswers([]); }}>Clear answers</Button>}
            </div>
            {live && !last && <Muted>Your answers are not marked until you submit.</Muted>}
          </Stack>
        )}

      </Stack>
    </Modal>
  );
}
