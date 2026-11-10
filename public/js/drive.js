/**
 * Main Google Drive Explorer & Navigation Controller
 * Mode Terfokus: Hanya membaca folder yang dimasukkan link-nya oleh pengguna
 */
const DriveApp = {
  currentFolderId: null, // null = Halaman Beranda (Folder Terhubung)
  currentFolderName: 'Folder Terhubung',
  folderHistory: [], // Array breadcrumb { id, name }
  currentItems: [],
  currentView: 'grid', // 'grid' | 'list'
  connectedFolders: [], // Daftar folder yang didaftarkan pengguna lewat link

  async init() {
    this.loadConnectedFoldersFromStorage();
    this.setupViewToggles();
    this.setupSearch();
    this.setupOpenLinkModal();
    this.setupAuthButtons();

    await this.checkAuthStatus();
    UploadManager.init();
  },

  // ===================== STORAGE & STATE =====================
  loadConnectedFoldersFromStorage() {
    try {
      const raw = localStorage.getItem('connected_drive_folders');
      this.connectedFolders = raw ? JSON.parse(raw) : [];
    } catch (_) {
      this.connectedFolders = [];
    }
    this.renderSidebarFolders();
  },

  saveConnectedFolders() {
    localStorage.setItem('connected_drive_folders', JSON.stringify(this.connectedFolders));
    this.renderSidebarFolders();
  },

  addConnectedFolder(name, folderId, link) {
    if (!this.connectedFolders.some((f) => f.id === folderId)) {
      this.connectedFolders.push({
        id: folderId,
        name,
        link: link || `https://drive.google.com/drive/folders/${folderId}`,
        addedAt: new Date().toISOString(),
      });
      this.saveConnectedFolders();
    }
  },

  removeConnectedFolder(folderId) {
    this.connectedFolders = this.connectedFolders.filter((f) => f.id !== folderId);
    this.saveConnectedFolders();
    if (this.currentFolderId === folderId) {
      this.loadDashboard();
    } else if (this.currentFolderId === null) {
      this.loadDashboard();
    }
  },

  // ===================== AUTH & STATE =====================
  async checkAuthStatus() {
    try {
      const res = await API.getStatus();
      const { configured, authenticated } = res.data;

      const authAlert = document.getElementById('auth-alert');
      const unconfiguredAlert = document.getElementById('unconfigured-alert');
      const appContainer = document.getElementById('app-container');
      const btnConnect = document.getElementById('btn-connect-google');
      const btnLogout = document.getElementById('btn-logout');

      if (!configured) {
        if (unconfiguredAlert) unconfiguredAlert.style.display = 'block';
        if (authAlert) authAlert.style.display = 'none';
        if (appContainer) appContainer.style.display = 'none';
        if (btnConnect) btnConnect.style.display = 'none';
        if (btnLogout) btnLogout.style.display = 'none';
        return;
      }

      if (unconfiguredAlert) unconfiguredAlert.style.display = 'none';

      if (!authenticated) {
        if (authAlert) authAlert.style.display = 'block';
        if (appContainer) appContainer.style.display = 'none';
        if (btnConnect) btnConnect.style.display = 'inline-flex';
        if (btnLogout) btnLogout.style.display = 'none';
        return;
      }

      // Authenticated!
      if (authAlert) authAlert.style.display = 'none';
      if (appContainer) appContainer.style.display = 'flex';
      if (btnConnect) btnConnect.style.display = 'none';
      if (btnLogout) btnLogout.style.display = 'inline-flex';

      // Muat info profil
      await this.loadDriveInfo();

      // Buka halaman Beranda (Folder Terhubung) - BUKAN membaca seluruh My Drive
      this.loadDashboard();
    } catch (err) {
      console.error('Failed to check auth status:', err);
    }
  },

  setupAuthButtons() {
    const btnConnect = document.getElementById('btn-connect-google');
    const btnConnectBanner = document.getElementById('btn-connect-banner');
    const btnLogout = document.getElementById('btn-logout');

    const handleConnect = async () => {
      try {
        const res = await API.getAuthUrl();
        if (res.success && res.data?.url) {
          window.location.href = res.data.url;
        } else {
          showToast(res.message || 'Gagal membuat URL login Google', 'error');
        }
      } catch (err) {
        showToast('Terjadi kesalahan saat memanggil API login', 'error');
      }
    };

    if (btnConnect) btnConnect.onclick = handleConnect;
    if (btnConnectBanner) btnConnectBanner.onclick = handleConnect;

    if (btnLogout) {
      btnLogout.onclick = async () => {
        if (confirm('Apakah Anda yakin ingin keluar dari akun Google Drive ini?')) {
          await API.logout();
          window.location.reload();
        }
      };
    }
  },

  async loadDriveInfo() {
    try {
      const res = await API.getAbout();
      if (!res.success) return;

      const { user, storage } = res.data;

      const userNameEl = document.getElementById('user-name');
      const userEmailEl = document.getElementById('user-email');
      const userAvatarEl = document.getElementById('user-avatar');

      if (userNameEl) userNameEl.textContent = user.displayName;
      if (userEmailEl) userEmailEl.textContent = user.emailAddress;
      if (userAvatarEl && user.photoLink) userAvatarEl.src = user.photoLink;

      if (storage.limit) {
        const usageGB = (storage.usage / (1024 * 1024 * 1024)).toFixed(1);
        const limitGB = (storage.limit / (1024 * 1024 * 1024)).toFixed(0);
        const percent = Math.min(100, Math.round((storage.usage / storage.limit) * 100));

        const storageTextEl = document.getElementById('storage-text');
        const storageBarEl = document.getElementById('storage-bar-fill');

        if (storageTextEl) storageTextEl.textContent = `${usageGB} GB dari ${limitGB} GB (${percent}%)`;
        if (storageBarEl) storageBarEl.style.width = `${percent}%`;
      }
    } catch (e) {
      console.error('Error loading drive about info:', e);
    }
  },

  // ===================== DASHBOARD / HOME (FOLDER TERHUBUNG) =====================
  loadDashboard() {
    this.currentFolderId = null;
    this.currentFolderName = 'Folder Terhubung';
    this.folderHistory = [{ id: null, name: 'Folder Terhubung' }];
    this.currentFolderLink = null;

    // Update active state di sidebar
    document.getElementById('nav-folders')?.classList.add('active');
    document.getElementById('nav-logs')?.classList.remove('active');

    // Tampilkan tombol action bar
    const actionBtns = document.querySelector('.action-buttons');
    const viewToggles = document.querySelector('.view-toggles');
    if (actionBtns) actionBtns.style.display = 'flex';
    if (viewToggles) viewToggles.style.display = 'flex';

    this.renderBreadcrumbs();

    const explorerEl = document.getElementById('file-explorer-content');
    if (!explorerEl) return;

    if (this.connectedFolders.length === 0) {
      explorerEl.innerHTML = `
        <div class="state-box" style="padding: 4rem 1.5rem;">
          <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(59, 130, 246, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem auto; color: var(--accent);">
            <i data-lucide="folder-lock" style="width: 32px; height: 32px;"></i>
          </div>
          <h2 style="font-size: 1.35rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.5rem;">Belum Ada Folder Terhubung</h2>
          <p style="max-width: 500px; color: var(--text-muted); line-height: 1.6; margin-bottom: 1.75rem;">
            Dashboard ini menjaga privasi Anda dengan <strong>tidak membaca seluruh Google Drive</strong>. Cukup masukkan link folder Google Drive yang ingin Anda hubungkan di sini.
          </p>
          <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="document.getElementById('btn-open-drive-link').click();">
              <i data-lucide="link"></i> + Hubungkan Link Folder Drive
            </button>
            <button class="btn btn-secondary" onclick="document.getElementById('btn-new-folder').click();">
              <i data-lucide="folder-plus"></i> + Buat Folder Baru
            </button>
          </div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Render daftar folder terhubung
    let html = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
        <div class="section-heading" style="margin: 0;">Folder Google Drive Terhubung (${this.connectedFolders.length})</div>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('btn-open-drive-link').click();">
          <i data-lucide="plus"></i> Tambah Folder Lain
        </button>
      </div>
      <div class="items-grid">
    `;

    this.connectedFolders.forEach((folder) => {
      html += `
        <div class="grid-card folder-card" onclick="DriveApp.navigateToFolder('${folder.id}', '${this.escapeHtml(folder.name)}');">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem;">
            <div class="grid-card-icon folder" style="background: rgba(59, 130, 246, 0.12); color: var(--accent); border: 1px solid rgba(59, 130, 246, 0.25);">
              <i data-lucide="folder-check"></i>
            </div>
            <span class="ext-badge" style="color: var(--accent); background: rgba(59, 130, 246, 0.12);">LINKED</span>
          </div>
          <div class="grid-card-info">
            <div class="grid-card-title" title="${this.escapeHtml(folder.name)}">${this.escapeHtml(folder.name)}</div>
            <div class="grid-card-meta">
              <span>Folder Terhubung</span>
              <span style="color: var(--accent);">Klik untuk Buka →</span>
            </div>
          </div>
          <div class="grid-card-actions">
            <a href="${folder.link}" target="_blank" class="action-icon-btn" title="Buka di Google Drive" onclick="event.stopPropagation();">
              <i data-lucide="external-link"></i>
            </a>
            <button class="action-icon-btn" title="Salin Link" onclick="event.stopPropagation(); DriveApp.copyLink('${folder.link}');">
              <i data-lucide="copy"></i>
            </button>
            <button class="action-icon-btn delete" title="Putuskan Tautan Folder dari Dashboard" onclick="event.stopPropagation(); DriveApp.confirmRemoveConnectedFolder('${folder.id}', '${this.escapeHtml(folder.name)}');">
              <i data-lucide="unlink"></i>
            </button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    explorerEl.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  },

  confirmRemoveConnectedFolder(folderId, name) {
    if (confirm(`Putuskan tautan folder "${name}" dari dashboard ini?\n(Folder di Google Drive Anda tidak akan terhapus).`)) {
      this.removeConnectedFolder(folderId);
      showToast(`Tautan folder "${name}" diputuskan`, 'info');

      // Catat ke log aktivitas
      if (window.ActivityLogger) {
        ActivityLogger.addLog({
          type: 'unlink_folder',
          action: 'Memutuskan Tautan Folder',
          title: name,
          details: 'Folder dilepas dari daftar aktif dashboard',
          status: 'success',
        });
      }
    }
  },

  // ===================== MEMBACA ISI FOLDER TERTENTU =====================
  async loadFolder(folderId, folderName = 'Folder', resetHistory = false) {
    if (!folderId) {
      this.loadDashboard();
      return;
    }

    this.currentFolderId = folderId;

    // Update active state di sidebar
    document.getElementById('nav-folders')?.classList.add('active');
    document.getElementById('nav-logs')?.classList.remove('active');

    // Tampilkan tombol action bar
    const actionBtns = document.querySelector('.action-buttons');
    const viewToggles = document.querySelector('.view-toggles');
    if (actionBtns) actionBtns.style.display = 'flex';
    if (viewToggles) viewToggles.style.display = 'flex';

    if (resetHistory) {
      this.folderHistory = [
        { id: null, name: 'Folder Terhubung' },
        { id: folderId, name: folderName },
      ];
    }

    const explorerEl = document.getElementById('file-explorer-content');
    if (explorerEl) {
      explorerEl.innerHTML = `
        <div class="state-box">
          <div class="spinner"></div>
          <p>Membaca isi folder "${this.escapeHtml(folderName)}" dari Google Drive...</p>
        </div>
      `;
    }

    try {
      const res = await API.getFiles(folderId);
      if (!res.success) {
        showToast(res.message, 'error');
        if (explorerEl) {
          explorerEl.innerHTML = `
            <div class="state-box">
              <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #ef4444;"></i>
              <p>${res.message}</p>
              <button class="btn btn-secondary btn-sm" onclick="DriveApp.loadDashboard();">
                Kembali ke Beranda
              </button>
            </div>
          `;
          if (window.lucide) window.lucide.createIcons();
        }
        return;
      }

      this.currentFolderName = res.data.folder.name;
      this.currentFolderLink = res.data.folder.webViewLink;

      // Update folder name di history
      const lastCrumb = this.folderHistory[this.folderHistory.length - 1];
      if (lastCrumb && lastCrumb.id === folderId) {
        lastCrumb.name = this.currentFolderName;
      }

      this.currentItems = res.data.items || [];
      this.renderBreadcrumbs();
      this.renderItems(this.currentItems);
    } catch (err) {
      showToast('Gagal memuat isi folder', 'error');
    }
  },

  navigateToFolder(folderId, folderName) {
    this.folderHistory.push({ id: folderId, name: folderName });
    this.loadFolder(folderId, folderName, false);
  },

  navigateBackToCrumb(index) {
    this.folderHistory = this.folderHistory.slice(0, index + 1);
    const target = this.folderHistory[this.folderHistory.length - 1];
    if (target.id === null) {
      this.loadDashboard();
    } else {
      this.loadFolder(target.id, target.name, false);
    }
  },

  renderBreadcrumbs() {
    const container = document.getElementById('breadcrumbs');
    const driveLinkEl = document.getElementById('current-drive-link');

    if (!container) return;
    container.innerHTML = '';

    this.folderHistory.forEach((crumb, idx) => {
      const isLast = idx === this.folderHistory.length - 1;

      if (!isLast) {
        const item = document.createElement('span');
        item.className = 'crumb-item';
        if (idx === 0) {
          item.innerHTML = `<i data-lucide="home" style="width: 14px; height: 14px;"></i> <span>${crumb.name}</span>`;
        } else {
          item.textContent = crumb.name;
        }
        item.onclick = () => this.navigateBackToCrumb(idx);
        container.appendChild(item);

        const sep = document.createElement('span');
        sep.className = 'crumb-separator';
        sep.innerHTML = '<i data-lucide="chevron-right" style="width: 13px; height: 13px;"></i>';
        container.appendChild(sep);
      } else {
        const current = document.createElement('span');
        current.className = 'crumb-current';
        if (idx === 0) {
          current.innerHTML = `<i data-lucide="home" style="width: 14px; height: 14px; display: inline-block; vertical-align: -2px; margin-right: 4px;"></i> <span>${crumb.name}</span>`;
        } else {
          current.textContent = crumb.name;
        }
        container.appendChild(current);
      }
    });

    if (driveLinkEl) {
      if (this.currentFolderLink) {
        driveLinkEl.href = this.currentFolderLink;
        driveLinkEl.style.display = 'inline-flex';
      } else {
        driveLinkEl.style.display = 'none';
      }
    }

    if (window.lucide) window.lucide.createIcons();
  },

  // ===================== RENDERING ITEMS =====================
  renderItems(items) {
    const container = document.getElementById('file-explorer-content');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="state-box">
          <div style="width: 58px; height: 58px; border-radius: 50%; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center; margin: 0 auto; color: var(--accent);">
            <i data-lucide="folder-open" style="width: 28px; height: 28px;"></i>
          </div>
          <h3>Folder ini masih kosong</h3>
          <p style="max-width: 420px; line-height: 1.5;">Tarik & lepaskan berkas ke sini atau klik tombol "Upload Berkas" untuk mengunggah ke folder ini.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const folders = items.filter((it) => it.isFolder);
    const files = items.filter((it) => !it.isFolder);

    if (this.currentView === 'grid') {
      this.renderGridView(container, folders, files);
    } else {
      this.renderListView(container, folders, files);
    }

    if (window.lucide) window.lucide.createIcons();
  },

  renderGridView(container, folders, files) {
    let html = '';

    if (folders.length > 0) {
      html += `
        <div class="section-heading"><i data-lucide="folder" style="width: 16px; height: 16px; color: var(--color-folder);"></i> Subfolder (${folders.length})</div>
        <div class="items-grid">
          ${folders.map((f) => this.generateGridFolderCard(f)).join('')}
        </div>
      `;
    }

    if (files.length > 0) {
      html += `
        <div class="section-heading" style="margin-top: 2rem;"><i data-lucide="file" style="width: 16px; height: 16px; color: var(--accent);"></i> Berkas (${files.length})</div>
        <div class="items-grid">
          ${files.map((f) => this.generateGridFileCard(f)).join('')}
        </div>
      `;
    }

    container.innerHTML = html;
    this.attachGridItemEvents();
  },

  generateGridFolderCard(folder) {
    return `
      <div class="grid-card folder-card" data-id="${folder.id}" data-name="${this.escapeHtml(folder.name)}">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem;">
          <div class="grid-card-icon folder">
            <i data-lucide="folder"></i>
          </div>
          <span class="ext-badge" style="color: var(--color-folder); background: rgba(245, 158, 11, 0.1);">DIR</span>
        </div>
        <div class="grid-card-info">
          <div class="grid-card-title" title="${this.escapeHtml(folder.name)}">${this.escapeHtml(folder.name)}</div>
          <div class="grid-card-meta">
            <span>Folder Google Drive</span>
          </div>
        </div>
        <div class="grid-card-actions">
          ${
            folder.webViewLink
              ? `<a href="${folder.webViewLink}" target="_blank" class="action-icon-btn" title="Buka di Google Drive" onclick="event.stopPropagation();">
                   <i data-lucide="external-link"></i>
                 </a>`
              : ''
          }
          <button class="action-icon-btn" title="Salin Link Folder" onclick="event.stopPropagation(); DriveApp.copyLink('${folder.webViewLink}');">
            <i data-lucide="copy"></i>
          </button>
          <button class="action-icon-btn delete" title="Hapus Folder" onclick="event.stopPropagation(); DriveApp.deleteItem('${folder.id}', '${this.escapeHtml(folder.name)}');">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
  },

  generateGridFileCard(file) {
    const { icon, category, ext } = this.getFileDetails(file.mimeType, file.name);
    const formattedSize = this.formatBytes(file.size);
    const dateFormatted = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : '';

    return `
      <div class="grid-card file-card" data-id="${file.id}">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem;">
          <div class="grid-card-icon ${category}">
            <i data-lucide="${icon}"></i>
          </div>
          <span class="ext-badge">${ext}</span>
        </div>
        <div class="grid-card-info" onclick="PreviewManager.open(${this.escapeHtmlAttr(JSON.stringify(file))})">
          <div class="grid-card-title" title="${this.escapeHtml(file.name)}">${this.escapeHtml(file.name)}</div>
          <div class="grid-card-meta">
            <span>${formattedSize}</span>
            <span>${dateFormatted}</span>
          </div>
        </div>
        <div class="grid-card-actions">
          <a href="${API.getDownloadUrl(file.id)}" download class="action-icon-btn" title="Unduh Berkas" onclick="event.stopPropagation(); DriveApp.logDownload(${this.escapeHtmlAttr(JSON.stringify(file))});">
            <i data-lucide="download"></i>
          </a>
          <button class="action-icon-btn" title="Pratinjau" onclick="event.stopPropagation(); PreviewManager.open(${this.escapeHtmlAttr(JSON.stringify(file))});">
            <i data-lucide="eye"></i>
          </button>
          ${
            file.webViewLink
              ? `<a href="${file.webViewLink}" target="_blank" class="action-icon-btn" title="Buka di Google Drive" onclick="event.stopPropagation();">
                   <i data-lucide="external-link"></i>
                 </a>`
              : ''
          }
          <button class="action-icon-btn delete" title="Hapus Berkas" onclick="event.stopPropagation(); DriveApp.deleteItem('${file.id}', '${this.escapeHtml(file.name)}');">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
  },

  renderListView(container, folders, files) {
    const allItems = [...folders, ...files];

    let html = `
      <div class="items-table-container">
        <table class="items-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Ukuran</th>
              <th>Terakhir Diubah</th>
              <th style="text-align: right;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${allItems.map((item) => this.generateTableRow(item)).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
    this.attachGridItemEvents();
  },

  generateTableRow(item) {
    const iconName = item.isFolder ? 'folder' : this.getFileIcon(item.mimeType, item.name);
    const formattedSize = item.isFolder ? '—' : this.formatBytes(item.size);
    const dateFormatted = item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString() : '—';

    return `
      <tr class="${item.isFolder ? 'folder-card' : 'file-card'}" data-id="${item.id}" data-name="${this.escapeHtml(item.name)}">
        <td>
          <div class="file-col-name">
            <i data-lucide="${iconName}" style="color: ${item.isFolder ? '#fbbf24' : 'var(--accent)'}; width: 20px; height: 20px;"></i>
            <span>${this.escapeHtml(item.name)}</span>
          </div>
        </td>
        <td style="color: var(--text-muted);">${formattedSize}</td>
        <td style="color: var(--text-muted);">${dateFormatted}</td>
        <td>
          <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
            ${
              !item.isFolder
                ? `<a href="${API.getDownloadUrl(item.id)}" download class="action-icon-btn" title="Unduh" onclick="event.stopPropagation(); DriveApp.logDownload(${this.escapeHtmlAttr(JSON.stringify(item))});">
                     <i data-lucide="download"></i>
                   </a>
                   <button class="action-icon-btn" title="Pratinjau" onclick="event.stopPropagation(); PreviewManager.open(${this.escapeHtmlAttr(JSON.stringify(item))});">
                     <i data-lucide="eye"></i>
                   </button>`
                : `<button class="action-icon-btn" title="Salin Link" onclick="event.stopPropagation(); DriveApp.copyLink('${item.webViewLink}');">
                     <i data-lucide="copy"></i>
                   </button>`
            }
            ${
              item.webViewLink
                ? `<a href="${item.webViewLink}" target="_blank" class="action-icon-btn" title="Buka di Drive" onclick="event.stopPropagation();">
                     <i data-lucide="external-link"></i>
                   </a>`
                : ''
            }
            <button class="action-icon-btn delete" title="Hapus" onclick="event.stopPropagation(); DriveApp.deleteItem('${item.id}', '${this.escapeHtml(item.name)}');">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  },

  attachGridItemEvents() {
    document.querySelectorAll('.folder-card').forEach((el) => {
      el.onclick = () => {
        const id = el.getAttribute('data-id');
        const name = el.getAttribute('data-name');
        this.navigateToFolder(id, name);
      };
    });
  },

  // ===================== FITUR BUKA VIA LINK GOOGLE DRIVE =====================
  setupOpenLinkModal() {
    const modal = document.getElementById('open-link-modal');
    const openBtn = document.getElementById('btn-open-drive-link');
    const closeBtn = document.getElementById('open-link-close');
    const cancelBtn = document.getElementById('open-link-cancel');
    const submitBtn = document.getElementById('open-link-submit');
    const inputLink = document.getElementById('drive-link-input');

    if (!modal || !openBtn) return;

    openBtn.onclick = () => {
      inputLink.value = '';
      modal.classList.add('active');
      setTimeout(() => inputLink.focus(), 50);
    };

    const closeModal = () => modal.classList.remove('active');
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    submitBtn.onclick = async () => {
      const link = inputLink.value.trim();
      if (!link) {
        showToast('Silakan tempelkan link folder Google Drive terlebih dahulu', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Memverifikasi folder...';

      try {
        const res = await API.resolveDriveLink(link);
        if (res.success) {
          const { folderId, info } = res.data;

          // Simpan ke daftar Folder Terhubung
          this.addConnectedFolder(info.name, folderId, info.webViewLink);

          // Catat ke log aktivitas
          if (window.ActivityLogger) {
            ActivityLogger.addLog({
              type: 'connect_folder',
              action: 'Menghubungkan Folder',
              title: info.name,
              details: `ID: ${folderId}`,
              status: 'success',
              link: info.webViewLink,
            });
          }

          showToast(`Folder "${info.name}" berhasil dihubungkan!`, 'success');
          closeModal();

          // Langsung buka folder tersebut
          this.folderHistory = [
            { id: null, name: 'Folder Terhubung' },
            { id: folderId, name: info.name },
          ];
          this.loadFolder(folderId, info.name, false);
        } else {
          showToast(res.message, 'error');
        }
      } catch (err) {
        showToast('Link folder Google Drive tidak valid atau tidak bisa diakses', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Hubungkan Folder';
      }
    };
  },

  renderSidebarFolders() {
    const listEl = document.getElementById('bookmark-list');
    if (!listEl) return;

    if (this.connectedFolders.length === 0) {
      listEl.innerHTML = `
        <li style="font-size: 0.8rem; color: var(--text-dim); padding: 0.5rem 0.75rem;">
          Belum ada folder terhubung.
        </li>
      `;
      return;
    }

    listEl.innerHTML = this.connectedFolders
      .map(
        (f) => `
        <li class="sidebar-item ${this.currentFolderId === f.id ? 'active' : ''}" onclick="DriveApp.navigateToFolder('${f.id}', '${this.escapeHtml(f.name)}')">
          <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
            <i data-lucide="folder" style="width: 16px; height: 16px; color: var(--accent); flex-shrink: 0;"></i>
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(f.name)}</span>
          </div>
          <span class="bookmark-remove" title="Putuskan Tautan" onclick="event.stopPropagation(); DriveApp.confirmRemoveConnectedFolder('${f.id}', '${this.escapeHtml(f.name)}');">
            <i data-lucide="x" style="width: 14px; height: 14px;"></i>
          </span>
        </li>
      `
      )
      .join('');

    if (window.lucide) window.lucide.createIcons();
  },

  // ===================== SEARCH & VIEW =====================
  setupSearch() {
    const input = document.getElementById('global-search');
    if (!input) return;

    // Keyboard shortcut: Ctrl + K atau / untuk fokus pencarian
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.focus();
        input.select();
      } else if (e.key === '/' && document.activeElement !== input && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });

    let debounceTimer;
    input.oninput = (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value.trim();

      debounceTimer = setTimeout(async () => {
        // Jika sedang di beranda
        if (this.currentFolderId === null) {
          if (!query) {
            this.loadDashboard();
            return;
          }
          // Filter folder terhubung lokal
          const filtered = this.connectedFolders.filter((f) =>
            f.name.toLowerCase().includes(query.toLowerCase())
          );
          const explorerEl = document.getElementById('file-explorer-content');
          if (explorerEl) {
            explorerEl.innerHTML = `
              <div class="section-heading">Hasil Pencarian Folder (${filtered.length})</div>
              <div class="items-grid">
                ${filtered
                  .map(
                    (folder) => `
                  <div class="grid-card folder-card" onclick="DriveApp.navigateToFolder('${folder.id}', '${this.escapeHtml(folder.name)}');">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                      <div class="grid-card-icon folder">
                        <i data-lucide="folder-check"></i>
                      </div>
                      <div class="grid-card-info">
                        <div class="grid-card-title">${this.escapeHtml(folder.name)}</div>
                        <div class="grid-card-meta">Folder Terhubung</div>
                      </div>
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `;
            if (window.lucide) window.lucide.createIcons();
          }
          return;
        }

        // Jika sedang di halaman log aktivitas
        if (this.currentFolderId === 'logs') {
          this.loadActivityLogs('all', query);
          return;
        }

        // Jika sedang di dalam folder tertentu
        if (!query) {
          this.renderItems(this.currentItems);
          return;
        }

        try {
          const res = await API.getFiles(this.currentFolderId, query);
          if (res.success) {
            this.renderItems(res.data.items);
          }
        } catch (err) {
          console.error('Search error:', err);
        }
      }, 400);
    };
  },

  setupViewToggles() {
    const gridBtn = document.getElementById('view-grid-btn');
    const listBtn = document.getElementById('view-list-btn');

    if (gridBtn && listBtn) {
      gridBtn.onclick = () => {
        this.currentView = 'grid';
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
        if (this.currentFolderId === null) {
          this.loadDashboard();
        } else {
          this.renderItems(this.currentItems);
        }
      };

      listBtn.onclick = () => {
        this.currentView = 'list';
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
        if (this.currentFolderId === null) {
          this.loadDashboard();
        } else {
          this.renderItems(this.currentItems);
        }
      };
    }
  },

  async deleteItem(id, name) {
    if (confirm(`Pindahkan "${name}" ke tempat sampah Google Drive?`)) {
      try {
        const res = await API.deleteItem(id);
        if (res.success) {
          showToast(`"${name}" dipindahkan ke tempat sampah`, 'success');

          // Catat ke log aktivitas
          if (window.ActivityLogger) {
            ActivityLogger.addLog({
              type: 'delete',
              action: 'Pindah ke Tempat Sampah',
              title: name,
              details: 'Item dipindahkan ke Trash Google Drive',
              status: 'success',
            });
          }

          this.loadFolder(this.currentFolderId);
          this.loadDriveInfo();
        } else {
          showToast(res.message, 'error');
        }
      } catch (err) {
        showToast('Gagal menghapus item', 'error');
      }
    }
  },

  // ===================== LOG AKTIVITAS (ACTIVITY LOG SECTION) =====================
  loadActivityLogs(filterTab = 'all', searchQuery = '') {
    this.currentFolderId = 'logs';
    this.currentFolderName = 'Log Aktivitas';
    this.folderHistory = [{ id: 'logs', name: 'Log Aktivitas' }];
    this.currentFolderLink = null;

    // Update active state di sidebar
    document.getElementById('nav-folders')?.classList.remove('active');
    document.getElementById('nav-logs')?.classList.add('active');

    // Sembunyikan tombol aksi explorer saat berada di halaman log
    const actionBtns = document.querySelector('.action-buttons');
    const viewToggles = document.querySelector('.view-toggles');
    if (actionBtns) actionBtns.style.display = 'none';
    if (viewToggles) viewToggles.style.display = 'none';

    this.renderBreadcrumbs();

    const explorerEl = document.getElementById('file-explorer-content');
    if (!explorerEl) return;

    const allLogs = window.ActivityLogger ? ActivityLogger.getLogs() : [];

    // Hitung per kategori
    const counts = {
      all: allLogs.length,
      upload: allLogs.filter((l) => l.type === 'upload').length,
      download: allLogs.filter((l) => l.type === 'download').length,
      folder: allLogs.filter((l) => ['create_folder', 'connect_folder', 'unlink_folder'].includes(l.type)).length,
      delete: allLogs.filter((l) => l.type === 'delete').length,
    };

    // Filter data berdasarkan tab
    let filtered = allLogs;
    if (filterTab === 'upload') filtered = filtered.filter((l) => l.type === 'upload');
    else if (filterTab === 'download') filtered = filtered.filter((l) => l.type === 'download');
    else if (filterTab === 'folder') filtered = filtered.filter((l) => ['create_folder', 'connect_folder', 'unlink_folder'].includes(l.type));
    else if (filterTab === 'delete') filtered = filtered.filter((l) => l.type === 'delete');

    // Filter pencarian jika ada
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((l) =>
        (l.title && l.title.toLowerCase().includes(q)) ||
        (l.action && l.action.toLowerCase().includes(q)) ||
        (l.details && l.details.toLowerCase().includes(q))
      );
    }

    let html = `
      <div class="log-view-header">
        <div class="log-view-title">
          <h2><i data-lucide="history" style="color: var(--accent);"></i> Log Aktivitas & Riwayat Transaksi</h2>
          <p>Mencatat secara lokal seluruh aksi upload, unduhan, pembuatan folder, dan penghapusan.</p>
        </div>
        <div style="display: flex; gap: 0.75rem;">
          <button class="btn btn-secondary btn-sm" onclick="DriveApp.loadDashboard();">
            <i data-lucide="arrow-left"></i> Kembali ke Folder
          </button>
          ${
            allLogs.length > 0
              ? `<button class="btn btn-danger btn-sm" onclick="DriveApp.confirmClearLogs();">
                   <i data-lucide="trash-2"></i> Bersihkan Log
                 </button>`
              : ''
          }
        </div>
      </div>

      <div class="log-toolbar">
        <div class="log-filter-tabs">
          <button class="log-tab-btn ${filterTab === 'all' ? 'active' : ''}" onclick="DriveApp.loadActivityLogs('all');">
            Semua (${counts.all})
          </button>
          <button class="log-tab-btn ${filterTab === 'upload' ? 'active' : ''}" onclick="DriveApp.loadActivityLogs('upload');">
            <i data-lucide="upload-cloud" style="width: 14px; height: 14px;"></i> Upload (${counts.upload})
          </button>
          <button class="log-tab-btn ${filterTab === 'download' ? 'active' : ''}" onclick="DriveApp.loadActivityLogs('download');">
            <i data-lucide="download" style="width: 14px; height: 14px;"></i> Download (${counts.download})
          </button>
          <button class="log-tab-btn ${filterTab === 'folder' ? 'active' : ''}" onclick="DriveApp.loadActivityLogs('folder');">
            <i data-lucide="folder" style="width: 14px; height: 14px;"></i> Folder (${counts.folder})
          </button>
          <button class="log-tab-btn ${filterTab === 'delete' ? 'active' : ''}" onclick="DriveApp.loadActivityLogs('delete');">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Hapus (${counts.delete})
          </button>
        </div>
      </div>
    `;

    if (filtered.length === 0) {
      html += `
        <div class="state-box" style="padding: 4.5rem 1.5rem;">
          <div style="width: 58px; height: 58px; border-radius: 50%; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center; margin: 0 auto; color: var(--accent);">
            <i data-lucide="history" style="width: 28px; height: 28px;"></i>
          </div>
          <h3>Belum Ada Log Aktivitas</h3>
          <p style="max-width: 440px; line-height: 1.5;">Setiap kali Anda mengunggah, mengunduh, membuat folder, atau menghapus berkas, riwayatnya akan tersimpan rapi di sini.</p>
        </div>
      `;
    } else {
      html += `<div class="log-timeline">`;
      filtered.forEach((log) => {
        const cfg = ActivityLogger.getTypeConfig(log.type);
        const relTime = ActivityLogger.formatRelativeTime(log.timestamp);
        const fullTime = ActivityLogger.formatFullDateTime(log.timestamp);

        html += `
          <div class="log-card ${log.status}">
            <div class="log-card-left">
              <div class="log-icon-box" style="background: ${cfg.bg}; color: ${cfg.color}; border: 1px solid ${cfg.border};">
                <i data-lucide="${cfg.icon}"></i>
              </div>
              <div class="log-card-info">
                <div class="log-card-header-row">
                  <span class="log-action-tag" style="background: ${cfg.bg}; color: ${cfg.color}; border: 1px solid ${cfg.border};">
                    ${cfg.label}
                  </span>
                  <span class="log-title" title="${this.escapeHtml(log.title)}">${this.escapeHtml(log.title)}</span>
                </div>
                ${log.details ? `<span class="log-details">${this.escapeHtml(log.details)}</span>` : ''}
              </div>
            </div>
            <div class="log-card-right">
              <div class="log-time-info">
                <span class="log-time-relative">${relTime}</span>
                <span class="log-time-full">${fullTime}</span>
              </div>
              ${
                log.link
                  ? `<a href="${log.link}" target="_blank" class="action-icon-btn" title="Buka di Google Drive">
                       <i data-lucide="external-link"></i>
                     </a>`
                  : ''
              }
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    explorerEl.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  },

  confirmClearLogs() {
    if (confirm('Apakah Anda yakin ingin membersihkan seluruh riwayat log aktivitas?')) {
      if (window.ActivityLogger) {
        ActivityLogger.clearLogs();
      }
      showToast('Riwayat log aktivitas berhasil dibersihkan', 'info');
      this.loadActivityLogs();
    }
  },

  logDownload(file) {
    if (window.ActivityLogger && file) {
      ActivityLogger.addLog({
        type: 'download',
        action: 'Mengunduh Berkas',
        title: file.name,
        details: `${this.formatBytes(file.size)}`,
        status: 'success',
        link: file.webViewLink || null,
      });
    }
  },

  copyLink(url) {
    if (!url) {
      showToast('Link Google Drive tidak tersedia', 'error');
      return;
    }
    navigator.clipboard.writeText(url);
    showToast('Link berhasil disalin ke clipboard!', 'success');
  },

  // ===================== HELPERS =====================
  getFileDetails(mimeType = '', fileName = '') {
    const ext = fileName.includes('.') ? fileName.split('.').pop().toUpperCase() : '';
    const m = (mimeType || '').toLowerCase();
    
    if (m.startsWith('video/') || ['MKV', 'MP4', 'AVI', 'MOV', 'WEBM', 'TS', 'M4V'].includes(ext)) {
      return { icon: 'video', category: 'video', ext: ext || 'VIDEO' };
    }
    if (m.startsWith('image/') || ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG', 'ICO'].includes(ext)) {
      return { icon: 'image', category: 'image', ext: ext || 'IMG' };
    }
    if (m.startsWith('audio/') || ['MP3', 'WAV', 'FLAC', 'AAC', 'OGG', 'M4A'].includes(ext)) {
      return { icon: 'music', category: 'audio', ext: ext || 'AUDIO' };
    }
    if (m.includes('pdf') || ext === 'PDF') {
      return { icon: 'file-text', category: 'doc', ext: 'PDF' };
    }
    if (m.includes('spreadsheet') || ['XLSX', 'XLS', 'CSV'].includes(ext)) {
      return { icon: 'file-spreadsheet', category: 'doc', ext: ext || 'SHEET' };
    }
    if (m.includes('presentation') || ['PPTX', 'PPT'].includes(ext)) {
      return { icon: 'presentation', category: 'doc', ext: ext || 'SLIDES' };
    }
    if (m.includes('document') || ['DOCX', 'DOC', 'TXT', 'MD'].includes(ext)) {
      return { icon: 'file-text', category: 'doc', ext: ext || 'DOC' };
    }
    if (m.includes('zip') || m.includes('compressed') || ['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(ext)) {
      return { icon: 'archive', category: 'archive', ext: ext || 'ZIP' };
    }
    if (['JS', 'TS', 'JSON', 'HTML', 'CSS', 'PY', 'RS', 'GO', 'C', 'CPP', 'JAVA'].includes(ext)) {
      return { icon: 'code-2', category: 'code', ext: ext || 'CODE' };
    }
    return { icon: 'file', category: 'default', ext: ext || 'FILE' };
  },

  getFileIcon(mimeType, fileName = '') {
    return this.getFileDetails(mimeType, fileName).icon;
  },

  formatBytes(bytes) {
    if (bytes === undefined || bytes === null || isNaN(bytes)) return '—';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  escapeHtmlAttr(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;');
  },
};

// Auto boot on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  DriveApp.init();
});
