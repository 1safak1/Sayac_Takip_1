// ===== File Handle Persistence (IndexedDB) =====
const HANDLE_DB_NAME = 'FileHandleDB';
const HANDLE_STORE_NAME = 'handles';

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = (e) => e.target.result.createObjectStore(HANDLE_STORE_NAME);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveFileHandle(handle) {
  const db = await openHandleDB();
  const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
  tx.objectStore(HANDLE_STORE_NAME).put(handle, 'lastHandle');
}

async function getFileHandle() {
  try {
    const db = await openHandleDB();
    return new Promise((resolve) => {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
      const request = tx.objectStore(HANDLE_STORE_NAME).get('lastHandle');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.error('Handle DB error:', err);
    return null;
  }
}

function updateFileStatus() {
  if (!fileStatusText) return;
  
  if (isFileConnected && fileHandle) {
    fileStatusText.textContent = `Bağlı: ${fileHandle.name}`;
    fileStatusText.style.color = 'var(--success)';
  } else if (fileHandle) {
    fileStatusText.textContent = `Hatırlandı: ${fileHandle.name} (İzin Bekleniyor...)`;
    fileStatusText.style.color = 'var(--warning)';
  } else {
    fileStatusText.textContent = 'Bağlı değil (Tarayıcı hafızası kullanılıyor)';
    fileStatusText.style.color = 'var(--text-muted)';
  }
}

// ===== Data Management =====
const LOCAL_DATA_KEY = 'tesis_endeks_data';
let facilities = { elektrik: [], su: [], tesis: [] };
let activeTab = 'elektrik'; 
let fileHandle = null; // Canlı JSON dosyası referansı
let isFileConnected = false;

async function initApp() {
  try {
    // 1. Önce LocalStorage'dan yükle (En güncel yerel veri)
    const localData = localStorage.getItem(LOCAL_DATA_KEY);
    if (localData) {
      facilities = JSON.parse(localData);
    } else {
      // 2. Eğer yerelde yoksa data.json'ı fetch ile oku (Varsayılan veri)
      const response = await fetch('data.json');
      if (response.ok) {
        const stored = await response.json();
        const defaults = { elektrik: [], su: [], tesis: [] };
        facilities = { ...defaults, ...stored };
      }
    }

    // 3. Kayıtlı bir dosya referansı var mı bak
    const savedHandle = await getFileHandle();
    if (savedHandle) {
      fileHandle = savedHandle;
      updateFileStatus();
      
      // Kullanıcı herhangi bir etkileşimde bulunduğunda otomatik bağlanmayı dene
      const connectTrigger = async () => {
        await autoConnectHandler();
        document.removeEventListener('click', connectTrigger);
        document.removeEventListener('keydown', connectTrigger);
      };
      document.addEventListener('click', connectTrigger);
      document.addEventListener('keydown', connectTrigger);
      
      showToast('Kayıtlı dosya bulundu. Devam etmek için herhangi bir yere tıklayın.');
    } else {
      updateFileStatus();
    }
  } catch (err) {
    console.error('Başlangıç hatası:', err);
  }
  
  // Başlangıç teması
  document.body.classList.add('theme-red');
  
  populateYearSelect();
  render();
}

async function autoConnectHandler() {
  if (fileHandle && !isFileConnected) {
    try {
      // Önce mevcut izni kontrol et
      const options = { mode: 'readwrite' };
      if (await fileHandle.queryPermission(options) !== 'granted') {
        if (await fileHandle.requestPermission(options) !== 'granted') {
          console.warn('Dosya izni reddedildi.');
          return;
        }
      }
      
      const file = await fileHandle.getFile();
      const content = await file.text();
      
      if (content.trim()) {
        const data = JSON.parse(content);
        if (data.elektrik && data.su && data.tesis) {
          facilities = data;
          isFileConnected = true;
          localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(facilities));
          
          render();
          renderSummary();
          updateFileStatus();
          showToast(`Dosya bağlandı: ${fileHandle.name}`);
        }
      } else {
        // Dosya boşsa mevcut veriyi yazalım
        await writeToConnectedFile();
        isFileConnected = true;
        updateFileStatus();
      }
    } catch (e) {
      console.warn('Otomatik bağlantı sırasında hata:', e);
      updateFileStatus();
    }
  }
}

function populateYearSelect() {
  const years = new Set();
  const currentYear = new Date().getFullYear();
  years.add(currentYear); 
  if (selectedSummaryYear) years.add(selectedSummaryYear); // Preserve selected year
  
  // Sadece aktif sekmeye ait yılları getir
  if (facilities[activeTab]) {
    facilities[activeTab].forEach(f => {
      f.readings.forEach(r => {
        if (r.date) {
          const y = new Date(r.date).getFullYear();
          years.add(y);
        }
      });
    });
  }

  const sortedYears = Array.from(years).sort((a, b) => b - a);
  
  if (!selectedSummaryYear) {
    selectedSummaryYear = sortedYears[0];
  }
  
  let options = '';
  sortedYears.forEach(y => {
    options += `<option value="${y}" ${y === selectedSummaryYear ? 'selected' : ''}>${y} Yılı</option>`;
  });
  summaryYearSelect.innerHTML = options;
}

async function saveData() {
  // Her zaman yerel depolamaya kaydet
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(facilities));

  // Eğer dosya bağlantısı yoksa veya izin yoksa
  if (!isFileConnected) {
    // Eğer bir handle hatırlanıyorsa ama henüz izin alınmadıysa
    if (fileHandle) {
      try {
        const permission = await fileHandle.requestPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          isFileConnected = true;
          await writeToConnectedFile();
        } else {
          showToast('UYARI: Dosya yazma izni verilmedi, veriler sadece tarayıcıda saklanıyor!');
        }
      } catch (err) {
        showToast('Dosya bağlantısı kurulamadı. Lütfen manuel bağlayın.');
      }
    } else {
      // Tamamen yeni bağlantı iste
      const autoConnect = confirm('Değişikliklerin dosyaya (data.json) kaydedilmesi için bağlantı gerekiyor. Şimdi bağlansın mı?');
      if (autoConnect) {
        await connectToJSONFile();
      } else {
        showToast('BİLGİ: Veriler sadece tarayıcı hafızasına kaydedildi.');
      }
    }
  } else {
    await writeToConnectedFile();
  }
  
  updateFileStatus();
  populateYearSelect();
}

