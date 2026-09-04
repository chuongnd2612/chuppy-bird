import './style.css';
import { sampleTickets } from './sampleTickets.ts';
import { renderApp } from './ui.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app root element');

renderApp(root, sampleTickets);
