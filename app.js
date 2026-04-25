// ===== IndexedDB Wrapper =====
const DB_NAME = 'TesisTakipDB';
const STORE_NAME = 'facilities';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function getStoredData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get('data');

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function setStoredData(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(data, 'data');

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ===== Data Management =====
let facilities = [];
let activeTab = 'elektrik'; 

async function initApp() {
  // Try to migrate from localStorage first
  const localData = localStorage.getItem('tesis_takip_data');
  if (localData) {
    try {
      facilities = JSON.parse(localData);
      await setStoredData(facilities); // Move to IndexedDB
      localStorage.removeItem('tesis_takip_data'); // Clean up
      console.log('Migrated from localStorage to IndexedDB');
    } catch (e) {
      console.error('Migration failed', e);
    }
  } else {
    facilities = await getStoredData();
  }
  
  render();
}

async function saveData() {
  await setStoredData(facilities);
}

// ===== DOM References =====
const addForm = document.getElementById('add-facility-form');
const nameInput = document.getElementById('facility-name');
const initialIndexInput = document.getElementById('initial-index');
const facilitiesList = document.getElementById('facilities-list');
const emptyState = document.getElementById('empty-state');
const facilityCount = document.getElementById('facility-count');
const activeTabName = document.getElementById('active-tab-name');

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');

// Modal - index entry
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalPrevIndex = document.getElementById('modal-prev-index');
const newIndexInput = document.getElementById('new-index');
const readingDateInput = document.getElementById('reading-date');
const indexForm = document.getElementById('index-form');
const consumptionPreview = document.getElementById('consumption-preview');
const previewValue = document.getElementById('preview-value');
const btnCloseModal = document.getElementById('btn-close-modal');

// Modal - delete
const deleteModalOverlay = document.getElementById('delete-modal-overlay');
const deleteName = document.getElementById('delete-name');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnCloseDeleteModal = document.getElementById('btn-close-delete-modal');

// Toast
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// State
let currentFacilityId = null;
let editingReadingId = null; 
let deleteFacilityId = null;
let openAccordionId = null;

// ===== Utility Functions =====

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function showToast(message) {
  toastMessage.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function getLatestIndex(facility, type) {
  const readings = facility[type].readings;
  if (readings.length === 0) return facility[type].initialIndex;
  const sorted = [...readings].sort((a, b) => new Date(a.date) - new Date(b.date));
  return sorted[sorted.length - 1].index;
}

function recalculateConsumptions(facility, type) {
  const data = facility[type];
  data.readings.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  let prevVal = data.initialIndex;
  data.readings.forEach(r => {
    r.consumption = r.index - prevVal;
    prevVal = r.index;
  });
}

function validateReading(facility, type, date, index, excludeId = null) {
  const data = facility[type];
  const targetDate = new Date(date);
  const otherReadings = data.readings
    .filter(r => r.id !== excludeId)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  let prevReading = null;
  let nextReading = null;
  for (let r of otherReadings) {
    const rDate = new Date(r.date);
    if (rDate < targetDate) prevReading = r;
    else if (rDate > targetDate && !nextReading) nextReading = r;
  }
  
  const minAllowed = prevReading ? prevReading.index : data.initialIndex;
  const maxAllowed = nextReading ? nextReading.index : Infinity;
  
  if (index < minAllowed) return { valid: false, msg: `Endeks, önceki tarihli kayıttan (${minAllowed}) küçük olamaz!` };
  if (index > maxAllowed) return { valid: false, msg: `Endeks, sonraki tarihli kayıttan (${maxAllowed}) büyük olamaz!` };
  return { valid: true };
}

// ===== Render =====

function render() {
  facilityCount.textContent = facilities.length;
  activeTabName.textContent = activeTab === 'elektrik' ? 'Elektrik' : 'Su';

  if (facilities.length === 0) {
    emptyState.style.display = 'flex';
    facilitiesList.innerHTML = '';
    return;
  }

  emptyState.style.display = 'none';
  facilitiesList.innerHTML = facilities.map(f => renderFacilityAccordion(f)).join('');
  attachEvents();
}

function renderFacilityAccordion(f) {
  const isOpen = openAccordionId === f.id;
  const currentData = f[activeTab];
  const sortedReadings = [...currentData.readings].sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastReading = sortedReadings[0];
  const currentIndex = lastReading ? lastReading.index : currentData.initialIndex;
  const lastConsumption = lastReading ? lastReading.consumption : 0;
  const totalConsumption = currentIndex - currentData.initialIndex;

  const elecIndex = getLatestIndex(f, 'elektrik');
  const waterIndex = getLatestIndex(f, 'su');

  return `
    <div class="facility-card ${isOpen ? 'open' : ''}" data-id="${f.id}">
      <button class="accordion-header" onclick="toggleAccordion('${f.id}')">
        <div class="facility-info-summary">
          <div class="subscriber-avatar">${f.name[0].toUpperCase()}</div>
          <span class="facility-name">${escapeHtml(f.name)}</span>
          <div class="facility-index-summary">
            <div class="summary-item">
              <span class="summary-label">Elek. Endeks</span>
              <span class="summary-value ${activeTab === 'elektrik' ? 'highlight' : ''}">${elecIndex.toLocaleString('tr-TR')}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Su Endeks</span>
              <span class="summary-value ${activeTab === 'su' ? 'highlight' : ''}">${waterIndex.toLocaleString('tr-TR')}</span>
            </div>
          </div>
        </div>
        <div class="chevron-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </button>
      <div class="accordion-content">
        <div class="subscriber-stats">
          <div class="stat-box">
            <div class="stat-label">GÜNCEL ${activeTab.toUpperCase()} ENDEKS</div>
            <div class="stat-value">${currentIndex.toLocaleString('tr-TR')}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">SON TÜKETİM</div>
            <div class="stat-value accent">${lastConsumption.toLocaleString('tr-TR')}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">TOPLAM TÜKETİM</div>
            <div class="stat-value success">${totalConsumption.toLocaleString('tr-TR')}</div>
          </div>
        </div>
        <button class="btn-enter-index" data-id="${f.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Yeni ${activeTab === 'elektrik' ? 'Elektrik' : 'Su'} Endeksi Gir
        </button>
        ${renderHistory(sortedReadings, f.id)}
        <div class="facility-actions-row">
          <button class="btn-icon danger btn-delete" data-id="${f.id}" title="Tesisi Sil">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderHistory(readings, facilityId) {
  if (readings.length === 0) return '';
  const rows = readings.map(r => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>${r.index.toLocaleString('tr-TR')}</td>
      <td><span class="consumption-badge">${r.consumption.toLocaleString('tr-TR')}</span></td>
      <td style="text-align: right;">
        <button class="btn-icon btn-edit-reading" data-fid="${facilityId}" data-rid="${r.id}" title="Düzenle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon danger btn-delete-reading" data-fid="${facilityId}" data-rid="${r.id}" title="Sil">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
  return `
    <div class="history-section">
      <div class="history-table-wrapper visible">
        <table class="history-table">
          <thead><tr><th>Tarih</th><th>Endeks</th><th>Tüketim</th><th style="text-align: right;">İşlem</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Logic & Event Handlers =====

function attachEvents() {
  document.querySelectorAll('.btn-enter-index').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openIndexModal(btn.dataset.id); });
  });
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(btn.dataset.id); });
  });
  document.querySelectorAll('.btn-edit-reading').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openIndexModal(btn.dataset.fid, btn.dataset.rid); });
  });
  document.querySelectorAll('.btn-delete-reading').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); deleteReading(btn.dataset.fid, btn.dataset.rid); });
  });
}

