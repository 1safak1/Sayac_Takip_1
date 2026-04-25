// ===== Data Store =====
const STORAGE_KEY = 'endeks_takip_data';

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveData(subscribers) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subscribers));
}

let subscribers = loadData();

// ===== DOM References =====
const addForm = document.getElementById('add-subscriber-form');
const nameInput = document.getElementById('subscriber-name');
const initialIndexInput = document.getElementById('initial-index');
const subscribersList = document.getElementById('subscribers-list');
const emptyState = document.getElementById('empty-state');
const subscriberCount = document.getElementById('subscriber-count');

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
const btnCloseDeleteModal = document.getElementById('btn-close-delete-modal');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');

// Toast
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// State
let currentSubscriberId = null;
let deleteSubscriberId = null;

// ===== Utility Functions =====

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function showToast(message) {
  toastMessage.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== Render =====

function render() {
  subscriberCount.textContent = subscribers.length;

  if (subscribers.length === 0) {
    emptyState.style.display = 'flex';
    subscribersList.innerHTML = '';
    return;
  }

  emptyState.style.display = 'none';
  subscribersList.innerHTML = subscribers.map(sub => renderSubscriberCard(sub)).join('');
  attachCardEvents();
}

function renderSubscriberCard(sub) {
  const lastReading = sub.readings[sub.readings.length - 1];
  const currentIndex = lastReading ? lastReading.index : sub.initialIndex;
  const totalConsumption = currentIndex - sub.initialIndex;
  const lastConsumption = sub.readings.length > 0 ? sub.readings[sub.readings.length - 1].consumption : 0;
  const readingCount = sub.readings.length;

  return `
    <div class="subscriber-card" data-id="${sub.id}">
      <div class="subscriber-top">
        <div class="subscriber-info">
          <div class="subscriber-avatar">${getInitials(sub.name)}</div>
          <div>
            <div class="subscriber-name">${escapeHtml(sub.name)}</div>
            <div class="subscriber-meta">${readingCount} kayıt · Eklenme: ${formatDate(sub.createdAt)}</div>
          </div>
        </div>
        <div class="subscriber-actions">
          <button class="btn-icon danger btn-delete" data-id="${sub.id}" title="Aboneyi sil">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="subscriber-stats">
        <div class="stat-box">
          <div class="stat-label">Güncel Endeks</div>
          <div class="stat-value">${currentIndex.toLocaleString('tr-TR')}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Son Tüketim</div>
          <div class="stat-value accent">${lastConsumption.toLocaleString('tr-TR')}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Toplam Tüketim</div>
          <div class="stat-value success">${totalConsumption.toLocaleString('tr-TR')}</div>
        </div>
      </div>

      <button class="btn-enter-index" data-id="${sub.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Yeni Endeks Gir
      </button>

      ${renderHistory(sub)}
    </div>
  `;
}

function renderHistory(sub) {
  if (sub.readings.length === 0) return '';

  const rows = [...sub.readings].reverse().map(r => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>${r.index.toLocaleString('tr-TR')}</td>
      <td><span class="consumption-badge">${r.consumption.toLocaleString('tr-TR')}</span></td>
    </tr>
  `).join('');

  return `
    <div class="history-section">
      <button class="history-toggle" data-id="${sub.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        Geçmiş Kayıtlar (${sub.readings.length})
      </button>
      <div class="history-table-wrapper" id="history-${sub.id}">
        <table class="history-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Endeks</th>
              <th>Tüketim</th>
            </tr>
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

// ===== Event Handlers =====

function attachCardEvents() {
  // Enter index buttons
  document.querySelectorAll('.btn-enter-index').forEach(btn => {
    btn.addEventListener('click', () => openIndexModal(btn.dataset.id));
  });

  // Delete buttons
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.id));
  });

  // History toggles
  document.querySelectorAll('.history-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrapper = document.getElementById(`history-${btn.dataset.id}`);
      btn.classList.toggle('open');
      wrapper.classList.toggle('visible');
    });
  });
}

