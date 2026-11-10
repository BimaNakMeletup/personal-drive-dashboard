import { Readable } from 'node:stream';
import { getDriveClient, getOAuth2Client } from '../config/google';

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size?: number | string;
  modifiedTime?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  parents?: string[];
}

export class DriveService {
  /**
   * Ekstrak Folder/File ID dari URL Google Drive atau kembalikan string aslinya jika sudah berupa ID
   * Contoh URL yang didukung:
   * - https://drive.google.com/drive/folders/1ABC_xyz-123
   * - https://drive.google.com/drive/u/0/folders/1ABC_xyz-123
   * - https://drive.google.com/file/d/1ABC_xyz-123/view
   */
  static extractIdFromInput(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return 'root';

    // Cek pattern /folders/ID
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) {
      return folderMatch[1];
    }

    // Cek pattern /file/d/ID
    const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch && fileMatch[1]) {
      return fileMatch[1];
    }

    // Cek pattern id query parameter ?id=ID
    const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (queryMatch && queryMatch[1]) {
      return queryMatch[1];
    }

    // Jika berupa ID murni tanpa URL
    return trimmed;
  }

  /**
   * Mengambil informasi dasar folder (nama, parent, webViewLink)
   */
  static async getFolderInfo(folderId: string): Promise<{ id: string; name: string; parents?: string[]; webViewLink?: string }> {
    const drive = getDriveClient();
    const resolvedId = this.extractIdFromInput(folderId);

    if (resolvedId === 'root') {
      return {
        id: 'root',
        name: 'My Drive',
        webViewLink: 'https://drive.google.com/drive/my-drive',
      };
    }

    try {
      const res = await drive.files.get({
        fileId: resolvedId,
        fields: 'id, name, mimeType, parents, webViewLink, trashed',
      });

      return {
        id: res.data.id || resolvedId,
        name: res.data.name || 'Folder',
        parents: res.data.parents || ['root'],
        webViewLink: res.data.webViewLink || `https://drive.google.com/drive/folders/${resolvedId}`,
      };
    } catch (err: any) {
      throw new Error(`Gagal membaca folder "${resolvedId}": ${err.message || err}`);
    }
  }

  /**
   * Membaca isi berkas dan folder di dalam folderId
   */
  static async listContents(folderId: string = 'root', searchQuery?: string): Promise<{ folder: any; items: DriveItem[] }> {
    const drive = getDriveClient();
    const resolvedId = this.extractIdFromInput(folderId);

    // Ambil info folder saat ini
    const currentFolder = await this.getFolderInfo(resolvedId);

    let q: string;
    if (searchQuery && searchQuery.trim()) {
      const cleanSearch = searchQuery.replace(/'/g, "\\'");
      q = `name contains '${cleanSearch}' and trashed = false`;
    } else {
      q = `'${resolvedId}' in parents and trashed = false`;
    }

    const res = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, thumbnailLink, iconLink, parents)',
      orderBy: 'folder,name',
      pageSize: 100,
      spaces: 'drive',
    });

    const files = res.data.files || [];
    const items: DriveItem[] = files.map((f) => ({
      id: f.id!,
      name: f.name || 'Unnamed',
      mimeType: f.mimeType || 'application/octet-stream',
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      size: f.size ? Number(f.size) : undefined,
      modifiedTime: f.modifiedTime || undefined,
      webViewLink: f.webViewLink || undefined,
      thumbnailLink: f.thumbnailLink || undefined,
      iconLink: f.iconLink || undefined,
      parents: f.parents || undefined,
    }));

    return {
      folder: currentFolder,
      items,
    };
  }

  /**
   * Membuat folder baru di Google Drive
   */
  static async createFolder(name: string, parentId: string = 'root'): Promise<DriveItem> {
    const drive = getDriveClient();
    const resolvedParentId = this.extractIdFromInput(parentId);

    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [resolvedParentId],
      },
      fields: 'id, name, mimeType, webViewLink, modifiedTime',
    });

    return {
      id: res.data.id!,
      name: res.data.name || name,
      mimeType: 'application/vnd.google-apps.folder',
      isFolder: true,
      webViewLink: res.data.webViewLink || `https://drive.google.com/drive/folders/${res.data.id}`,
      modifiedTime: res.data.modifiedTime || new Date().toISOString(),
    };
  }

  /**
   * Mengunggah berkas besar ke Google Drive menggunakan Google Resumable Upload Protocol
   * Mendukung berkas berukuran gigabyte (video, film, zip) langsung via streaming
   */
  static async uploadLargeFileResumable(
    fileStream: ReadableStream | NodeJS.ReadableStream,
    fileName: string,
    mimeType: string,
    fileSize: number | undefined,
    parentId: string = 'root'
  ): Promise<DriveItem> {
    const auth = getOAuth2Client();
    if (!auth) throw new Error('Klien OAuth belum terhubung');

    const resolvedParentId = this.extractIdFromInput(parentId);
    const tokenInfo = await auth.getAccessToken();
    const token = tokenInfo.token;

    if (!token) throw new Error('Token otentikasi Google tidak tersedia');

    // Step 1: Inisialisasi Resumable Session ke Google Drive API
    const initHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType || 'application/octet-stream',
    };

    if (fileSize && fileSize > 0) {
      initHeaders['X-Upload-Content-Length'] = fileSize.toString();
    }

    const initRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,webViewLink,modifiedTime',
      {
        method: 'POST',
        headers: initHeaders,
        body: JSON.stringify({
          name: fileName,
          parents: [resolvedParentId],
        }),
      }
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      throw new Error(`Gagal menginisialisasi upload Google Drive (${initRes.status}): ${errText}`);
    }

    const locationUrl = initRes.headers.get('location');
    if (!locationUrl) {
      throw new Error('Google Drive tidak mengembalikan URL lokasi upload resumable');
    }

    // Step 2: Stream langsung data berkas ke locationUrl
    const uploadHeaders: Record<string, string> = {
      'Content-Type': mimeType || 'application/octet-stream',
    };

    if (fileSize && fileSize > 0) {
      uploadHeaders['Content-Length'] = fileSize.toString();
    }

    const uploadRes = await fetch(locationUrl, {
      method: 'PUT',
      headers: uploadHeaders,
      body: fileStream as any,
      duplex: 'half' as any,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Gagal mengunggah berkas ke Google Drive (${uploadRes.status}): ${errText}`);
    }

    const resData: any = await uploadRes.json();

    return {
      id: resData.id,
      name: resData.name || fileName,
      mimeType: resData.mimeType || mimeType,
      isFolder: false,
      size: resData.size ? Number(resData.size) : fileSize,
      webViewLink: resData.webViewLink || `https://drive.google.com/file/d/${resData.id}/view`,
      modifiedTime: resData.modifiedTime || new Date().toISOString(),
    };
  }

  /**
   * Mengunggah berkas baru ke folder tertentu menggunakan Stream
   */
  static async uploadFile(
    fileStream: NodeJS.ReadableStream,
    fileName: string,
    mimeType: string,
    parentId: string = 'root'
  ): Promise<DriveItem> {
    const drive = getDriveClient();
    const resolvedParentId = this.extractIdFromInput(parentId);

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [resolvedParentId],
      },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: fileStream,
      },
      fields: 'id, name, mimeType, size, webViewLink, modifiedTime',
    });

    return {
      id: res.data.id!,
      name: res.data.name || fileName,
      mimeType: res.data.mimeType || mimeType,
      isFolder: false,
      size: res.data.size ? Number(res.data.size) : undefined,
      webViewLink: res.data.webViewLink || undefined,
      modifiedTime: res.data.modifiedTime || new Date().toISOString(),
    };
  }

  /**
   * Mengunduh berkas langsung dari Google Drive sebagai stream
   */
  static async downloadFile(fileId: string): Promise<{
    stream: NodeJS.ReadableStream;
    name: string;
    mimeType: string;
    size?: number;
  }> {
    const drive = getDriveClient();
    const resolvedId = this.extractIdFromInput(fileId);

    // Ambil metadata file terlebih dahulu
    const metaRes = await drive.files.get({
      fileId: resolvedId,
      fields: 'id, name, mimeType, size',
    });

    const file = metaRes.data;
    const name = file.name || 'download';
    const mimeType = file.mimeType || 'application/octet-stream';
    const size = file.size ? Number(file.size) : undefined;

    // Handle Google Docs / Sheets / Slides yang perlu di-export
    if (mimeType.startsWith('application/vnd.google-apps.')) {
      let exportMime = 'application/pdf';
      let extension = '.pdf';

      if (mimeType.includes('document')) {
        exportMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        extension = '.docx';
      } else if (mimeType.includes('spreadsheet')) {
        exportMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        extension = '.xlsx';
      } else if (mimeType.includes('presentation')) {
        exportMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        extension = '.pptx';
      }

      const exportRes = await drive.files.export(
        {
          fileId: resolvedId,
          mimeType: exportMime,
        },
        { responseType: 'stream' }
      );

      const finalName = name.endsWith(extension) ? name : `${name}${extension}`;
      return {
        stream: exportRes.data as unknown as NodeJS.ReadableStream,
        name: finalName,
        mimeType: exportMime,
      };
    }

    // Regular binary file
    const downloadRes = await drive.files.get(
      {
        fileId: resolvedId,
        alt: 'media',
      },
      { responseType: 'stream' }
    );

    return {
      stream: downloadRes.data as unknown as NodeJS.ReadableStream,
      name,
      mimeType,
      size,
    };
  }

  /**
   * Pindahkan item ke tempat sampah (Trash)
   */
  static async trashItem(fileId: string): Promise<boolean> {
    const drive = getDriveClient();
    const resolvedId = this.extractIdFromInput(fileId);

    await drive.files.update({
      fileId: resolvedId,
      requestBody: {
        trashed: true,
      },
    });

    return true;
  }

  /**
   * Informasi akun dan penggunaan kapasitas kuota Google Drive
   */
  static async getAboutInfo() {
    const drive = getDriveClient();
    const res = await drive.about.get({
      fields: 'user, storageQuota',
    });

    return {
      user: {
        displayName: res.data.user?.displayName || 'Pengguna Google',
        emailAddress: res.data.user?.emailAddress || '',
        photoLink: res.data.user?.photoLink || '',
      },
      storage: {
        limit: res.data.storageQuota?.limit ? Number(res.data.storageQuota.limit) : null,
        usage: res.data.storageQuota?.usage ? Number(res.data.storageQuota.usage) : 0,
        usageInDrive: res.data.storageQuota?.usageInDrive ? Number(res.data.storageQuota.usageInDrive) : 0,
        usageInTrash: res.data.storageQuota?.usageInDriveTrash ? Number(res.data.storageQuota.usageInDriveTrash) : 0,
      },
    };
  }
}
