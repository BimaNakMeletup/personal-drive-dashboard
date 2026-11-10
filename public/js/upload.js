/**
 * Upload & Folder Creation Handler dengan Tampilan Loading Khas Google Drive
 */
const UploadManager = {
  widgetEl: null,
  bodyEl: null,
  titleTextEl: null,
  toggleBtn: null,
  closeBtn: null,
  isCollapsed: false,
  uploadQueue: [],
  activeUploadsCount: 0,

  init() {
    this.setupWidgetElements();
    this.setupDropzone();
    this.setupFileInput();
    this.setupNewFolderModal();
  },

  setupWidgetElements() {
    this.widgetEl = document.getElementById('gdrive-upload-widget');
    this.bodyEl = document.getElementById('gdrive-upload-body');
    this.titleTextEl = document.getElementById('gdrive-upload-title-text');
    this.toggleBtn = document.getElementById('gdrive-upload-toggle');
    this.closeBtn = document.getElementById('gdrive-upload-close');

    if (this.toggleBtn) {
      this.toggleBtn.onclick = () => {
        this.isCollapsed = !this.isCollapsed;
        this.widgetEl.classList.toggle('collapsed', this.isCollapsed);
        const icon = document.getElementById('gdrive-upload-toggle-icon');
        if (icon) {
          icon.setAttribute('data-lucide', this.isCollapsed ? 'chevron-up' : 'chevron-down');
          if (window.lucide) window.lucide.createIcons();
        }
      };
    }

    if (this.closeBtn) {
      this.closeBtn.onclick = () => {
        this.widgetEl.classList.remove('active');
        this.bodyEl.innerHTML = '';
      };
    }
  },

  setupDropzone() {
    const dropzone = document.getElementById('dropzone');
    const overlay = document.getElementById('drag-overlay');

    if (!dropzone || !overlay) return;

    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      overlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        overlay.classList.remove('active');
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragCounter = 0;
      overlay.classList.remove('active');

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        await this.handleFilesUpload(Array.from(files));
      }
    });
  },

  setupFileInput() {
    const fileInput = document.getElementById('file-upload-input');
    const uploadBtn = document.getElementById('btn-upload-file');

    if (!fileInput || !uploadBtn) return;

    uploadBtn.onclick = () => {
      if (DriveApp.currentFolderId === null) {
        showToast('Buka salah satu folder terlebih dahulu sebelum mengunggah berkas!', 'warning');
        return;
      }
      fileInput.click();
    };

    fileInput.onchange = async () => {
      if (fileInput.files && fileInput.files.length > 0) {
        await this.handleFilesUpload(Array.from(fileInput.files));
        fileInput.value = ''; // Reset input agar bisa pilih file yang sama
      }
    };
  },

  async handleFilesUpload(files) {
    if (!files || files.length === 0) return;

    const currentFolderId = DriveApp.currentFolderId || 'root';

    // Munculkan floating widget Google Drive
    this.widgetEl.classList.remove('collapsed');
    this.widgetEl.classList.add('active');
    this.isCollapsed = false;

    this.activeUploadsCount += files.length;
    this.updateWidgetTitle();

    for (const file of files) {
      await this.uploadSingleFile(file, currentFolderId);
    }

    // Refresh folder dan kuota storage setelah seluruh upload selesai
    DriveApp.loadFolder(currentFolderId);
    DriveApp.loadDriveInfo();
  },

  updateWidgetTitle() {
    if (!this.titleTextEl) return;
    if (this.activeUploadsCount > 0) {
      this.titleTextEl.textContent = `Mengunggah ${this.activeUploadsCount} item...`;
    } else {
      this.titleTextEl.textContent = 'Semua upload selesai';
    }
  },

  async uploadSingleFile(file, folderId) {
    const rowId = 'upload-row-' + Math.random().toString(36).substring(2, 9);
    const iconName = DriveApp.getFileIcon(file.type, file.name);
    const totalFormatted = DriveApp.formatBytes(file.size);

    // Buat elemen row di dalam widget
    const rowEl = document.createElement('div');
    rowEl.className = 'upload-item-row';
    rowEl.id = rowId;

    rowEl.innerHTML = `
      <div class="upload-item-left">
        <div class="upload-item-icon">
          <i data-lucide="${iconName}"></i>
        </div>
        <div class="upload-item-info">
          <span class="upload-item-name" title="${DriveApp.escapeHtml(file.name)}">${DriveApp.escapeHtml(file.name)}</span>
          <span class="upload-item-status" id="${rowId}-status">Memulai... (0% dari ${totalFormatted})</span>
        </div>
      </div>
      <div class="upload-item-right" id="${rowId}-action">
        <!-- Circular Progress Ring Google Drive Style -->
        <div class="progress-ring-container">
          <svg class="progress-ring" id="${rowId}-ring">
            <circle class="progress-ring-circle-bg" cx="16" cy="16" r="14" />
            <circle class="progress-ring-circle" id="${rowId}-circle" cx="16" cy="16" r="14" />
          </svg>
        </div>
      </div>
    `;

    // Pasang di bagian teratas widget body
    this.bodyEl.prepend(rowEl);
    if (window.lucide) window.lucide.createIcons();

    const circleEl = document.getElementById(`${rowId}-circle`);
    const statusEl = document.getElementById(`${rowId}-status`);
    const actionEl = document.getElementById(`${rowId}-action`);
    const ringEl = document.getElementById(`${rowId}-ring`);

    const circumference = 2 * Math.PI * 14; // ~87.96

    try {
      const res = await API.uploadFileWithProgress(file, folderId, (progress) => {
        const percent = progress.percent;
        const loadedFormatted = DriveApp.formatBytes(progress.loaded);
        const offset = circumference - (percent / 100) * circumference;

        if (circleEl) circleEl.style.strokeDashoffset = offset;

        if (percent < 100) {
          if (statusEl) {
            statusEl.textContent = `${loadedFormatted} dari ${totalFormatted} (${percent}%)`;
          }
        } else {
          // 100% dari client ke server selesai, sekarang Google Drive API sedang memproses
          if (statusEl) {
            statusEl.textContent = 'Menyimpan ke Google Drive...';
          }
          if (ringEl) {
            ringEl.classList.add('spinner-ring');
          }
        }
      });

      if (res.success) {
        if (statusEl) {
          statusEl.textContent = 'Upload selesai';
          statusEl.style.color = 'var(--success)';
        }
        if (actionEl) {
          actionEl.innerHTML = `<i data-lucide="check-circle" class="upload-success-icon"></i>`;
          if (window.lucide) window.lucide.createIcons();
        }
        showToast(`"${file.name}" berhasil diunggah!`, 'success');

        // Catat ke Log Aktivitas
        if (window.ActivityLogger) {
          ActivityLogger.addLog({
            type: 'upload',
            action: 'Upload Berkas Berhasil',
            title: file.name,
            details: `${totalFormatted} • Folder: ${DriveApp.currentFolderName}`,
            status: 'success',
            link: res.data?.webViewLink,
          });
        }
      } else {
        throw new Error(res.message || 'Gagal mengunggah');
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = `Gagal: ${err.message || 'Error'}`;
        statusEl.style.color = 'var(--danger)';
      }
      if (actionEl) {
        actionEl.innerHTML = `<i data-lucide="alert-circle" class="upload-error-icon"></i>`;
        if (window.lucide) window.lucide.createIcons();
      }
      showToast(`Gagal mengunggah "${file.name}"`, 'error');

      // Catat kegagalan ke Log Aktivitas
      if (window.ActivityLogger) {
        ActivityLogger.addLog({
          type: 'upload',
          action: 'Upload Berkas Gagal',
          title: file.name,
          details: `${err.message || 'Koneksi terputus'}`,
          status: 'error',
        });
      }
    } finally {
      this.activeUploadsCount = Math.max(0, this.activeUploadsCount - 1);
      this.updateWidgetTitle();
    }
  },

  setupNewFolderModal() {
    const modal = document.getElementById('new-folder-modal');
    const openBtn = document.getElementById('btn-new-folder');
    const closeBtn = document.getElementById('new-folder-close');
    const cancelBtn = document.getElementById('new-folder-cancel');
    const submitBtn = document.getElementById('new-folder-submit');
    const nameInput = document.getElementById('new-folder-name');
    const parentLinkInput = document.getElementById('new-folder-parent-link');

    if (!modal || !openBtn) return;

    openBtn.onclick = () => {
      nameInput.value = '';
      parentLinkInput.value = '';
      modal.classList.add('active');
      setTimeout(() => nameInput.focus(), 50);
    };

    const closeModal = () => modal.classList.remove('active');
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    submitBtn.onclick = async () => {
      const name = nameInput.value.trim();
      const customParentLink = parentLinkInput.value.trim();

      if (!name) {
        showToast('Nama folder tidak boleh kosong', 'error');
        return;
      }

      // Jika di halaman beranda dan tidak memasukkan link induk
      if (DriveApp.currentFolderId === null && !customParentLink) {
        showToast('Masukkan link folder Google Drive induk tempat folder ini akan dibuat!', 'warning');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Membuat...';

      try {
        const targetParentId = customParentLink ? customParentLink : (DriveApp.currentFolderId || 'root');

        const res = await API.createFolder(name, targetParentId);
        if (res.success) {
          showToast(res.message, 'success');
          closeModal();

          // Otomatis daftarkan ke daftar folder terhubung
          if (res.data?.id) {
            DriveApp.addConnectedFolder(name, res.data.id, res.data.webViewLink);
          }

          if (res.data?.webViewLink) {
            this.showFolderCreatedResult(res.data);
          }

          // Catat pembuatan folder ke Log Aktivitas
          if (window.ActivityLogger) {
            ActivityLogger.addLog({
              type: 'create_folder',
              action: 'Membuat Folder Baru',
              title: name,
              details: `Folder berhasil dibuat di Google Drive`,
              status: 'success',
              link: res.data?.webViewLink,
            });
          }

          if (DriveApp.currentFolderId === null) {
            DriveApp.loadDashboard();
          } else {
            DriveApp.loadFolder(DriveApp.currentFolderId);
          }
        } else {
          showToast(res.message, 'error');
        }
      } catch (err) {
        showToast('Gagal membuat folder di Google Drive', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Buat Folder';
      }
    };
  },

  showFolderCreatedResult(folder) {
    const modal = document.getElementById('folder-result-modal');
    if (!modal) return;

    const linkInput = document.getElementById('created-folder-link');
    const openBtn = document.getElementById('created-folder-open');
    const copyBtn = document.getElementById('created-folder-copy');
    const closeBtn = document.getElementById('folder-result-close');

    if (linkInput) linkInput.value = folder.webViewLink || '';
    if (openBtn) openBtn.onclick = () => window.open(folder.webViewLink, '_blank');

    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(folder.webViewLink);
        showToast('Link folder Google Drive berhasil disalin ke clipboard!', 'success');
      };
    }

    if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');

    modal.classList.add('active');
  },
};
