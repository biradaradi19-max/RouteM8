import { io, Socket } from 'socket.io-client';
import { auth } from './firebase';
import type { TransporterLocation } from '../types';

let socket: Socket | null = null;

export async function getSocket(): Promise<Socket> {
  if (socket && socket.connected) {
    return socket;
  }

  // Get token if user is signed in
  const token = (await auth?.currentUser?.getIdToken()) || '';

  if (!socket) {
    const socketOrigin = import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_API_BASE_URL || window.location.origin;
    socket = io(socketOrigin, {
      path: '/socket.io',
      auth: { token },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket.IO Client] Connected:', socket?.id);
    });

    socket.on('connect_error', async (err) => {
      console.warn('[Socket.IO Client] Connection error:', err.message);
      // Attempt to refresh auth token
      if (auth?.currentUser && socket) {
        try {
          const freshToken = await auth.currentUser.getIdToken(true);
          socket.auth = { token: freshToken };
        } catch {
          // Ignore
        }
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.IO Client] Disconnected:', reason);
    });
  } else if (!socket.connected) {
    socket.auth = { token };
    socket.connect();
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Join delivery room and subscribe to live location and call events
 */
export async function joinDeliveryRoom(
  deliveryId: string,
  handlers: {
    onLocation?: (location: TransporterLocation) => void;
    onDeliveryUpdated?: (update: any) => void;
    onIncomingCall?: (call: any) => void;
    onCallAccepted?: (data: any) => void;
    onCallRejected?: (data: any) => void;
    onCallEnded?: (data: any) => void;
  }
): Promise<() => void> {
  const s = await getSocket();

  s.emit('delivery:join', { deliveryId }, (res: any) => {
    if (res?.error) {
      console.warn('[Socket.IO] delivery:join error:', res.error);
    }
  });

  const handleLocation = (data: TransporterLocation) => {
    if (data.deliveryId === deliveryId && handlers.onLocation) {
      handlers.onLocation(data);
    }
  };

  const handleCallIncoming = (data: any) => {
    if (data.deliveryId === deliveryId && handlers.onIncomingCall) {
      handlers.onIncomingCall(data);
    }
  };

  const handleCallAccepted = (data: any) => {
    if (data.deliveryId === deliveryId && handlers.onCallAccepted) {
      handlers.onCallAccepted(data);
    }
  };

  const handleCallRejected = (data: any) => {
    if (data.deliveryId === deliveryId && handlers.onCallRejected) {
      handlers.onCallRejected(data);
    }
  };

  const handleCallEnded = (data: any) => {
    if (data.deliveryId === deliveryId && handlers.onCallEnded) {
      handlers.onCallEnded(data);
    }
  };

  s.on('location:change', handleLocation);
  s.on('call:incoming', handleCallIncoming);
  s.on('call:accepted', handleCallAccepted);
  s.on('call:rejected', handleCallRejected);
  s.on('call:ended', handleCallEnded);

  return () => {
    s.emit('delivery:leave', { deliveryId });
    s.off('location:change', handleLocation);
    s.off('call:incoming', handleCallIncoming);
    s.off('call:accepted', handleCallAccepted);
    s.off('call:rejected', handleCallRejected);
    s.off('call:ended', handleCallEnded);
  };
}

/**
 * Send real-time GPS coordinates for active delivery
 */
export async function emitLocationUpdate(
  deliveryId: string,
  latitude: number,
  longitude: number,
  heading?: number,
  speed?: number
): Promise<{ success: boolean; rateLimited?: boolean; error?: string }> {
  const s = await getSocket();
  return new Promise((resolve) => {
    s.emit(
      'location:update',
      { deliveryId, latitude, longitude, heading, speed },
      (res: any) => {
        if (!res) {
          resolve({ success: false, error: 'No response from server' });
        } else if (res.error) {
          resolve({ success: false, error: res.error });
        } else if (res.rateLimited) {
          resolve({ success: false, rateLimited: true });
        } else {
          resolve({ success: true });
        }
      }
    );
  });
}