// ===== DOM References =====
const addForm = document.getElementById('add-facility-form');
const nameInput = document.getElementById('facility-name');
const initialIndexInput = document.getElementById('initial-index');
const facilitiesList = document.getElementById('facilities-list');
const emptyState = document.getElementById('empty-state');
const facilityCount = document.getElementById('facility-count');
const activeTabName = document.getElementById('active-tab-name');

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
const readingNoteInput = document.getElementById('reading-note');

// Modal - delete
const deleteModalOverlay = document.getElementById('delete-modal-overlay');
const deleteName = document.getElementById('delete-name');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnCloseDeleteModal = document.getElementById('btn-close-delete-modal');

// Toast
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Navigation & Views
const navBtns = document.querySelectorAll('.nav-btn');
const managementView = document.getElementById('management-view');
const summaryView = document.getElementById('summary-view');
const summaryTable = document.getElementById('summary-table');
const summaryToggleBtns = document.querySelectorAll('.toggle-btn');
const summaryYearSelect = document.getElementById('summary-year-select');
const summaryDateSelect = document.getElementById('summary-date-select');
const btnExportPdf = document.getElementById('btn-export-pdf');
const btnExportCsv = document.getElementById('btn-export-csv');

// Data Management References
const dataManagementView = document.getElementById('data-management-view');
const btnExportJson = document.getElementById('btn-export-json');
const btnImportJsonTrigger = document.getElementById('btn-import-json-trigger');
const importJsonInput = document.getElementById('import-json-input');
const btnConnectFile = document.getElementById('btn-connect-file');
const fileStatusText = document.getElementById('file-status-text');

// State
let currentFacilityId = null;
let editingReadingId = null; 
let deleteFacilityId = null;
let openAccordionId = null;
let summaryDataType = 'consumption'; // 'consumption' or 'index'
let selectedSummaryYear = new Date().getFullYear();

