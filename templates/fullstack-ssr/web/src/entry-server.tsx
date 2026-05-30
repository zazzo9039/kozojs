import { renderToString } from 'react-dom/server';
import { App } from './App.js';

export function render(_url: string) {
  const html = renderToString(<App message="Hello from SSR" />);
  return { html };
}
