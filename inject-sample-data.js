/**
 * Alternassist Sample Data Generator
 * Copy and paste this entire file into the browser console (DevTools)
 */

// Projects for Kanban board
const projects = [
  {
    id: "proj-001",
    title: "Documentary: Ocean Cleanup Initiative",
    client: "PBS Studios",
    contactEmail: "producer@pbs.org",
    column: "in-process",
    status: "in-progress",
    pinned: true,
    notes: "Climate action focus. Target demographic 25-54. Requires uplifting yet grounded score.",
    scopeData: { music: 45, dialogue: 20, soundDesign: 15, mix: 12 },
    loggedHours: { music: 22, dialogue: 10, soundDesign: 8, mix: 6, revisions: 3 }
  },
  {
    id: "proj-002",
    title: "Indie Feature Film: The Wanderer",
    client: "Meridian Films",
    contactEmail: "director@meridianfilms.com",
    column: "in-review",
    status: "in-review",
    pinned: false,
    notes: "Independent film noir. Client provided temp music they want to replace. 92-minute runtime.",
    scopeData: { music: 75, dialogue: 30, soundDesign: 25, mix: 18 },
    loggedHours: { music: 42, dialogue: 15, soundDesign: 18, mix: 10, revisions: 8 }
  },
  {
    id: "proj-003",
    title: "Commercial: TechStart Mobile App Launch",
    client: "TechStart Inc.",
    contactEmail: "marketing@techstart.io",
    column: "approved-billed",
    status: "invoiced",
    pinned: false,
    notes: "30-second commercial for app launch campaign. Needs cutting-edge electronic score.",
    scopeData: { music: 2, dialogue: 1, soundDesign: 3, mix: 1 },
    loggedHours: { music: 2, dialogue: 1, soundDesign: 2, mix: 1, revisions: 1 }
  },
  {
    id: "proj-004",
    title: "Corporate Training Video: HR Onboarding",
    client: "Fortune 500 Tech",
    contactEmail: "training@fortune500tech.com",
    column: "prospects",
    status: "proposal-sent",
    pinned: false,
    notes: "Multi-part training series. 45 minutes total content. Professional, upbeat tone.",
    scopeData: { music: 30, dialogue: 25, soundDesign: 10, mix: 8 },
    loggedHours: {}
  },
  {
    id: "proj-005",
    title: "Podcast Intro/Outro Package",
    client: "The Daily Stories Podcast",
    contactEmail: "host@thedailystories.com",
    column: "approved-billed",
    status: "invoiced",
    pinned: true,
    notes: "Custom music and sound design for weekly podcast. Needs to be versatile but branded.",
    scopeData: { music: 10, dialogue: 0, soundDesign: 8, mix: 2 },
    loggedHours: { music: 10, dialogue: 0, soundDesign: 8, mix: 2, revisions: 2 }
  },
  {
    id: "proj-006",
    title: "Game Trailer: Mythic Realm",
    client: "Stellar Games",
    contactEmail: "audio@stellargames.com",
    column: "in-process",
    status: "in-progress",
    pinned: false,
    notes: "60-second game trailer. Epic fantasy setting. Orchestral/electronic hybrid score.",
    scopeData: { music: 3, dialogue: 2, soundDesign: 8, mix: 2 },
    loggedHours: { music: 2, dialogue: 0.5, soundDesign: 5, mix: 1, revisions: 1.5 }
  },
  {
    id: "proj-007",
    title: "Wedding Video - Morrison Family",
    client: "Sarah Morrison",
    contactEmail: "sarah@morrisons.com",
    column: "archive",
    status: "paid",
    pinned: false,
    notes: "45-minute wedding documentary. Emotional, sentimental score.",
    scopeData: { music: 20, dialogue: 5, soundDesign: 8, mix: 4 },
    loggedHours: { music: 20, dialogue: 5, soundDesign: 8, mix: 4, revisions: 2 }
  }
];