// ===== Utility Functions =====

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  if (activeTab === 'tesis') {
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function showToast(message) {
  toastMessage.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function getLatestIndex(facility) {
  const readings = facility.readings;
  if (readings.length === 0) return facility.initialIndex;
  const sorted = [...readings].sort((a, b) => new Date(a.date) - new Date(b.date));
  return sorted[sorted.length - 1].index;
}

function recalculateConsumptions(facility) {
  facility.readings.sort((a, b) => new Date(a.date) - new Date(b.date));
  let prevVal = facility.initialIndex;
  facility.readings.forEach(r => {
    r.consumption = r.index - prevVal;
    prevVal = r.index;
  });
}

function validateReading(facility, date, index, excludeId = null) {
  const targetDate = new Date(date);
  const targetMonthStr = date; 
  const monthExists = facility.readings.some(r => r.date.startsWith(targetMonthStr) && r.id !== excludeId);
  
  if (monthExists) {
    const periodLabel = activeTab === 'tesis' ? 'gün' : 'dönem';
    return { valid: false, msg: `Bu ${periodLabel} (${formatDate(date)}) için zaten bir kayıt mevcut!` };
  }

  // Tesis için endeks kısıtlaması yok (azalabilir)
  if (activeTab === 'tesis') {
    return { valid: true };
  }

  const otherReadings = facility.readings.filter(r => r.id !== excludeId).sort((a, b) => new Date(a.date) - new Date(b.date));
  let prevReading = null;
  let nextReading = null;
  for (let r of otherReadings) {
    const rDate = new Date(r.date);
    if (rDate < targetDate) prevReading = r;
    else if (rDate > targetDate && !nextReading) nextReading = r;
  }
  const minAllowed = prevReading ? prevReading.index : facility.initialIndex;
  const maxAllowed = nextReading ? nextReading.index : Infinity;
  if (index < minAllowed) return { valid: false, msg: `Endeks, önceki dönemden (${minAllowed}) küçük olamaz!` };
  if (index > maxAllowed) return { valid: false, msg: `Endeks, sonraki dönemden (${maxAllowed}) büyük olamaz!` };
  return { valid: true };
}

// ===== Render =====

function render() {
  const activeList = facilities[activeTab] || [];
  facilityCount.textContent = activeList.length;
  
  if (activeTab === 'tesis') activeTabName.textContent = 'Genel Tesis';
  else activeTabName.textContent = activeTab === 'elektrik' ? 'Elektrik' : 'Su';

  if (activeList.length === 0) {
    emptyState.style.display = 'flex';
    facilitiesList.innerHTML = '';
    return;
  }

  emptyState.style.display = 'none';
  facilitiesList.innerHTML = activeList.map(f => renderFacilityAccordion(f)).join('');
  attachEvents();
}

function renderFacilityAccordion(f) {
  const isOpen = openAccordionId === f.id;
  const sortedReadings = [...f.readings].sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastReading = sortedReadings[0];
  const currentIndex = lastReading ? lastReading.index : f.initialIndex;
  const lastConsumption = lastReading ? lastReading.consumption : 0;
  const totalConsumption = currentIndex - f.initialIndex;

  return `
    <div class="facility-card ${isOpen ? 'open' : ''}" data-id="${f.id}">
      <div class="accordion-header" onclick="toggleAccordion('${f.id}')">
        <div class="facility-info-summary">
          <div class="subscriber-avatar">${f.name[0].toUpperCase()}</div>
          <div class="facility-text-info">
            <span class="facility-name">${escapeHtml(f.name)}</span>
            <div class="facility-index-summary">
              <div class="summary-item"><span class="summary-label">Güncel ${activeTab === 'tesis' ? 'Değer' : 'Endeks'}</span><span class="summary-value highlight">${currentIndex.toLocaleString('tr-TR')} ${f.unit || ''}</span></div>
              <div class="summary-item"><span class="summary-label">Toplam ${activeTab === 'tesis' ? 'Değişim' : 'Tük.'}</span><span class="summary-value">${totalConsumption.toLocaleString('tr-TR')} ${f.unit || ''}</span></div>
            </div>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn-icon btn-delete-header" data-id="${f.id}" title="${activeTab === 'tesis' ? 'Veri Adını Sil' : 'Tesisi Sil'}" style="color:#d63031; background:transparent; border:none; padding:8px; cursor:pointer; margin-right:5px; border-radius:4px; display:flex; align-items:center; justify-content:center;" onmouseover="this.style.background='rgba(214,48,49,0.1)'" onmouseout="this.style.background='transparent'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <button class="btn-enter-index" data-id="${f.id}" title="Yeni Endeks Gir">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Endeks Gir</span>
          </button>
          <div class="chevron-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></div>
        </div>
      </div>
      <div class="accordion-content">
        <div class="subscriber-stats">
          <div class="stat-box"><div class="stat-label">GÜNCEL ${activeTab === 'tesis' ? 'DEĞER' : 'ENDEKS'}</div><div class="stat-value">${currentIndex.toLocaleString('tr-TR')} ${f.unit || ''}</div></div>
          <div class="stat-box"><div class="stat-label">SON ${activeTab === 'tesis' ? 'DEĞİŞİM' : 'TÜKETİM'}</div><div class="stat-value accent">${lastConsumption.toLocaleString('tr-TR')} ${f.unit || ''}</div></div>
          <div class="stat-box"><div class="stat-label">TOPLAM ${activeTab === 'tesis' ? 'DEĞİŞİM' : 'TÜKETİM'}</div><div class="stat-value success">${totalConsumption.toLocaleString('tr-TR')} ${f.unit || ''}</div></div>
        </div>
        ${renderHistory(sortedReadings, f.id)}
        <div class="facility-actions-row">
          <button class="btn-icon danger btn-delete" data-id="${f.id}" title="Tesisi Sil">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
      <td class="note-cell">${escapeHtml(r.note || '')}</td>
      <td style="text-align: right;">
        <button class="btn-icon btn-edit-reading" data-fid="${facilityId}" data-rid="${r.id}" title="Düzenle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger btn-delete-reading" data-fid="${facilityId}" data-rid="${r.id}" title="Sil"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </td>
    </tr>
  `).join('');
  return `
    <div class="history-section">
      <div class="history-table-wrapper visible">
        <table class="history-table">
          <thead><tr><th>Tarih</th><th>Endeks</th><th>Tüketim</th><th>Not</th><th style="text-align: right;">İşlem</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSummary() {
  const activeList = facilities[activeTab] || [];
  let html = '';

  if (activeTab === 'tesis') {
    // Tesis: Günlük Rapor Tablosu
    const selectedDateStr = summaryDateSelect.value; // YYYY-MM-DD
    html = `<thead><tr><th>Veri Adı</th><th>Değer</th></tr></thead><tbody>`;
    if (activeList.length === 0) {
      html += `<tr><td colspan="2" style="text-align:center; padding: 40px;">Henüz tesis eklenmedi</td></tr>`;
    } else {
      activeList.forEach(f => {
        const reading = f.readings.find(r => r.date.startsWith(selectedDateStr));
        const unitLabel = f.unit ? ` <small style="font-size:0.7em; opacity:0.7;">${f.unit}</small>` : '';
        if (reading) {
          html += `<tr>
            <td>${escapeHtml(f.name)}</td>
            <td class="val-index">${reading.index.toLocaleString('tr-TR')}${unitLabel}</td>
          </tr>`;
        } else {
          html += `<tr>
            <td>${escapeHtml(f.name)}</td>
            <td class="empty-cell" style="text-align:center; color:#999;">— (Girilmedi)</td>
          </tr>`;
        }
      });
    }
  } else {
    // Elektrik / Su: Aylık Rapor Tablosu
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const monthsData = months.map((m, i) => ({
      label: m,
      key: `${selectedSummaryYear}-${String(i + 1).padStart(2, '0')}`
    }));

    html = `<thead><tr><th>Tesis Adı</th>${monthsData.map(m => `<th>${m.label}</th>`).join('')}</tr></thead><tbody>`;

    if (activeList.length === 0) {
      html += `<tr><td colspan="${monthsData.length + 1}" style="text-align:center; padding: 40px;">Henüz tesis eklenmedi</td></tr>`;
    } else {
      activeList.forEach(f => {
        html += `<tr><td>${escapeHtml(f.name)}</td>`;
        monthsData.forEach(m => {
          const reading = f.readings.find(r => r.date.startsWith(m.key));
          if (reading) {
            const val = summaryDataType === 'consumption' ? reading.consumption : reading.index;
            const cssClass = summaryDataType === 'consumption' ? 'val-consumption' : 'val-index';
            const noteMarker = reading.note ? `<span class="note-indicator" title="${escapeHtml(reading.note)}">*</span>` : '';
            html += `<td class="${cssClass}">${val.toLocaleString('tr-TR')}${noteMarker}</td>`;
          } else { html += `<td class="empty-cell">—</td>`; }
        });
        html += `</tr>`;
      });
    }
  }
  html += `</tbody>`;
  summaryTable.innerHTML = html;
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
  document.querySelectorAll('.btn-delete-header').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(btn.dataset.id); });
  });
}

function toggleAccordion(id) {
  openAccordionId = openAccordionId === id ? null : id;
  render();
}

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    
    // Theme & Active Tab logic
    if (view.startsWith('elek')) {
      activeTab = 'elektrik';
      document.body.classList.remove('theme-blue', 'theme-yellow');
      document.body.classList.add('theme-red');
    } else if (view.startsWith('su')) {
      activeTab = 'su';
      document.body.classList.remove('theme-red', 'theme-yellow');
      document.body.classList.add('theme-blue');
    } else if (view === 'tesis-manage' || view === 'tesis-summary') {
      activeTab = 'tesis'; 
      document.body.classList.remove('theme-red', 'theme-blue');
      document.body.classList.add('theme-yellow');
    }

    if (view === 'data-management') {
      managementView.style.display = 'none';
      summaryView.style.display = 'none';
      dataManagementView.style.display = 'block';
    } else if (view.endsWith('manage')) {
      managementView.style.display = 'block';
      summaryView.style.display = 'none';
      dataManagementView.style.display = 'none';
      
      const lblName = document.getElementById('lbl-facility-name');
      const initialGroup = document.getElementById('lbl-initial-index').parentElement;
      const unitGroup = document.getElementById('unit-group');

      if (activeTab === 'tesis') {
        activeTabName.textContent = 'Genel Tesis';
        lblName.textContent = 'Veri Adı';
        initialGroup.style.display = 'none'; // Hide Initial Value for Tesis
        unitGroup.style.display = 'block';
      } else {
        activeTabName.textContent = activeTab === 'elektrik' ? 'Elektrik' : 'Su';
        lblName.textContent = 'Tesis Adı';
        document.getElementById('lbl-initial-index').textContent = 'Başlangıç Endeksi';
        initialGroup.style.display = 'block';
        unitGroup.style.display = 'none';
      }
      document.getElementById('add-section').style.display = 'block';
      render(); 
    } else {
      managementView.style.display = 'none';
      summaryView.style.display = 'block';
      const summaryTitle = document.getElementById('summary-title');
      let titlePrefix = '';
      if (activeTab === 'elektrik') titlePrefix = 'Elektrik';
      else if (activeTab === 'su') titlePrefix = 'Su';
      else titlePrefix = 'Genel Tesis';
      
      summaryTitle.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> ${titlePrefix} Tüketim Özeti`;
      
      // Tesis özetinde Değer/Fark seçimini gizle ve tarih seçiciyi göster
      const toggleGroup = document.querySelector('.summary-toggle-group');
      if (activeTab === 'tesis') {
        toggleGroup.style.display = 'none';
        summaryYearSelect.style.display = 'none';
        summaryDateSelect.style.display = 'inline-block';
        if (!summaryDateSelect.value) {
          summaryDateSelect.value = new Date().toISOString().substring(0, 10);
        }
        summaryDataType = 'index'; // Her zaman değer göster
      } else {
        toggleGroup.style.display = 'flex';
        summaryYearSelect.style.display = 'inline-block';
        summaryDateSelect.style.display = 'none';
        
        // Diğer sekmelere geçince aktif olan butona göre veri tipini eski haline getir
        const activeToggle = document.querySelector('.toggle-btn.active');
        summaryDataType = activeToggle ? activeToggle.dataset.type : 'consumption';
      }
      
      populateYearSelect();
      renderSummary();
    }
    openAccordionId = null;
  });
});

summaryToggleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    summaryToggleBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    summaryDataType = btn.dataset.type;
    renderSummary();
  });
});

summaryYearSelect.addEventListener('change', () => {
  selectedSummaryYear = parseInt(summaryYearSelect.value, 10);
  renderSummary();
});

summaryDateSelect.addEventListener('change', () => {
  renderSummary();
});

btnExportPdf.addEventListener('click', exportToPDF);
btnExportCsv.addEventListener('click', exportToCSV);

// Data Management Event Listeners
btnExportJson.addEventListener('click', exportToJSON);
btnImportJsonTrigger.addEventListener('click', () => importJsonInput.click());
importJsonInput.addEventListener('change', importFromJSON);
btnConnectFile.addEventListener('click', connectToJSONFile);

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const unit = document.getElementById('facility-unit').value.trim();
  
  // Tesis için başlangıç değeri 0 kabul edilir, diğerleri için inputtan okunur
  let initial = 0;
  if (activeTab !== 'tesis') {
    initial = parseFloat(initialIndexInput.value) || 0;
  }
  
  if (!name) return;
  const newFacility = { 
    id: generateId(), 
    name, 
    createdAt: new Date().toISOString(), 
    initialIndex: initial, 
    unit: activeTab === 'tesis' ? unit : '',
    readings: [] 
  };
  facilities[activeTab].push(newFacility);
  await saveData();
  render();
  nameInput.value = ''; initialIndexInput.value = ''; 
  if(document.getElementById('facility-unit')) document.getElementById('facility-unit').value = '';
  nameInput.focus();
  
  let label = '';
  if (activeTab === 'elektrik') label = 'Elektrik';
  else if (activeTab === 'su') label = 'Su';
  else label = 'Genel Tesis';
  showToast(`${activeTab === 'tesis' ? 'Veri' : 'Tesis'} eklendi (${label}): ${name}`);
});

