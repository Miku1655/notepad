/**
 * firebase.js — Firebase Auth + Firestore sync for N-Pane Draft Workspace
 *
 * Provides:
 *  - Email/password login with persistence (localStorage remembers auth state)
 *  - Firestore sync for projects and visual presets
 *  - Real-time listener so multiple tabs stay in sync
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Config ─────────────────────────────────────────

const firebaseConfig = {
  apiKey:            "AIzaSyDWOUxZTsyqjGHJNsXFHUzvxtXmfyKenpM",
  authDomain:        "notepad-700f1.firebaseapp.com",
  projectId:         "notepad-700f1",
  storageBucket:     "notepad-700f1.firebasestorage.app",
  messagingSenderId: "336407048461",
  appId:             "1:336407048461:web:352eccacfb60d26fb80044",
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Keep auth state in localStorage so we survive page refreshes
await setPersistence(auth, browserLocalPersistence).catch(() => {});

// ── Internal state ─────────────────────────────────

let _user            = null;
let _onUserChange    = null;   // callback(user)
let _onProjectsSync  = null;   // callback(projectsArray)
let _onPresetsSync   = null;   // callback(presetsObject {name: data})
let _projectsUnsub  = null;
let _presetsUnsub   = null;

// ── Auth ───────────────────────────────────────────

onAuthStateChanged(auth, user => {
  _user = user;
  if (_onUserChange) _onUserChange(user);
  if (user) {
    _startListeners();
  } else {
    _stopListeners();
  }
});

export function onUserChange(cb)   { _onUserChange   = cb; }
export function onProjectsSync(cb) { _onProjectsSync = cb; }
export function onPresetsSync(cb)  { _onPresetsSync  = cb; }

export function currentUser() { return _user; }

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function register(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  _stopListeners();
  await signOut(auth);
}

// ── Firestore paths ────────────────────────────────

function projectsRef(uid)       { return collection(db, 'users', uid, 'projects'); }
function projectRef(uid, id)    { return doc(db, 'users', uid, 'projects', id); }
function presetsRef(uid)        { return collection(db, 'users', uid, 'presets'); }
function presetRef(uid, name)   { return doc(db, 'users', uid, 'presets', _safeId(name)); }

function _safeId(name) {
  // Firestore doc IDs can't contain '/' or start with '.'
  return encodeURIComponent(name).replace(/%/g, '_');
}

// ── Real-time listeners ────────────────────────────

function _startListeners() {
  if (!_user) return;
  _stopListeners();

  // Projects
  _projectsUnsub = onSnapshot(
    query(projectsRef(_user.uid), orderBy('savedAt', 'desc')),
    snap => {
      if (!_onProjectsSync) return;
      const projects = snap.docs.map(d => {
        const data = d.data();
        // Convert Firestore Timestamp → ms number for compat
        if (data.savedAt?.toMillis) data.savedAt = data.savedAt.toMillis();
        return data;
      });
      _onProjectsSync(projects);
    },
    err => console.warn('[npane] projects listener error', err)
  );

  // Presets
  _presetsUnsub = onSnapshot(
    presetsRef(_user.uid),
    snap => {
      if (!_onPresetsSync) return;
      const presets = {};
      snap.docs.forEach(d => {
        const data = d.data();
        presets[data._name || d.id] = data.preset;
      });
      _onPresetsSync(presets);
    },
    err => console.warn('[npane] presets listener error', err)
  );
}

function _stopListeners() {
  if (_projectsUnsub) { _projectsUnsub(); _projectsUnsub = null; }
  if (_presetsUnsub)  { _presetsUnsub();  _presetsUnsub  = null; }
}

// ── Projects CRUD ──────────────────────────────────

export async function syncSaveProject(workspaceData) {
  if (!_user) return;
  const id = workspaceData.id || ('proj-' + Date.now());
  await setDoc(projectRef(_user.uid, id), {
    ...workspaceData,
    id,
    savedAt: serverTimestamp(),
  });
  return id;
}

export async function syncDeleteProject(id) {
  if (!_user) return;
  await deleteDoc(projectRef(_user.uid, id));
}

export async function fetchAllProjects() {
  if (!_user) return [];
  const snap = await getDocs(query(projectsRef(_user.uid), orderBy('savedAt', 'desc')));
  return snap.docs.map(d => {
    const data = d.data();
    if (data.savedAt?.toMillis) data.savedAt = data.savedAt.toMillis();
    return data;
  });
}

// ── Presets CRUD ───────────────────────────────────

export async function syncSavePreset(name, presetData) {
  if (!_user) return;
  await setDoc(presetRef(_user.uid, name), {
    _name:  name,
    preset: presetData,
    savedAt: serverTimestamp(),
  });
}

export async function syncDeletePreset(name) {
  if (!_user) return;
  await deleteDoc(presetRef(_user.uid, name));
}

export async function fetchAllPresets() {
  if (!_user) return {};
  const snap = await getDocs(presetsRef(_user.uid));
  const result = {};
  snap.docs.forEach(d => {
    const data = d.data();
    result[data._name || d.id] = data.preset;
  });
  return result;
}
