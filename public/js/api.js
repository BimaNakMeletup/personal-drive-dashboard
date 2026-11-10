/**
 * API Client wrapper untuk berkomunikasi dengan Backend Hono
 */
const API = {
  // 1. Auth & Status
  async getStatus() {
    const res = await fetch('/api/auth/status');
    return res.json();
  },

  async getAuthUrl() {
    const res = await fetch('/api/auth/url');
    return res.json();
  },

  async logout() {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    return res.json();
  },

  // 2. Drive Info
  async getAbout() {
    const res = await fetch('/api/drive/about');
    return res.json();
  },

  // 3. Files & Folders
  async getFiles(folderId = 'root', search = '') {
    const params = new URLSearchParams();
    if (folderId) params.append('folderId', folderId);
    if (search) params.append('search', search);

    const res = await fetch(`/api/files?${params.toString()}`);
    return res.json();
  },

  async resolveDriveLink(link) {
    const res = await fetch('/api/files/resolve-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link }),
    });
    return res.json();
  },

  async createFolder(name, parentId = 'root') {
    const res = await fetch('/api/files/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId }),
    });
    return res.json();
  },

  async uploadFile(file, folderId = 'root') {
    return this.uploadFileWithProgress(file, folderId);
  },

  uploadFileWithProgress(file, folderId = 'root', onProgress = null) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
            onProgress({
              loaded: event.loaded,
              total: event.total,
              percent,
            });
          }
        };
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch (e) {
          reject(new Error(xhr.responseText || 'Gagal mengurai respons server'));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Koneksi terputus ke server saat mengunggah'));
      };

      xhr.open('POST', '/api/files/upload', true);
      // Kirim sebagai stream binary langsung dengan headers khusus
      xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
      xhr.setRequestHeader('x-folder-id', folderId);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.send(file);
    });
  },

  async deleteItem(id) {
    const res = await fetch(`/api/files/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  getDownloadUrl(fileId) {
    return `/api/files/download/${fileId}`;
  },
};

// UI Helper: Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