function toggleAccordion(id) {
  openAccordionId = openAccordionId === id ? null : id;
  render();
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    render();
  });
});

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const initial = parseInt(initialIndexInput.value, 10) || 0;
  if (!name) return;

  const newFacility = {
    id: generateId(),
    name,
    createdAt: new Date().toISOString(),
    elektrik: { initialIndex: initial, readings: [] },
    su: { initialIndex: initial, readings: [] }
  };
  facilities.push(newFacility);
  await saveData();
  render();
  nameInput.value = '';
  initialIndexInput.value = '';
  nameInput.focus();
  showToast(`Tesis eklendi: ${name}`);
});

function openIndexModal(fid, rid = null) {
  currentFacilityId = fid;
  editingReadingId = rid;
  const f = facilities.find(fac => fac.id === fid);
  const data = f[activeTab];
  
  if (rid) {
    const r = data.readings.find(x => x.id === rid);
    modalTitle.textContent = `${f.name} — Kayıt Düzenle`;
    newIndexInput.value = r.index;
    readingDateInput.value = r.date.split('T')[0];
    const others = data.readings.filter(x => x.id !== rid).sort((a,b) => new Date(a.date) - new Date(b.date));
    let prev = data.initialIndex;
    for(let x of others) { if (new Date(x.date) < new Date(r.date)) prev = x.index; }
    modalPrevIndex.textContent = prev.toLocaleString('tr-TR');
  } else {
    const lastIdx = getLatestIndex(f, activeTab);
    modalTitle.textContent = `${f.name} — ${activeTab.toUpperCase()} Endeksi`;
    modalPrevIndex.textContent = lastIdx.toLocaleString('tr-TR');
    newIndexInput.value = '';
    readingDateInput.value = new Date().toISOString().split('T')[0];
  }
  consumptionPreview.style.display = 'none';
  modalOverlay.classList.add('active');
  setTimeout(() => newIndexInput.focus(), 100);
}