function openIndexModal(fid, rid = null) {
  currentFacilityId = fid; editingReadingId = rid;
  const activeList = facilities[activeTab];
  const f = activeList.find(fac => fac.id === fid);
  
  // Tesis için günlük (date), diğerleri için aylık (month) giriş
  readingDateInput.type = activeTab === 'tesis' ? 'date' : 'month';

  if (rid) {
    const r = f.readings.find(x => x.id === rid);
    modalTitle.textContent = `${f.name} — Kayıt Düzenle`;
    newIndexInput.value = r.index; 
    
    if (activeTab === 'tesis') {
      readingDateInput.value = r.date.substring(0, 10); // YYYY-MM-DD
    } else {
      readingDateInput.value = r.date.substring(0, 7); // YYYY-MM
    }
    
    readingNoteInput.value = r.note || '';
    const others = f.readings.filter(x => x.id !== rid).sort((a,b) => new Date(a.date) - new Date(b.date));
    let prev = f.initialIndex;
    for(let x of others) { if (new Date(x.date) < new Date(r.date)) prev = x.index; }
    modalPrevIndex.textContent = prev.toLocaleString('tr-TR');
  } else {
    const lastIdx = getLatestIndex(f);
    modalTitle.textContent = `${f.name} — ${activeTab === 'tesis' ? 'Veri Değeri' : activeTab.toUpperCase() + ' Endeksi'}`;
    modalPrevIndex.textContent = lastIdx.toLocaleString('tr-TR');
    newIndexInput.value = '';
    readingNoteInput.value = '';
    const now = new Date(); 
    if (activeTab === 'tesis') {
      readingDateInput.value = now.toISOString().substring(0, 10);
    } else {
      readingDateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  consumptionPreview.style.display = 'none';
  modalOverlay.classList.add('active');
  setTimeout(() => newIndexInput.focus(), 100);
}

function closeIndexModal() { modalOverlay.classList.remove('active'); currentFacilityId = null; editingReadingId = null; }
btnCloseModal.addEventListener('click', closeIndexModal);
modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) closeIndexModal(); });
newIndexInput.addEventListener('input', updateConsumptionPreview);
readingDateInput.addEventListener('input', updateConsumptionPreview);

function updateConsumptionPreview() {
  const activeList = facilities[activeTab];
  const f = activeList.find(fac => fac.id === currentFacilityId);
  if (!f) return;
  const val = parseInt(newIndexInput.value, 10);
  const date = readingDateInput.value;
  if (!isNaN(val) && date) {
    const others = f.readings.filter(x => x.id !== editingReadingId).sort((a,b) => new Date(a.date) - new Date(date))
    let prev = f.initialIndex;
    for(let x of others) { if (new Date(x.date) < new Date(date)) prev = x.index; }
    consumptionPreview.style.display = 'block';
    previewValue.textContent = (val - prev).toLocaleString('tr-TR');
  } else { consumptionPreview.style.display = 'none'; }
}

indexForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const activeList = facilities[activeTab];
  const f = activeList.find(fac => fac.id === currentFacilityId);
  const val = parseInt(newIndexInput.value, 10); const date = readingDateInput.value;
  const note = readingNoteInput.value.trim();
  if (isNaN(val) || !date) { showToast('Hatalı giriş!'); return; }
  const check = validateReading(f, date, val, editingReadingId);
  if (!check.valid) { showToast(check.msg); return; }
  if (editingReadingId) {
    const r = f.readings.find(x => x.id === editingReadingId);
    r.index = val; r.date = new Date(date).toISOString();
    r.note = note;
  } else { f.readings.push({ id: generateId(), date: new Date(date).toISOString(), index: val, consumption: 0, note: note }); }
  recalculateConsumptions(f); await saveData(); render(); closeIndexModal();
  showToast(editingReadingId ? 'Kayıt güncellendi' : 'Endeks kaydedildi');
});

