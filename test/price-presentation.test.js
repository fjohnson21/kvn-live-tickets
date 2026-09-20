import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('crosses out the regular price while an early-release price is active', async () => {
  const css = await readFile(new URL('../public/discount-price.css', import.meta.url), 'utf8');
  const eventPage = await readFile(new URL('../public/event.html', import.meta.url), 'utf8');

  assert.match(css, /\.regular-price\s*\{[^}]*text-decoration(?:-line)?:\s*line-through/i);
  assert.match(css, /\.regular-price\s*\{[^}]*text-decoration-color:\s*var\(--accent\)/i);
  assert.match(eventPage, /href="\/discount-price\.css"/i);
});
