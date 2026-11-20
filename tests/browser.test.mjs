import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

test('call badges and checking ages use the reader’s inclusive local calendar dates', () => {
  const source = readFileSync(new URL('../static/app.js', import.meta.url), 'utf8');
  const base = new Date('2026-11-22T03:30:00Z'); // Still November 21 for the reader.
  const dates = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-24', null, null];
  const calls = dates.map((dateTime, i) => {
    const styles = new Set(['s-open']);
    const badge = {
      dataset: { opens: i === 5 ? '2026-11-23' : '' },
      classList: { toggle: (style, active) => active ? styles.add(style) : styles.delete(style) }
    };
    return {
      badge, styles,
      querySelector(selector) { return selector === '[data-call-status]' ? badge : dateTime && { dateTime }; }
    };
  });
  const age = { dataset: { checkedAge: '2026-11-20' } };
  const document = {
    getElementById: () => null,
    querySelectorAll(selector) {
      return { '[data-call]': calls, '[data-checked-age]': [age] }[selector] || [];
    }
  };
  class ReaderDate extends Date {
    constructor() { super(base); }
    getFullYear() { return 2026; }
    getMonth() { return 10; }
    getDate() { return 21; }
  }
  runInNewContext(source, { document, Date: ReaderDate });
  assert.deepEqual(calls.map(({ badge }) => badge.textContent),
    ['Closed', 'Closes today', '1 day left', '3 days left', 'Rolling', 'Opens in 2 days']);
  assert.deepEqual([...calls[0].styles], ['s-closed']);
  assert.deepEqual([...calls[5].styles], ['s-calls']);
  assert.equal(age.textContent, '(1 day ago)');
});
