'use client';
// The rules this page follows, in plain words, shown on every tab.

import { Card, T } from '../../ui';

export default function Principles() {
  return (
    <Card padding={16}>
      <div data-testid="principles-box" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 16 }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontFamily: T.heading, fontSize: 14, color: T.text }}>Why we aggregate</h2>
          <p style={{ margin: 0, fontSize: 13, color: T.dim, lineHeight: 1.55 }}>
            We want to learn how teams are doing so we can fix real problems. Results are shown for a group only when at least 5 people answered, so nobody can be picked out. Small teams are counted in the company total and shown nowhere else.
          </p>
        </div>
        <div>
          <h2 style={{ margin: '0 0 6px', fontFamily: T.heading, fontSize: 14, color: T.text }}>What we never do</h2>
          <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13, color: T.dim, lineHeight: 1.55 }}>
            <li>Score, rank or list individuals by how they answered or how engaged they seem.</li>
            <li>Rank managers or teams against each other.</li>
            <li>Store who answered a survey: a response keeps only the team.</li>
            <li>Show a comment with a name, a time, a role or a place that could identify its author.</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