async function deleteReading(fid, rid) {
  const activeList = facilities[activeTab];
  const f = activeList.find(fac => fac.id === fid);
  f.readings = f.readings.filter(r => r.id !== rid);
  recalculateConsumptions(f); await saveData(); render(); showToast('Kayıt silindi');
}

function openDeleteModal(id) {
  deleteFacilityId = id; const activeList = facilities[activeTab]; const f = activeList.find(fac => fac.id === id);
  deleteName.textContent = f.name; deleteModalOverlay.classList.add('active');
}
function closeDeleteModal() { deleteModalOverlay.classList.remove('active'); deleteFacilityId = null; }
btnConfirmDelete.addEventListener('click', async () => {
  facilities[activeTab] = facilities[activeTab].filter(f => f.id !== deleteFacilityId);
  await saveData(); render(); closeDeleteModal(); showToast('Tesis silindi');
});
btnCancelDelete.addEventListener('click', closeDeleteModal);
btnCloseDeleteModal.addEventListener('click', closeDeleteModal);

async function exportToPDF() {
  const monthsFull = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const monthsShort = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const typeLabel = summaryDataType === 'consumption' ? 'Aylık Tüketim' : 'Endeks Değerleri';

  showToast('Yazı boyutu maksimize ediliyor...');

  const generateTable = (cat) => {
    const list = facilities[cat] || [];
    if (list.length === 0) return `<div style="text-align:center; padding:15px; border:1px solid #ccc;">Veri bulunamadı.</div>`;
    
    let t = '';
    
    if (cat === 'tesis') {
      const selectedDateStr = summaryDateSelect.value || new Date().toISOString().substring(0, 10);
      
      let topList = list;
      let bottomList = [];
      if (list.length > 4) {
        topList = list.slice(0, list.length - 4);
        bottomList = list.slice(list.length - 4);
      }

      const renderRows = (items) => {
        let rowsHtml = '';
        items.forEach((f, index) => {
          const reading = f.readings.find(r => r.date.startsWith(selectedDateStr));
          const rowBg = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
          const isAzot = f.name === 'Tanktaki Sıvı Azot Değişimi';
          const nameColor = isAzot ? '#d63031' : '#000000';
          const valueColor = isAzot ? '#d63031' : '#000000';

          if (reading) {
            rowsHtml += `<tr style="background:${rowBg};">
              <td style="border:1.1px solid #000; padding:4px; font-weight:bold; font-size:11px; color:${nameColor}; vertical-align:middle; word-break:break-all;">${escapeHtml(f.name)}</td>
              <td style="border:1.1px solid #000; padding:4px; text-align:center !important; vertical-align:middle; color:${valueColor}; font-weight:bold; font-size:11px;">${reading.index.toLocaleString('tr-TR')} ${f.unit || ''}</td>
            </tr>`;
          } else {
            rowsHtml += `<tr style="background:${rowBg};">
              <td style="border:1.1px solid #000; padding:4px; font-weight:bold; font-size:11px; color:${nameColor}; vertical-align:middle; word-break:break-all;">${escapeHtml(f.name)}</td>
              <td style="border:1.1px solid #000; padding:4px; text-align:center !important; vertical-align:middle; color:#999; font-size:11px;">— (Girilmedi)</td>
            </tr>`;
          }
        });
        return rowsHtml;
      };
      
      t = `<table style="width:100%; border-collapse:collapse; margin-bottom:${bottomList.length > 0 ? '0px' : '20px'}; background:#fff; table-layout:fixed; border:1.1px solid #000;">
        <colgroup><col style="width:60%;"><col style="width:40%;"></colgroup>
        <thead>
          <tr style="background:#f1f2f6;">
            <th style="border:1.1px solid #000; padding:4px; text-align:left; vertical-align:middle; font-size:11px; color:#000;">Veri Adı</th>
            <th style="border:1.1px solid #000; padding:4px; text-align:center; vertical-align:middle; font-size:11px; color:#000;">Değer</th>
          </tr>
        </thead>
        <tbody>
          ${renderRows(topList)}
        </tbody>
      </table>`;

      if (bottomList.length > 0) {
        let bottomSum = 0;
        bottomList.forEach(f => {
          const reading = f.readings.find(r => r.date.startsWith(selectedDateStr));
          if (reading && !isNaN(reading.index)) {
            bottomSum += reading.index;
          }
        });

        t += `<div style="height:15px;"></div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; background:#fff; table-layout:fixed; border:1.1px solid #000;">
          <colgroup><col style="width:60%;"><col style="width:40%;"></colgroup>
          <tbody>
            ${renderRows(bottomList)}
            <tr style="background:#eef2f3;">
              <td style="border:1.1px solid #000; padding:4px; font-weight:bold; font-size:11.5px; color:#000; vertical-align:middle;">Toplam Kullanım</td>
              <td style="border:1.1px solid #000; padding:4px; text-align:center !important; vertical-align:middle; color:#000; font-weight:bold; font-size:11.5px;">${bottomSum.toLocaleString('tr-TR')} Nm3</td>
            </tr>
          </tbody>
        </table>`;
      }
      
    } else {
      const monthlyTotals = new Array(12).fill(0);
      list.forEach(f => {
        monthsFull.forEach((m, i) => {
          const key = `${selectedSummaryYear}-${String(i + 1).padStart(2, '0')}`;
          const reading = f.readings.find(r => r.date && r.date.startsWith(key));
          if (reading) {
            monthlyTotals[i] += summaryDataType === 'consumption' ? (reading.consumption || 0) : (reading.index || 0);
          }
        });
      });

      t = `<table style="width:100%; border-collapse:collapse; margin-bottom:20px; background:#fff; table-layout:fixed; border:1.1px solid #000;">
        <thead>
          <tr style="background:#f1f2f6;">
            <th style="border:1.1px solid #000; padding:4px; text-align:left; vertical-align:middle; font-size:11px; width:130px; color:#000;">Tesis Adı (${list.length})</th>`;
      monthsShort.forEach(m => t += `<th style="border:1.1px solid #000; padding:4px; text-align:center; vertical-align:middle; font-size:11px; color:#000;">${m}</th>`);
      t += `</tr></thead><tbody>`;
      
      list.forEach((f, index) => {
        const rowBg = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
        t += `<tr style="background:${rowBg};">
          <td style="border:1.1px solid #000; padding:3px; font-weight:bold; font-size:11px; color:#000; vertical-align:middle; word-break:break-all;">${escapeHtml(f.name || 'Tesis')}</td>`;
        
        monthsFull.forEach((m, i) => {
          const key = `${selectedSummaryYear}-${String(i + 1).padStart(2, '0')}`;
          const reading = f.readings.find(r => r.date && r.date.startsWith(key));
          if (reading) {
            const val = summaryDataType === 'consumption' ? (reading.consumption || 0) : (reading.index || 0);
            const color = cat === 'elektrik' ? '#d63031' : '#0984e3';
            t += `<td style="border:1.1px solid #000; padding:3px; text-align:center !important; vertical-align:middle; color:${color}; font-weight:bold; font-size:10.5px; font-family:'Arial Narrow',Arial,sans-serif; white-space:nowrap; letter-spacing:-0.3px;">${val.toLocaleString('tr-TR').trim()}</td>`;
          } else {
            t += `<td style="border:1.1px solid #000; padding:3px; text-align:center !important; vertical-align:middle; color:#999; font-size:10.5px;">—</td>`;
          }
        });
        t += `</tr>`;
      });

      t += `<tr>
        <td style="border:1.1px solid #000; padding:4px; font-weight:bold; font-size:11.5px; color:#000; text-align:right; vertical-align:middle; background:#f1f2f6;">TOPLAM :</td>`;
      monthlyTotals.forEach(tot => {
        const totalStr = tot > 0 ? tot.toLocaleString('tr-TR') : '—';
        t += `<td style="border:1.1px solid #000; padding:4px; text-align:center !important; font-weight:bold; font-size:10.5px; color:#000; vertical-align:middle; font-family:'Arial Narrow',Arial,sans-serif; background:#f1f2f6; white-space:nowrap; letter-spacing:-0.3px;">${totalStr}</td>`;
      });
      t += `</tr></tbody></table>`;
    }
    
    return t;
  };

  const reportHtml = activeTab === 'tesis' ? `
    <div style="width:1122px; background:#fff; padding:20px; padding-left:100px; box-sizing:border-box; font-family: Arial, sans-serif; color:#000;">
      <div style="width:1020px; background:#fff;">
        <!-- GENEL TESİS SAYFASI -->
        <div style="margin-bottom:30px; padding-bottom:10px;">
          <div style="text-align:center; margin-bottom:20px; padding:15px; border:2px solid #000000;">
            <h1 style="margin:0; font-size:24px; color:#000000;">GÜNLÜK TESİS VERİ RAPORU</h1>
            <p style="font-size:14px; margin:5px 0;">Tarih: ${formatDate(summaryDateSelect.value || new Date().toISOString().substring(0, 10))}</p>
          </div>
          ${generateTable('tesis')}
        </div>
      </div>
    </div>
  ` : `
    <div style="width:1122px; background:#fff; padding:20px; padding-left:100px; box-sizing:border-box; font-family: Arial, sans-serif; color:#000;">
      <div style="width:1020px; background:#fff;">
        <!-- ELEKTRİK SAYFASI -->
        <div style="page-break-after:always; margin-bottom:30px; padding-bottom:10px;">
          <div style="text-align:center; margin-bottom:20px; padding:15px; border:2px solid #eb4d4b;">
            <h1 style="margin:0; font-size:24px; color:#eb4d4b;">HAT ${selectedSummaryYear} YILI ELEKTRİK TÜKETİM RAPORU</h1>
            <p style="font-size:14px; margin:5px 0;">Yıllık ${typeLabel} Özeti</p>
          </div>
          ${generateTable('elektrik')}
          <div style="margin-top:20px; font-size:11px; color:#666; text-align:right;">
            Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}
          </div>
        </div>
        
        <!-- SU SAYFASI -->
        <div style="padding-top:10px;">
          <div style="text-align:center; margin-bottom:20px; padding:15px; border:2px solid #0984e3;">
            <h1 style="margin:0; font-size:24px; color:#0984e3;">HAT ${selectedSummaryYear} YILI SU TÜKETİM RAPORU</h1>
            <p style="font-size:14px; margin:5px 0;">Yıllık ${typeLabel} Özeti</p>
          </div>
          ${generateTable('su')}
          <div style="margin-top:20px; font-size:11px; color:#666; text-align:right;">
            Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}
          </div>
        </div>
      </div>
    </div>
  `;

  const fileName = activeTab === 'tesis' ? `Genel_Tesis_Raporu_${selectedSummaryYear}.pdf` : `Elektrik_Su_Raporu_${selectedSummaryYear}.pdf`;

  const opt = {
    margin: 0,
    filename: fileName,
    image: { type: 'jpeg', quality: 1.0 },
    html2canvas: { scale: 2, useCORS: true, windowWidth: 1122, scrollX: 0, scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
    pagebreak: { mode: ['css', 'legacy'] }
  };

  try {
    await html2pdf().set(opt).from(reportHtml).save();
    showToast('PDF başarıyla oluşturuldu.');
  } catch (err) {
    showToast('Hata: PDF oluşturulamadı.');
  }
}

// ===== Export / Import Logic =====

function exportToJSON() {
  const dataStr = JSON.stringify(facilities, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Tesis_Yedek_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Veriler JSON olarak indirildi');
}

async function importFromJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const importedData = JSON.parse(event.target.result);
      
      // Basic validation
      if (!importedData.elektrik || !importedData.su || !importedData.tesis) {
        throw new Error('Geçersiz dosya formatı!');
      }

      if (confirm('Mevcut veriler silinecek ve yedekteki veriler yüklenecek. Onaylıyor musunuz?')) {
        facilities = importedData;
        await saveData();
        render();
        renderSummary();
        showToast('Veriler başarıyla geri yüklendi');
      }
    } catch (err) {
      alert('Hata: ' + err.message);
    }
    importJsonInput.value = ''; // Reset for next use
  };
  reader.readAsText(file);
}

