/* ============================================================
   icons.js — set ikon SVG stroke konsisten (gaya native notes)
   ============================================================ */

const P = {
  menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
  search: `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  minus: `<path d="M5 12h14"/>`,
  close: `<path d="M18 6 6 18M6 6l12 12"/>`,
  check: `<path d="m20 6-11 11-5-5"/>`,
  check2: `<path d="m20 6-11 11-5-5"/>`,
  checkCircle: `<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.8-5"/>`,
  circle: `<circle cx="12" cy="12" r="9"/>`,
  chevronLeft: `<path d="m15 18-6-6 6-6"/>`,
  chevronRight: `<path d="m9 18 6-6-6-6"/>`,
  chevronDown: `<path d="m6 9 6 6 6-6"/>`,
  chevronUp: `<path d="m18 15-6-6-6 6"/>`,
  arrowLeft: `<path d="M19 12H5M12 19l-7-7 7-7"/>`,
  arrowRight: `<path d="M5 12h14M12 5l7 7-7 7"/>`,
  more: `<circle cx="5" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.35" fill="currentColor" stroke="none"/>`,
  moreVertical: `<circle cx="12" cy="5" r="1.35" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.35" fill="currentColor" stroke="none"/>`,
  star: `<path d="m12 3.2 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.6l6.1-.9Z"/>`,
  starFill: `<path d="m12 3.2 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.6l6.1-.9Z" fill="currentColor" stroke="none"/>`,
  pin: `<path d="M9.5 3.5h5l-.8 5.2 2.8 2.8v1.3H7.5v-1.3l2.8-2.8Z"/><path d="M12 13v7.5"/>`,
  pinFill: `<path d="M9.5 3.5h5l-.8 5.2 2.8 2.8v1.3H7.5v-1.3l2.8-2.8Z" fill="currentColor"/><path d="M12 13v7.5"/>`,
  archive: `<rect x="3" y="4" width="18" height="4.5" rx="1.5"/><path d="M5 8.5V19a1.8 1.8 0 0 0 1.8 1.8h10.4A1.8 1.8 0 0 0 19 19V8.5M10 12.2h4"/>`,
  trash: `<path d="M4 7h16M9.5 7V4.8A1.8 1.8 0 0 1 11.3 3h1.4a1.8 1.8 0 0 1 1.8 1.8V7M6.2 7l.8 12.1A1.9 1.9 0 0 0 8.9 21h6.2a1.9 1.9 0 0 0 1.9-1.9L17.8 7M10 11v6M14 11v6"/>`,
  restore: `<path d="M4.5 12a7.5 7.5 0 1 0 2.1-5.2L4.5 9"/><path d="M4.5 4.5V9H9"/>`,
  settings: `<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.6.68 1.03 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>`,
  folder: `<path d="M3.5 7.5A1.8 1.8 0 0 1 5.3 5.7h4l1.7 2h7.7a1.8 1.8 0 0 1 1.8 1.8v7.7a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8Z"/>`,
  folderOpen: `<path d="M3.5 8V6.3a1.8 1.8 0 0 1 1.8-1.8h3.4l1.7 2h7.1a1.8 1.8 0 0 1 1.8 1.8V9"/><path d="m3.5 9 1.4 8.9a1.8 1.8 0 0 0 1.8 1.5h10.6a1.8 1.8 0 0 0 1.8-1.5L20.5 9Z"/>`,
  folderPlus: `<path d="M3.5 7.5A1.8 1.8 0 0 1 5.3 5.7h4l1.7 2h7.7a1.8 1.8 0 0 1 1.8 1.8v7.7a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8Z"/><path d="M12 11v5M9.5 13.5h5"/>`,
  tag: `<path d="M20 13.2 13.2 20a2 2 0 0 1-2.8 0L3.5 13.1V4.5A1 1 0 0 1 4.5 3.5h8.6l6.9 6.9a2 2 0 0 1 0 2.8Z"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>`,
  tagPlus: `<path d="M20 13.2 13.2 20a2 2 0 0 1-2.8 0L3.5 13.1V4.5A1 1 0 0 1 4.5 3.5h8.6l6.9 6.9a2 2 0 0 1 0 2.8Z"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/><path d="M14.5 11.5v4M12.5 13.5h4"/>`,
  note: `<path d="M6 3.5h8.3L19 8.2V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5Z"/><path d="M14 3.5V8h4.5M8.5 12h6M8.5 15.5h4.5"/>`,
  notes: `<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>`,
  home: `<path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9.3V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.3M9.5 21v-6h5v6"/>`,
  grid: `<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>`,
  list: `<path d="M8 5.5h12M8 12h12M8 18.5h12"/><circle cx="4" cy="5.5" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18.5" r="1" fill="currentColor" stroke="none"/>`,
  sort: `<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>`,
  filter: `<path d="M4 5h16l-6.3 7.3v5.2L10 20v-7.7Z"/>`,
  pencil: `<path d="M12.5 5.5 18.5 11.5M4 20l4.7-1L20 7.7a2.4 2.4 0 0 0-3.4-3.4L5.3 15.6Z"/>`,
  edit: `<path d="M11 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V13"/><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L11 16l-4 1 1-4Z"/>`,
  share: `<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.4 10.8 7.2-4.3M8.4 13.2l7.2 4.3"/>`,
  copy: `<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M5.5 15.5h-1a1.5 1.5 0 0 1-1.5-1.5V4.5A1.5 1.5 0 0 1 4.5 3H14a1.5 1.5 0 0 1 1.5 1.5v1"/>`,
  download: `<path d="M20 15.5v3A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-3M7.5 10 12 14.5 16.5 10M12 14.5V3.5"/>`,
  upload: `<path d="M20 15.5v3A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-3M7.5 8.5 12 4l4.5 4.5M12 4v11"/>`,
  print: `<path d="M7 8V3.5h10V8M7 17.5H4.5A1.5 1.5 0 0 1 3 16v-5.5A1.5 1.5 0 0 1 4.5 9h15A1.5 1.5 0 0 1 21 10.5V16a1.5 1.5 0 0 1-1.5 1.5H17"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>`,
  image: `<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><circle cx="9" cy="9.5" r="1.4"/><path d="m3.8 17 4.7-4.7a1.4 1.4 0 0 1 2 0l2.3 2.3 1.7-1.7a1.4 1.4 0 0 1 2 0l3.7 3.7"/>`,
  camera: `<path d="M4.5 7.5h2.2l1.4-2.2A1.3 1.3 0 0 1 9.2 4.7h5.6a1.3 1.3 0 0 1 1.1.6l1.4 2.2h2.2A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5Z"/><circle cx="12" cy="13" r="3.4"/>`,
  draw: `<path d="M4 20c2.8.2 5.2-.5 7-2.1M4 20l4.4-1.1L19.4 7.9a2.2 2.2 0 0 0-3.1-3.1L5.3 15.6Z"/><path d="M14.5 6.5 17.5 9.5"/>`,
  table: `<rect x="3.5" y="4.5" width="17" height="15" rx="1.8"/><path d="M3.5 9.5h17M9.5 9.5v10M15.5 9.5v10"/>`,
  link: `<path d="M9.5 14.5 14.5 9.5"/><path d="M7.5 16.5 6 18a3.3 3.3 0 0 1-4.6-4.6L5 9.8a3.3 3.3 0 0 1 4.6 0"/><path d="M16.5 7.5 18 6a3.3 3.3 0 0 1 4.6 4.6L19 14.2a3.3 3.3 0 0 1-4.6 0"/>`,
  unlink: `<path d="M9.5 14.5 8 16a3.3 3.3 0 0 1-4.6-4.6l1.8-1.8M14.5 9.5 16 8a3.3 3.3 0 0 0-4.6-4.6l-1.8 1.8M4 4l16 16"/>`,
  bold: `<path d="M7 4.5h6.2a3.75 3.75 0 0 1 0 7.5H7Z"/><path d="M7 12h7a3.75 3.75 0 0 1 0 7.5H7Z"/>`,
  italic: `<path d="M18.5 4.5h-8M13.5 19.5h-8M15 4.5 9 19.5"/>`,
  underline: `<path d="M6 4.5v5.7a6 6 0 0 0 12 0V4.5M4 20.5h16"/>`,
  strike: `<path d="M5 12h14M7 7.5c0-1.8 1.8-3 5-3s5 1.2 5 3-1.8 2.5-5 3-5 1.2-5 3 1.8 3 5 3 5-1.2 5-3"/>`,
  highlight: `<path d="m14.5 4.5 5 5L11 18H6v-5Z"/><path d="M14.5 4.5 19.5 9.5M4 21h16"/>`,
  palette: `<path d="M12 3a9 9 0 1 0 0 18h1.2a1.9 1.9 0 0 0 1.4-3.2 1.9 1.9 0 0 1 1.4-3.2H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z"/><circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="17" cy="10" r="1" fill="currentColor" stroke="none"/>`,
  listBullet: `<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none"/>`,
  listNumber: `<path d="M9.5 6h11M9.5 12h11M9.5 18h11M4 4.5h1.2v4M4 8.5h2.4M3.5 15.2c0-.9.7-1.4 1.5-1.4s1.4.5 1.4 1.3c0 1.4-2.6 1.7-2.6 3.4h2.8"/>`,
  checklist: `<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="m7.5 9 1.4 1.4L11.5 8M7.5 15l1.4 1.4 2.6-2.4M14 9.5h3.5M14 15.5h3.5"/>`,
  quote: `<path d="M9.5 7.5H5.8A1.8 1.8 0 0 0 4 9.3v3.2a1.8 1.8 0 0 0 1.8 1.8h2.4c0 2-1.3 2.7-2.9 3.2M20 7.5h-3.7a1.8 1.8 0 0 0-1.8 1.8v3.2a1.8 1.8 0 0 0 1.8 1.8h2.4c0 2-1.3 2.7-2.9 3.2"/>`,
  code: `<path d="m8.5 8-4.5 4 4.5 4M15.5 8l4.5 4-4.5 4M13.5 5l-3 14"/>`,
  divider: `<path d="M3 12h18"/><path d="M6 7h12M6 17h12" opacity=".35"/>`,
  alignLeft: `<path d="M4 6h16M4 10h10M4 14h16M4 18h8"/>`,
  alignCenter: `<path d="M4 6h16M7 10h10M4 14h16M8 18h8"/>`,
  alignRight: `<path d="M4 6h16M10 10h10M4 14h16M12 18h8"/>`,
  indent: `<path d="M9 6h11M9 12h11M9 18h11M4 9l3 3-3 3"/>`,
  outdent: `<path d="M9 6h11M9 12h11M9 18h11M7 9l-3 3 3 3"/>`,
  undo: `<path d="M8.5 6.5 4 11l4.5 4.5"/><path d="M4 11h9.2a6.3 6.3 0 0 1 0 12.6H11"/>`,
  redo: `<path d="m15.5 6.5 4.5 4.5-4.5 4.5"/><path d="M20 11h-9.2a6.3 6.3 0 0 0 0 12.6H13"/>`,
  textAa: `<path d="M4 18 9 6l5 12M6 14h6M16 10.5h4M18 10.5V18"/>`,
  type: `<path d="M5 6h14M12 6v13M8.5 19h7"/>`,
  lock: `<rect x="4.5" y="10" width="15" height="10.5" rx="2.2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/><circle cx="12" cy="15.2" r="1.1" fill="currentColor" stroke="none"/>`,
  unlock: `<rect x="4.5" y="10" width="15" height="10.5" rx="2.2"/><path d="M8 10V7.5a4 4 0 0 1 7.4-2.1M12 15.2v.1"/>`,
  eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>`,
  eyeOff: `<path d="M3 3l18 18"/><path d="M10.6 6.1A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.7 3.4M6.1 7.5A17.4 17.4 0 0 0 2.5 12S6 18 12 18a10 10 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>`,
  calendar: `<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M8 3v4M16 3v4M3.5 9.5h17"/>`,
  info: `<circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 8h.01"/>`,
  sparkles: `<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2Z"/><path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7ZM5 14l.6 1.9 1.9.6-1.9.6L5 19l-.6-1.9-1.9-.6 1.9-.6Z"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>`,
  moon: `<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>`,
  monitor: `<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>`,
  keyboard: `<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M6 14h.01M18 14h.01M9.5 14h5"/>`,
  command: `<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z"/>`,
  move: `<path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4"/>`,
  drag: `<circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none"/>`,
  database: `<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>`,
  shield: `<path d="M12 3 5 6v5.5c0 4.3 2.9 7.7 7 9.5 4.1-1.8 7-5.2 7-9.5V6Z"/><path d="m9 12 2 2 4-4.5"/>`,
  mic: `<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>`,
  play: `<path d="M8 5.5v13l10-6.5Z" fill="currentColor"/>`,
  pause: `<rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/>`,
  stop: `<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>`,
  searchX: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-3.2-3.2M8 8l5 5M13 8l-5 5"/>`,
  fileText: `<path d="M6 3.5h8.3L19 8.2V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5Z"/><path d="M14 3.5V8h4.5M8.5 12h7M8.5 15.5h7M8.5 18h4"/>`,
  markdown: `<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M6.5 15V9l2.4 3 2.4-3v6M15 9v6M15 15l2-2M15 15l-2-2"/>`,
  wand: `<path d="m4 20 11-11M13 3.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1ZM19 9l.7 1.8 1.8.7-1.8.7L19 14l-.7-1.8L16.5 11.5l1.8-.7Z"/>`,
  refresh: `<path d="M20 5v5h-5M4 19v-5h5"/><path d="M18.4 9A7.5 7.5 0 0 0 5.6 6.6L4 10M5.6 15A7.5 7.5 0 0 0 18.4 17.4L20 14"/>`,
  alert: `<path d="M12 3 2.8 20h18.4Z"/><path d="M12 9v4.5M12 17h.01"/>`,
  external: `<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H11"/>`,
  scan: `<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/>`,
  history: `<path d="M3.5 12a8.5 8.5 0 1 0 2.4-5.9L3.5 8.5"/><path d="M3.5 3.5v5h5M12 7.5V12l3.2 2"/>`,
  trashX: `<path d="M4 7h16M9.5 7V4.8A1.8 1.8 0 0 1 11.3 3h1.4a1.8 1.8 0 0 1 1.8 1.8V7M6.2 7l.8 12.1A1.9 1.9 0 0 0 8.9 21h6.2a1.9 1.9 0 0 0 1.9-1.9L17.8 7M10 11l4 4M14 11l-4 4"/>`,
  sunMoon: `<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/><path d="M20.5 17.5A5.5 5.5 0 0 1 14.5 11"/>`,
  logo: `<path d="M6.5 3.5h8L19 8v12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1.5-1.5Z"/><path d="M14 3.5V8h5M8.5 12h7M8.5 15.5h5M8.5 19h3"/>`
};

export function icon(name, size = 20, className = '') {
  const body = P[name] || P.note;
  return `<svg class="ico ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export const BRAND_SVG = `<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
  <defs>
    <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5b8cff"/>
      <stop offset="1" stop-color="#6d5dfc"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="17" fill="url(#brandGrad)"/>
  <rect x="15" y="12" width="34" height="40" rx="6" fill="#fff" opacity=".97"/>
  <path d="M23 23h18M23 31h18M23 39h11" stroke="#c9d6ff" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="42" cy="45" r="8" fill="#6d5dfc"/>
  <path d="m38.5 45 2.4 2.4 4.4-5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