function closeIndexModal() {
  modalOverlay.classList.remove('active');
  currentFacilityId = null;
  editingReadingId = null;
}

btnCloseModal.addEventListener('click', closeIndexModal);
modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) closeIndexModal(); });

newIndexInput.addEventListener('input', updateConsumptionPreview);
readingDateInput.addEventListener('input', updateConsumptionPreview);

function updateConsumptionPreview() {
  const f = facilities.find(fac => fac.id === currentFacilityId);
  if (!f) return;
  const data = f[activeTab];
  const val = parseInt(newIndexInput.value, 10);
  const date = readingDateInput.value;
  if (!isNaN(val) && date) {
    const others = data.readings.filter(x => x.id !== editingReadingId).sort((a,b) => new Date(a.date) - new Date(b.date));
    let prev = data.initialIndex;
    for(let x of others) { if (new Date(x.date) < new Date(date)) prev = x.index; }
    consumptionPreview.style.display = 'block';
    previewValue.textContent = (val - prev).toLocaleString('tr-TR');
  } else { consumptionPreview.style.display = 'none'; }
}

indexForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = facilities.find(fac => fac.id === currentFacilityId);
  const data = f[activeTab];
  const val = parseInt(newIndexInput.value, 10);
  const date = readingDateInput.value;
  if (isNaN(val) || !date) { showToast('Hatalı giriş!'); return; }
  const check = validateReading(f, activeTab, date, val, editingReadingId);
  if (!check.valid) { showToast(check.msg); return; }
  if (editingReadingId) {
    const r = data.readings.find(x => x.id === editingReadingId);
    r.index = val;
    r.date = new Date(date).toISOString();
  } else {
    data.readings.push({ id: generateId(), date: new Date(date).toISOString(), index: val, consumption: 0 });
  }
  recalculateConsumptions(f, activeTab);
  await saveData();
  render();
  closeIndexModal();
  showToast(editingReadingId ? 'Kayıt güncellendi' : 'Endeks kaydedildi');
});

async function deleteReading(fid, rid) {
  const f = facilities.find(fac => fac.id === fid);
  const data = f[activeTab];
  data.readings = data.readings.filter(r => r.id !== rid);
  recalculateConsumptions(f, activeTab);
  await saveData();
  render();
  showToast('Kayıt silindi');
}

function openDeleteModal(id) {
  deleteFacilityId = id;
  const f = facilities.find(fac => fac.id === id);
  deleteName.textContent = f.name;
  deleteModalOverlay.classList.add('active');
}

function closeDeleteModal() {
  deleteModalOverlay.classList.remove('active');
  deleteFacilityId = null;
}

btnConfirmDelete.addEventListener('click', async () => {
  facilities = facilities.filter(f => f.id !== deleteFacilityId);
  await saveData();
  render();
  closeDeleteModal();
  showToast('Tesis silindi');
});

btnCancelDelete.addEventListener('click', closeDeleteModal);
btnCloseDeleteModal.addEventListener('click', closeDeleteModal);

// Init
window.toggleAccordion = toggleAccordion;
initApp();
