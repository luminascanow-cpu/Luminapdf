import * as MediaLibrary from 'expo-media-library';
import { useCallback, useState } from 'react';

export function usePermissions() {
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();

  const ensureStoragePermission = useCallback(async () => {
    // Check if permissions are already granted
    if (permissionResponse?.granted) {
      return true;
    }

    // If not granted, request permission
    const { status, canAskAgain } = await requestPermission();

    if (status === 'granted') {
      return true;
    }

    if (!canAskAgain) {
      // If we can't ask again, the user needs to enable it in settings
      return false;
    }

    return false;
  }, [permissionResponse, requestPermission]);

  return {
    ensureStoragePermission,
    isGranted: !!permissionResponse?.granted,
  };
}