function exportToCSV() {
  const table = document.getElementById('summary-table');
  if (!table || table.rows.length === 0) {
    showToast('Dışa aktarılacak veri bulunamadı');
    return;
  }

  let csvContent = "\uFEFF"; // UTF-8 BOM for Excel Turkish character support
  
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const rowData = [];
    for (let j = 0; j < row.cells.length; j++) {
      let content = row.cells[j].innerText.replace(/\n/g, " ").replace(/;/g, ",");
      rowData.push(`"${content}"`);
    }
    csvContent += rowData.join(";") + "\r\n";
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${activeTab}_Raporu_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Tablo CSV olarak indirildi');
}

// ===== Direct File System Access (Canlı JSON) =====

async function connectToJSONFile() {
  if (!('showOpenFilePicker' in window)) {
    alert('Tarayıcınız doğrudan dosya erişimini desteklemiyor. Lütfen Chrome veya Edge kullanın.');
    return;
  }

  try {
    // Eğer hali hazırda bir handle varsa ve izin istiyorsak
    if (fileHandle) {
      const permission = await fileHandle.requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        const file = await fileHandle.getFile();
        const content = await file.text();
        facilities = JSON.parse(content);
        isFileConnected = true;
        localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(facilities));
        render();
        renderSummary();
        fileStatusText.textContent = `Bağlı: ${fileHandle.name}`;
        fileStatusText.style.color = 'var(--success)';
        showToast('Bağlantı tazelendi.');
        return;
      }
    }

    // Yoksa yeni dosya seçtir
    const [handle] = await window.showOpenFilePicker({
      types: [{
        description: 'JSON Veri Dosyası',
        accept: { 'application/json': ['.json'] },
      }],
      multiple: false
    });

    fileHandle = handle;
    await saveFileHandle(fileHandle); // Handle'ı hafızaya kaydet
    
    const file = await fileHandle.getFile();
    const content = await file.text();
    
    try {
      const data = JSON.parse(content);
      if (data.elektrik && data.su && data.tesis) {
        facilities = data;
        isFileConnected = true;
        localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(facilities));
        render();
        renderSummary();
        updateFileStatus();
        showToast('Dosya bağlandı ve hafızaya alındı.');
      }
    } catch (e) {
      alert('Hata: Dosya içeriği geçersiz veya uyumsuz.');
      fileHandle = null;
      isFileConnected = false;
      updateFileStatus();
    }
  } catch (err) {
    console.error('Dosya işlemi iptal edildi:', err);
  }
}

async function writeToConnectedFile() {
  if (!fileHandle) return;

  try {
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(facilities, null, 2));
    await writable.close();
    console.log('Veriler dosyaya yazıldı:', fileHandle.name);
    isFileConnected = true;
    updateFileStatus();
  } catch (err) {
    console.error('Dosyaya yazılamadı:', err);
    showToast('Hata: Dosyaya yazılamadı. Yetki verilmemiş olabilir.');
    isFileConnected = false;
    updateFileStatus();
  }
}

window.toggleAccordion = toggleAccordion;
initApp();