// Music cues
const cues = {
  'proj-001': [
    { id: 'cue-001-1', number: '1m1', title: 'Main Title Theme', startTime: '00:00:00', endTime: '00:02:30', theme: 'Main Theme', status: 'approved', version: 'v2', notes: 'Energetic opening, 80 BPM, orchestral with electronic elements', createdAt: new Date().toISOString() },
    { id: 'cue-001-2', number: '1m2', title: 'Planning Phase', startTime: '00:03:15', endTime: '00:09:15', theme: 'Contemplation', status: 'approved', version: 'v1', notes: 'Thoughtful underscore, builds tension gradually', createdAt: new Date().toISOString() },
    { id: 'cue-001-3', number: '2m1', title: 'Construction Begins', startTime: '00:11:30', endTime: '00:20:00', theme: 'Building Energy', status: 'written', version: 'v1', notes: 'Rhythmic, industrial percussion with synth layers', createdAt: new Date().toISOString() },
    { id: 'cue-001-4', number: '2m2', title: 'Progress Montage', startTime: '00:22:00', endTime: '00:29:00', theme: 'Building Energy', status: 'revisions', version: 'v3', notes: 'Uplifting build with driving beat. Client wants brighter orchestration.', createdAt: new Date().toISOString() },
    { id: 'cue-001-5', number: '3m1', title: 'Obstacles & Setbacks', startTime: '00:31:45', endTime: '00:37:00', theme: 'Tension', status: 'to-write', version: 'v1', notes: 'Tension and uncertainty, then resolution', createdAt: new Date().toISOString() }
  ],
  'proj-002': [
    { id: 'cue-002-1', number: '1m1', title: 'Cold Open - City Streets', startTime: '00:00:00', endTime: '00:03:45', theme: 'Film Noir', status: 'approved', version: 'v2', notes: 'Dark jazz, upright bass, muted trumpet. Very Ellington-esque.', createdAt: new Date().toISOString() },
    { id: 'cue-002-2', number: '1m2', title: 'The Offer', startTime: '00:05:30', endTime: '00:12:00', theme: 'Noir Intrigue', status: 'written', version: 'v1', notes: 'Tense, mysterious. Suggest danger.', createdAt: new Date().toISOString() },
    { id: 'cue-002-3', number: '2m1', title: 'The Chase', startTime: '00:45:00', endTime: '00:52:30', theme: 'Action/Suspense', status: 'to-write', version: 'v1', notes: 'High-energy, percussive-driven chase sequence', createdAt: new Date().toISOString() }
  ],
  'proj-006': [
    { id: 'cue-006-1', number: '1m1', title: 'Epic Reveal', startTime: '00:00:00', endTime: '00:00:30', theme: 'Epic Fantasy', status: 'written', version: 'v1', notes: 'Big orchestral swell with electronic elements', createdAt: new Date().toISOString() },
    { id: 'cue-006-2', number: '1m2', title: 'Gameplay Loop', startTime: '00:00:31', endTime: '00:01:00', theme: 'Battle Theme', status: 'revisions', version: 'v2', notes: 'Loopable combat music. Client wants more synth, less orchestral.', createdAt: new Date().toISOString() }
  ]
};

const cueProjects = [
  { id: 'proj-001', title: 'Documentary: Ocean Cleanup Initiative', client: 'PBS Studios' },
  { id: 'proj-002', title: 'Indie Feature Film: The Wanderer', client: 'Meridian Films' },
  { id: 'proj-006', title: 'Game Trailer: Mythic Realm', client: 'Stellar Games' }
];

// Invoices
const invoices = [
  { id: 'inv-001', invoiceNumber: '2523', projectId: 'proj-001', projectName: 'Documentary: Ocean Cleanup Initiative', clientName: 'PBS Studios', amount: 22500, dueDate: '2024-11-16', description: 'Music Composition & Post-Production Audio Services', status: 'sent', category: 'Music & Post-Production', musicMinutes: 45, postDays: 15, paymentSplit: 'full', createdAt: new Date(Date.now() - 5*24*60*60*1000).toISOString() },
  { id: 'inv-002', invoiceNumber: '2524', projectId: 'proj-002', projectName: 'Indie Feature Film: The Wanderer', clientName: 'Meridian Films', amount: 45000, dueDate: '2024-11-30', description: '50% Deposit - Music Composition & Post-Production', status: 'sent', category: 'Music & Post-Production', musicMinutes: 75, postDays: 30, paymentSplit: '50%', createdAt: new Date(Date.now() - 3*24*60*60*1000).toISOString() },
  { id: 'inv-003', invoiceNumber: '2525', projectId: 'proj-003', projectName: 'Commercial: TechStart Mobile App Launch', clientName: 'TechStart Inc.', amount: 6000, dueDate: '2024-10-31', description: 'Music Composition & Sound Design - Commercial (30 seconds)', status: 'paid', category: 'Music & Post-Production', musicMinutes: 2, postDays: 3, paymentSplit: 'full', paidDate: '2024-10-28', paidAmount: 6000, createdAt: new Date(Date.now() - 15*24*60*60*1000).toISOString() },
  { id: 'inv-004', invoiceNumber: '2526', projectId: 'proj-005', projectName: 'Podcast Intro/Outro Package', clientName: 'The Daily Stories Podcast', amount: 3500, dueDate: '2024-10-15', description: 'Music & Sound Design Package - Podcast', status: 'paid', category: 'Music & Post-Production', musicMinutes: 10, postDays: 2, paymentSplit: 'full', paidDate: '2024-10-15', paidAmount: 3500, createdAt: new Date(Date.now() - 20*24*60*60*1000).toISOString() },
  { id: 'inv-005', invoiceNumber: '2527', projectId: 'proj-004', projectName: 'Corporate Training Video: HR Onboarding', clientName: 'Fortune 500 Tech', amount: 18000, dueDate: '2024-12-15', description: 'Music Composition & Audio Design - Training Series', status: 'sent', category: 'Music Composition', musicMinutes: 30, postDays: 0, paymentSplit: 'full', createdAt: new Date(Date.now() - 1*24*60*60*1000).toISOString() },
  { id: 'inv-006', invoiceNumber: '2528', projectId: 'proj-006', projectName: 'Game Trailer: Mythic Realm', clientName: 'Stellar Games', amount: 12000, dueDate: '2024-11-20', description: '50% Deposit - Music & Sound Design - Game Trailer', status: 'sent', category: 'Music & Post-Production', musicMinutes: 3, postDays: 5, paymentSplit: '50%', createdAt: new Date(Date.now() - 2*24*60*60*1000).toISOString() }
];

