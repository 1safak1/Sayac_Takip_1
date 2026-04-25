// ===== Data Store =====
const STORAGE_KEY = 'tesis_takip_data';

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    // Migration: If old data format (subscribers), convert or clear
    if (data.length > 0 && !data[0].hasOwnProperty('electricity')) {
      return []; // Reset for new structure
    }
    return data;
  } catch { return []; }
}

function saveData(facilities) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(facilities));
}

let facilities = loadData();
let activeTab = 'elektrik'; // 'elektrik' or 'su'

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
  return readings[readings.length - 1].index;
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
  const lastReading = currentData.readings[currentData.readings.length - 1];
  const currentIndex = lastReading ? lastReading.index : currentData.initialIndex;
  const lastConsumption = lastReading ? lastReading.consumption : 0;
  const totalConsumption = currentIndex - currentData.initialIndex;

  // Header Summary (Always visible)
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

        ${renderHistory(currentData.readings)}

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

function renderHistory(readings) {
  if (readings.length === 0) return '';

  const rows = [...readings].reverse().map(r => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>${r.index.toLocaleString('tr-TR')}</td>
      <td><span class="consumption-badge">${r.consumption.toLocaleString('tr-TR')}</span></td>
    </tr>
  `).join('');

  return `
    <div class="history-section">
      <div class="history-table-wrapper visible">
        <table class="history-table">
          <thead>
            <tr><th>Tarih</th><th>Endeks</th><th>Tüketim</th></tr>
          </thead>
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
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openIndexModal(btn.dataset.id);
    });
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteModal(btn.dataset.id);
    });
  });
}

function toggleAccordion(id) {
  openAccordionId = openAccordionId === id ? null : id;
  render();
}

// Tab Switching
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    render();
  });
});

// Add Facility
addForm.addEventListener('submit', (e) => {
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
  saveData(facilities);
  render();

  nameInput.value = '';
  initialIndexInput.value = '';
  nameInput.focus();
  showToast(`Tesis eklendi: ${name}`);
});

// Index Modal Logic
function openIndexModal(id) {
  currentFacilityId = id;
  const f = facilities.find(fac => fac.id === id);
  const data = f[activeTab];
  const lastIdx = data.readings.length > 0 ? data.readings[data.readings.length - 1].index : data.initialIndex;

  modalTitle.textContent = `${f.name} — ${activeTab.toUpperCase()} Endeksi`;
  modalPrevIndex.textContent = lastIdx.toLocaleString('tr-TR');
  newIndexInput.value = '';
  readingDateInput.value = new Date().toISOString().split('T')[0];
  consumptionPreview.style.display = 'none';

  modalOverlay.classList.add('active');
  setTimeout(() => newIndexInput.focus(), 100);
}

function closeIndexModal() {
  modalOverlay.classList.remove('active');
  currentFacilityId = null;
}

btnCloseModal.addEventListener('click', closeIndexModal);
modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) closeIndexModal(); });

newIndexInput.addEventListener('input', () => {
  const f = facilities.find(fac => fac.id === currentFacilityId);
  const data = f[activeTab];
  const lastIdx = data.readings.length > 0 ? data.readings[data.readings.length - 1].index : data.initialIndex;
  const val = parseInt(newIndexInput.value, 10);

  if (!isNaN(val) && val >= lastIdx) {
    consumptionPreview.style.display = 'block';
    previewValue.textContent = (val - lastIdx).toLocaleString('tr-TR');
  } else {
    consumptionPreview.style.display = 'none';
  }
});

indexForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = facilities.find(fac => fac.id === currentFacilityId);
  const data = f[activeTab];
  const lastIdx = data.readings.length > 0 ? data.readings[data.readings.length - 1].index : data.initialIndex;
  const val = parseInt(newIndexInput.value, 10);
  const date = readingDateInput.value;

  if (isNaN(val) || val < lastIdx) {
    showToast('Hatalı endeks değeri!');
    return;
  }

  data.readings.push({
    date: new Date(date).toISOString(),
    index: val,
    consumption: val - lastIdx
  });

  saveData(facilities);
  render();
  closeIndexModal();
  showToast('Endeks kaydedildi');
});

// Delete Logic
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

btnConfirmDelete.addEventListener('click', () => {
  facilities = facilities.filter(f => f.id !== deleteFacilityId);
  saveData(facilities);
  render();
  closeDeleteModal();
  showToast('Tesis silindi');
});

btnCancelDelete.addEventListener('click', closeDeleteModal);
btnCloseDeleteModal.addEventListener('click', closeDeleteModal);

// Init
window.toggleAccordion = toggleAccordion;
render();
