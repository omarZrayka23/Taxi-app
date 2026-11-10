import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type { PickedFile } from '@/api/types';

const MAX_BYTES = 8 * 1024 * 1024;

export class FileTooLargeError extends Error {
  constructor() {
    super('FILE_TOO_LARGE');
  }
}

function guessName(uri: string, fallbackExt: string) {
  const last = uri.split('/').pop()?.split('?')[0];
  if (last && /\.[a-z0-9]+$/i.test(last)) return last;
  return `upload-${Date.now()}.${fallbackExt}`;
}

function guessMime(name: string, fallback: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'webp') return 'image/webp';
  return fallback;
}

function fromAsset(a: ImagePicker.ImagePickerAsset): PickedFile {
  if (a.fileSize && a.fileSize > MAX_BYTES) throw new FileTooLargeError();
  const name = a.fileName || guessName(a.uri, 'jpg');
  return { uri: a.uri, name, mimeType: a.mimeType || guessMime(name, 'image/jpeg') };
}

/** Pick photo(s) from the library. Returns [] when cancelled or permission denied. */
export async function pickImages(opts: { multiple?: boolean; limit?: number } = {}): Promise<PickedFile[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    allowsMultipleSelection: !!opts.multiple,
    selectionLimit: opts.limit ?? (opts.multiple ? 6 : 1),
  });
  if (res.canceled) return [];
  return res.assets.map(fromAsset);
}

/** Take a photo with the camera. */
export async function takePhoto(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (res.canceled || !res.assets[0]) return null;
  return fromAsset(res.assets[0]);
}

/** Pick a PDF or image file. */
export async function pickDocumentFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/jpeg', 'image/png'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (a.size && a.size > MAX_BYTES) throw new FileTooLargeError();
  return {
    uri: a.uri,
    name: a.name || guessName(a.uri, 'pdf'),
    mimeType: a.mimeType || guessMime(a.name, 'application/pdf'),
  };
}