// Add subscriber
addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const initialIndex = parseInt(initialIndexInput.value, 10);

  if (!name || isNaN(initialIndex)) return;

  const newSub = {
    id: generateId(),
    name,
    initialIndex,
    readings: [],
    createdAt: new Date().toISOString()
  };

  subscribers.push(newSub);
  saveData(subscribers);
  render();

  nameInput.value = '';
  initialIndexInput.value = '';
  nameInput.focus();

  showToast(`${name} başarıyla eklendi`);
});

// ===== Index Modal =====

function openIndexModal(subId) {
  currentSubscriberId = subId;
  const sub = subscribers.find(s => s.id === subId);
  if (!sub) return;

  const lastReading = sub.readings[sub.readings.length - 1];
  const prevIndex = lastReading ? lastReading.index : sub.initialIndex;

  modalTitle.textContent = `${sub.name} — Endeks Girişi`;
  modalPrevIndex.textContent = prevIndex.toLocaleString('tr-TR');
  newIndexInput.value = '';
  
  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  readingDateInput.value = today;

  consumptionPreview.style.display = 'none';

  modalOverlay.classList.add('active');
  setTimeout(() => newIndexInput.focus(), 100);
}

function closeIndexModal() {
  modalOverlay.classList.remove('active');
  currentSubscriberId = null;
}

btnCloseModal.addEventListener('click', closeIndexModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeIndexModal();
});

// Live consumption preview
newIndexInput.addEventListener('input', () => {
  const sub = subscribers.find(s => s.id === currentSubscriberId);
  if (!sub) return;

  const lastReading = sub.readings[sub.readings.length - 1];
  const prevIndex = lastReading ? lastReading.index : sub.initialIndex;
  const newVal = parseInt(newIndexInput.value, 10);

  if (!isNaN(newVal) && newVal >= prevIndex) {
    consumptionPreview.style.display = 'block';
    previewValue.textContent = (newVal - prevIndex).toLocaleString('tr-TR');
  } else {
    consumptionPreview.style.display = 'none';
  }
});

// Save index
indexForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const sub = subscribers.find(s => s.id === currentSubscriberId);
  if (!sub) return;

  const lastReading = sub.readings[sub.readings.length - 1];
  const prevIndex = lastReading ? lastReading.index : sub.initialIndex;
  const newIndex = parseInt(newIndexInput.value, 10);

  if (isNaN(newIndex)) return;

  if (newIndex < prevIndex) {
    showToast('Yeni endeks, önceki endeksten küçük olamaz!');
    return;
  }

  const consumption = newIndex - prevIndex;
  const selectedDate = readingDateInput.value;

  sub.readings.push({
    date: selectedDate ? new Date(selectedDate).toISOString() : new Date().toISOString(),
    index: newIndex,
    consumption
  });

  saveData(subscribers);
  render();
  closeIndexModal();
  showToast(`Endeks kaydedildi — Tüketim: ${consumption.toLocaleString('tr-TR')}`);
});

// ===== Delete Modal =====

function openDeleteModal(subId) {
  deleteSubscriberId = subId;
  const sub = subscribers.find(s => s.id === subId);
  if (!sub) return;

  deleteName.textContent = sub.name;
  deleteModalOverlay.classList.add('active');
}

function closeDeleteModal() {
  deleteModalOverlay.classList.remove('active');
  deleteSubscriberId = null;
}

btnCloseDeleteModal.addEventListener('click', closeDeleteModal);
btnCancelDelete.addEventListener('click', closeDeleteModal);
deleteModalOverlay.addEventListener('click', (e) => {
  if (e.target === deleteModalOverlay) closeDeleteModal();
});

btnConfirmDelete.addEventListener('click', () => {
  const sub = subscribers.find(s => s.id === deleteSubscriberId);
  if (!sub) return;

  subscribers = subscribers.filter(s => s.id !== deleteSubscriberId);
  saveData(subscribers);
  render();
  closeDeleteModal();
  showToast(`${sub.name} silindi`);
});

// Escape key to close modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modalOverlay.classList.contains('active')) closeIndexModal();
    if (deleteModalOverlay.classList.contains('active')) closeDeleteModal();
  }
});

// ===== Init =====
render();
