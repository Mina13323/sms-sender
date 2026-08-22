// ==UserScript==
// @name         Systemic Form Assistant
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Operator-assisted form automation tool for contact list processing. Does NOT automatically submit.
// @author       You
// @match        https://link.systemic-digital.net/widget/form/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  // --- State ---
  const STATE_KEY = 'systemic_assistant_state';
  
  let state = loadState() || {
    contacts: [], // { name, phone, message, status: 'pending'|'filled'|'skipped'|'done' }
    currentIndex: 0,
    settings: {
      defaultName: 'Test Contact',
      defaultMessage: 'Hello, please contact me.',
    }
  };

  function loadState() {
    try {
      const data = GM_getValue(STATE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  function saveState() {
    GM_setValue(STATE_KEY, JSON.stringify(state));
    updateUI();
  }

  // --- CSV Parser ---
  function parseCSV(csvText) {
    const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    
    // Check if header exists
    let startIndex = 0;
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('phone') || firstLine.includes('name');
    if (hasHeader) startIndex = 1;

    let valid = 0, invalid = 0, duplicates = 0;
    const parsed = [];
    const seenPhones = new Set();

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      
      let phone = '';
      let name = '';
      let message = '';

      if (cols.length === 1) {
        phone = cols[0];
      } else if (cols.length >= 3) {
        name = cols[0];
        phone = cols[1];
        message = cols.slice(2).join(',');
      } else {
        name = cols[0];
        phone = cols[1];
      }

      phone = normalizePhone(phone);
      
      if (!isValidPhone(phone)) {
        invalid++;
        continue;
      }

      if (seenPhones.has(phone)) {
        duplicates++;
        continue; // Default to removing duplicates
      }
      
      seenPhones.add(phone);
      parsed.push({
        name: name || state.settings.defaultName,
        phone,
        message: message || state.settings.defaultMessage,
        status: 'pending'
      });
      valid++;
    }

    alert(`CSV Loaded!\nValid: ${valid}\nDuplicates ignored: ${duplicates}\nInvalid: ${invalid}`);
    return parsed;
  }

  function normalizePhone(p) {
    let clean = p.replace(/[^\d+]/g, '');
    if (!clean.startsWith('+')) {
       // Just a best effort, don't invent country codes, but if it starts with 0 maybe it's local
    }
    return clean;
  }

  function isValidPhone(p) {
    return p.length >= 7;
  }

  // --- Field Detection & Filling ---
  function setNativeValue(element, value) {
    if (!element) return;
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value').set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else {
      valueSetter.call(element, value);
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function findInput(type) {
    const inputs = Array.from(document.querySelectorAll('input, textarea'));
    
    if (type === 'name') {
      return document.getElementById('full_name') ||
             inputs.find(i => i.name && i.name.toLowerCase().includes('name')) ||
             inputs.find(i => i.placeholder && i.placeholder.toLowerCase().includes('name')) ||
             inputs.find(i => i.type === 'text');
    }
    if (type === 'phone') {
      return document.getElementById('phone') ||
             inputs.find(i => i.name && i.name.toLowerCase().includes('phone')) ||
             inputs.find(i => i.type === 'tel') ||
             inputs.find(i => i.placeholder && i.placeholder.toLowerCase().includes('phone'));
    }
    if (type === 'message') {
      return document.querySelector('textarea') ||
             inputs.find(i => i.name && i.name.toLowerCase().includes('message')) ||
             inputs.find(i => i.placeholder && i.placeholder.toLowerCase().includes('message'));
    }
    return null;
  }

  function fillCurrentContact() {
    if (state.contacts.length === 0 || state.currentIndex >= state.contacts.length) return;
    
    const contact = state.contacts[state.currentIndex];
    const nameInput = findInput('name');
    const phoneInput = findInput('phone');
    const msgInput = findInput('message');

    if (nameInput) setNativeValue(nameInput, contact.name);
    if (phoneInput) setNativeValue(phoneInput, contact.phone);
    if (msgInput) {
      let msg = contact.message.replace('{{name}}', contact.name).replace('{{phone}}', contact.phone);
      setNativeValue(msgInput, msg);
    }

    contact.status = 'filled';
    saveState();
  }

  // --- UI ---
  const ui = document.createElement('div');
  ui.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 300px;
    background: #fff;
    border: 1px solid #ccc;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 999999;
    font-family: sans-serif;
    font-size: 14px;
    color: #333;
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    overflow: hidden;
  `;
  document.body.appendChild(ui);

  let isDragging = false, startX, startY, initialX, initialY;
  const header = document.createElement('div');
  header.style.cssText = 'background: #007bff; color: white; padding: 10px; cursor: move; font-weight: bold; text-align: center;';
  header.innerText = 'CONTACT ASSISTANT';
  
  header.addEventListener('mousedown', e => {
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    initialX = ui.offsetLeft; initialY = ui.offsetTop;
  });
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    ui.style.left = initialX + (e.clientX - startX) + 'px';
    ui.style.top = initialY + (e.clientY - startY) + 'px';
    ui.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => { isDragging = false; });
  ui.appendChild(header);

  const content = document.createElement('div');
  content.style.padding = '10px';
  ui.appendChild(content);

  function updateUI() {
    const total = state.contacts.length;
    const contact = state.contacts[state.currentIndex];
    const completed = state.contacts.filter(c => c.status === 'done').length;

    let html = '';
    if (total === 0) {
      html += `<div>No contacts loaded.</div>`;
    } else {
      html += `
        <div style="margin-bottom: 10px;">
          <strong>${state.currentIndex + 1} / ${total}</strong> 
          <span style="float:right; font-size:12px; color:gray">Done: ${completed}</span>
        </div>
        ${contact ? `
        <div style="background: #f9f9f9; padding: 8px; border-radius: 4px; margin-bottom: 10px;">
          <div style="font-weight:bold">${contact.name}</div>
          <div>${contact.phone}</div>
          <div style="font-size:12px; color:#666; margin-top:4px;">Status: ${contact.status.toUpperCase()}</div>
        </div>
        ` : '<div>End of list.</div>'}
      `;
    }

    html += `
      <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom: 10px;">
        <button id="btn-fill" style="flex:1; padding:5px; cursor:pointer;" title="Shortcut: F">FILL</button>
        <button id="btn-next" style="flex:1; padding:5px; cursor:pointer;" title="Shortcut: N">NEXT</button>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom: 10px;">
        <button id="btn-prev" style="flex:1; padding:5px; cursor:pointer;" title="Shortcut: P">PREV</button>
        <button id="btn-skip" style="flex:1; padding:5px; cursor:pointer;" title="Shortcut: S">SKIP</button>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom: 10px;">
        <button id="btn-done" style="flex:1; padding:5px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer;">MARK DONE</button>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom: 10px;">
        <button id="btn-reset" style="flex:1; padding:5px; cursor:pointer;" title="Shortcut: R">RESET POS</button>
        <button id="btn-clear" style="flex:1; padding:5px; background:#dc3545; color:white; border:none; border-radius:4px; cursor:pointer;">CLEAR</button>
      </div>
      <div style="margin-bottom:10px;">
         <input type="text" id="search-box" placeholder="Search name/phone..." style="width:100%; padding:5px; box-sizing:border-box;">
      </div>
      <div style="margin-bottom: 10px;">
        <input type="file" id="csv-file" accept=".csv" style="display:none;" />
        <button id="btn-import" style="width:100%; padding:5px; cursor:pointer;">IMPORT CSV</button>
      </div>
    `;

    content.innerHTML = html;

    // Attach events
    const el = (id) => document.getElementById(id);
    
    el('btn-import')?.addEventListener('click', () => el('csv-file').click());
    el('csv-file')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const parsed = parseCSV(ev.target.result);
        if (parsed.length > 0) {
          state.contacts = parsed;
          state.currentIndex = 0;
          saveState();
        }
      };
      reader.readAsText(file);
    });

    el('btn-fill')?.addEventListener('click', fillCurrentContact);
    
    el('btn-next')?.addEventListener('click', () => {
      if (state.currentIndex < total - 1) {
        state.currentIndex++;
        saveState();
      }
    });

    el('btn-prev')?.addEventListener('click', () => {
      if (state.currentIndex > 0) {
        state.currentIndex--;
        saveState();
      }
    });

    el('btn-skip')?.addEventListener('click', () => {
      if (contact) contact.status = 'skipped';
      if (state.currentIndex < total - 1) state.currentIndex++;
      saveState();
    });

    el('btn-done')?.addEventListener('click', () => {
      if (contact) contact.status = 'done';
      if (state.currentIndex < total - 1) state.currentIndex++;
      saveState();
    });

    el('btn-reset')?.addEventListener('click', () => {
      state.currentIndex = 0;
      saveState();
    });

    el('btn-clear')?.addEventListener('click', () => {
      if (confirm("Are you sure you want to clear all contacts?")) {
        state.contacts = [];
        state.currentIndex = 0;
        saveState();
      }
    });

    el('search-box')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      if (q.length < 2) return;
      const idx = state.contacts.findIndex(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
      if (idx !== -1) {
        state.currentIndex = idx;
        saveState();
        // focus back on search box
        setTimeout(() => document.getElementById('search-box').focus(), 50);
      }
    });
  }

  updateUI();

  // --- Keyboard Shortcuts ---
  document.addEventListener('keydown', (e) => {
    // Disable if focus is in an input
    const tag = document.activeElement.tagName.toLowerCase();
    const editable = document.activeElement.isContentEditable;
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || editable) return;

    if (e.key.toLowerCase() === 'f') {
      fillCurrentContact();
    } else if (e.key.toLowerCase() === 'n') {
      if (state.currentIndex < state.contacts.length - 1) {
        state.currentIndex++;
        saveState();
      }
    } else if (e.key.toLowerCase() === 'p') {
      if (state.currentIndex > 0) {
        state.currentIndex--;
        saveState();
      }
    } else if (e.key.toLowerCase() === 's') {
      if (state.contacts[state.currentIndex]) state.contacts[state.currentIndex].status = 'skipped';
      if (state.currentIndex < state.contacts.length - 1) state.currentIndex++;
      saveState();
    } else if (e.key.toLowerCase() === 'r') {
      state.currentIndex = 0;
      saveState();
    }
  });

})();
