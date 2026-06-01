import { useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import { API_URL } from "../lib/api";

export function useSocket() {
  const socket = useMemo(
    () =>
      io(API_URL || window.location.origin, {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 600,
        reconnectionDelayMax: 4000,
        transports: ["websocket", "polling"]
      }),
    []
  );

  useEffect(() => {
    socket.connect();
    return () => socket.disconnect();
  }, [socket]);

  return socket;
}