// Payments
const payments = [
  { id: 'pmt-001', invoiceId: 'inv-003', amount: 6000, date: '2024-10-28', method: 'bank transfer', createdAt: new Date(Date.now() - 10*24*60*60*1000).toISOString() },
  { id: 'pmt-002', invoiceId: 'inv-004', amount: 3500, date: '2024-10-15', method: 'credit card', createdAt: new Date(Date.now() - 23*24*60*60*1000).toISOString() }
];

// Accounting transactions
const transactions = [
  { id: 1697500200000, type: 'income', date: '2024-10-28', description: 'Payment', invoice: '2525', customName: 'Commercial: TechStart Mobile App Launch', account: 'Business Checking', category: 'income', amount: 6000, notes: 'Full payment received' },
  { id: 1697500210000, type: 'income', date: '2024-10-15', description: 'Payment', invoice: '2526', customName: 'Podcast Intro/Outro Package', account: 'Business Checking', category: 'income', amount: 3500, notes: 'Full payment received' },
  { id: 1697500220000, type: 'expense', date: '2024-10-16', description: 'Pro Tools Annual Subscription', category: 'Software', taxCategory: 'software-licenses', account: 'Business Checking', amount: 349.99, notes: 'DAW license renewal' },
  { id: 1697500230000, type: 'expense', date: '2024-10-14', description: 'iZotope Plugin Bundle Update', category: 'Software', taxCategory: 'software-licenses', account: 'Business Checking', amount: 89.99, notes: 'Production tools update' },
  { id: 1697500240000, type: 'expense', date: '2024-10-10', description: 'Studio Rent - October', category: 'Facilities', taxCategory: 'rental-equipment', account: 'Business Checking', amount: 1500, notes: 'Monthly studio rental' },
  { id: 1697500250000, type: 'expense', date: '2024-10-08', description: 'Session Musicians - String Section', category: 'Freelance/Contractors', taxCategory: 'contractor-fees', account: 'Business Checking', amount: 800, notes: 'Live string recording session' },
  { id: 1697500260000, type: 'expense', date: '2024-10-05', description: 'Adobe Creative Cloud Subscription', category: 'Software', taxCategory: 'software-licenses', account: 'Business Checking', amount: 84.49, notes: 'Monthly subscription' }
];

// Inject data into localStorage
console.log('🚀 Injecting sample data into Alternassist...');

localStorage.setItem('kanban-projects', JSON.stringify(projects));
localStorage.setItem('cue-tracker-cues', JSON.stringify(cues));
localStorage.setItem('cue-projects', JSON.stringify(cueProjects));
localStorage.setItem('outstanding-payments', JSON.stringify(invoices));
localStorage.setItem('alternatone-payments', JSON.stringify(payments));
localStorage.setItem('accountingTransactions', JSON.stringify(transactions));
localStorage.setItem('invoice-count', '28');

console.log('✅ Sample data injected successfully!');
console.log('📊 Data Summary:');
console.log('  - Projects: 7');
console.log('  - Music Cues: 11 (across 3 projects)');
console.log('  - Invoices: 6 (2 paid, 4 outstanding)');
console.log('  - Payments: 2');
console.log('  - Accounting Transactions: 7 (2 income, 5 expenses)');
console.log('\n🔄 Refresh the page or navigate to different sections to see the data!');
